package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"backend/db"
	"github.com/jackc/pgx/v5"
)

var ptPhoneRegex = regexp.MustCompile(`^\+?[\d\s-]{7,15}$`)

type Patient struct {
	ID             int       `json:"id"`
	Name           string    `json:"name"`
	Phone          string    `json:"phone"`
	Gender         string    `json:"gender"`
	Age            int       `json:"age"`
	MedicalHistory string    `json:"medical_history"`
	DuesCount      int       `json:"dues_count"`
	TotalDues      float64   `json:"total_dues"`
	CreatedAt      time.Time `json:"created_at"`
}

type BillSummary struct {
	ID              int        `json:"id"`
	PatientID       int        `json:"patient_id"`
	Description     string     `json:"description"`
	TotalAmount     float64    `json:"total_amount"`
	RemainingAmount float64    `json:"remaining_amount"`
	Status          string     `json:"status"`
	InvoiceURL      *string    `json:"invoice_url"`
	CreatedAt       time.Time  `json:"created_at"`
	Notified        bool       `json:"notified"`
}

type AppointmentSummary struct {
	ID              int       `json:"id"`
	PatientID       int       `json:"patient_id"`
	AppointmentDate time.Time `json:"appointment_date"`
	Status          string    `json:"status"`
	Reason          string    `json:"reason"`
	CreatedAt       time.Time `json:"created_at"`
}

type PrescriptionItem struct {
	ID           int    `json:"id"`
	MedicineName string `json:"medicine_name"`
	MedicineID   *int   `json:"medicine_id"`
	Dosage       string `json:"dosage"`
	Frequency    string `json:"frequency"`
	Duration     string `json:"duration"`
	Quantity     int    `json:"quantity"`
	Instructions string `json:"instructions"`
}

type PrescriptionSummary struct {
	ID          int                `json:"id"`
	Diagnosis   string             `json:"diagnosis"`
	Notes       string             `json:"notes"`
	Status      string             `json:"status"`
	CreatedAt   time.Time          `json:"created_at"`
	LabRequests []string           `json:"lab_requests,omitempty"`
	Items       []PrescriptionItem `json:"items,omitempty"`
}

