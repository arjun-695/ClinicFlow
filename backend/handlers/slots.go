package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"time"

	"backend/db"
)

type DoctorAvailability struct {
	ID                  int    `json:"id"`
	FacilityID          int    `json:"facility_id"`
	DoctorID            int    `json:"doctor_id"`
	DayOfWeek           int    `json:"day_of_week"` // 0=Sun, 6=Sat
	StartTime           string `json:"start_time"`  // e.g. "09:00:00"
	EndTime             string `json:"end_time"`    // e.g. "17:00:00"
	SlotDurationMinutes int    `json:"slot_duration_minutes"`
	MaxPatientsPerSlot  int    `json:"max_patients_per_slot"`
	IsActive            bool   `json:"is_active"`
}

type AppointmentSlot struct {
	ID          int    `json:"id"`
	FacilityID  int    `json:"facility_id"`
	DoctorID    int    `json:"doctor_id"`
	SlotDate    string `json:"slot_date"` // YYYY-MM-DD
	StartTime   string `json:"start_time"`
	EndTime     string `json:"end_time"`
	MaxPatients int    `json:"max_patients"`
	BookedCount int    `json:"booked_count"`
	Status      string `json:"status"` // available, full, cancelled, blocked
}

// Helper to parse Postgres TIME string
func parsePGTime(timeStr string) (time.Time, error) {
	if len(timeStr) > 5 {
		// truncate seconds if present, e.g. "09:00:00" -> "09:00"
		timeStr = timeStr[:5]
	}
	return time.Parse("15:04", timeStr)
}

// SetDoctorAvailability updates the doctor's weekly availability schedule
func SetDoctorAvailability(w http.ResponseWriter, r *http.Request) {
	var input struct {
		DoctorID       int                  `json:"doctor_id"`
		Availabilities []DoctorAvailability `json:"availabilities"`
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

	// Verify permissions: admin can set for anyone, doctor can only set for themselves
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

	tx, err := db.Pool.Begin(r.Context())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to start transaction"})
		return
	}
	defer tx.Rollback(r.Context())

	// Clear existing availabilities
	_, err = tx.Exec(r.Context(), "DELETE FROM doctor_availability WHERE facility_id = $1 AND doctor_id = $2", facilityID, doctorID)
	if err != nil {
		log.Printf("SetDoctorAvailability delete error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to update availability schedule"})
		return
	}

	// Insert new availabilities
	insertQuery := `
		INSERT INTO doctor_availability (facility_id, doctor_id, day_of_week, start_time, end_time, slot_duration_minutes, max_patients_per_slot, is_active)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	`
	for _, avail := range input.Availabilities {
		if avail.DayOfWeek < 0 || avail.DayOfWeek > 6 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "day_of_week must be between 0 (Sun) and 6 (Sat)"})
			return
		}
		duration := avail.SlotDurationMinutes
		if duration <= 0 {
			duration = 60 // Default to 1 hour
		}
		maxPatients := avail.MaxPatientsPerSlot
		if maxPatients <= 0 {
			maxPatients = 1
		}

		_, err = tx.Exec(r.Context(), insertQuery, facilityID, doctorID, avail.DayOfWeek, avail.StartTime, avail.EndTime, duration, maxPatients, avail.IsActive)
		if err != nil {
			log.Printf("SetDoctorAvailability insert error: %v", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to write availability record"})
			return
		}
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to commit transaction"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "Doctor availability updated successfully"})
}

// GetDoctorAvailability retrieves the doctor's weekly availability schedule
func GetDoctorAvailability(w http.ResponseWriter, r *http.Request) {
	doctorIDStr := r.URL.Query().Get("doctor_id")
	var doctorID int
	var err error

	userID, ok := r.Context().Value(ShopkeeperIDKey).(int)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	if doctorIDStr != "" {
		doctorID, err = strconv.Atoi(doctorIDStr)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid doctor ID"})
			return
		}
	} else {
		role, _ := getUserRole(r.Context(), userID)
		if role == "DOCTOR" {
			doctorID = userID
		} else {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "doctor_id is required"})
			return
		}
	}

	facilityID, err := GetActiveFacilityID(r, userID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to resolve active facility"})
		return
	}

	query := `
		SELECT id, facility_id, doctor_id, day_of_week, start_time::text, end_time::text, slot_duration_minutes, max_patients_per_slot, is_active
		FROM doctor_availability
		WHERE facility_id = $1 AND doctor_id = $2
		ORDER BY day_of_week ASC
	`
	rows, err := db.Pool.Query(r.Context(), query, facilityID, doctorID)
	if err != nil {
		log.Printf("GetDoctorAvailability query error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to fetch availability schedule"})
		return
	}
	defer rows.Close()

	availabilities := []DoctorAvailability{}
	for rows.Next() {
		var a DoctorAvailability
		err = rows.Scan(&a.ID, &a.FacilityID, &a.DoctorID, &a.DayOfWeek, &a.StartTime, &a.EndTime, &a.SlotDurationMinutes, &a.MaxPatientsPerSlot, &a.IsActive)
		if err == nil {
			availabilities = append(availabilities, a)
		}
	}

	writeJSON(w, http.StatusOK, availabilities)
}

