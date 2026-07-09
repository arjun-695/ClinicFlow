package handlers

import (
	"context"
	"log"
	"net/http"
	"strconv"
	"strings"

	"backend/db"
	"golang.org/x/sync/errgroup"
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

	facilityID, err := GetActiveFacilityID(r, doctorID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to get active facility"})
		return
	}

	ctx := r.Context()

	role, err := getUserRole(ctx, doctorID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to retrieve user role"})
		return
	}

	targetDoctorID := doctorID
	if strings.ToUpper(role) == "HOSPITAL_ADMIN" {
		targetDoctorIDStr := r.URL.Query().Get("doctor_id")
		if targetDoctorIDStr != "" {
			parsedID, err := strconv.Atoi(targetDoctorIDStr)
			if err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid doctor_id parameter"})
				return
			}
			// Verify that this doctor is associated with the admin's active facility.
			var associated bool
			checkQuery := `
				SELECT EXISTS(
					SELECT 1 FROM user_facilities 
					WHERE user_id = $1 AND facility_id = $2
				)
			`
			err = db.Pool.QueryRow(ctx, checkQuery, parsedID, facilityID).Scan(&associated)
			if err != nil {
				log.Printf("GetAnalytics user_facilities check error: %v", err)
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Database error checking doctor association"})
				return
			}
			if !associated {
				writeJSON(w, http.StatusForbidden, map[string]string{"error": "Doctor is not associated with this facility"})
				return
			}
			targetDoctorID = parsedID
		}
	} else {
		// Regular doctor or other roles: enforce security check if they try to access another ID
		targetDoctorIDStr := r.URL.Query().Get("doctor_id")
		if targetDoctorIDStr != "" {
			parsedID, err := strconv.Atoi(targetDoctorIDStr)
			if err != nil || parsedID != doctorID {
				writeJSON(w, http.StatusForbidden, map[string]string{"error": "Forbidden: you can only access your own analytics"})
				return
			}
		}
	}

	// 1. Weekly Treated Patients (Prescriptions written in past 7 days)
	queryWeekly := `
		SELECT TO_CHAR(d, 'Dy') AS label, COALESCE(COUNT(DISTINCT p.patient_id), 0)::float8 AS value
		FROM generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, '1 day') d
		LEFT JOIN prescriptions p ON DATE(p.created_at) = DATE(d) AND p.doctor_id = $1 AND p.facility_id = $2 AND p.status != 'cancelled'
		GROUP BY d ORDER BY d ASC
	`

	// 2. Monthly Treated Patients (Prescriptions written in past 12 months)
	queryMonthly := `
		SELECT TO_CHAR(m, 'Mon') AS label, COALESCE(COUNT(DISTINCT p.patient_id), 0)::float8 AS value
		FROM generate_series(CURRENT_DATE - INTERVAL '11 months', CURRENT_DATE, '1 month') m
		LEFT JOIN prescriptions p ON DATE_TRUNC('month', p.created_at) = DATE_TRUNC('month', m) AND p.doctor_id = $1 AND p.facility_id = $2 AND p.status != 'cancelled'
		GROUP BY m ORDER BY m ASC
	`

	// 3. Yearly Treated Patients (Prescriptions written in past 5 years)
	queryYearly := `
		SELECT TO_CHAR(y, 'YYYY') AS label, COALESCE(COUNT(DISTINCT p.patient_id), 0)::float8 AS value
		FROM generate_series(CURRENT_DATE - INTERVAL '4 years', CURRENT_DATE, '1 year') y
		LEFT JOIN prescriptions p ON DATE_TRUNC('year', p.created_at) = DATE_TRUNC('year', y) AND p.doctor_id = $1 AND p.facility_id = $2 AND p.status != 'cancelled'
		GROUP BY y ORDER BY y ASC
	`

	// 4. Daily Revenue (Sum of Bills created in past 30 days)
	queryRevenue := `
		SELECT TO_CHAR(d, 'DD Mon') AS label, COALESCE(SUM(b.total_amount), 0.0)::float8 AS value
		FROM generate_series(CURRENT_DATE - INTERVAL '29 days', CURRENT_DATE, '1 day') d
		LEFT JOIN bills b ON DATE(b.created_at) = DATE(d) AND b.doctor_id = $1 AND b.facility_id = $2
		GROUP BY d ORDER BY d ASC
	`

	// 5. Future Appointments Density (Count of Pending appointments in next 14 days)
	queryAppts := `
		SELECT TO_CHAR(d, 'DD Mon') AS label, COALESCE(COUNT(a.id), 0)::float8 AS value
		FROM generate_series(CURRENT_DATE, CURRENT_DATE + INTERVAL '13 days', '1 day') d
		LEFT JOIN appointments a ON DATE(a.appointment_date) = DATE(d) AND a.doctor_id = $1 AND a.facility_id = $2 AND a.status = 'PENDING'
		GROUP BY d ORDER BY d ASC
	`

	g, gCtx := errgroup.WithContext(ctx)

	var weeklyPoints, monthlyPoints, yearlyPoints, revenuePoints, apptPoints []DataPoint

	g.Go(func() error {
		var err error
		weeklyPoints, err = queryDataPoints(gCtx, queryWeekly, targetDoctorID, facilityID)
		if err != nil {
			log.Printf("GetAnalytics weekly error: %v", err)
		}
		return err
	})

	g.Go(func() error {
		var err error
		monthlyPoints, err = queryDataPoints(gCtx, queryMonthly, targetDoctorID, facilityID)
		if err != nil {
			log.Printf("GetAnalytics monthly error: %v", err)
		}
		return err
	})

	g.Go(func() error {
		var err error
		yearlyPoints, err = queryDataPoints(gCtx, queryYearly, targetDoctorID, facilityID)
		if err != nil {
			log.Printf("GetAnalytics yearly error: %v", err)
		}
		return err
	})

	g.Go(func() error {
		var err error
		revenuePoints, err = queryDataPoints(gCtx, queryRevenue, targetDoctorID, facilityID)
		if err != nil {
			log.Printf("GetAnalytics revenue error: %v", err)
		}
		return err
	})

	g.Go(func() error {
		var err error
		apptPoints, err = queryDataPoints(gCtx, queryAppts, targetDoctorID, facilityID)
		if err != nil {
			log.Printf("GetAnalytics future appts error: %v", err)
		}
		return err
	})

	if err := g.Wait(); err != nil {
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

func queryDataPoints(ctx context.Context, sqlQuery string, doctorID int, facilityID int) ([]DataPoint, error) {
	rows, err := db.Pool.Query(ctx, sqlQuery, doctorID, facilityID)
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
