package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"backend/db"
	"backend/services"
)

type PatientVital struct {
	ID            int                    `json:"id"`
	PatientID     int                    `json:"patient_id"`
	WeightKg      *float64               `json:"weight_kg"`
	BloodPressure *string                `json:"blood_pressure"`
	HeartRate     *int                   `json:"heart_rate"`
	RecordedAt    time.Time              `json:"recorded_at"`
	EncounterID   *int                   `json:"encounter_id"`
	Pulse         *int                   `json:"pulse"`
	SpO2          *int                   `json:"spo2"`
	Temperature   *float64               `json:"temperature"`
	CustomMetrics map[string]interface{} `json:"custom_metrics"`
}

// Check if blood pressure is out of safe range
func checkBPRange(bp string) (bool, string) {
	parts := strings.Split(bp, "/")
	if len(parts) != 2 {
		return false, ""
	}
	systolic, err1 := strconv.Atoi(strings.TrimSpace(parts[0]))
	diastolic, err2 := strconv.Atoi(strings.TrimSpace(parts[1]))
	if err1 != nil || err2 != nil {
		return false, ""
	}
	if systolic > 140 {
		return true, fmt.Sprintf("High Systolic Blood Pressure (%d mmHg)", systolic)
	}
	if systolic < 90 {
		return true, fmt.Sprintf("Low Systolic Blood Pressure (%d mmHg)", systolic)
	}
	if diastolic > 90 {
		return true, fmt.Sprintf("High Diastolic Blood Pressure (%d mmHg)", diastolic)
	}
	if diastolic < 60 {
		return true, fmt.Sprintf("Low Diastolic Blood Pressure (%d mmHg)", diastolic)
	}
	return false, ""
}

// Check if heart rate is out of safe range
func checkHRRange(hr int) (bool, string) {
	if hr > 100 {
		return true, fmt.Sprintf("High Heart Rate (%d bpm)", hr)
	}
	if hr < 60 {
		return true, fmt.Sprintf("Low Heart Rate (%d bpm)", hr)
	}
	return false, ""
}

// LogPatientVitals records patient vitals and evaluates alerts
func LogPatientVitals(w http.ResponseWriter, r *http.Request) {
	var input struct {
		PatientID     int                    `json:"patient_id"`
		WeightKg      *float64                `json:"weight_kg"`
		BloodPressure string                 `json:"blood_pressure"`
		HeartRate     int                    `json:"heart_rate"`
		EncounterID   *int                   `json:"encounter_id"`
		Pulse         *int                   `json:"pulse"`
		SpO2          *int                   `json:"spo2"`
		Temperature   *float64               `json:"temperature"`
		CustomMetrics map[string]interface{} `json:"custom_metrics"`
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

	facilityID, err := GetActiveFacilityID(r, doctorID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to get active facility"})
		return
	}

	// Support pulse as heart rate if heart rate not explicitly set
	if input.Pulse != nil && input.HeartRate == 0 {
		input.HeartRate = *input.Pulse
	}

	// Verify patient ownership / assignment
	var isAssigned bool
	err = db.Pool.QueryRow(r.Context(), `
		SELECT EXISTS(
			SELECT 1 FROM patient_doctors WHERE patient_id = $1 AND doctor_id = $2 AND facility_id = $3
		)
	`, input.PatientID, doctorID, facilityID).Scan(&isAssigned)
	if err != nil || !isAssigned {
		var legacyOwned bool
		_ = db.Pool.QueryRow(r.Context(), "SELECT EXISTS(SELECT 1 FROM patients WHERE id = $1 AND doctor_id = $2)", input.PatientID, doctorID).Scan(&legacyOwned)
		if !legacyOwned {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "Patient not found or you are not assigned to this patient"})
			return
		}
	}

	var patientName, patientPhone string
	err = db.Pool.QueryRow(r.Context(), "SELECT name, phone FROM patients WHERE id = $1", input.PatientID).Scan(&patientName, &patientPhone)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Patient not found"})
		return
	}

	var customMetricsJSON []byte
	if input.CustomMetrics != nil {
		customMetricsJSON, err = json.Marshal(input.CustomMetrics)
		if err != nil {
			log.Printf("LogPatientVitals marshal custom metrics error: %v", err)
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid custom metrics JSON"})
			return
		}
	}

	// Insert local record
	query := `
		INSERT INTO patient_vitals (patient_id, weight_kg, blood_pressure, heart_rate, encounter_id, pulse, spo2, temperature, custom_metrics, facility_id)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		RETURNING id, recorded_at
	`
	var vitalID int
	var recordedAt time.Time
	err = db.Pool.QueryRow(r.Context(), query, input.PatientID, input.WeightKg, input.BloodPressure, input.HeartRate, input.EncounterID, input.Pulse, input.SpO2, input.Temperature, customMetricsJSON, facilityID).Scan(&vitalID, &recordedAt)
	if err != nil {
		log.Printf("LogPatientVitals insert error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to record patient vitals"})
		return
	}

	// Check vitals threshold for alerts
	isAlert := false
	alertDetails := []string{}

	if input.BloodPressure != "" {
		if out, desc := checkBPRange(input.BloodPressure); out {
			isAlert = true
			alertDetails = append(alertDetails, desc)
		}
	}

	if input.HeartRate > 0 {
		if out, desc := checkHRRange(input.HeartRate); out {
			isAlert = true
			alertDetails = append(alertDetails, desc)
		}
	}

	alertMessage := ""
	if isAlert && patientPhone != "" {
		alertMessage = fmt.Sprintf(
			"⚠️ [ClinicFlow Vital Alert] Out-of-range clinical metrics detected for patient %s:\n%s\nPlease consult your healthcare practitioner.",
			patientName,
			strings.Join(alertDetails, "\n"),
		)
		
		// Send WhatsApp alert using Twilio service asynchronously
		go func() {
			errAlert := services.SendTwilioWhatsApp(patientPhone, alertMessage, "")
			if errAlert != nil {
				log.Printf("[Vitals Alert] Failed to dispatch WhatsApp alert: %v", errAlert)
			}
		}()
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"message":          "Vitals recorded successfully",
		"vital_id":         vitalID,
		"recorded_at":      recordedAt,
		"alert_triggered":  isAlert,
		"alert_details":    alertDetails,
	})
}

