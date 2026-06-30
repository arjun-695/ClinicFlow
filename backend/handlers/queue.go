package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"backend/db"
)

type QueueEntry struct {
	ID                    int        `json:"id"`
	DoctorID              int        `json:"doctor_id"`
	PatientID             int        `json:"patient_id"`
	PatientName           string     `json:"patient_name"`
	PatientPhone          string     `json:"patient_phone"`
	EncounterID           *string    `json:"encounter_id"`
	Status                string     `json:"status"` // WAITING, IN_CONSULTATION, COMPLETED, CANCELLED
	QueueOrder            int        `json:"queue_order"`
	CheckInTime           time.Time  `json:"check_in_time"`
	ConsultationStart     *time.Time `json:"consultation_start_time"`
	ConsultationEnd       *time.Time `json:"consultation_end_time"`
	EstimatedWaitMinutes  int        `json:"estimated_wait_minutes"`
}

// WebSocket / SSE connection management
type wsClient struct {
	conn     wsConn
	doctorID int
	send     chan []byte
}

type wsConn interface {
	WriteMessage(messageType int, data []byte) error
	Close() error
}

var (
	wsClients   = make(map[*wsClient]bool)
	wsClientsMu sync.Mutex
)

// BroadcastQueueUpdate sends a signal to all connected clients for a doctor to refresh their queue
func BroadcastQueueUpdate(doctorID int) {
	wsClientsMu.Lock()
	defer wsClientsMu.Unlock()

	msg, _ := json.Marshal(map[string]interface{}{
		"event":     "queue_update",
		"doctor_id": doctorID,
	})

	for client := range wsClients {
		if client.doctorID == doctorID {
			select {
			case client.send <- msg:
			default:
				// Channel full, drop or ignore
			}
		}
	}
}

func CalculateWaitTime(ctx context.Context, doctorID int, facilityID int, targetOrder int) int {
	var avgMinutes float64
	limitQuery := `
		WITH last_completed AS (
			SELECT consultation_start_time, consultation_end_time 
			FROM queue_entries 
			WHERE doctor_id = $1 AND facility_id = $2
			  AND status = 'COMPLETED' 
			  AND consultation_start_time IS NOT NULL 
			  AND consultation_end_time IS NOT NULL
			  ORDER BY consultation_end_time DESC 
			  LIMIT 5
		)
		SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (consultation_end_time - consultation_start_time))/60), 15.0)
		FROM last_completed
	`
	err := db.Pool.QueryRow(ctx, limitQuery, doctorID, facilityID).Scan(&avgMinutes)
	if err != nil {
		avgMinutes = 15.0
	}

	var countAhead int
	countQuery := `
		SELECT COUNT(*) 
		FROM queue_entries 
		WHERE doctor_id = $1 AND facility_id = $3
		  AND (status = 'WAITING' OR status = 'IN_CONSULTATION')
		  AND queue_order < $2
	`
	_ = db.Pool.QueryRow(ctx, countQuery, doctorID, targetOrder, facilityID).Scan(&countAhead)

	estimated := int(float64(countAhead) * avgMinutes)
	if estimated < 0 {
		return 0
	}
	return estimated
}