// CreatePatient handles patient creation
func CreatePatient(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Name           string `json:"name"`
		Phone          string `json:"phone"`
		Gender         string `json:"gender"`
		Age            int    `json:"age"`
		MedicalHistory string `json:"medical_history"`
		DoctorIDs      []int  `json:"doctor_ids"` // Assign to multiple doctors
	}

	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
		return
	}

	if input.Name == "" || input.Phone == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Name and Phone are required"})
		return
	}

	if len(input.Name) > 100 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Name must be 100 characters or fewer"})
		return
	}

	if !ptPhoneRegex.MatchString(input.Phone) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid phone number format"})
		return
	}

	if input.Gender == "" {
		input.Gender = "Male"
	}

	creatorID, ok := r.Context().Value(ShopkeeperIDKey).(int)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	facilityID, err := GetActiveFacilityID(r, creatorID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to get active facility"})
		return
	}

	creatorRole, err := getUserRole(r.Context(), creatorID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to check creator permissions"})
		return
	}

	// Clinic Mode mapping: automatically assign doctor
	if len(input.DoctorIDs) == 0 {
		if strings.ToUpper(creatorRole) == "DOCTOR" {
			input.DoctorIDs = append(input.DoctorIDs, creatorID)
		} else {
			// Find all active doctors in the facility
			rows, err := db.Pool.Query(r.Context(), `
				SELECT uf.user_id
				FROM user_facilities uf
				JOIN users u ON uf.user_id = u.id
				WHERE uf.facility_id = $1 AND u.role = 'DOCTOR'
			`, facilityID)
			if err == nil {
				defer rows.Close()
				for rows.Next() {
					var docID int
					if err := rows.Scan(&docID); err == nil {
						input.DoctorIDs = append(input.DoctorIDs, docID)
					}
				}
			}
		}
	} else if strings.ToUpper(creatorRole) == "DOCTOR" {
		// Ensure creator (who is a doctor) is assigned
		found := false
		for _, docID := range input.DoctorIDs {
			if docID == creatorID {
				found = true
				break
			}
		}
		if !found {
			input.DoctorIDs = append(input.DoctorIDs, creatorID)
		}
	}

	if len(input.DoctorIDs) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Please assign at least one doctor to this patient"})
		return
	}

	input.Name = CapitalizeName(input.Name)

	// Determine primary doctor_id for legacy compatibility (must be NOT NULL in schema)
	primaryDoctorID := creatorID
	if len(input.DoctorIDs) > 0 {
		primaryDoctorID = input.DoctorIDs[0]
	}

	tx, err := db.Pool.Begin(r.Context())
	if err != nil {
		log.Printf("CreatePatient Tx begin error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Database error"})
		return
	}
	defer tx.Rollback(r.Context())

	query := `INSERT INTO patients (doctor_id, name, phone, gender, age, medical_history, facility_id) 
	          VALUES ($1, $2, $3, $4, $5, $6, $7) 
	          RETURNING id, created_at`
	var id int
	var createdAt time.Time
	err = tx.QueryRow(r.Context(), query, primaryDoctorID, input.Name, input.Phone, input.Gender, input.Age, input.MedicalHistory, facilityID).Scan(&id, &createdAt)
	if err != nil {
		log.Printf("CreatePatient DB error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "An internal error occurred"})
		return
	}

	// Insert assignments into patient_doctors junction table
	for _, docID := range input.DoctorIDs {
		_, err = tx.Exec(r.Context(), `
			INSERT INTO patient_doctors (patient_id, doctor_id, facility_id, assigned_by)
			VALUES ($1, $2, $3, $4)
			ON CONFLICT (patient_id, doctor_id, facility_id) DO NOTHING
		`, id, docID, facilityID, creatorID)
		if err != nil {
			log.Printf("CreatePatient patient_doctors mapping error: %v", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to create doctor assignments"})
			return
		}
	}

	if err = tx.Commit(r.Context()); err != nil {
		log.Printf("CreatePatient Tx commit error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to save patient records"})
		return
	}

	// Invalidate caches
	db.InvalidateCache(r.Context(), "patients:list:*:"+strconv.Itoa(facilityID)+":*")
	for _, docID := range input.DoctorIDs {
		db.InvalidateCache(r.Context(), "patients:list:"+strconv.Itoa(docID)+":"+strconv.Itoa(facilityID)+":*")
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"id":              id,
		"name":            input.Name,
		"phone":           input.Phone,
		"gender":          input.Gender,
		"age":             input.Age,
		"medical_history": input.MedicalHistory,
		"created_at":      createdAt,
	})
}