type SlotPreview struct {
	SlotDate    string `json:"slot_date"`
	StartTime   string `json:"start_time"`
	EndTime     string `json:"end_time"`
	MaxPatients int    `json:"max_patients"`
}

// GenerateSlots previews discrete appointment slots over a date range
func GenerateSlots(w http.ResponseWriter, r *http.Request) {
	var input struct {
		DoctorID  int    `json:"doctor_id"`
		StartDate string `json:"start_date"` // YYYY-MM-DD
		EndDate   string `json:"end_date"`   // YYYY-MM-DD
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

	start, err := time.Parse("2006-01-02", input.StartDate)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid start_date. Use YYYY-MM-DD"})
		return
	}

	end, err := time.Parse("2006-01-02", input.EndDate)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid end_date. Use YYYY-MM-DD"})
		return
	}

	if start.After(end) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "start_date cannot be after end_date"})
		return
	}

	// Fetch active availability rules
	query := `
		SELECT day_of_week, start_time::text, end_time::text, slot_duration_minutes, max_patients_per_slot
		FROM doctor_availability
		WHERE facility_id = $1 AND doctor_id = $2 AND is_active = true
	`
	rows, err := db.Pool.Query(r.Context(), query, facilityID, doctorID)
	if err != nil {
		log.Printf("GenerateSlots fetch availability error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to fetch availability schedule"})
		return
	}
	defer rows.Close()

	rules := make(map[int][]DoctorAvailability)
	for rows.Next() {
		var a DoctorAvailability
		err = rows.Scan(&a.DayOfWeek, &a.StartTime, &a.EndTime, &a.SlotDurationMinutes, &a.MaxPatientsPerSlot)
		if err == nil {
			rules[a.DayOfWeek] = append(rules[a.DayOfWeek], a)
		}
	}

	previews := []SlotPreview{}
	// Iterate through dates
	for d := start; !d.After(end); d = d.AddDate(0, 0, 1) {
		dayOfWeek := int(d.Weekday())
		dayRules, exists := rules[dayOfWeek]
		if !exists {
			continue
		}

		for _, rule := range dayRules {
			sTime, err1 := parsePGTime(rule.StartTime)
			eTime, err2 := parsePGTime(rule.EndTime)
			if err1 != nil || err2 != nil {
				continue
			}

			duration := time.Duration(rule.SlotDurationMinutes) * time.Minute
			for current := sTime; current.Add(duration).Before(eTime) || current.Add(duration).Equal(eTime); current = current.Add(duration) {
				previews = append(previews, SlotPreview{
					SlotDate:    d.Format("2006-01-02"),
					StartTime:   current.Format("15:04"),
					EndTime:     current.Add(duration).Format("15:04"),
					MaxPatients: rule.MaxPatientsPerSlot,
				})
			}
		}
	}

	writeJSON(w, http.StatusOK, previews)
}

// ConfirmSlots writes generated preview slots to the database
func ConfirmSlots(w http.ResponseWriter, r *http.Request) {
	var input struct {
		DoctorID int           `json:"doctor_id"`
		Slots    []SlotPreview `json:"slots"`
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

	tx, err := db.Pool.Begin(r.Context())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to start transaction"})
		return
	}
	defer tx.Rollback(r.Context())

	insertQuery := `
		INSERT INTO appointment_slots (facility_id, doctor_id, slot_date, start_time, end_time, max_patients, booked_count, status)
		VALUES ($1, $2, $3, $4, $5, $6, 0, 'available')
		ON CONFLICT (facility_id, doctor_id, slot_date, start_time) DO NOTHING
	`
	for _, slot := range input.Slots {
		_, err = tx.Exec(r.Context(), insertQuery, facilityID, doctorID, slot.SlotDate, slot.StartTime, slot.EndTime, slot.MaxPatients)
		if err != nil {
			log.Printf("ConfirmSlots insert error: %v", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to save appointment slots"})
			return
		}
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to commit slots"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "Appointment slots created successfully"})
}

// ListSlots lists available and booked slots for a doctor on a specific date
func ListSlots(w http.ResponseWriter, r *http.Request) {
	doctorIDStr := r.URL.Query().Get("doctor_id")
	dateStr := r.URL.Query().Get("date")

	if doctorIDStr == "" || dateStr == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "doctor_id and date are required"})
		return
	}

	doctorID, err := strconv.Atoi(doctorIDStr)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid doctor ID"})
		return
	}

	userID, ok := r.Context().Value(ShopkeeperIDKey).(int)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	facilityID, err := GetActiveFacilityID(r, userID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to resolve active facility"})
		return
	}

	query := `
		SELECT id, facility_id, doctor_id, slot_date::text, start_time::text, end_time::text, max_patients, booked_count, status
		FROM appointment_slots
		WHERE facility_id = $1 AND doctor_id = $2 AND slot_date = $3
		ORDER BY start_time ASC
	`
	rows, err := db.Pool.Query(r.Context(), query, facilityID, doctorID, dateStr)
	if err != nil {
		log.Printf("ListSlots query error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to fetch slots"})
		return
	}
	defer rows.Close()

	slots := []AppointmentSlot{}
	for rows.Next() {
		var s AppointmentSlot
		err = rows.Scan(&s.ID, &s.FacilityID, &s.DoctorID, &s.SlotDate, &s.StartTime, &s.EndTime, &s.MaxPatients, &s.BookedCount, &s.Status)
		if err == nil {
			slots = append(slots, s)
		}
	}

	writeJSON(w, http.StatusOK, slots)
}

