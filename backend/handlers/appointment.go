package handlers

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"backend/db"
	"backend/services"
)

type Appointment struct {
	ID              int       `json:"id"`
	PatientID       int       `json:"patient_id"`
	PatientName     string    `json:"patient_name"`
	PatientPhone    string    `json:"patient_phone"`
	DoctorID        int       `json:"doctor_id"`
	DoctorName      string    `json:"doctor_name"`
	AppointmentDate time.Time `json:"appointment_date"`
	Status          string    `json:"status"` // PENDING, COMPLETED, CANCELLED
	Reason          string    `json:"reason"`
	SlotID          *int      `json:"slot_id"`
	SlotTime        string    `json:"slot_time,omitempty"`
	CreatedAt       time.Time `json:"created_at"`
}

// CreateAppointment schedules an appointment using slot-based selection
func CreateAppointment(w http.ResponseWriter, r *http.Request) {
	var input struct {
		PatientID int    `json:"patient_id"`
		SlotID    int    `json:"slot_id"`
		Reason    string `json:"reason"`
	}

	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
		return
	}

	if input.SlotID <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Valid slot_id is required"})
		return
	}

	userID, ok := r.Context().Value(ShopkeeperIDKey).(int)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	role, err := getUserRole(r.Context(), userID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to determine user role"})
		return
	}

	facilityID, err := GetActiveFacilityID(r, userID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to get active facility"})
		return
	}

	// Resolve Patient ID for patients booking themselves
	patientID := input.PatientID
	if role == "USER" {
		var phone string
		err = db.Pool.QueryRow(r.Context(), "SELECT phone FROM users WHERE id = $1", userID).Scan(&phone)
		if err != nil {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "User account lookup failed"})
			return
		}

		err = db.Pool.QueryRow(r.Context(), "SELECT id FROM patients WHERE phone = $1 AND facility_id = $2", phone, facilityID).Scan(&patientID)
		if err != nil {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "Patient profile not found for this account"})
			return
		}
	} else {
		if patientID <= 0 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Valid patient_id is required"})
			return
		}
	}

	tx, err := db.Pool.Begin(r.Context())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Database error"})
		return
	}
	defer tx.Rollback(r.Context())

	// Lock the slot row for update to prevent concurrent overbooking
	var doctorID int
	var slotDate string
	var startTime string
	var maxPatients, bookedCount int
	var slotStatus string
	slotQuery := `
		SELECT doctor_id, slot_date::text, start_time::text, max_patients, booked_count, status
		FROM appointment_slots
		WHERE id = $1 AND facility_id = $2 FOR UPDATE
	`
	err = tx.QueryRow(r.Context(), slotQuery, input.SlotID, facilityID).Scan(&doctorID, &slotDate, &startTime, &maxPatients, &bookedCount, &slotStatus)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Appointment slot not found"})
		return
	}

	if slotStatus != "available" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Slot is no longer available"})
		return
	}

	if bookedCount >= maxPatients {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Appointment slot is fully booked"})
		return
	}

	// Parse slot date + time into a time.Time object
	parsedDateTime, err := time.Parse("2006-01-02 15:04:05", slotDate+" "+startTime)
	if err != nil {
		parsedDateTime, err = time.Parse("2006-01-02 15:04", slotDate+" "+startTime)
		if err != nil {
			// Fallback to today if parsing fails
			parsedDateTime = time.Now()
		}
	}

	// Insert appointment
	insertAppt := `
		INSERT INTO appointments (patient_id, doctor_id, appointment_date, status, reason, facility_id, slot_id)
		VALUES ($1, $2, $3, 'PENDING', $4, $5, $6)
		RETURNING id, status, created_at
	`
	var apptID int
	var status string
	var createdAt time.Time
	err = tx.QueryRow(r.Context(), insertAppt, patientID, doctorID, parsedDateTime, input.Reason, facilityID, input.SlotID).Scan(&apptID, &status, &createdAt)
	if err != nil {
		log.Printf("CreateAppointment insert error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to create appointment"})
		return
	}

	// Update slot bookings count
	newBookedCount := bookedCount + 1
	var newSlotStatus string = "available"
	if newBookedCount >= maxPatients {
		newSlotStatus = "full"
	}
	_, err = tx.Exec(r.Context(), "UPDATE appointment_slots SET booked_count = $1, status = $2 WHERE id = $3", newBookedCount, newSlotStatus, input.SlotID)
	if err != nil {
		log.Printf("CreateAppointment slot update error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to update slot count"})
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to confirm booking"})
		return
	}

	// Dispatch WhatsApp confirmation message (asynchronously to avoid blocking response)
	var patientName, patientPhone, doctorName, clinicName string
	db.Pool.QueryRow(r.Context(), "SELECT name, phone FROM patients WHERE id = $1", patientID).Scan(&patientName, &patientPhone)
	db.Pool.QueryRow(r.Context(), "SELECT name FROM users WHERE id = $1", doctorID).Scan(&doctorName)
	db.Pool.QueryRow(r.Context(), "SELECT name FROM facilities WHERE id = $1", facilityID).Scan(&clinicName)
	if clinicName == "" {
		clinicName = "Our Clinic"
	}

	go func(facID int, phone, patName, docName, clName, apptTimeStr, reasonStr string, docID int) {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		tmpl := GetTemplateForDoctor(ctx, docID, "appointment_confirmation")
		msgTemplate := tmpl.Greeting + "\n\n" + tmpl.Body + "\n\n" + tmpl.Footer
		replacer := strings.NewReplacer(
			"{patient_name}", patName,
			"{doctor_name}", docName,
			"{clinic_name}", clName,
			"{appointment_time}", apptTimeStr,
			"{reason}", reasonStr,
		)
		messageText := replacer.Replace(msgTemplate)

		if err := services.SendWhatsApp(facID, phone, messageText); err != nil {
			log.Printf("Failed to send appointment confirmation WhatsApp to %s (%s): %v", patName, phone, err)
		}
	}(facilityID, patientPhone, patientName, doctorName, clinicName, parsedDateTime.Format("Mon, Jan 2 at 3:04 PM"), input.Reason, doctorID)

	// Invalidate caches
	db.InvalidateCache(r.Context(), "appointments:list:*")
	db.InvalidateCache(r.Context(), "patient:detail:*")

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"id":               apptID,
		"patient_id":       patientID,
		"doctor_id":        doctorID,
		"appointment_date": parsedDateTime,
		"status":           status,
		"reason":           input.Reason,
		"slot_id":          input.SlotID,
		"created_at":       createdAt,
	})
}

