package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"backend/db"
	"backend/services"
	"github.com/jackc/pgx/v5"
)

type RxItem struct {
	ID             int    `json:"id"`
	PrescriptionID int    `json:"prescription_id"`
	MedicineName   string `json:"medicine_name"`
	MedicineID     *int   `json:"medicine_id"`
	Dosage         string `json:"dosage"`
	Frequency      string `json:"frequency"`
	Duration       string `json:"duration"`
	Quantity       int    `json:"quantity"`
	Instructions   string `json:"instructions"`
}

type Prescription struct {
	ID            int       `json:"id"`
	FacilityID    int       `json:"facility_id"`
	PatientID     int       `json:"patient_id"`
	PatientName   string    `json:"patient_name"`
	DoctorID      int       `json:"doctor_id"`
	DoctorName    string    `json:"doctor_name"`
	AppointmentID *int      `json:"appointment_id"`
	Diagnosis     string    `json:"diagnosis"`
	Notes         string    `json:"notes"`
	Status        string    `json:"status"` // active, dispensed, partially_dispensed, cancelled
	CreatedAt     time.Time `json:"created_at"`
	Items         []RxItem  `json:"items,omitempty"`
	LabRequests   []string  `json:"lab_requests,omitempty"`
}

// CreatePrescription handles writing a new prescription.
// Restricts to DOCTOR role only.
func CreatePrescription(w http.ResponseWriter, r *http.Request) {
	var input struct {
		PatientID     int `json:"patient_id"`
		AppointmentID *int `json:"appointment_id"`
		Diagnosis     string `json:"diagnosis"`
		Notes         string `json:"notes"`
		Items         []struct {
			MedicineName string `json:"medicine_name"`
			MedicineID   *int   `json:"medicine_id"`
			Dosage       string `json:"dosage"`
			Frequency    string `json:"frequency"`
			Duration     string `json:"duration"`
			Quantity     int    `json:"quantity"`
			Instructions string `json:"instructions"`
		} `json:"items"`
		LabRequests   []string `json:"lab_requests"`
		VisitCharges  *float64 `json:"visit_charges,omitempty"`
		AmountPaid    *float64 `json:"amount_paid,omitempty"`
	}

	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
		return
	}

	if input.PatientID <= 0 || (len(input.Items) == 0 && len(input.LabRequests) == 0) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Patient ID and at least one item (medicine or lab request) are required"})
		return
	}

	doctorID, ok := r.Context().Value(ShopkeeperIDKey).(int)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	facilityID, err := GetActiveFacilityID(r, doctorID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to get active facility"})
		return
	}

	// Verify doctor is assigned to this patient
	var isAssigned bool
	err = db.Pool.QueryRow(r.Context(), `
		SELECT EXISTS(SELECT 1 FROM patient_doctors WHERE patient_id = $1 AND doctor_id = $2 AND facility_id = $3)
	`, input.PatientID, doctorID, facilityID).Scan(&isAssigned)
	if err != nil || !isAssigned {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "Forbidden: you are not assigned to this patient"})
		return
	}

	tx, err := db.Pool.Begin(r.Context())
	if err != nil {
		log.Printf("CreatePrescription transaction begin error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Database error"})
		return
	}
	defer tx.Rollback(r.Context())

	// Insert prescription header
	var rxID int
	var status string
	var createdAt time.Time
	rxQuery := `
		INSERT INTO prescriptions (facility_id, patient_id, doctor_id, appointment_id, diagnosis, notes, status)
		VALUES ($1, $2, $3, $4, $5, $6, 'active')
		RETURNING id, status, created_at
	`
	err = tx.QueryRow(r.Context(), rxQuery, facilityID, input.PatientID, doctorID, input.AppointmentID, input.Diagnosis, input.Notes).Scan(&rxID, &status, &createdAt)
	if err != nil {
		log.Printf("CreatePrescription insert prescription error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to save prescription header"})
		return
	}

	// Insert items
	for _, item := range input.Items {
		itemQuery := `
			INSERT INTO prescription_items (prescription_id, medicine_name, medicine_id, dosage, frequency, duration, quantity, instructions)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		`
		_, err = tx.Exec(r.Context(), itemQuery, rxID, item.MedicineName, item.MedicineID, item.Dosage, item.Frequency, item.Duration, item.Quantity, item.Instructions)
		if err != nil {
			log.Printf("CreatePrescription insert item error: %v", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to save prescription items"})
			return
		}
	}

	// Insert lab requests
	for _, testName := range input.LabRequests {
		if testName == "" {
			continue
		}
		_, err = tx.Exec(r.Context(), `
			INSERT INTO lab_requests (patient_id, doctor_id, test_name, status, facility_id, prescription_id)
			VALUES ($1, $2, $3, 'REQUESTED', $4, $5)
			ON CONFLICT (prescription_id, test_name) DO NOTHING
		`, input.PatientID, doctorID, testName, facilityID, rxID)
		if err != nil {
			log.Printf("CreatePrescription insert lab request error: %v", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to save lab requests"})
			return
		}
	}

	// Insert consult bill if visit charges are specified
	var billIDVal *int
	if input.VisitCharges != nil && *input.VisitCharges > 0 {
		var amountPaid float64
		if input.AmountPaid != nil {
			amountPaid = *input.AmountPaid
		}
		remainingAmount := *input.VisitCharges - amountPaid

		var billStatus string
		if remainingAmount <= 0 {
			billStatus = "SETTLED"
			remainingAmount = 0
		} else if amountPaid > 0 {
			billStatus = "PARTIALLY_PAID"
		} else {
			billStatus = "PENDING"
		}

		billQuery := `
			INSERT INTO bills (patient_id, doctor_id, description, total_amount, remaining_amount, status, promised_due_date, created_at, facility_id)
			VALUES ($1, $2, 'Consultation / Visit Charges', $3, $4, $5, NULL, $6, $7)
			RETURNING id
		`
		var billID int
		err = tx.QueryRow(r.Context(), billQuery, input.PatientID, doctorID, *input.VisitCharges, remainingAmount, billStatus, createdAt, facilityID).Scan(&billID)
		if err != nil {
			log.Printf("CreatePrescription insert bill error: %v", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to create consultation bill"})
			return
		}

		itemQuery := `
			INSERT INTO bill_items (bill_id, item_name, quantity, unit_price, dosage)
			VALUES ($1, 'Consultation Fee', 1, $2, '')
		`
		_, err = tx.Exec(r.Context(), itemQuery, billID, *input.VisitCharges)
		if err != nil {
			log.Printf("CreatePrescription insert bill item error: %v", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to create consultation bill item"})
			return
		}

		// Log upfront payment if amountPaid > 0
		if amountPaid > 0 {
			queryPayment := `
				INSERT INTO payments (bill_id, amount_paid, payment_mode, remarks, payment_date)
				VALUES ($1, $2, 'CASH', 'Consultation upfront payment', $3)
			`
			_, err = tx.Exec(r.Context(), queryPayment, billID, amountPaid, createdAt)
			if err != nil {
				log.Printf("CreatePrescription insert payment error: %v", err)
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to record payment"})
				return
			}
		}

		billIDVal = &billID
	}

	if err = tx.Commit(r.Context()); err != nil {
		log.Printf("CreatePrescription transaction commit error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Transaction failed"})
		return
	}

	// Invalidate cache
	db.InvalidateCache(r.Context(), "patient:detail:*:"+strconv.Itoa(input.PatientID))

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"id":         rxID,
		"status":     status,
		"created_at": createdAt,
		"bill_id":    billIDVal,
		"message":    "Prescription created successfully",
	})
}

