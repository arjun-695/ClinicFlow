package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"regexp"
	"strconv"
	"time"

	"backend/db"
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

// CreatePatient handles patient creation
func CreatePatient(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Name           string `json:"name"`
		Phone          string `json:"phone"`
		Gender         string `json:"gender"`
		Age            int    `json:"age"`
		MedicalHistory string `json:"medical_history"`
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

	doctorID, ok := r.Context().Value(ShopkeeperIDKey).(int)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	query := `INSERT INTO patients (doctor_id, name, phone, gender, age, medical_history) 
	          VALUES ($1, $2, $3, $4, $5, $6) 
	          RETURNING id, created_at`
	var id int
	var createdAt time.Time
	err := db.Pool.QueryRow(r.Context(), query, doctorID, input.Name, input.Phone, input.Gender, input.Age, input.MedicalHistory).Scan(&id, &createdAt)
	if err != nil {
		log.Printf("CreatePatient DB error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "An internal error occurred"})
		return
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
	doctorID, ok := r.Context().Value(ShopkeeperIDKey).(int)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
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

	query := `
		SELECT p.id, p.name, p.phone, p.gender, p.age, p.medical_history, p.created_at,
		       COALESCE(COUNT(b.id) FILTER (WHERE b.remaining_amount > 0), 0) as dues_count,
		       COALESCE(SUM(b.remaining_amount), 0) as total_dues
		FROM patients p
		LEFT JOIN bills b ON p.id = b.patient_id
		WHERE p.doctor_id = $1
		GROUP BY p.id
		ORDER BY total_dues DESC, p.name ASC
		LIMIT $2 OFFSET $3
	`
	rows, err := db.Pool.Query(r.Context(), query, doctorID, limit, offset)
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

	writeJSON(w, http.StatusOK, patients)
}

// GetPatient returns details of a patient, their billing history, and appointments list
func GetPatient(w http.ResponseWriter, r *http.Request) {
	idStr := r.URL.Query().Get("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid patient ID"})
		return
	}

	doctorID, ok := r.Context().Value(ShopkeeperIDKey).(int)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	ctx := r.Context()

	// Load patient info
	var p Patient
	err = db.Pool.QueryRow(ctx, "SELECT id, name, phone, gender, age, medical_history, created_at FROM patients WHERE id = $1 AND doctor_id = $2", id, doctorID).Scan(
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

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"patient":      p,
		"contracts":    billsList, // Keep "contracts" key for compatibility with existing dashboard code
		"appointments": apptsList,
	})
}
