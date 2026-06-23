package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"

	"backend/db"
	"github.com/joho/godotenv"
)

func TestIntegrationFlows(t *testing.T) {
	// Load environment variables from backend/.env
	_ = godotenv.Load("../.env")

	// Initialize DB connection
	db.InitDB()
	if db.Pool == nil {
		t.Fatal("Failed to initialize database pool")
	}

	ctx := context.Background()

	// 1. Get or create a doctor user for the test
	var doctorID int
	err := db.Pool.QueryRow(ctx, "SELECT id FROM users WHERE role = 'DOCTOR' LIMIT 1").Scan(&doctorID)
	if err != nil {
		// Insert a test doctor
		err = db.Pool.QueryRow(ctx, `
			INSERT INTO users (name, email, role, phone, password_hash)
			VALUES ('Test Doctor', 'testdoc@example.com', 'DOCTOR', '+919999999999', 'mock_hash')
			RETURNING id
		`).Scan(&doctorID)
		if err != nil {
			t.Fatalf("Failed to create test doctor: %v", err)
		}
	}

	// 2. Get or create a facility
	var facilityID int
	err = db.Pool.QueryRow(ctx, "SELECT id FROM facilities LIMIT 1").Scan(&facilityID)
	if err != nil {
		err = db.Pool.QueryRow(ctx, `
			INSERT INTO facilities (name, type)
			VALUES ('Test Clinic', 'CLINIC')
			RETURNING id
		`).Scan(&facilityID)
		if err != nil {
			t.Fatalf("Failed to create test facility: %v", err)
		}
	}

	// Make sure the doctor belongs to the facility
	var exists bool
	_ = db.Pool.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM user_facilities WHERE user_id = $1 AND facility_id = $2)", doctorID, facilityID).Scan(&exists)
	if !exists {
		_, err = db.Pool.Exec(ctx, `
			INSERT INTO user_facilities (user_id, facility_id, role)
			VALUES ($1, $2, 'DOCTOR')
		`, doctorID, facilityID)
		if err != nil {
			t.Fatalf("Failed to link doctor to facility: %v", err)
		}
	}

	// 3. Create a patient in "Clinic Mode" (i.e. doctor_ids is empty)
	// We want to test that the doctor is auto-assigned.
	patientPhone := "+919988776655"
	// Clean up any existing patient with this phone number to keep the test idempotent
	_, _ = db.Pool.Exec(ctx, "DELETE FROM patients WHERE phone = $1", patientPhone)

	patientInput := map[string]interface{}{
		"name":            "Jane Doe",
		"phone":           patientPhone,
		"gender":          "Female",
		"age":             30,
		"medical_history": "None",
		"doctor_ids":      []int{}, // Empty array triggers auto-assignment in Clinic Mode
	}

	bodyBytes, _ := json.Marshal(patientInput)
	req := httptest.NewRequest("POST", "/api/patients", bytes.NewReader(bodyBytes))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Facility-ID", strconv.Itoa(facilityID))
	// Add user info into request context as done by authMiddleware
	req = req.WithContext(context.WithValue(req.Context(), ShopkeeperIDKey, doctorID))

	w := httptest.NewRecorder()
	CreatePatient(w, req)

	if w.Code != http.StatusCreated && w.Code != http.StatusOK {
		t.Fatalf("CreatePatient returned status %d, body: %s", w.Code, w.Body.String())
	}

	var patientResp struct {
		ID int `json:"id"`
	}
	if err := json.NewDecoder(w.Body).Decode(&patientResp); err != nil {
		t.Fatalf("Failed to decode patient response: %v", err)
	}

	// Verify auto-assignment of the patient to the doctor in patient_doctors
	var assigned bool
	err = db.Pool.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM patient_doctors 
			WHERE patient_id = $1 AND doctor_id = $2 AND facility_id = $3
		)
	`, patientResp.ID, doctorID, facilityID).Scan(&assigned)
	if err != nil || !assigned {
		t.Fatalf("Patient was not auto-assigned to doctor in Clinic Mode. Err: %v", err)
	}

	// 4. Create a prescription with lab requests
	prescriptionInput := map[string]interface{}{
		"patient_id": patientResp.ID,
		"diagnosis":  "Common Cold",
		"notes":      "Take rest",
		"items": []map[string]interface{}{
			{
				"medicine_name": "Paracetamol",
				"dosage":        "500mg",
				"frequency":     "1-0-1",
				"duration":      "3 days",
				"quantity":      6,
				"instructions":  "After meals",
			},
		},
		"lab_requests": []string{"CBC", "X-Ray Chest"},
	}

	bodyBytes, _ = json.Marshal(prescriptionInput)
	req = httptest.NewRequest("POST", "/api/prescriptions", bytes.NewReader(bodyBytes))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Facility-ID", strconv.Itoa(facilityID))
	req = req.WithContext(context.WithValue(req.Context(), ShopkeeperIDKey, doctorID))

	w = httptest.NewRecorder()
	CreatePrescription(w, req)

	if w.Code != http.StatusCreated && w.Code != http.StatusOK {
		t.Fatalf("CreatePrescription returned status %d, body: %s", w.Code, w.Body.String())
	}

	// Query db to verify prescription and its lab requests are present
	var rxID int
	err = db.Pool.QueryRow(ctx, "SELECT id FROM prescriptions WHERE patient_id = $1 ORDER BY id DESC LIMIT 1", patientResp.ID).Scan(&rxID)
	if err != nil {
		t.Fatalf("Failed to find created prescription: %v", err)
	}

	var labRequestCount int
	err = db.Pool.QueryRow(ctx, "SELECT COUNT(*) FROM lab_requests WHERE prescription_id = $1", rxID).Scan(&labRequestCount)
	if err != nil || labRequestCount != 2 {
		t.Fatalf("Expected 2 lab requests, found %d. Err: %v", labRequestCount, err)
	}

	// 5. Update the prescription:
	// Let's set the CBC status to 'COMPLETED' first.
	_, err = db.Pool.Exec(ctx, "UPDATE lab_requests SET status = 'COMPLETED' WHERE prescription_id = $1 AND test_name = 'CBC'", rxID)
	if err != nil {
		t.Fatalf("Failed to mark CBC as completed: %v", err)
	}

	// Doctor updates prescription: removes "X-Ray Chest" and adds "Lipid Profile"
	updateInput := map[string]interface{}{
		"id":         rxID,
		"patient_id": patientResp.ID,
		"diagnosis":  "Mild Influenza",
		"items": []map[string]interface{}{
			{
				"medicine_name": "Paracetamol",
				"dosage":        "500mg",
				"frequency":     "1-0-1",
				"duration":      "3 days",
				"quantity":      6,
				"instructions":  "After meals",
			},
		},
		"lab_requests": []string{"CBC", "Lipid Profile"}, // "X-Ray Chest" is deleted, "Lipid Profile" added
	}

	bodyBytes, _ = json.Marshal(updateInput)
	req = httptest.NewRequest("PUT", "/api/prescriptions", bytes.NewReader(bodyBytes))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Facility-ID", strconv.Itoa(facilityID))
	req = req.WithContext(context.WithValue(req.Context(), ShopkeeperIDKey, doctorID))

	w = httptest.NewRecorder()
	UpdatePrescription(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("UpdatePrescription returned status %d, body: %s", w.Code, w.Body.String())
	}

	// Check final list of lab requests: CBC (COMPLETED) and Lipid Profile (REQUESTED)
	rows, err := db.Pool.Query(ctx, "SELECT test_name, status FROM lab_requests WHERE prescription_id = $1 ORDER BY test_name ASC", rxID)
	if err != nil {
		t.Fatalf("Failed to query updated lab requests: %v", err)
	}
	defer rows.Close()

	labResults := make(map[string]string)
	for rows.Next() {
		var name, status string
		if err := rows.Scan(&name, &status); err == nil {
			labResults[name] = status
		}
	}

	if len(labResults) != 2 {
		t.Fatalf("Expected 2 lab requests, got: %v", labResults)
	}
	if labResults["CBC"] != "COMPLETED" {
		t.Fatalf("Expected CBC to remain COMPLETED, got status: %s", labResults["CBC"])
	}
	if labResults["Lipid Profile"] != "REQUESTED" {
		t.Fatalf("Expected Lipid Profile to be REQUESTED, got status: %s", labResults["Lipid Profile"])
	}
	if _, exists := labResults["X-Ray Chest"]; exists {
		t.Fatal("Expected X-Ray Chest to be deleted since it was pending and omitted in the update")
	}

	// 6. Log Vitals with the new fields
	vitalsInput := map[string]interface{}{
		"patient_id":     patientResp.ID,
		"weight_kg":      72.5,
		"blood_pressure": "120/80",
		"pulse":          72, // pulse aliased to heart_rate
		"spo2":           98,
		"temperature":    98.6,
		"custom_metrics": map[string]interface{}{
			"Blood Sugar": "110 mg/dL",
			"Respiratory": 16,
		},
	}

	bodyBytes, _ = json.Marshal(vitalsInput)
	req = httptest.NewRequest("POST", "/api/vitals", bytes.NewReader(bodyBytes))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Facility-ID", strconv.Itoa(facilityID))
	req = req.WithContext(context.WithValue(req.Context(), ShopkeeperIDKey, doctorID))

	w = httptest.NewRecorder()
	LogPatientVitals(w, req)

	if w.Code != http.StatusCreated && w.Code != http.StatusOK {
		t.Fatalf("LogPatientVitals returned status %d, body: %s", w.Code, w.Body.String())
	}

	// Retrieve vitals
	req = httptest.NewRequest("GET", "/api/vitals?patient_id="+strconv.Itoa(patientResp.ID), nil)
	req.Header.Set("X-Facility-ID", strconv.Itoa(facilityID))
	req = req.WithContext(context.WithValue(req.Context(), ShopkeeperIDKey, doctorID))

	w = httptest.NewRecorder()
	GetPatientVitals(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("GetPatientVitals returned status %d, body: %s", w.Code, w.Body.String())
	}

	var vitalsList []PatientVital
	if err := json.NewDecoder(w.Body).Decode(&vitalsList); err != nil {
		t.Fatalf("Failed to decode vitals list: %v", err)
	}

	if len(vitalsList) != 1 {
		t.Fatalf("Expected 1 vital record, got: %d", len(vitalsList))
	}

	v := vitalsList[0]
	if v.WeightKg == nil || *v.WeightKg != 72.5 {
		t.Fatalf("Expected weight 72.5, got: %v", v.WeightKg)
	}
	if v.BloodPressure == nil || *v.BloodPressure != "120/80" {
		t.Fatalf("Expected BP 120/80, got: %v", v.BloodPressure)
	}
	// Verify pulse maps to heart_rate
	if v.HeartRate == nil || *v.HeartRate != 72 {
		t.Fatalf("Expected heart_rate 72, got: %v", v.HeartRate)
	}
	if v.Pulse == nil || *v.Pulse != 72 {
		t.Fatalf("Expected pulse 72, got: %v", v.Pulse)
	}
	if v.SpO2 == nil || *v.SpO2 != 98 {
		t.Fatalf("Expected spo2 98, got: %v", v.SpO2)
	}
	if v.Temperature == nil || *v.Temperature != 98.6 {
		t.Fatalf("Expected temperature 98.6, got: %v", v.Temperature)
	}
	if v.CustomMetrics == nil || v.CustomMetrics["Blood Sugar"] != "110 mg/dL" {
		t.Fatalf("Expected custom metrics blood sugar, got: %v", v.CustomMetrics)
	}

	t.Log("Integration Flows Tested Successfully!")
}
