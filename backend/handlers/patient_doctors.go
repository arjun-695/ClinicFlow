package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"

	"backend/db"
)

// AssignPatientToDoctor assigns a patient to one or more doctors.
// Accessible by Admin or Receptionist roles.
func AssignPatientToDoctor(w http.ResponseWriter, r *http.Request) {
	var input struct {
		PatientID int   `json:"patient_id"`
		DoctorIDs []int `json:"doctor_ids"`
	}

	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
		return
	}

	if input.PatientID <= 0 || len(input.DoctorIDs) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Patient ID and at least one Doctor ID are required"})
		return
	}

	adminID, ok := r.Context().Value(ShopkeeperIDKey).(int)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	facilityID, err := GetActiveFacilityID(r, adminID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to get active facility"})
		return
	}

	// Verify patient exists in the facility
	var patientExists bool
	err = db.Pool.QueryRow(r.Context(), "SELECT EXISTS(SELECT 1 FROM patients WHERE id = $1 AND facility_id = $2)", input.PatientID, facilityID).Scan(&patientExists)
	if err != nil || !patientExists {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Patient not found in this facility"})
		return
	}

	tx, err := db.Pool.Begin(r.Context())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Database error"})
		return
	}
	defer tx.Rollback(r.Context())

	for _, docID := range input.DoctorIDs {
		// Verify doctor exists and has DOCTOR role
		var isDoctor bool
		err = tx.QueryRow(r.Context(), "SELECT EXISTS(SELECT 1 FROM users WHERE id = $1 AND role = 'DOCTOR')", docID).Scan(&isDoctor)
		if err != nil || !isDoctor {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "One or more user IDs are not doctors"})
			return
		}

		// Insert or ignore if mapping already exists
		_, err = tx.Exec(r.Context(), `
			INSERT INTO patient_doctors (patient_id, doctor_id, facility_id, assigned_by)
			VALUES ($1, $2, $3, $4)
			ON CONFLICT (patient_id, doctor_id, facility_id) DO NOTHING
		`, input.PatientID, docID, facilityID, adminID)
		if err != nil {
			log.Printf("AssignPatientToDoctor insert error: %v", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to assign doctor"})
			return
		}
	}

	if err = tx.Commit(r.Context()); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Transaction commit failed"})
		return
	}

	// Invalidate patient detail cache for any doctor who was assigned
	for _, docID := range input.DoctorIDs {
		db.InvalidateCache(r.Context(), "patient:detail:"+strconv.Itoa(docID)+":"+strconv.Itoa(input.PatientID))
		db.InvalidateCache(r.Context(), "patients:list:"+strconv.Itoa(docID)+":"+strconv.Itoa(facilityID)+":*")
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "Doctors assigned successfully"})
}

// RemovePatientFromDoctor unassigns a doctor from a patient.
// Accessible by Admin or Receptionist roles.
func RemovePatientFromDoctor(w http.ResponseWriter, r *http.Request) {
	var input struct {
		PatientID int `json:"patient_id"`
		DoctorID  int `json:"doctor_id"`
	}

	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
		return
	}

	if input.PatientID <= 0 || input.DoctorID <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Patient ID and Doctor ID are required"})
		return
	}

	adminID, ok := r.Context().Value(ShopkeeperIDKey).(int)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	facilityID, err := GetActiveFacilityID(r, adminID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to get active facility"})
		return
	}

	_, err = db.Pool.Exec(r.Context(), `
		DELETE FROM patient_doctors 
		WHERE patient_id = $1 AND doctor_id = $2 AND facility_id = $3
	`, input.PatientID, input.DoctorID, facilityID)
	if err != nil {
		log.Printf("RemovePatientFromDoctor delete error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to unassign doctor"})
		return
	}

	// Invalidate cache
	db.InvalidateCache(r.Context(), "patient:detail:"+strconv.Itoa(input.DoctorID)+":"+strconv.Itoa(input.PatientID))
	db.InvalidateCache(r.Context(), "patients:list:"+strconv.Itoa(input.DoctorID)+":"+strconv.Itoa(facilityID)+":*")

	writeJSON(w, http.StatusOK, map[string]string{"message": "Doctor unassigned successfully"})
}

