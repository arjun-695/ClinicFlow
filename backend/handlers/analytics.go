package handlers

import (
	"context"
	"log"
	"net/http"

	"backend/db"
)

type DataPoint struct {
	Label string  `json:"label"`
	Value float64 `json:"value"`
}

type AnalyticsResponse struct {
	PatientsWeekly      []DataPoint `json:"patients_weekly"`
	PatientsMonthly     []DataPoint `json:"patients_monthly"`
	PatientsYearly      []DataPoint `json:"patients_yearly"`
	RevenueDaily        []DataPoint `json:"revenue_daily"`
	AppointmentsFuture  []DataPoint `json:"appointments_future"`
}

// GetAnalytics collects all stats for the doctor's graphical dashboard
func GetAnalytics(w http.ResponseWriter, r *http.Request) {
	doctorID, ok := r.Context().Value(ShopkeeperIDKey).(int)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	ctx := r.Context()

	// 1. Weekly Treated Patients (Distinct Patient count with Completed Appointments or Bills in past 7 days)
	queryWeekly := `
		SELECT TO_CHAR(d, 'Dy') AS label, COALESCE(COUNT(DISTINCT a.patient_id), 0)::float8 AS value
		FROM generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, '1 day') d
		LEFT JOIN appointments a ON DATE(a.appointment_date) = DATE(d) AND a.doctor_id = $1 AND a.status = 'COMPLETED'
		GROUP BY d ORDER BY d ASC
	`
	weeklyPoints, err := queryDataPoints(ctx, queryWeekly, doctorID)
	if err != nil {
		log.Printf("GetAnalytics weekly error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "An internal error occurred"})
		return
	}

	// 2. Monthly Treated Patients (Completed Patients in past 12 months)
	queryMonthly := `
		SELECT TO_CHAR(m, 'Mon') AS label, COALESCE(COUNT(DISTINCT a.patient_id), 0)::float8 AS value
		FROM generate_series(CURRENT_DATE - INTERVAL '11 months', CURRENT_DATE, '1 month') m
		LEFT JOIN appointments a ON DATE_TRUNC('month', a.appointment_date) = DATE_TRUNC('month', m) AND a.doctor_id = $1 AND a.status = 'COMPLETED'
		GROUP BY m ORDER BY m ASC
	`
	monthlyPoints, err := queryDataPoints(ctx, queryMonthly, doctorID)
	if err != nil {
		log.Printf("GetAnalytics monthly error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "An internal error occurred"})
		return
	}

	// 3. Yearly Treated Patients (Completed Patients in past 5 years)
	queryYearly := `
		SELECT TO_CHAR(y, 'YYYY') AS label, COALESCE(COUNT(DISTINCT a.patient_id), 0)::float8 AS value
		FROM generate_series(CURRENT_DATE - INTERVAL '4 years', CURRENT_DATE, '1 year') y
		LEFT JOIN appointments a ON DATE_TRUNC('year', a.appointment_date) = DATE_TRUNC('year', y) AND a.doctor_id = $1 AND a.status = 'COMPLETED'
		GROUP BY y ORDER BY y ASC
	`
	yearlyPoints, err := queryDataPoints(ctx, queryYearly, doctorID)
	if err != nil {
		log.Printf("GetAnalytics yearly error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "An internal error occurred"})
		return
	}

	// 4. Daily Revenue (Sum of Bills created in past 30 days)
	queryRevenue := `
		SELECT TO_CHAR(d, 'DD Mon') AS label, COALESCE(SUM(b.total_amount), 0.0)::float8 AS value
		FROM generate_series(CURRENT_DATE - INTERVAL '29 days', CURRENT_DATE, '1 day') d
		LEFT JOIN bills b ON DATE(b.created_at) = DATE(d) AND b.doctor_id = $1
		GROUP BY d ORDER BY d ASC
	`
	revenuePoints, err := queryDataPoints(ctx, queryRevenue, doctorID)
	if err != nil {
		log.Printf("GetAnalytics revenue error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "An internal error occurred"})
		return
	}

	// 5. Future Appointments Density (Count of Pending appointments in next 14 days)
	queryAppts := `
		SELECT TO_CHAR(d, 'DD Mon') AS label, COALESCE(COUNT(a.id), 0)::float8 AS value
		FROM generate_series(CURRENT_DATE, CURRENT_DATE + INTERVAL '13 days', '1 day') d
		LEFT JOIN appointments a ON DATE(a.appointment_date) = DATE(d) AND a.doctor_id = $1 AND a.status = 'PENDING'
		GROUP BY d ORDER BY d ASC
	`
	apptPoints, err := queryDataPoints(ctx, queryAppts, doctorID)
	if err != nil {
		log.Printf("GetAnalytics future appts error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "An internal error occurred"})
		return
	}

	writeJSON(w, http.StatusOK, AnalyticsResponse{
		PatientsWeekly:     weeklyPoints,
		PatientsMonthly:    monthlyPoints,
		PatientsYearly:     yearlyPoints,
		RevenueDaily:       revenuePoints,
		AppointmentsFuture: apptPoints,
	})
}

func queryDataPoints(ctx context.Context, sqlQuery string, doctorID int) ([]DataPoint, error) {
	rows, err := db.Pool.Query(ctx, sqlQuery, doctorID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	points := []DataPoint{}
	for rows.Next() {
		var dp DataPoint
		err := rows.Scan(&dp.Label, &dp.Value)
		if err != nil {
			return nil, err
		}
		points = append(points, dp)
	}
	return points, nil
}