// ListPrescriptions returns list of prescriptions.
// Role-aware: Doctor sees their own; Pharmacist sees active prescriptions in their queue; Admin sees all.
func ListPrescriptions(w http.ResponseWriter, r *http.Request) {
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

	role, err := getUserRole(r.Context(), userID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to authenticate role"})
		return
	}

	limitStr := r.URL.Query().Get("limit")
	offsetStr := r.URL.Query().Get("offset")
	limit := 50
	if l, err := strconv.Atoi(limitStr); err == nil && l > 0 { limit = l }
	offset := 0
	if o, err := strconv.Atoi(offsetStr); err == nil && o >= 0 { offset = o }

	var query string
	var rows pgx.Rows
	var qErr error

	normalizedRole := strings.ToUpper(role)

	if normalizedRole == "DOCTOR" {
		// Only prescriptions created by this doctor in the current facility
		query = `
			SELECT rx.id, rx.patient_id, p.name as patient_name, rx.doctor_id, u.name as doctor_name, 
			       rx.appointment_id, rx.diagnosis, rx.notes, rx.status, rx.created_at
			FROM prescriptions rx
			JOIN patients p ON rx.patient_id = p.id
			JOIN users u ON rx.doctor_id = u.id
			WHERE rx.doctor_id = $1 AND rx.facility_id = $2
			ORDER BY rx.created_at DESC
			LIMIT $3 OFFSET $4
		`
		rows, qErr = db.Pool.Query(r.Context(), query, userID, facilityID, limit, offset)
	} else if normalizedRole == "PHARMACIST" {
		// All active/partially_dispensed prescriptions for the facility (the dispensing work queue)
		query = `
			SELECT rx.id, rx.patient_id, p.name as patient_name, rx.doctor_id, u.name as doctor_name, 
			       rx.appointment_id, rx.diagnosis, rx.notes, rx.status, rx.created_at
			FROM prescriptions rx
			JOIN patients p ON rx.patient_id = p.id
			JOIN users u ON rx.doctor_id = u.id
			WHERE rx.facility_id = $1 AND rx.status IN ('active', 'partially_dispensed')
			ORDER BY rx.created_at ASC
			LIMIT $2 OFFSET $3
		`
		rows, qErr = db.Pool.Query(r.Context(), query, facilityID, limit, offset)
	} else {
		// Admin sees everything
		query = `
			SELECT rx.id, rx.patient_id, p.name as patient_name, rx.doctor_id, u.name as doctor_name, 
			       rx.appointment_id, rx.diagnosis, rx.notes, rx.status, rx.created_at
			FROM prescriptions rx
			JOIN patients p ON rx.patient_id = p.id
			JOIN users u ON rx.doctor_id = u.id
			WHERE rx.facility_id = $1
			ORDER BY rx.created_at DESC
			LIMIT $2 OFFSET $3
		`
		rows, qErr = db.Pool.Query(r.Context(), query, facilityID, limit, offset)
	}

	if qErr != nil {
		log.Printf("ListPrescriptions DB query error: %v", qErr)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to query prescriptions"})
		return
	}
	defer rows.Close()

	prescriptions := []Prescription{}
	for rows.Next() {
		var rx Prescription
		err := rows.Scan(&rx.ID, &rx.PatientID, &rx.PatientName, &rx.DoctorID, &rx.DoctorName, &rx.AppointmentID, &rx.Diagnosis, &rx.Notes, &rx.Status, &rx.CreatedAt)
		if err != nil {
			log.Printf("ListPrescriptions scan error: %v", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to read database records"})
			return
		}
		prescriptions = append(prescriptions, rx)
	}

	// Fetch and append lab requests for the listed prescriptions in a single batch query
	if len(prescriptions) > 0 {
		rxIDs := make([]int, len(prescriptions))
		for i, rx := range prescriptions {
			rxIDs[i] = rx.ID
		}

		labRows, err := db.Pool.Query(r.Context(), `
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
			for i := range prescriptions {
				if labs, ok := labMap[prescriptions[i].ID]; ok {
					prescriptions[i].LabRequests = labs
				} else {
					prescriptions[i].LabRequests = []string{}
				}
			}
		} else {
			log.Printf("ListPrescriptions lab requests query error: %v", err)
		}
	}

	writeJSON(w, http.StatusOK, prescriptions)
}

// GetPrescription returns detail of a single prescription and its items.
func GetPrescription(w http.ResponseWriter, r *http.Request) {
	rxIDStr := r.URL.Query().Get("id")
	rxID, err := strconv.Atoi(rxIDStr)
	if err != nil || rxID <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid prescription ID"})
		return
	}

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

	role, err := getUserRole(r.Context(), userID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to verify credentials"})
		return
	}

	var rx Prescription
	rxQuery := `
		SELECT rx.id, rx.facility_id, rx.patient_id, p.name as patient_name, rx.doctor_id, u.name as doctor_name, 
		       rx.appointment_id, rx.diagnosis, rx.notes, rx.status, rx.created_at
		FROM prescriptions rx
		JOIN patients p ON rx.patient_id = p.id
		JOIN users u ON rx.doctor_id = u.id
		WHERE rx.id = $1 AND rx.facility_id = $2
	`
	err = db.Pool.QueryRow(r.Context(), rxQuery, rxID, facilityID).Scan(
		&rx.ID, &rx.FacilityID, &rx.PatientID, &rx.PatientName, &rx.DoctorID, &rx.DoctorName, &rx.AppointmentID, &rx.Diagnosis, &rx.Notes, &rx.Status, &rx.CreatedAt,
	)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Prescription not found"})
		return
	}

	// Doctor isolation check
	if strings.ToUpper(role) == "DOCTOR" && rx.DoctorID != userID {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "Forbidden: you can only view prescriptions you authored"})
		return
	}

	// Fetch items
	itemsQuery := `
		SELECT id, prescription_id, medicine_name, medicine_id, dosage, frequency, duration, quantity, instructions
		FROM prescription_items
		WHERE prescription_id = $1
		ORDER BY id ASC
	`
	rows, err := db.Pool.Query(r.Context(), itemsQuery, rxID)
	if err != nil {
		log.Printf("GetPrescription items query error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to load prescription line items"})
		return
	}
	defer rows.Close()

	items := []RxItem{}
	for rows.Next() {
		var it RxItem
		err := rows.Scan(&it.ID, &it.PrescriptionID, &it.MedicineName, &it.MedicineID, &it.Dosage, &it.Frequency, &it.Duration, &it.Quantity, &it.Instructions)
		if err != nil {
			log.Printf("GetPrescription item scan error: %v", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to read database records"})
			return
		}
		items = append(items, it)
	}
	rx.Items = items

	// Fetch lab requests
	labQuery := `
		SELECT test_name
		FROM lab_requests
		WHERE prescription_id = $1
		ORDER BY id ASC
	`
	labRows, err := db.Pool.Query(r.Context(), labQuery, rxID)
	if err != nil {
		log.Printf("GetPrescription lab requests query error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to load prescription lab requests"})
		return
	}
	defer labRows.Close()

	labRequests := []string{}
	for labRows.Next() {
		var testName string
		if err := labRows.Scan(&testName); err == nil {
			labRequests = append(labRequests, testName)
		}
	}
	rx.LabRequests = labRequests

	writeJSON(w, http.StatusOK, rx)
}

// UpdatePrescription allows a doctor to update a prescription (only if still active/not dispensed).
func UpdatePrescription(w http.ResponseWriter, r *http.Request) {
	var input struct {
		ID        int    `json:"id"`
		Diagnosis string `json:"diagnosis"`
		Notes     string `json:"notes"`
		Items     []struct {
			MedicineName string `json:"medicine_name"`
			MedicineID   *int   `json:"medicine_id"`
			Dosage       string `json:"dosage"`
			Frequency    string `json:"frequency"`
			Duration     string `json:"duration"`
			Quantity     int    `json:"quantity"`
			Instructions string `json:"instructions"`
		} `json:"items"`
		LabRequests []string `json:"lab_requests"`
	}

	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
		return
	}

	if input.ID <= 0 || (len(input.Items) == 0 && len(input.LabRequests) == 0) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Prescription ID and at least one item (medicine or lab request) are required"})
		return
	}

	doctorID, ok := r.Context().Value(ShopkeeperIDKey).(int)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	// Verify ownership and status
	var currentStatus string
	var authorID int
	err := db.Pool.QueryRow(r.Context(), "SELECT doctor_id, status FROM prescriptions WHERE id = $1", input.ID).Scan(&authorID, &currentStatus)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Prescription not found"})
		return
	}

	if authorID != doctorID {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "Forbidden: you can only edit prescriptions you authored"})
		return
	}

	if currentStatus != "active" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Cannot edit prescription: items have already been dispensed"})
		return
	}

	tx, err := db.Pool.Begin(r.Context())
	if err != nil {
		log.Printf("UpdatePrescription transaction begin error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Database error"})
		return
	}
	defer tx.Rollback(r.Context())

	// Update header
	_, err = tx.Exec(r.Context(), `
		UPDATE prescriptions
		SET diagnosis = $1, notes = $2
		WHERE id = $3
	`, input.Diagnosis, input.Notes, input.ID)
	if err != nil {
		log.Printf("UpdatePrescription update header error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to update header"})
		return
	}

	// Delete old items
	_, err = tx.Exec(r.Context(), "DELETE FROM prescription_items WHERE prescription_id = $1", input.ID)
	if err != nil {
		log.Printf("UpdatePrescription delete items error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to clear old prescription lines"})
		return
	}

	// Insert new items
	for _, item := range input.Items {
		itemQuery := `
			INSERT INTO prescription_items (prescription_id, medicine_name, medicine_id, dosage, frequency, duration, quantity, instructions)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		`
		_, err = tx.Exec(r.Context(), itemQuery, input.ID, item.MedicineName, item.MedicineID, item.Dosage, item.Frequency, item.Duration, item.Quantity, item.Instructions)
		if err != nil {
			log.Printf("UpdatePrescription insert item error: %v", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to save updated prescription items"})
			return
		}
	}

	// Sync lab requests using SQL-only commands (Option C)
	if input.LabRequests == nil {
		input.LabRequests = []string{}
	}
	_, err = tx.Exec(r.Context(), `
		DELETE FROM lab_requests
		WHERE prescription_id = $1 AND status = 'REQUESTED' AND NOT (test_name = ANY($2::text[]))
	`, input.ID, input.LabRequests)
	if err != nil {
		log.Printf("UpdatePrescription delete old lab requests error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to sync lab requests"})
		return
	}

	var patientID, facilityID int
	err = tx.QueryRow(r.Context(), "SELECT patient_id, facility_id FROM prescriptions WHERE id = $1", input.ID).Scan(&patientID, &facilityID)
	if err != nil {
		log.Printf("UpdatePrescription fetch patient/facility error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to find prescription details"})
		return
	}

	for _, testName := range input.LabRequests {
		if testName == "" {
			continue
		}
		_, err = tx.Exec(r.Context(), `
			INSERT INTO lab_requests (patient_id, doctor_id, test_name, status, facility_id, prescription_id)
			VALUES ($1, $2, $3, 'REQUESTED', $4, $5)
			ON CONFLICT (prescription_id, test_name) DO NOTHING
		`, patientID, doctorID, testName, facilityID, input.ID)
		if err != nil {
			log.Printf("UpdatePrescription insert lab request error: %v", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to save updated lab requests"})
			return
		}
	}

	if err = tx.Commit(r.Context()); err != nil {
		log.Printf("UpdatePrescription transaction commit error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to save changes"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "Prescription updated successfully"})
}

// UploadPrescriptionAndBillPDF uploads prescription and bill PDFs to storage and dispatches them via WhatsApp
func UploadPrescriptionAndBillPDF(w http.ResponseWriter, r *http.Request) {
	err := r.ParseMultipartForm(10 << 20) // 10MB max
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Failed to parse form data"})
		return
	}

	rxIDStr := r.FormValue("prescription_id")
	rxID, err := strconv.Atoi(rxIDStr)
	if err != nil || rxID <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Valid prescription_id is required"})
		return
	}

	doctorID, ok := r.Context().Value(ShopkeeperIDKey).(int)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	ctx := r.Context()

	// Fetch prescription and patient details
	var pName, pPhone, docName, clinicName, diagnosis, notes string
	var rxFacilityID *int
	queryRx := `
		SELECT p.name as patient_name, p.phone as patient_phone, d.name as doctor_name, 
		       COALESCE(d.clinic_name, '') as clinic_name, rx.diagnosis, rx.notes,
		       rx.facility_id
		FROM prescriptions rx
		JOIN patients p ON rx.patient_id = p.id
		LEFT JOIN users d ON rx.doctor_id = d.id
		WHERE rx.id = $1 AND p.doctor_id = $2
	`
	err = db.Pool.QueryRow(ctx, queryRx, rxID, doctorID).Scan(&pName, &pPhone, &docName, &clinicName, &diagnosis, &notes, &rxFacilityID)
	if err != nil {
		log.Printf("UploadPrescriptionAndBillPDF query error: %v", err)
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Prescription not found or unauthorized"})
		return
	}

	activeFacID, _ := GetActiveFacilityID(r, doctorID)

	// Process prescription PDF if uploaded
	fileRx, fileHeaderRx, errRx := r.FormFile("prescription")
	if errRx == nil {
		defer fileRx.Close()
		fileBytesRx, errRead := io.ReadAll(fileRx)
		if errRead == nil {
			// Send prescription WhatsApp notification asynchronously
			go func(fID int) {
				tmpl := GetTemplateForDoctor(context.Background(), doctorID, "prescription_notification")
				msgTemplate := tmpl.Greeting + "\n\n" + tmpl.Body + "\n\n" + tmpl.Footer
				replacer := strings.NewReplacer(
					"{patient_name}", pName,
					"{doctor_name}", docName,
					"{clinic_name}", clinicName,
					"{diagnosis}", diagnosis,
					"{notes}", notes,
				)
				messageText := replacer.Replace(msgTemplate)

				facID := fID
				if rxFacilityID != nil {
					facID = *rxFacilityID
				}

				errSend := services.SendWhatsAppWithAttachment(facID, pPhone, messageText, fileBytesRx, fileHeaderRx.Filename, "application/pdf")
				if errSend != nil {
					log.Printf("WhatsApp prescription dispatch failed for Patient %s (%s): %v", pName, pPhone, errSend)
				}
			}(activeFacID)
		} else {
			log.Printf("UploadPrescriptionAndBillPDF prescription read error: %v", errRead)
		}
	}

	// Process bill PDF if uploaded
	billIDStr := r.FormValue("bill_id")
	if billIDStr != "" {
		billID, errBillID := strconv.Atoi(billIDStr)
		if errBillID == nil && billID > 0 {
			fileBill, fileHeaderBill, errBill := r.FormFile("invoice")
			if errBill == nil {
				defer fileBill.Close()
				fileBytesBill, errReadBill := io.ReadAll(fileBill)
				if errReadBill == nil {
					// Upload invoice PDF to Supabase storage
					url, errUpload := services.UploadReceipt(fileBytesBill, fileHeaderBill.Filename, "application/pdf")
					if errUpload != nil {
						log.Printf("UploadPrescriptionAndBillPDF bill upload warning: %v", errUpload)
					} else {
						_, errDB := db.Pool.Exec(ctx, "UPDATE bills SET invoice_url = $1 WHERE id = $2", url, billID)
						if errDB != nil {
							log.Printf("UploadPrescriptionAndBillPDF database update error: %v", errDB)
						}
					}

					// Dispatch bill WhatsApp notification asynchronously
					go func(fID int) {
						var b BillSummary
						var billFacilityID *int
						queryBill := `
							SELECT b.id, b.patient_id, b.description, b.total_amount, b.remaining_amount, b.status, b.created_at, b.notified, b.facility_id
							FROM bills b
							WHERE b.id = $1
						`
						errQueryBill := db.Pool.QueryRow(context.Background(), queryBill, billID).Scan(
							&b.ID, &b.PatientID, &b.Description, &b.TotalAmount, &b.RemainingAmount, &b.Status, &b.CreatedAt, &b.Notified, &billFacilityID,
						)
						if errQueryBill != nil {
							log.Printf("UploadPrescriptionAndBillPDF queryBill error: %v", errQueryBill)
							return
						}

						// Load bill items
						rowsItems, errItems := db.Pool.Query(context.Background(), `
							SELECT item_name, quantity, unit_price, dosage FROM bill_items WHERE bill_id = $1 ORDER BY id ASC
						`, billID)
						itemsList := ""
						if errItems == nil {
							defer rowsItems.Close()
							i := 1
							for rowsItems.Next() {
								var item struct {
									ItemName  string
									Quantity  int
									UnitPrice float64
									Dosage    string
								}
								if errScan := rowsItems.Scan(&item.ItemName, &item.Quantity, &item.UnitPrice, &item.Dosage); errScan == nil {
									dosageStr := ""
									if item.Dosage != "" {
										dosageStr = fmt.Sprintf(" [%s]", item.Dosage)
									}
									itemsList += fmt.Sprintf("%d. %s (Qty: %d) - ₹%.2f/unit%s\n", i, item.ItemName, item.Quantity, item.UnitPrice, dosageStr)
									i++
								}
							}
						}

						tmpl := GetTemplateForDoctor(context.Background(), doctorID, "bill_notification")

						paymentDetails := ""
						totalPaid := b.TotalAmount - b.RemainingAmount
						if totalPaid > 0 {
							var payMode string
							_ = db.Pool.QueryRow(context.Background(), "SELECT payment_mode FROM payments WHERE bill_id = $1 ORDER BY payment_date DESC LIMIT 1", billID).Scan(&payMode)
							if payMode == "" {
								payMode = "CASH"
							}
							paymentDetails = fmt.Sprintf("Amount Paid: ₹%.2f (%s)\n", totalPaid, payMode)
						}

						appURL := os.Getenv("WEBAUTHN_RP_ORIGIN")
						if appURL == "" {
							appURL = "http://localhost:3000"
						}
						billLink := fmt.Sprintf("%s/dashboard?view=bill&id=%d", appURL, billID)

						msgTemplate := tmpl.Greeting + "\n\n" + tmpl.Body + "\n\n" + tmpl.Footer
						replacer := strings.NewReplacer(
							"{patient_name}", pName,
							"{total_amount}", fmt.Sprintf("%.2f", b.TotalAmount),
							"{clinic_name}", clinicName,
							"{payment_details}", paymentDetails,
							"{remaining_amount}", fmt.Sprintf("%.2f", b.RemainingAmount),
							"{items_list}", itemsList,
							"{bill_link}", billLink,
							"{description}", b.Description,
						)
						messageText := replacer.Replace(msgTemplate)

						facID := fID
						if billFacilityID != nil {
							facID = *billFacilityID
						}

						errSendBill := services.SendWhatsAppWithAttachment(facID, pPhone, messageText, fileBytesBill, fileHeaderBill.Filename, "application/pdf")
						if errSendBill != nil {
							log.Printf("WhatsApp bill dispatch failed (UploadPrescriptionAndBillPDF) for Patient %s (%s): %v", pName, pPhone, errSendBill)
						} else {
							_, _ = db.Pool.Exec(context.Background(), "UPDATE bills SET notified = TRUE WHERE id = $1", billID)
						}
					}(activeFacID)
				}
			}
		}
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "Prescription and Bill documents processed successfully"})
}