// CheckInPatient checks a patient into the queue
func CheckInPatient(w http.ResponseWriter, r *http.Request) {
	var input struct {
		PatientID int    `json:"patient_id"`
		DoctorID  int    `json:"doctor_id"`
		Reason    string `json:"reason"`
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

	var role, phone string
	err := db.Pool.QueryRow(r.Context(), "SELECT role, phone FROM users WHERE id = $1", userID).Scan(&role, &phone)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "User account lookup failed"})
		return
	}

	facilityID, err := GetActiveFacilityID(r, userID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to get active facility"})
		return
	}

	patientID := input.PatientID
	doctorID := input.DoctorID

	roleUpper := strings.ToUpper(role)
	if roleUpper == "USER" {
		// Patient booking themselves - resolve their patient record
		err = db.Pool.QueryRow(r.Context(), "SELECT id FROM patients WHERE phone = $1 AND facility_id = $2 LIMIT 1", phone, facilityID).Scan(&patientID)
		if err != nil {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "Patient profile not found for this account"})
			return
		}

		if doctorID <= 0 {
			// Try to find today's active appointment
			err = db.Pool.QueryRow(r.Context(), `
				SELECT doctor_id FROM appointments 
				WHERE patient_id = $1 AND facility_id = $2 AND appointment_date::DATE = CURRENT_DATE AND status != 'CANCELLED' 
				LIMIT 1
			`, patientID, facilityID).Scan(&doctorID)
			if err != nil {
				// Fallback to patient_doctors assignment
				err = db.Pool.QueryRow(r.Context(), "SELECT doctor_id FROM patient_doctors WHERE patient_id = $1 AND facility_id = $2 LIMIT 1", patientID, facilityID).Scan(&doctorID)
				if err != nil {
					writeJSON(w, http.StatusBadRequest, map[string]string{"error": "No assigned doctor found. Please specify doctor_id."})
					return
				}
			}
		}
	} else {
		// Admin/Doctor booking
		if patientID <= 0 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Valid patient_id is required"})
			return
		}
		if doctorID <= 0 {
			if roleUpper == "DOCTOR" {
				doctorID = userID
			} else {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "doctor_id is required"})
				return
			}
		}
	}

	// Verify doctor belongs to facility
	var docExists bool
	err = db.Pool.QueryRow(r.Context(), "SELECT EXISTS(SELECT 1 FROM user_facilities WHERE user_id = $1 AND facility_id = $2)", doctorID, facilityID).Scan(&docExists)
	if err != nil || !docExists {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Selected doctor is not associated with this facility"})
		return
	}

	// Prevent duplicate check-in for today
	var checkedIn bool
	checkQuery := `
		SELECT EXISTS(
			SELECT 1 FROM queue_entries 
			WHERE patient_id = $1 AND doctor_id = $2 AND facility_id = $3
			  AND check_in_time > CURRENT_DATE
			  AND status IN ('WAITING', 'IN_CONSULTATION')
		)
	`
	_ = db.Pool.QueryRow(r.Context(), checkQuery, patientID, doctorID, facilityID).Scan(&checkedIn)
	if checkedIn {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Patient is already checked in and waiting in the queue"})
		return
	}

	tx, err := db.Pool.Begin(r.Context())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Transaction error"})
		return
	}
	defer tx.Rollback(r.Context())

	// Automatically map the patient to the doctor in patient_doctors for this facility if not already assigned
	var isAssigned bool
	err = tx.QueryRow(r.Context(), `
		SELECT EXISTS(SELECT 1 FROM patient_doctors WHERE patient_id = $1 AND doctor_id = $2 AND facility_id = $3)
	`, patientID, doctorID, facilityID).Scan(&isAssigned)
	if err != nil {
		log.Printf("CheckInPatient verify assignment error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Database validation error"})
		return
	}

	if !isAssigned {
		_, err = tx.Exec(r.Context(), `
			INSERT INTO patient_doctors (patient_id, doctor_id, facility_id, assigned_by)
			VALUES ($1, $2, $3, $4)
		`, patientID, doctorID, facilityID, userID)
		if err != nil {
			log.Printf("CheckInPatient patient_doctors mapping error: %v", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to assign doctor to patient"})
			return
		}
		db.InvalidateCache(r.Context(), "patient:detail:"+strconv.Itoa(doctorID)+":"+strconv.Itoa(patientID))
		db.InvalidateCache(r.Context(), "patients:list:"+strconv.Itoa(doctorID)+":"+strconv.Itoa(facilityID)+":*")
	}

	// Insert temporary entry
	var entryID int
	insertQuery := `
		INSERT INTO queue_entries (doctor_id, patient_id, status, queue_order, estimated_wait_minutes, facility_id)
		VALUES ($1, $2, 'WAITING', 9999, 0, $3)
		RETURNING id
	`
	err = tx.QueryRow(r.Context(), insertQuery, doctorID, patientID, facilityID).Scan(&entryID)
	if err != nil {
		log.Printf("CheckInPatient insert error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to check in patient"})
		return
	}

	// Recalculate queue_order sequence using slot start time first, then check-in time (FCFS)
	reorderQuery := `
		WITH ordered_queue AS (
			SELECT q.id, ROW_NUMBER() OVER (
				ORDER BY COALESCE(s.start_time, '23:59:59'::TIME) ASC, q.check_in_time ASC
			) as row_num
			FROM queue_entries q
			LEFT JOIN appointments a ON a.patient_id = q.patient_id 
				AND a.doctor_id = q.doctor_id 
				AND a.appointment_date::DATE = CURRENT_DATE
				AND a.status != 'CANCELLED'
			LEFT JOIN appointment_slots s ON a.slot_id = s.id
			WHERE q.doctor_id = $1 
			  AND q.facility_id = $2 
			  AND q.check_in_time > CURRENT_DATE
			  AND q.status IN ('WAITING', 'IN_CONSULTATION')
		)
		UPDATE queue_entries q
		SET queue_order = o.row_num
		FROM ordered_queue o
		WHERE q.id = o.id
	`
	_, err = tx.Exec(r.Context(), reorderQuery, doctorID, facilityID)
	if err != nil {
		log.Printf("CheckInPatient reorder error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to calculate queue order"})
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to save check-in"})
		return
	}

	// Get final queue_order and calculate wait time
	var finalOrder int
	_ = db.Pool.QueryRow(r.Context(), "SELECT queue_order FROM queue_entries WHERE id = $1", entryID).Scan(&finalOrder)
	waitMin := CalculateWaitTime(r.Context(), doctorID, facilityID, finalOrder)

	// Update wait time estimation on row
	_, _ = db.Pool.Exec(r.Context(), "UPDATE queue_entries SET estimated_wait_minutes = $1 WHERE id = $2", waitMin, entryID)

	// Invalidate cache
	db.InvalidateCache(r.Context(), "queue:list:*")

	// Broadcast update
	BroadcastQueueUpdate(doctorID)

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"message":                "Patient checked in successfully",
		"queue_entry_id":         entryID,
		"queue_order":            finalOrder,
		"estimated_wait_minutes": waitMin,
	})
}