// GetPatientVitals returns a list of vitals over time for charting
func GetPatientVitals(w http.ResponseWriter, r *http.Request) {
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

	// Verify patient belongs to doctor OR patient is querying their own vitals
	var role, phone string
	err = db.Pool.QueryRow(r.Context(), "SELECT role, phone FROM users WHERE id = $1", doctorID).Scan(&role, &phone)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	facilityID, err := GetActiveFacilityID(r, doctorID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to get active facility"})
		return
	}

	var exists bool
	if role == "USER" {
		err = db.Pool.QueryRow(r.Context(), "SELECT EXISTS(SELECT 1 FROM patients WHERE id = $1 AND phone = $2)", patientID, phone).Scan(&exists)
	} else {
		// Doctor or receptionist/admin: check assignment
		err = db.Pool.QueryRow(r.Context(), `
			SELECT EXISTS(
				SELECT 1 FROM patient_doctors WHERE patient_id = $1 AND doctor_id = $2 AND facility_id = $3
			)
		`, patientID, doctorID, facilityID).Scan(&exists)
		if err == nil && !exists {
			// Legacy owned check
			_ = db.Pool.QueryRow(r.Context(), "SELECT EXISTS(SELECT 1 FROM patients WHERE id = $1 AND doctor_id = $2)", patientID, doctorID).Scan(&exists)
		}
	}
	if err != nil || !exists {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Patient not found"})
		return
	}

	query := `
		SELECT id, patient_id, weight_kg, blood_pressure, heart_rate, recorded_at, encounter_id, pulse, spo2, temperature, custom_metrics
		FROM patient_vitals
		WHERE patient_id = $1
		ORDER BY recorded_at ASC
	`
	rows, err := db.Pool.Query(r.Context(), query, patientID)
	if err != nil {
		log.Printf("GetPatientVitals query error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to fetch vitals data"})
		return
	}
	defer rows.Close()

	vitals := []PatientVital{}
	for rows.Next() {
		var pv PatientVital
		var customJSON []byte
		err = rows.Scan(&pv.ID, &pv.PatientID, &pv.WeightKg, &pv.BloodPressure, &pv.HeartRate, &pv.RecordedAt, &pv.EncounterID, &pv.Pulse, &pv.SpO2, &pv.Temperature, &customJSON)
		if err == nil {
			if len(customJSON) > 0 {
				_ = json.Unmarshal(customJSON, &pv.CustomMetrics)
			}
			vitals = append(vitals, pv)
		}
	}

	writeJSON(w, http.StatusOK, vitals)
}
