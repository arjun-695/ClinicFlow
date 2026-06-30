package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"time"

	"backend/db"
)

type LabRequest struct {
	ID            int        `json:"id"`
	PatientID     int        `json:"patient_id"`
	PatientName   string     `json:"patient_name"`
	DoctorID      int        `json:"doctor_id"`
	DoctorName    string     `json:"doctor_name"`
	TestName      string     `json:"test_name"`
	Status        string     `json:"status"` // REQUESTED, COMPLETED, CANCELLED
	RequestedDate time.Time  `json:"requested_date"`
	ReportURL     *string    `json:"report_url"`
	ResultSummary *string    `json:"result_summary"`
	UploadedAt    *time.Time `json:"uploaded_at"`
}

// RequestLabTest handles creating a lab test request
func RequestLabTest(w http.ResponseWriter, r *http.Request) {
	var input struct {
		PatientID int    `json:"patient_id"`
		TestName  string `json:"test_name"`
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

	if input.TestName == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Test name is required"})
		return
	}

	// Insert local record
	query := `
		INSERT INTO lab_requests (patient_id, doctor_id, test_name, status)
		VALUES ($1, $2, $3, 'REQUESTED')
		RETURNING id
	`
	var id int
	err := db.Pool.QueryRow(r.Context(), query, input.PatientID, doctorID, input.TestName).Scan(&id)
	if err != nil {
		log.Printf("RequestLabTest insert error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to record lab request"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"message":        "Lab test requested successfully",
		"lab_request_id": id,
		"status":         "REQUESTED",
	})
}

// UploadLabReport handles uploading test results and closing the request
func UploadLabReport(w http.ResponseWriter, r *http.Request) {
	var input struct {
		LabRequestID  int    `json:"lab_request_id"`
		ReportURL     string `json:"report_url"`
		ResultSummary string `json:"result_summary"`
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

	if input.ReportURL == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Report URL is required"})
		return
	}

	tx, err := db.Pool.Begin(r.Context())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Transaction failed"})
		return
	}
	defer tx.Rollback(r.Context())

	// Update lab request status
	_, err = tx.Exec(r.Context(), "UPDATE lab_requests SET status = 'COMPLETED' WHERE id = $1 AND doctor_id = $2", input.LabRequestID, doctorID)
	if err != nil {
		log.Printf("UploadLabReport status update error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to update lab request status"})
		return
	}

	// Insert report record
	insertReport := `
		INSERT INTO lab_reports (lab_request_id, report_url, result_summary)
		VALUES ($1, $2, $3)
	`
	_, err = tx.Exec(r.Context(), insertReport, input.LabRequestID, input.ReportURL, input.ResultSummary)
	if err != nil {
		log.Printf("UploadLabReport report insert error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to save lab report"})
		return
	}

	err = tx.Commit(r.Context())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to commit upload"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "Lab report uploaded and status completed"})
}

// ListLabRequests returns all lab requests and reports for a patient
func ListLabRequests(w http.ResponseWriter, r *http.Request) {
	patientIDStr := r.URL.Query().Get("patient_id")
	patientID, err := strconv.Atoi(patientIDStr)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid patient ID"})
		return
	}

	doctorID, ok := r.Context().Value(ShopkeeperIDKey).(int)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	var role, phone string
	err = db.Pool.QueryRow(r.Context(), "SELECT role, phone FROM users WHERE id = $1", doctorID).Scan(&role, &phone)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	var query string
	var rows interface {
		Next() bool
		Scan(dest ...any) error
		Close()
	}
	if role == "USER" {
		var exists bool
		_ = db.Pool.QueryRow(r.Context(), "SELECT EXISTS(SELECT 1 FROM patients WHERE id = $1 AND phone = $2)", patientID, phone).Scan(&exists)
		if !exists {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "Unauthorized to view this patient's records"})
			return
		}
		query = `
			SELECT lr.id, lr.patient_id, p.name as patient_name, lr.doctor_id, u.name as doctor_name,
			       lr.test_name, lr.status, lr.requested_date,
			       rep.report_url, rep.result_summary, rep.uploaded_at
			FROM lab_requests lr
			JOIN patients p ON lr.patient_id = p.id
			JOIN users u ON lr.doctor_id = u.id
			LEFT JOIN lab_reports rep ON rep.lab_request_id = lr.id
			WHERE lr.patient_id = $1
			ORDER BY lr.requested_date DESC
		`
		rows, err = db.Pool.Query(r.Context(), query, patientID)
	} else {
		query = `
			SELECT lr.id, lr.patient_id, p.name as patient_name, lr.doctor_id, u.name as doctor_name,
			       lr.test_name, lr.status, lr.requested_date,
			       rep.report_url, rep.result_summary, rep.uploaded_at
			FROM lab_requests lr
			JOIN patients p ON lr.patient_id = p.id
			JOIN users u ON lr.doctor_id = u.id
			LEFT JOIN lab_reports rep ON rep.lab_request_id = lr.id
			WHERE lr.patient_id = $1 AND lr.doctor_id = $2
			ORDER BY lr.requested_date DESC
		`
		rows, err = db.Pool.Query(r.Context(), query, patientID, doctorID)
	}
	if err != nil {
		log.Printf("ListLabRequests query error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to query lab requests"})
		return
	}
	defer rows.Close()

	requests := []LabRequest{}
	for rows.Next() {
		var lr LabRequest
		err = rows.Scan(
			&lr.ID, &lr.PatientID, &lr.PatientName, &lr.DoctorID, &lr.DoctorName,
			&lr.TestName, &lr.Status, &lr.RequestedDate,
			&lr.ReportURL, &lr.ResultSummary, &lr.UploadedAt,
		)
		if err == nil {
			requests = append(requests, lr)
		}
	}

	writeJSON(w, http.StatusOK, requests)
}