// ListQueue returns the active queue list for a doctor
func ListQueue(w http.ResponseWriter, r *http.Request) {
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
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "doctor_id parameter is required"})
			return
		}
	}

	facilityID, err := GetActiveFacilityID(r, userID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to get active facility"})
		return
	}

	query := `
		SELECT q.id, q.doctor_id, q.patient_id, p.name, p.phone, q.encounter_id, 
		       q.status, q.queue_order, q.check_in_time, q.consultation_start_time, 
		       q.consultation_end_time, q.estimated_wait_minutes
		FROM queue_entries q
		JOIN patients p ON q.patient_id = p.id
		WHERE q.doctor_id = $1 AND q.facility_id = $2 AND q.check_in_time > CURRENT_DATE
		  AND q.status IN ('WAITING', 'IN_CONSULTATION')
		ORDER BY q.queue_order ASC
	`
	rows, err := db.Pool.Query(r.Context(), query, doctorID, facilityID)
	if err != nil {
		log.Printf("ListQueue query error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to fetch queue list"})
		return
	}
	defer rows.Close()

	entries := []QueueEntry{}
	for rows.Next() {
		var q QueueEntry
		err = rows.Scan(
			&q.ID, &q.DoctorID, &q.PatientID, &q.PatientName, &q.PatientPhone, &q.EncounterID,
			&q.Status, &q.QueueOrder, &q.CheckInTime, &q.ConsultationStart,
			&q.ConsultationEnd, &q.EstimatedWaitMinutes,
		)
		if err == nil {
			q.EstimatedWaitMinutes = CalculateWaitTime(r.Context(), doctorID, facilityID, q.QueueOrder)
			entries = append(entries, q)
		}
	}

	writeJSON(w, http.StatusOK, entries)
}

// UpdateQueueStatus changes status of a queue entry
func UpdateQueueStatus(w http.ResponseWriter, r *http.Request) {
	var input struct {
		EntryID int    `json:"entry_id"`
		Status  string `json:"status"` // WAITING, IN_CONSULTATION, COMPLETED, CANCELLED
	}

	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
		return
	}

	doctorID, ok := r.Context().Value(ShopkeeperIDKey).(int)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	var currentStatus string
	var queueDoctorID int
	err := db.Pool.QueryRow(r.Context(), "SELECT status, doctor_id FROM queue_entries WHERE id = $1", input.EntryID).Scan(&currentStatus, &queueDoctorID)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Queue entry not found"})
		return
	}

	role, _ := getUserRole(r.Context(), doctorID)
	if role == "DOCTOR" && queueDoctorID != doctorID {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "Forbidden: Not your patient queue"})
		return
	}

	var updateQuery string
	var args []interface{}

	switch input.Status {
	case "IN_CONSULTATION":
		updateQuery = `
			UPDATE queue_entries 
			SET status = $1, consultation_start_time = NOW() 
			WHERE id = $2
		`
		args = []interface{}{input.Status, input.EntryID}
	case "COMPLETED", "CANCELLED":
		updateQuery = `
			UPDATE queue_entries 
			SET status = $1, consultation_end_time = NOW() 
			WHERE id = $2
		`
		args = []interface{}{input.Status, input.EntryID}
	default:
		updateQuery = `
			UPDATE queue_entries 
			SET status = $1 
			WHERE id = $2
		`
		args = []interface{}{input.Status, input.EntryID}
	}

	_, err = db.Pool.Exec(r.Context(), updateQuery, args...)
	if err != nil {
		log.Printf("UpdateQueueStatus update error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to update queue status"})
		return
	}

	BroadcastQueueUpdate(queueDoctorID)

	writeJSON(w, http.StatusOK, map[string]string{"message": "Queue status updated successfully"})
}

