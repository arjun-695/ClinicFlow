package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

	"backend/db"
)

type UnavailabilityRecord struct {
	ID                 int       `json:"id"`
	FacilityID         int       `json:"facility_id"`
	DoctorID           int       `json:"doctor_id"`
	UnavailableDate    string    `json:"unavailable_date"`
	Reason             string    `json:"reason"`
	TriggeredBy        int       `json:"triggered_by"`
	NotificationStatus string    `json:"notification_status"`
	CreatedAt          time.Time `json:"created_at"`
}

type RescheduleItem struct {
	ID                int       `json:"id"`
	FacilityID        int       `json:"facility_id"`
	AppointmentID     int       `json:"appointment_id"`
	PatientID         int       `json:"patient_id"`
	PatientName       string    `json:"patient_name"`
	PatientPhone      string    `json:"patient_phone"`
	DoctorID          int       `json:"doctor_id"`
	DoctorName        string    `json:"doctor_name"`
	OriginalDate      string    `json:"original_date"`
	OriginalSlotID    *int      `json:"original_slot_id"`
	OriginalSlotTime  string    `json:"original_slot_time,omitempty"`
	NewSlotID         *int      `json:"new_slot_id"`
	Status            string    `json:"status"` // pending, rescheduled, cancelled, notified
	NotificationSent  bool      `json:"notification_sent"`
	CreatedAt         time.Time `json:"created_at"`
}

// MarkDoctorUnavailable registers unavailability, cancels slots, and queues reschedules
func MarkDoctorUnavailable(w http.ResponseWriter, r *http.Request) {
	var input struct {
		DoctorID        int    `json:"doctor_id"`
		UnavailableDate string `json:"unavailable_date"` // YYYY-MM-DD
		Reason          string `json:"reason"`
	}

	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
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

	doctorID := input.DoctorID
	if role == "DOCTOR" {
		doctorID = userID
	} else if role != "HOSPITAL_ADMIN" {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "Forbidden: insufficient permissions"})
		return
	}

	if doctorID <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Valid doctor_id is required"})
		return
	}

	facilityID, err := GetActiveFacilityID(r, userID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to resolve active facility"})
		return
	}

	_, err = time.Parse("2006-01-02", input.UnavailableDate)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid date format. Use YYYY-MM-DD"})
		return
	}

	tx, err := db.Pool.Begin(r.Context())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to start transaction"})
		return
	}
	defer tx.Rollback(r.Context())

	// 1. Insert doctor unavailability
	insertUnavail := `
		INSERT INTO doctor_unavailability (facility_id, doctor_id, unavailable_date, reason, triggered_by, notification_status)
		VALUES ($1, $2, $3, $4, $5, 'pending')
		ON CONFLICT (facility_id, doctor_id, unavailable_date) 
		DO UPDATE SET reason = EXCLUDED.reason, triggered_by = EXCLUDED.triggered_by
	`
	_, err = tx.Exec(r.Context(), insertUnavail, facilityID, doctorID, input.UnavailableDate, input.Reason, userID)
	if err != nil {
		log.Printf("MarkDoctorUnavailable insert unavail error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to record unavailability"})
		return
	}

	// 2. Insert booked appointments into reschedule_queue
	queueReschedules := `
		INSERT INTO reschedule_queue (facility_id, appointment_id, patient_id, doctor_id, original_date, original_slot_id, status)
		SELECT facility_id, id, patient_id, doctor_id, appointment_date::DATE, slot_id, 'pending'
		FROM appointments
		WHERE doctor_id = $1 
		  AND facility_id = $2 
		  AND appointment_date::DATE = $3::DATE 
		  AND status != 'CANCELLED'
		  AND id NOT IN (SELECT appointment_id FROM reschedule_queue WHERE status = 'pending')
	`
	_, err = tx.Exec(r.Context(), queueReschedules, doctorID, facilityID, input.UnavailableDate)
	if err != nil {
		log.Printf("MarkDoctorUnavailable reschedule insert error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to populate reschedule queue"})
		return
	}

	// 3. Mark appointment slots as cancelled and reset bookings count
	cancelSlots := `
		UPDATE appointment_slots
		SET status = 'cancelled', booked_count = 0
		WHERE doctor_id = $1 AND facility_id = $2 AND slot_date = $3::DATE
	`
	_, err = tx.Exec(r.Context(), cancelSlots, doctorID, facilityID, input.UnavailableDate)
	if err != nil {
		log.Printf("MarkDoctorUnavailable slots cancel error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to cancel affected slots"})
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to save changes"})
		return
	}

	// Trigger background WhatsApp notification (logged in Phase 5 worker)
	log.Printf("Unavailability automation: queued WhatsApp alerts for doctor ID %d on %s", doctorID, input.UnavailableDate)

	writeJSON(w, http.StatusOK, map[string]string{"message": "Doctor unavailability registered and affected appointments queued for rescheduling"})
}