// ListPatients returns all patients with their total outstanding dues calculated (paginated)
func ListPatients(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(ShopkeeperIDKey).(int)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	facilityID, err := GetActiveFacilityID(r, userID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to get active facility"})
		return
	}

	limitStr := r.URL.Query().Get("limit")
	offsetStr := r.URL.Query().Get("offset")
	
	limit := 50
	if limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
			limit = l
		}
	}
	if limit > 100 {
		limit = 100
	}

	offset := 0
	if offsetStr != "" {
		if o, err := strconv.Atoi(offsetStr); err == nil && o >= 0 {
			offset = o
		}
	}

	cacheKey := "patients:list:" + strconv.Itoa(userID) + ":" + strconv.Itoa(facilityID) + ":" + strconv.Itoa(limit) + ":" + strconv.Itoa(offset)
	var cachedPatients []Patient
	if db.GetCache(r.Context(), cacheKey, &cachedPatients) {
		writeJSON(w, http.StatusOK, cachedPatients)
		return
	}

	role, err := getUserRole(r.Context(), userID)
	if err != nil {
		log.Printf("ListPatients role fetch error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to check credentials"})
		return
	}

	var rows pgx.Rows
	treatedOnly := r.URL.Query().Get("treated_only") == "true"

	if strings.ToUpper(role) == "DOCTOR" {
		if treatedOnly {
			// In hospital mode, doctors only see patients they have treated in the past or are referred/assigned to them
			query := `
				SELECT p.id, p.name, p.phone, p.gender, p.age, p.medical_history, p.created_at,
				       COALESCE(COUNT(b.id) FILTER (WHERE b.remaining_amount > 0), 0) as dues_count,
				       COALESCE(SUM(b.remaining_amount), 0) as total_dues
				FROM patients p
				LEFT JOIN bills b ON p.id = b.patient_id
				WHERE p.facility_id = $4 AND (
					p.id IN (SELECT patient_id FROM queue_entries WHERE doctor_id = $1 AND status = 'COMPLETED') OR
					p.id IN (SELECT patient_id FROM appointments WHERE doctor_id = $1 AND status = 'COMPLETED') OR
					p.id IN (SELECT patient_id FROM prescriptions WHERE doctor_id = $1) OR
					p.id IN (SELECT patient_id FROM patient_doctors WHERE doctor_id = $1 AND facility_id = $4)
				)
				GROUP BY p.id
				ORDER BY p.name ASC
				LIMIT $2 OFFSET $3
			`
			rows, err = db.Pool.Query(r.Context(), query, userID, limit, offset, facilityID)
		} else {
			// Doctors only see patients assigned to them via patient_doctors
			query := `
				SELECT p.id, p.name, p.phone, p.gender, p.age, p.medical_history, p.created_at,
				       COALESCE(COUNT(b.id) FILTER (WHERE b.remaining_amount > 0), 0) as dues_count,
				       COALESCE(SUM(b.remaining_amount), 0) as total_dues
				FROM patients p
				JOIN patient_doctors pd ON p.id = pd.patient_id
				LEFT JOIN bills b ON p.id = b.patient_id
				WHERE pd.doctor_id = $1 AND pd.facility_id = $4
				GROUP BY p.id
				ORDER BY total_dues DESC, p.name ASC
				LIMIT $2 OFFSET $3
			`
			rows, err = db.Pool.Query(r.Context(), query, userID, limit, offset, facilityID)
		}
	} else {
		// Admin/Receptionist sees all patients in the facility
		query := `
			SELECT p.id, p.name, p.phone, p.gender, p.age, p.medical_history, p.created_at,
			       COALESCE(COUNT(b.id) FILTER (WHERE b.remaining_amount > 0), 0) as dues_count,
			       COALESCE(SUM(b.remaining_amount), 0) as total_dues
			FROM patients p
			LEFT JOIN bills b ON p.id = b.patient_id
			WHERE p.facility_id = $3
			GROUP BY p.id
			ORDER BY total_dues DESC, p.name ASC
			LIMIT $1 OFFSET $2
		`
		rows, err = db.Pool.Query(r.Context(), query, limit, offset, facilityID)
	}

	if err != nil {
		log.Printf("ListPatients DB error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "An internal error occurred"})
		return
	}
	defer rows.Close()

	patients := []Patient{}
	for rows.Next() {
		var p Patient
		err := rows.Scan(&p.ID, &p.Name, &p.Phone, &p.Gender, &p.Age, &p.MedicalHistory, &p.CreatedAt, &p.DuesCount, &p.TotalDues)
		if err != nil {
			log.Printf("ListPatients scan error: %v", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "An internal error occurred"})
			return
		}
		patients = append(patients, p)
	}

	db.SetCache(r.Context(), cacheKey, patients, 10*time.Minute)

	writeJSON(w, http.StatusOK, patients)
}