// DeleteQueueEntry removes a completed/treated patient from today's active queue (Admin or Doctor)
func DeleteQueueEntry(w http.ResponseWriter, r *http.Request) {
	entryIDStr := r.URL.Query().Get("entry_id")
	if entryIDStr == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "entry_id is required"})
		return
	}

	entryID, err := strconv.Atoi(entryIDStr)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid entry_id"})
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

	var doctorID int
	err = db.Pool.QueryRow(r.Context(), "SELECT doctor_id FROM queue_entries WHERE id = $1 AND facility_id = $2", entryID, facilityID).Scan(&doctorID)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Queue entry not found"})
		return
	}

	// Verify permissions: admin or the specific doctor can delete
	if role == "DOCTOR" && doctorID != userID {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "Forbidden: You cannot modify this queue"})
		return
	} else if role != "HOSPITAL_ADMIN" && role != "DOCTOR" {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "Forbidden: Insufficient permissions"})
		return
	}

	_, err = db.Pool.Exec(r.Context(), "DELETE FROM queue_entries WHERE id = $1 AND facility_id = $2", entryID, facilityID)
	if err != nil {
		log.Printf("DeleteQueueEntry error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to remove patient from queue"})
		return
	}

	// Invalidate cache
	db.InvalidateCache(r.Context(), "queue:list:*")

	// Broadcast update
	BroadcastQueueUpdate(doctorID)

	writeJSON(w, http.StatusOK, map[string]string{"message": "Patient removed from queue successfully"})
}

// ReorderQueue updates queue_order for multiple entries
func ReorderQueue(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Orders []struct {
			ID         int `json:"id"`
			QueueOrder int `json:"queue_order"`
		} `json:"orders"`
	}

	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
		return
	}

	doctorID, ok := r.Context().Value(ShopkeeperIDKey).(int)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	tx, err := db.Pool.Begin(r.Context())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Transaction failed"})
		return
	}
	defer tx.Rollback(r.Context())

	for _, ord := range input.Orders {
		_, err = tx.Exec(r.Context(), "UPDATE queue_entries SET queue_order = $1 WHERE id = $2 AND doctor_id = $3", ord.QueueOrder, ord.ID, doctorID)
		if err != nil {
			log.Printf("ReorderQueue update error: %v", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to reorder some queue items"})
			return
		}
	}

	err = tx.Commit(r.Context())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to commit reorder"})
		return
	}

	BroadcastQueueUpdate(doctorID)

	writeJSON(w, http.StatusOK, map[string]string{"message": "Queue reordered successfully"})
}

// ServeQueueWS sets up SSE stream
func ServeQueueWS(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	doctorIDStr := r.URL.Query().Get("doctor_id")
	doctorID, err := strconv.Atoi(doctorIDStr)
	if err != nil {
		return
	}

	sendChan := make(chan []byte, 10)

	client := &wsClient{
		conn: &sseAdapter{
			w: w,
			f: http.NewResponseController(w),
		},
		doctorID: doctorID,
		send:     sendChan,
	}

	wsClientsMu.Lock()
	wsClients[client] = true
	wsClientsMu.Unlock()

	defer func() {
		wsClientsMu.Lock()
		delete(wsClients, client)
		wsClientsMu.Unlock()
	}()

	_, _ = fmt.Fprintf(w, "data: {\"event\":\"connected\"}\n\n")
	_ = http.NewResponseController(w).Flush()

	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case <-ticker.C:
			_, err = fmt.Fprintf(w, "data: {\"event\":\"ping\"}\n\n")
			if err != nil {
				return
			}
			_ = http.NewResponseController(w).Flush()
		case msg := <-sendChan:
			err = client.conn.WriteMessage(1, msg)
			if err != nil {
				return
			}
		}
	}
}

type sseAdapter struct {
	w http.ResponseWriter
	f *http.ResponseController
}

func (s *sseAdapter) WriteMessage(messageType int, data []byte) error {
	_, err := fmt.Fprintf(s.w, "data: %s\n\n", string(data))
	if err == nil {
		_ = s.f.Flush()
	}
	return err
}

func (s *sseAdapter) Close() error {
	return nil
}