// ListRescheduleQueue returns all pending reschedule requests
func ListRescheduleQueue(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(ShopkeeperIDKey).(int)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	role, err := getUserRole(r.Context(), userID)
	if err != nil || role != "HOSPITAL_ADMIN" {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "Forbidden: Admins only"})
		return
	}

	facilityID, err := GetActiveFacilityID(r, userID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to resolve active facility"})
		return
	}

	query := `
		SELECT rq.id, rq.facility_id, rq.appointment_id, rq.patient_id, p.name, p.phone,
		       rq.doctor_id, u.name, rq.original_date::text, rq.original_slot_id,
		       COALESCE(s.start_time::text || ' - ' || s.end_time::text, ''),
		       rq.new_slot_id, rq.status, rq.notification_sent, rq.created_at
		FROM reschedule_queue rq
		JOIN patients p ON rq.patient_id = p.id
		JOIN users u ON rq.doctor_id = u.id
		LEFT JOIN appointment_slots s ON rq.original_slot_id = s.id
		WHERE rq.facility_id = $1 AND rq.status = 'pending'
		ORDER BY rq.created_at DESC
	`
	rows, err := db.Pool.Query(r.Context(), query, facilityID)
	if err != nil {
		log.Printf("ListRescheduleQueue query error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to load reschedule queue"})
		return
	}
	defer rows.Close()

	items := []RescheduleItem{}
	for rows.Next() {
		var rq RescheduleItem
		err = rows.Scan(
			&rq.ID, &rq.FacilityID, &rq.AppointmentID, &rq.PatientID, &rq.PatientName, &rq.PatientPhone,
			&rq.DoctorID, &rq.DoctorName, &rq.OriginalDate, &rq.OriginalSlotID, &rq.OriginalSlotTime,
			&rq.NewSlotID, &rq.Status, &rq.NotificationSent, &rq.CreatedAt,
		)
		if err == nil {
			items = append(items, rq)
		}
	}

	writeJSON(w, http.StatusOK, items)
}

// ResolveReschedule assigns a new slot to a queued appointment
func ResolveReschedule(w http.ResponseWriter, r *http.Request) {
	var input struct {
		RescheduleID int `json:"reschedule_id"`
		NewSlotID    int `json:"new_slot_id"`
	}

	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
		return
	}

	userID, ok := r.Context().Value(ShopkeeperIDKey).(int)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	role, err := getUserRole(r.Context(), userID)
	if err != nil || role != "HOSPITAL_ADMIN" {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "Forbidden: Admins only"})
		return
	}

	facilityID, err := GetActiveFacilityID(r, userID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to resolve active facility"})
		return
	}

	tx, err := db.Pool.Begin(r.Context())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to start transaction"})
		return
	}
	defer tx.Rollback(r.Context())

	// Fetch reschedule item
	var appointmentID, doctorID int
	err = tx.QueryRow(r.Context(), `
		SELECT appointment_id, doctor_id 
		FROM reschedule_queue 
		WHERE id = $1 AND facility_id = $2 AND status = 'pending'
	`, input.RescheduleID, facilityID).Scan(&appointmentID, &doctorID)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Reschedule request not found"})
		return
	}

	// Fetch new slot details
	var slotDate string
	var startTime string
	var maxPatients, bookedCount int
	slotQuery := `
		SELECT slot_date::text, start_time::text, max_patients, booked_count 
		FROM appointment_slots 
		WHERE id = $1 AND doctor_id = $2 AND facility_id = $3 FOR UPDATE
	`
	err = tx.QueryRow(r.Context(), slotQuery, input.NewSlotID, doctorID, facilityID).Scan(&slotDate, &startTime, &maxPatients, &bookedCount)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "New slot not found or belongs to a different doctor"})
		return
	}

	if bookedCount >= maxPatients {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Target slot is already fully booked"})
		return
	}

	// Update appointment slot and date
	updateAppt := `
		UPDATE appointments
		SET slot_id = $1, appointment_date = ($2::date + $3::time)
		WHERE id = $4 AND facility_id = $5
	`
	_, err = tx.Exec(r.Context(), updateAppt, input.NewSlotID, slotDate, startTime, appointmentID, facilityID)
	if err != nil {
		log.Printf("ResolveReschedule update appointment error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to update appointment slot"})
		return
	}

	// Increment new slot bookings count
	_, err = tx.Exec(r.Context(), "UPDATE appointment_slots SET booked_count = booked_count + 1 WHERE id = $1", input.NewSlotID)
	if err != nil {
		log.Printf("ResolveReschedule increment count error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to update slot booking count"})
		return
	}

	// Update reschedule queue item status
	_, err = tx.Exec(r.Context(), "UPDATE reschedule_queue SET status = 'rescheduled', new_slot_id = $1 WHERE id = $2", input.NewSlotID, input.RescheduleID)
	if err != nil {
		log.Printf("ResolveReschedule queue status error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to resolve queue request"})
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to save reschedule changes"})
		return
	}

	// Send rescheduling notification (Triggered in Phase 5 worker)
	log.Printf("Reschedule automation: queued WhatsApp update for rescheduled appointment ID %d", appointmentID)

	writeJSON(w, http.StatusOK, map[string]string{"message": "Appointment rescheduled successfully"})
}