// ListDoctorsForPatient returns all doctors assigned to a patient.
func ListDoctorsForPatient(w http.ResponseWriter, r *http.Request) {
	patientIDStr := r.URL.Query().Get("patient_id")
	patientID, err := strconv.Atoi(patientIDStr)
	if err != nil || patientID <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid patient ID"})
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

	query := `
		SELECT u.id, u.name, u.email, u.phone, COALESCE(u.specialization, '') as specialization
		FROM patient_doctors pd
		JOIN users u ON pd.doctor_id = u.id
		WHERE pd.patient_id = $1 AND pd.facility_id = $2
	`
	rows, err := db.Pool.Query(r.Context(), query, patientID, facilityID)
	if err != nil {
		log.Printf("ListDoctorsForPatient query error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to retrieve doctors"})
		return
	}
	defer rows.Close()

	type DoctorInfo struct {
		ID             int    `json:"id"`
		Name           string `json:"name"`
		Email          string `json:"email"`
		Phone          string `json:"phone"`
		Specialization string `json:"specialization"`
	}

	doctors := []DoctorInfo{}
	for rows.Next() {
		var doc DoctorInfo
		err := rows.Scan(&doc.ID, &doc.Name, &doc.Email, &doc.Phone, &doc.Specialization)
		if err != nil {
			log.Printf("ListDoctorsForPatient scan error: %v", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to read database records"})
			return
		}
		doctors = append(doctors, doc)
	}

	writeJSON(w, http.StatusOK, doctors)
}

// ListPatientsForDoctor returns all patients assigned to the authenticated doctor.
func ListPatientsForDoctor(w http.ResponseWriter, r *http.Request) {
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

	query := `
		SELECT p.id, p.name, p.phone, p.gender, p.age, p.medical_history, p.created_at
		FROM patient_doctors pd
		JOIN patients p ON pd.patient_id = p.id
		WHERE pd.doctor_id = $1 AND pd.facility_id = $2
		ORDER BY p.name ASC
	`
	rows, err := db.Pool.Query(r.Context(), query, doctorID, facilityID)
	if err != nil {
		log.Printf("ListPatientsForDoctor query error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to retrieve patients"})
		return
	}
	defer rows.Close()

	patients := []Patient{}
	for rows.Next() {
		var p Patient
		err := rows.Scan(&p.ID, &p.Name, &p.Phone, &p.Gender, &p.Age, &p.MedicalHistory, &p.CreatedAt)
		if err != nil {
			log.Printf("ListPatientsForDoctor scan error: %v", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to read database records"})
			return
		}
		patients = append(patients, p)
	}

	writeJSON(w, http.StatusOK, patients)
}

// ListFacilityDoctors returns all users with role='DOCTOR' in the facility.
func ListFacilityDoctors(w http.ResponseWriter, r *http.Request) {
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

	query := `
		SELECT u.id, u.name, u.email, u.phone, COALESCE(u.specialization, '') as specialization
		FROM user_facilities uf
		JOIN users u ON uf.user_id = u.id
		WHERE uf.facility_id = $1 AND u.role = 'DOCTOR'
		ORDER BY u.name ASC
	`
	rows, err := db.Pool.Query(r.Context(), query, facilityID)
	if err != nil {
		log.Printf("ListFacilityDoctors query error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to retrieve doctors list"})
		return
	}
	defer rows.Close()

	type DoctorSummary struct {
		ID             int    `json:"id"`
		Name           string `json:"name"`
		Email          string `json:"email"`
		Phone          string `json:"phone"`
		Specialization string `json:"specialization"`
	}

	doctors := []DoctorSummary{}
	for rows.Next() {
		var doc DoctorSummary
		err := rows.Scan(&doc.ID, &doc.Name, &doc.Email, &doc.Phone, &doc.Specialization)
		if err != nil {
			log.Printf("ListFacilityDoctors scan error: %v", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to read database records"})
			return
		}
		doctors = append(doctors, doc)
	}

	writeJSON(w, http.StatusOK, doctors)
}