// ListAppointments lists appointments based on user role and permissions
func ListAppointments(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(ShopkeeperIDKey).(int)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	role, err := getUserRole(r.Context(), userID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to determine user role"})
		return
	}

	facilityID, err := GetActiveFacilityID(r, userID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to get active facility"})
		return
	}

	limitStr := r.URL.Query().Get("limit")
	offsetStr := r.URL.Query().Get("offset")
	doctorIDFilterStr := r.URL.Query().Get("doctor_id")

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

	var baseQuery string
	var args []interface{}

	roleUpper := strings.ToUpper(role)
	if roleUpper == "DOCTOR" {
		// Doctors only see their own appointments
		baseQuery = `
			SELECT a.id, a.patient_id, p.name as patient_name, p.phone as patient_phone, 
			       a.doctor_id, u.name as doctor_name, a.appointment_date, a.status, a.reason, 
			       a.slot_id, COALESCE(s.start_time::text || ' - ' || s.end_time::text, ''), a.created_at
			FROM appointments a
			JOIN patients p ON a.patient_id = p.id
			JOIN users u ON a.doctor_id = u.id
			LEFT JOIN appointment_slots s ON a.slot_id = s.id
			WHERE a.doctor_id = $1 AND a.facility_id = $2
			ORDER BY a.appointment_date ASC
			LIMIT $3 OFFSET $4
		`
		args = []interface{}{userID, facilityID, limit, offset}
	} else if roleUpper == "USER" {
		// Patients see their own appointments (lookup phone number)
		var phone string
		err = db.Pool.QueryRow(r.Context(), "SELECT phone FROM users WHERE id = $1", userID).Scan(&phone)
		if err != nil {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "User account lookup failed"})
			return
		}

		baseQuery = `
			SELECT a.id, a.patient_id, p.name as patient_name, p.phone as patient_phone, 
			       a.doctor_id, u.name as doctor_name, a.appointment_date, a.status, a.reason, 
			       a.slot_id, COALESCE(s.start_time::text || ' - ' || s.end_time::text, ''), a.created_at
			FROM appointments a
			JOIN patients p ON a.patient_id = p.id
			JOIN users u ON a.doctor_id = u.id
			LEFT JOIN appointment_slots s ON a.slot_id = s.id
			WHERE p.phone = $1 AND a.facility_id = $2
			ORDER BY a.appointment_date ASC
			LIMIT $3 OFFSET $4
		`
		args = []interface{}{phone, facilityID, limit, offset}
	} else {
		// Admins, Pharmacists, etc. can see all appointments with optional doctor filter
		if doctorIDFilterStr != "" {
			doctorIDFilter, err := strconv.Atoi(doctorIDFilterStr)
			if err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid doctor_id filter"})
				return
			}
			baseQuery = `
				SELECT a.id, a.patient_id, p.name as patient_name, p.phone as patient_phone, 
				       a.doctor_id, u.name as doctor_name, a.appointment_date, a.status, a.reason, 
				       a.slot_id, COALESCE(s.start_time::text || ' - ' || s.end_time::text, ''), a.created_at
				FROM appointments a
				JOIN patients p ON a.patient_id = p.id
				JOIN users u ON a.doctor_id = u.id
				LEFT JOIN appointment_slots s ON a.slot_id = s.id
				WHERE a.doctor_id = $1 AND a.facility_id = $2
				ORDER BY a.appointment_date ASC
				LIMIT $3 OFFSET $4
			`
			args = []interface{}{doctorIDFilter, facilityID, limit, offset}
		} else {
			baseQuery = `
				SELECT a.id, a.patient_id, p.name as patient_name, p.phone as patient_phone, 
				       a.doctor_id, u.name as doctor_name, a.appointment_date, a.status, a.reason, 
				       a.slot_id, COALESCE(s.start_time::text || ' - ' || s.end_time::text, ''), a.created_at
				FROM appointments a
				JOIN patients p ON a.patient_id = p.id
				JOIN users u ON a.doctor_id = u.id
				LEFT JOIN appointment_slots s ON a.slot_id = s.id
				WHERE a.facility_id = $1
				ORDER BY a.appointment_date ASC
				LIMIT $2 OFFSET $3
			`
			args = []interface{}{facilityID, limit, offset}
		}
	}

	rows, err := db.Pool.Query(r.Context(), baseQuery, args...)
	if err != nil {
		log.Printf("ListAppointments DB query error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to retrieve appointments"})
		return
	}
	defer rows.Close()

	appointments := []Appointment{}
	for rows.Next() {
		var a Appointment
		err := rows.Scan(&a.ID, &a.PatientID, &a.PatientName, &a.PatientPhone, &a.DoctorID, &a.DoctorName, &a.AppointmentDate, &a.Status, &a.Reason, &a.SlotID, &a.SlotTime, &a.CreatedAt)
		if err != nil {
			log.Printf("ListAppointments scan error: %v", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to parse appointments"})
			return
		}
		appointments = append(appointments, a)
	}

	writeJSON(w, http.StatusOK, appointments)
}