// GetPatient returns details of a patient, their billing history, and appointments list
func GetPatient(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(ShopkeeperIDKey).(int)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	var role, phone string
	err := db.Pool.QueryRow(r.Context(), "SELECT role, phone FROM users WHERE id = $1", userID).Scan(&role, &phone)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	facilityID, err := GetActiveFacilityID(r, userID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to get active facility"})
		return
	}

	var id int
	if role == "USER" {
		err = db.Pool.QueryRow(r.Context(), "SELECT id FROM patients WHERE phone = $1 LIMIT 1", phone).Scan(&id)
		if err != nil {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "Patient profile not found for this account"})
			return
		}
	} else {
		idStr := r.URL.Query().Get("id")
		id, err = strconv.Atoi(idStr)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid patient ID"})
			return
		}
	}

	ctx := r.Context()

	cacheKey := "patient:detail:" + strconv.Itoa(userID) + ":" + strconv.Itoa(id)
	var cachedData map[string]interface{}
	if db.GetCache(ctx, cacheKey, &cachedData) {
		writeJSON(w, http.StatusOK, cachedData)
		return
	}

	// Verify Doctor is assigned to this patient, or Admin belongs to the same facility
	if strings.ToUpper(role) == "DOCTOR" {
		var isAssigned bool
		err = db.Pool.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM patient_doctors WHERE patient_id = $1 AND doctor_id = $2 AND facility_id = $3)", id, userID, facilityID).Scan(&isAssigned)
		if err != nil || !isAssigned {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "Forbidden: you are not assigned to this patient"})
			return
		}
	} else if strings.ToUpper(role) == "HOSPITAL_ADMIN" || strings.ToUpper(role) == "PHARMACIST" {
		var sameFacility bool
		err = db.Pool.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM patients WHERE id = $1 AND facility_id = $2)", id, facilityID).Scan(&sameFacility)
		if err != nil || !sameFacility {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "Forbidden: patient does not belong to your facility"})
			return
		}
	}

	// Load patient info
	var p Patient
	err = db.Pool.QueryRow(ctx, "SELECT id, name, phone, gender, age, medical_history, created_at FROM patients WHERE id = $1", id).Scan(
		&p.ID, &p.Name, &p.Phone, &p.Gender, &p.Age, &p.MedicalHistory, &p.CreatedAt,
	)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Patient not found"})
		return
	}

	// Load billing history
	queryBills := `
		SELECT b.id, b.patient_id, b.description, b.total_amount, b.remaining_amount, b.status, b.invoice_url, b.created_at, b.notified
		FROM bills b
		WHERE b.patient_id = $1
		ORDER BY b.created_at DESC
	`
	rowsBills, err := db.Pool.Query(ctx, queryBills, id)
	if err != nil {
		log.Printf("GetPatient bills query error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "An internal error occurred"})
		return
	}
	defer rowsBills.Close()

	billsList := []BillSummary{}
	for rowsBills.Next() {
		var b BillSummary
		err := rowsBills.Scan(&b.ID, &b.PatientID, &b.Description, &b.TotalAmount, &b.RemainingAmount, &b.Status, &b.InvoiceURL, &b.CreatedAt, &b.Notified)
		if err != nil {
			log.Printf("GetPatient bill scan error: %v", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "An internal error occurred"})
			return
		}
		billsList = append(billsList, b)
	}

	// Compute total dues and dues count from billsList
	var totalDues float64
	var duesCount int
	for _, b := range billsList {
		if b.RemainingAmount > 0 {
			totalDues += b.RemainingAmount
			duesCount++
		}
	}
	p.TotalDues = totalDues
	p.DuesCount = duesCount

	// Load appointments list
	queryAppts := `
		SELECT id, patient_id, appointment_date, status, reason, created_at
		FROM appointments
		WHERE patient_id = $1
		ORDER BY appointment_date DESC
	`
	rowsAppts, err := db.Pool.Query(ctx, queryAppts, id)
	if err != nil {
		log.Printf("GetPatient appointments query error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "An internal error occurred"})
		return
	}
	defer rowsAppts.Close()

	apptsList := []AppointmentSummary{}
	for rowsAppts.Next() {
		var a AppointmentSummary
		err := rowsAppts.Scan(&a.ID, &a.PatientID, &a.AppointmentDate, &a.Status, &a.Reason, &a.CreatedAt)
		if err != nil {
			log.Printf("GetPatient appointment scan error: %v", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "An internal error occurred"})
			return
		}
		apptsList = append(apptsList, a)
	}

	// Load prescriptions list
	queryRxs := `
		SELECT id, diagnosis, notes, status, created_at
		FROM prescriptions
		WHERE patient_id = $1
		ORDER BY created_at DESC
	`
	rowsRxs, err := db.Pool.Query(ctx, queryRxs, id)
	if err != nil {
		log.Printf("GetPatient prescriptions query error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "An internal error occurred"})
		return
	}
	defer rowsRxs.Close()

	rxsList := []PrescriptionSummary{}
	for rowsRxs.Next() {
		var rx PrescriptionSummary
		err := rowsRxs.Scan(&rx.ID, &rx.Diagnosis, &rx.Notes, &rx.Status, &rx.CreatedAt)
		if err != nil {
			log.Printf("GetPatient prescription scan error: %v", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "An internal error occurred"})
			return
		}
		rxsList = append(rxsList, rx)
	}

	// Fetch lab requests for these prescriptions
	if len(rxsList) > 0 {
		rxIDs := make([]int, len(rxsList))
		for i, rx := range rxsList {
			rxIDs[i] = rx.ID
		}
		labRows, err := db.Pool.Query(ctx, `
			SELECT prescription_id, test_name
			FROM lab_requests
			WHERE prescription_id = ANY($1)
			ORDER BY id ASC
		`, rxIDs)
		if err == nil {
			defer labRows.Close()
			labMap := make(map[int][]string)
			for labRows.Next() {
				var rxID int
				var tn string
				if err := labRows.Scan(&rxID, &tn); err == nil {
					labMap[rxID] = append(labMap[rxID], tn)
				}
			}
			for i := range rxsList {
				if labs, ok := labMap[rxsList[i].ID]; ok {
					rxsList[i].LabRequests = labs
				} else {
					rxsList[i].LabRequests = []string{}
				}
			}
		} else {
			log.Printf("GetPatient lab requests query error: %v", err)
		}

		// Fetch prescription items
		itemRows, err := db.Pool.Query(ctx, `
			SELECT id, prescription_id, medicine_name, medicine_id, dosage, frequency, duration, quantity, instructions
			FROM prescription_items
			WHERE prescription_id = ANY($1)
			ORDER BY id ASC
		`, rxIDs)
		if err == nil {
			defer itemRows.Close()
			itemsMap := make(map[int][]PrescriptionItem)
			for itemRows.Next() {
				var rxID int
				var item PrescriptionItem
				errScan := itemRows.Scan(
					&item.ID, &rxID, &item.MedicineName, &item.MedicineID,
					&item.Dosage, &item.Frequency, &item.Duration, &item.Quantity, &item.Instructions,
				)
				if errScan == nil {
					itemsMap[rxID] = append(itemsMap[rxID], item)
				}
			}
			for i := range rxsList {
				if items, ok := itemsMap[rxsList[i].ID]; ok {
					rxsList[i].Items = items
				} else {
					rxsList[i].Items = []PrescriptionItem{}
				}
			}
		} else {
			log.Printf("GetPatient prescription items query error: %v", err)
		}
	}

	responseData := map[string]interface{}{
		"patient":       p,
		"contracts":     billsList,
		"appointments":  apptsList,
		"prescriptions": rxsList,
	}
	db.SetCache(ctx, cacheKey, responseData, 10*time.Minute)

	writeJSON(w, http.StatusOK, responseData)
}