// EditSlot modifies slot times or capacity (Admin only)
func EditSlot(w http.ResponseWriter, r *http.Request) {
	var input struct {
		SlotID         int    `json:"slot_id"`
		StartTime      string `json:"start_time"`
		EndTime        string `json:"end_time"`
		MaxPatients    int    `json:"max_patients"`
		TargetSlotID   *int   `json:"target_slot_id"` // required if booked_count > 0 to merge appointments
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

	// Fetch current slot details
	var bookedCount, currentMax int
	err = tx.QueryRow(r.Context(), "SELECT booked_count, max_patients FROM appointment_slots WHERE id = $1 AND facility_id = $2", input.SlotID, facilityID).Scan(&bookedCount, &currentMax)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Slot not found"})
		return
	}

	if bookedCount > 0 {
		if input.TargetSlotID == nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Slot has active bookings. Specify target_slot_id to merge bookings."})
			return
		}

		// Move existing appointments to the target slot
		_, err = tx.Exec(r.Context(), "UPDATE appointments SET slot_id = $1 WHERE slot_id = $2 AND status != 'CANCELLED'", *input.TargetSlotID, input.SlotID)
		if err != nil {
			log.Printf("EditSlot update appointments error: %v", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to move appointments to target slot"})
			return
		}

		// Add bookings count to target slot
		_, err = tx.Exec(r.Context(), "UPDATE appointment_slots SET booked_count = booked_count + $1 WHERE id = $2", bookedCount, *input.TargetSlotID)
		if err != nil {
			log.Printf("EditSlot update target slot count error: %v", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to update target slot count"})
			return
		}

		// Reset booked count of old slot
		_, err = tx.Exec(r.Context(), "UPDATE appointment_slots SET booked_count = 0 WHERE id = $1", input.SlotID)
		if err != nil {
			log.Printf("EditSlot reset old slot count error: %v", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to reset old slot count"})
			return
		}
	}

	// Update the slot details
	_, err = tx.Exec(r.Context(), `
		UPDATE appointment_slots
		SET start_time = $1, end_time = $2, max_patients = $3
		WHERE id = $4 AND facility_id = $5
	`, input.StartTime, input.EndTime, input.MaxPatients, input.SlotID, facilityID)
	if err != nil {
		log.Printf("EditSlot update slot details error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to update slot details"})
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to commit transaction"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "Slot modified successfully"})
}

// CancelSlot cancels an appointment slot and moves active bookings to reschedule queue
func CancelSlot(w http.ResponseWriter, r *http.Request) {
	var input struct {
		SlotID int `json:"slot_id"`
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

	// Get slot date and details
	var doctorID int
	var slotDate string
	err = tx.QueryRow(r.Context(), "SELECT doctor_id, slot_date::text FROM appointment_slots WHERE id = $1 AND facility_id = $2", input.SlotID, facilityID).Scan(&doctorID, &slotDate)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Slot not found"})
		return
	}

	// Move active appointments to reschedule_queue
	reschedQuery := `
		INSERT INTO reschedule_queue (facility_id, appointment_id, patient_id, doctor_id, original_date, original_slot_id, status)
		SELECT facility_id, id, patient_id, doctor_id, appointment_date::DATE, slot_id, 'pending'
		FROM appointments
		WHERE slot_id = $1 AND status != 'CANCELLED'
	`
	_, err = tx.Exec(r.Context(), reschedQuery, input.SlotID)
	if err != nil {
		log.Printf("CancelSlot reschedule insert error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to queue reschedules"})
		return
	}

	// Update slot status to cancelled
	_, err = tx.Exec(r.Context(), "UPDATE appointment_slots SET status = 'cancelled', booked_count = 0 WHERE id = $1", input.SlotID)
	if err != nil {
		log.Printf("CancelSlot update status error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to cancel slot"})
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to commit cancellation"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "Slot cancelled. Booked appointments moved to reschedule queue."})
}