// UpdateAppointmentStatus changes the status of an appointment and handles slot booked counts
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

	userID, ok := r.Context().Value(ShopkeeperIDKey).(int)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	role, err := getUserRole(r.Context(), userID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to determine user role"})
		return
	}

	tx, err := db.Pool.Begin(r.Context())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Database transaction error"})
		return
	}
	defer tx.Rollback(r.Context())

	// Verify appointment ownership/existence
	var currentStatus string
	var slotID *int
	var patientID, doctorID, facilityID int
	query := "SELECT status, slot_id, patient_id, doctor_id, facility_id FROM appointments WHERE id = $1 FOR UPDATE"
	err = tx.QueryRow(r.Context(), query, input.ID).Scan(&currentStatus, &slotID, &patientID, &doctorID, &facilityID)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Appointment not found"})
		return
	}

	// Verify permissions: doctor can edit own doctor appointments, patient can cancel own appointments
	if role == "DOCTOR" && doctorID != userID {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "Forbidden: Not your appointment"})
		return
	} else if role == "USER" {
		// Patients can only cancel their own appointments
		var phone string
		err = db.Pool.QueryRow(r.Context(), "SELECT phone FROM users WHERE id = $1", userID).Scan(&phone)
		if err != nil {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "User account lookup failed"})
			return
		}
		var isOwn bool
		err = db.Pool.QueryRow(r.Context(), "SELECT EXISTS(SELECT 1 FROM patients WHERE id = $1 AND phone = $2)", patientID, phone).Scan(&isOwn)
		if err != nil || !isOwn {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "Forbidden: Not your appointment"})
			return
		}
		if input.Status != "CANCELLED" {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "Forbidden: Patients can only cancel appointments"})
			return
		}
	}

	// Update appointment status
	_, err = tx.Exec(r.Context(), "UPDATE appointments SET status = $1 WHERE id = $2", input.Status, input.ID)
	if err != nil {
		log.Printf("UpdateAppointmentStatus DB error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to update status"})
		return
	}

	// If transitioning to CANCELLED from PENDING, decrement slot's booked_count
	if input.Status == "CANCELLED" && currentStatus == "PENDING" && slotID != nil {
		// Decrement bookings count
		var currentBookedCount int
		err = tx.QueryRow(r.Context(), "SELECT booked_count FROM appointment_slots WHERE id = $1 FOR UPDATE", *slotID).Scan(&currentBookedCount)
		if err == nil && currentBookedCount > 0 {
			newCount := currentBookedCount - 1
			_, err = tx.Exec(r.Context(), "UPDATE appointment_slots SET booked_count = $1, status = 'available' WHERE id = $2", newCount, *slotID)
			if err != nil {
				log.Printf("UpdateAppointmentStatus slot count decrement error: %v", err)
			}
		}
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to commit changes"})
		return
	}

	// Invalidate caches
	db.InvalidateCache(r.Context(), "appointments:list:*")
	db.InvalidateCache(r.Context(), "patient:detail:*")

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"id":     input.ID,
		"status": input.Status,
	})
}