// DeletePatient deletes a patient and all their cascading data (Admin only)
func DeletePatient(w http.ResponseWriter, r *http.Request) {
	adminID, ok := r.Context().Value(ShopkeeperIDKey).(int)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	adminRole, err := getUserRole(r.Context(), adminID)
	if err != nil || adminRole != "HOSPITAL_ADMIN" {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "Only Hospital Admins can delete patients"})
		return
	}

	facilityID, err := GetActiveFacilityID(r, adminID)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Failed to resolve active facility"})
		return
	}

	patientIDStr := r.URL.Query().Get("id")
	if patientIDStr == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Patient ID is required"})
		return
	}

	patientID, err := strconv.Atoi(patientIDStr)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid patient ID"})
		return
	}

	// Run inside a transaction to ensure all associated records not set to ON DELETE CASCADE are cleaned up properly
	tx, err := db.Pool.Begin(r.Context())
	if err != nil {
		log.Printf("DeletePatient begin tx error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "An internal error occurred"})
		return
	}
	defer tx.Rollback(r.Context())

	// 1. Delete from reschedule_queue
	_, _ = tx.Exec(r.Context(), "DELETE FROM reschedule_queue WHERE patient_id = $1", patientID)

	// 2. Delete from dispensing_items
	_, _ = tx.Exec(r.Context(), "DELETE FROM dispensing_items WHERE dispensing_id IN (SELECT id FROM dispensing_records WHERE patient_id = $1)", patientID)

	// 3. Delete from dispensing_records
	_, _ = tx.Exec(r.Context(), "DELETE FROM dispensing_records WHERE patient_id = $1", patientID)

	// 4. Delete from lab_reports
	_, _ = tx.Exec(r.Context(), "DELETE FROM lab_reports WHERE lab_request_id IN (SELECT id FROM lab_requests WHERE patient_id = $1)", patientID)

	// 5. Delete patient
	_, err = tx.Exec(r.Context(), "DELETE FROM patients WHERE id = $1 AND facility_id = $2", patientID, facilityID)
	if err != nil {
		log.Printf("DeletePatient delete patient error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to delete patient"})
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		log.Printf("DeletePatient commit error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to delete patient"})
		return
	}

	// Invalidate cache
	db.InvalidateCache(r.Context(), "patient:detail:"+strconv.Itoa(patientID))

	writeJSON(w, http.StatusOK, map[string]string{"message": "Patient deleted successfully"})
}

