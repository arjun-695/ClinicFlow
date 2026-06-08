package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"time"

	"backend/db"
)

type Appointment struct {
	ID              int       `json:"id"`
	PatientID       int       `json:"patient_id"`
	PatientName     string    `json:"patient_name"`
	PatientPhone    string    `json:"patient_phone"`
	DoctorID        int       `json:"doctor_id"`
	AppointmentDate time.Time `json:"appointment_date"`
	Status          string    `json:"status"`
	Reason          string    `json:"reason"`
	CreatedAt       time.Time `json:"created_at"`
}

// CreateAppointment schedules an appointment
func CreateAppointment(w http.ResponseWriter, r *http.Request) {
	var input struct {
		PatientID       int    `json:"patient_id"`
		AppointmentDate string `json:"appointment_date"` // RFC3339 or "2006-01-02T15:04"
		Reason          string `json:"reason"`
	}

	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
		return
	}

	if input.PatientID <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Valid patient_id is required"})
		return
	}

	if input.AppointmentDate == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Appointment date is required"})
		return
	}

	var parsedDate time.Time
	var err error
	if parsedDate, err = time.Parse(time.RFC3339, input.AppointmentDate); err != nil {
		if parsedDate, err = time.Parse("2006-01-02T15:04", input.AppointmentDate); err != nil {
			if parsedDate, err = time.Parse("2006-01-02 15:04", input.AppointmentDate); err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid date format. Use ISO8601 (e.g. 2006-01-02T15:04:00Z) or YYYY-MM-DDTHH:MM."})
				return
			}
		}
	}

	doctorID, ok := r.Context().Value(ShopkeeperIDKey).(int)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	// Verify patient belongs to the doctor
	var patientExists bool
	err = db.Pool.QueryRow(r.Context(), "SELECT EXISTS(SELECT 1 FROM patients WHERE id = $1 AND doctor_id = $2)", input.PatientID, doctorID).Scan(&patientExists)
	if err != nil || !patientExists {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Patient not found"})
		return
	}

	query := `
		INSERT INTO appointments (patient_id, doctor_id, appointment_date, status, reason)
		VALUES ($1, $2, $3, 'PENDING', $4)
		RETURNING id, status, created_at
	`
	var id int
	var status string
	var createdAt time.Time
	err = db.Pool.QueryRow(r.Context(), query, input.PatientID, doctorID, parsedDate, input.Reason).Scan(&id, &status, &createdAt)
	if err != nil {
		log.Printf("CreateAppointment DB error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "An internal error occurred"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"id":               id,
		"patient_id":       input.PatientID,
		"doctor_id":        doctorID,
		"appointment_date": parsedDate,
		"status":           status,
		"reason":           input.Reason,
		"created_at":       createdAt,
	})
}

// ListAppointments lists all appointments for the logged-in doctor (paginated)
func ListAppointments(w http.ResponseWriter, r *http.Request) {
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
		SELECT a.id, a.patient_id, p.name as patient_name, p.phone as patient_phone, 
		       a.doctor_id, a.appointment_date, a.status, a.reason, a.created_at
		FROM appointments a
		JOIN patients p ON a.patient_id = p.id
		WHERE a.doctor_id = $1
		ORDER BY a.appointment_date ASC
		LIMIT $2 OFFSET $3
	`
	rows, err := db.Pool.Query(r.Context(), query, doctorID, limit, offset)
	if err != nil {
		log.Printf("ListAppointments DB error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "An internal error occurred"})
		return
	}
	defer rows.Close()

	appointments := []Appointment{}
	for rows.Next() {
		var a Appointment
		err := rows.Scan(&a.ID, &a.PatientID, &a.PatientName, &a.PatientPhone, &a.DoctorID, &a.AppointmentDate, &a.Status, &a.Reason, &a.CreatedAt)
		if err != nil {
			log.Printf("ListAppointments scan error: %v", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "An internal error occurred"})
			return
		}
		appointments = append(appointments, a)
	}

	writeJSON(w, http.StatusOK, appointments)
}

// UpdateAppointmentStatus changes the status of an appointment
func UpdateAppointmentStatus(w http.ResponseWriter, r *http.Request) {
	var input struct {
		ID     int    `json:"id"`
		Status string `json:"status"` // PENDING, COMPLETED, CANCELLED
	}

	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
		return
	}

	if input.ID <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Valid ID is required"})
		return
	}

	if input.Status != "PENDING" && input.Status != "COMPLETED" && input.Status != "CANCELLED" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Status must be 'PENDING', 'COMPLETED', or 'CANCELLED'"})
		return
	}

	doctorID, ok := r.Context().Value(ShopkeeperIDKey).(int)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	// Verify appointment belongs to doctor
	var exists bool
	err := db.Pool.QueryRow(r.Context(), "SELECT EXISTS(SELECT 1 FROM appointments WHERE id = $1 AND doctor_id = $2)", input.ID, doctorID).Scan(&exists)
	if err != nil || !exists {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Appointment not found"})
		return
	}

	_, err = db.Pool.Exec(r.Context(), "UPDATE appointments SET status = $1 WHERE id = $2", input.Status, input.ID)
	if err != nil {
		log.Printf("UpdateAppointmentStatus DB error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "An internal error occurred"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"id":     input.ID,
		"status": input.Status,
	})
}
