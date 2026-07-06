// Package worker runs the background notification loop that checks overdue
// customer promises and upcoming supplier dues, then sends WhatsApp reminders.
package worker

import (
	"context"
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"
	"time"

	"backend/db"
	"backend/services"
)

type Template struct {
	Greeting string
	Body     string
	Footer   string
}

// StartWorker runs the background cron checker loop
func StartWorker(ctx context.Context) {
	if strings.ToLower(os.Getenv("DISABLE_NOTIFICATION_WORKER")) == "true" {
		log.Println("Background clinic notification worker is disabled via environment variable.")
		return
	}

	intervalStr := os.Getenv("WORKER_INTERVAL_MINUTES")
	interval := 30 * time.Minute
	if intervalStr != "" {
		if d, err := time.ParseDuration(intervalStr + "m"); err == nil {
			interval = d
		}
	}

	log.Printf("Starting background clinic notification worker (interval: %v)...", interval)
	ticker := time.NewTicker(interval)

	go func() {
		defer ticker.Stop()

		// Safe check wrapper with per-invocation panic recovery
		safeRunCycle := func() {
			defer func() {
				if r := recover(); r != nil {
					log.Printf("[Worker] PANIC recovered in runNotificationCycle: %v", r)
				}
			}()
			runNotificationCycle(ctx)
		}

		// Run immediate check on start
		safeRunCycle()

		for {
			select {
			case <-ticker.C:
				safeRunCycle()
			case <-ctx.Done():
				log.Println("Stopping background notification worker...")
				return
			}
		}
	}()
}

func runNotificationCycle(ctx context.Context) {
	log.Println("[Worker] Running clinic notification checks...")
	
	if err := checkCustomerPromises(ctx); err != nil {
		log.Printf("[Worker] Customer promises check failed: %v", err)
	}

	if err := checkSupplierDues(ctx); err != nil {
		log.Printf("[Worker] Supplier payables check failed: %v", err)
	}

	if err := checkRescheduleQueue(ctx); err != nil {
		log.Printf("[Worker] Reschedule queue check failed: %v", err)
	}

	if err := checkRecurringPaymentReminders(ctx); err != nil {
		log.Printf("[Worker] Recurring payment reminders check failed: %v", err)
	}

	if err := checkAppointmentReminders(ctx); err != nil {
		log.Printf("[Worker] Appointment reminders check failed: %v", err)
	}
}

func checkCustomerPromises(ctx context.Context) error {
	// Query bills that are overdue/due and not yet notified, joining with doctors to get the clinic name
	query := `
		SELECT b.id, b.description, b.remaining_amount, b.promised_due_date, p.name, p.phone, d.clinic_name, d.id as doctor_id, b.facility_id
		FROM bills b
		JOIN patients p ON b.patient_id = p.id
		JOIN users d ON b.doctor_id = d.id
		WHERE b.promised_due_date <= CURRENT_DATE 
		  AND b.status != 'SETTLED'
		  AND b.notified = FALSE
	`
	rows, err := db.Pool.Query(ctx, query)
	if err != nil {
		return fmt.Errorf("failed to query patient bills: %v", err)
	}
	defer rows.Close()

	appURL := os.Getenv("WEBAUTHN_RP_ORIGIN")
	if appURL == "" {
		appURL = "http://localhost:3000"
	}

	type Promise struct {
		ID          int
		Description string
		Amount      float64
		DueDate     time.Time
		CustName    string
		CustPhone   string
		ClinicName  string
		DoctorID    int
		FacilityID  *int
	}

	var duePromises []Promise
	for rows.Next() {
		var p Promise
		err := rows.Scan(&p.ID, &p.Description, &p.Amount, &p.DueDate, &p.CustName, &p.CustPhone, &p.ClinicName, &p.DoctorID, &p.FacilityID)
		if err != nil {
			log.Printf("[Worker] Error scanning bill row: %v", err)
			continue
		}
		duePromises = append(duePromises, p)
	}

	// Prefetch templates to avoid N+1 lookups
	doctorIDsMap := make(map[int]bool)
	var doctorIDs []int
	for _, p := range duePromises {
		if !doctorIDsMap[p.DoctorID] {
			doctorIDsMap[p.DoctorID] = true
			doctorIDs = append(doctorIDs, p.DoctorID)
		}
	}

	templatesMap := make(map[int]Template)
	if len(doctorIDs) > 0 {
		rowsTmpl, err := db.Pool.Query(ctx, `
			SELECT doctor_id, greeting, body, footer 
			FROM whatsapp_templates 
			WHERE template_key = 'overdue_reminder' AND doctor_id = ANY($1)
		`, doctorIDs)
		if err == nil {
			defer rowsTmpl.Close()
			for rowsTmpl.Next() {
				var docID int
				var t Template
				if errScan := rowsTmpl.Scan(&docID, &t.Greeting, &t.Body, &t.Footer); errScan == nil {
					templatesMap[docID] = t
				}
			}
		}
	}

	for _, p := range duePromises {
		clinicName := p.ClinicName
		if clinicName == "" {
			clinicName = "Our Clinic"
		}
		
		// Try to load custom template in-memory
		tmpl, exists := templatesMap[p.DoctorID]
		var greeting, body, footer string
		if exists {
			greeting, body, footer = tmpl.Greeting, tmpl.Body, tmpl.Footer
		} else {
			// Use defaults
			greeting = "Dear {patient_name},"
			body = "This is a friendly reminder from {clinic_name} that an outstanding balance of ₹{remaining_amount} is due for your bill ({description})."
			footer = "You can view your details and receipt here: {bill_link}"
		}

		msgTemplate := greeting + "\n\n" + body + "\n\n" + footer
		replacer := strings.NewReplacer(
			"{patient_name}", p.CustName,
			"{clinic_name}", clinicName,
			"{remaining_amount}", fmt.Sprintf("%.2f", p.Amount),
			"{description}", p.Description,
			"{bill_link}", fmt.Sprintf("%s/dashboard?view=bill&id=%d", appURL, p.ID),
		)
		messageText := replacer.Replace(msgTemplate)

		facID := 0
		if p.FacilityID != nil {
			facID = *p.FacilityID
		}

		err = services.SendWhatsApp(facID, p.CustPhone, messageText)
		if err != nil {
			log.Printf("[Worker] Failed to send WhatsApp to patient %s (%s): %v", p.CustName, p.CustPhone, err)
			continue
		}

		_, err = db.Pool.Exec(ctx, "UPDATE bills SET notified = TRUE WHERE id = $1", p.ID)
		if err != nil {
			log.Printf("[Worker] Failed to update bill notified status for ID %d: %v", p.ID, err)
		}
	}

	return nil
}

func checkSupplierDues(ctx context.Context) error {
	// Query supplier dues that are due in the next 2 days or past due, and not yet notified, joining with doctors to get their phone
	// Also select facility ID mapped to the user
	query := `
		SELECT sd.id, sd.supplier_name, sd.amount, sd.due_date, d.phone,
		       COALESCE((SELECT facility_id FROM user_facilities WHERE user_id = sd.shopkeeper_id LIMIT 1), 0) as facility_id
		FROM supplier_dues sd
		JOIN users d ON sd.shopkeeper_id = d.id
		WHERE sd.due_date <= CURRENT_DATE + INTERVAL '2 days'
		  AND sd.notified = FALSE
	`
	rows, err := db.Pool.Query(ctx, query)
	if err != nil {
		return fmt.Errorf("failed to query supplier dues: %v", err)
	}
	defer rows.Close()

	type Due struct {
		ID           int
		SupplierName string
		Amount       float64
		DueDate      time.Time
		DoctorPhone  string
		FacilityID   int
	}

	var dueSuppliers []Due
	for rows.Next() {
		var d Due
		err := rows.Scan(&d.ID, &d.SupplierName, &d.Amount, &d.DueDate, &d.DoctorPhone, &d.FacilityID)
		if err != nil {
			log.Printf("[Worker] Error scanning supplier row: %v", err)
			continue
		}
		dueSuppliers = append(dueSuppliers, d)
	}

	for _, d := range dueSuppliers {
		if d.DoctorPhone == "" {
			continue
		}

		messageText := fmt.Sprintf(
			"Self-Reminder: You have a payable amount of ₹%.2f due to medical supplier %s on %s.",
			d.Amount, d.SupplierName, d.DueDate.Format("2006-01-02"),
		)

		err := services.SendWhatsApp(d.FacilityID, d.DoctorPhone, messageText)
		if err != nil {
			log.Printf("[Worker] Failed to send WhatsApp reminder to doctor (%s): %v", d.DoctorPhone, err)
			continue
		}

		_, err = db.Pool.Exec(ctx, "UPDATE supplier_dues SET notified = TRUE WHERE id = $1", d.ID)
		if err != nil {
			log.Printf("[Worker] Failed to update supplier notified status for ID %d: %v", d.ID, err)
		}
	}

	return nil
}

func checkRescheduleQueue(ctx context.Context) error {
	// 1. Process Unavailability Alerts (status = 'pending' AND notification_sent = false)
	pendingQuery := `
		SELECT rq.id, rq.appointment_id, p.name, p.phone, u.name, rq.original_date::text, u.clinic_name, u.id, rq.facility_id
		FROM reschedule_queue rq
		JOIN patients p ON rq.patient_id = p.id
		JOIN users u ON rq.doctor_id = u.id
		WHERE rq.status = 'pending' AND rq.notification_sent = FALSE
	`
	rows, err := db.Pool.Query(ctx, pendingQuery)
	if err == nil {
		type PendingAlert struct {
			ID            int
			AppointmentID int
			PatientName   string
			PatientPhone  string
			DoctorName    string
			OriginalDate  string
			ClinicName    string
			DoctorID      int
			FacilityID    *int
		}
		var alerts []PendingAlert
		for rows.Next() {
			var a PendingAlert
			if errScan := rows.Scan(&a.ID, &a.AppointmentID, &a.PatientName, &a.PatientPhone, &a.DoctorName, &a.OriginalDate, &a.ClinicName, &a.DoctorID, &a.FacilityID); errScan == nil {
				alerts = append(alerts, a)
			}
		}
		rows.Close()

		// Prefetch templates to avoid N+1 lookups
		doctorIDsMap := make(map[int]bool)
		var doctorIDs []int
		for _, a := range alerts {
			if !doctorIDsMap[a.DoctorID] {
				doctorIDsMap[a.DoctorID] = true
				doctorIDs = append(doctorIDs, a.DoctorID)
			}
		}
		templatesMap := make(map[int]Template)
		if len(doctorIDs) > 0 {
			rowsTmpl, err := db.Pool.Query(ctx, `
				SELECT doctor_id, greeting, body, footer 
				FROM whatsapp_templates 
				WHERE template_key = 'doctor_unavailable' AND doctor_id = ANY($1)
			`, doctorIDs)
			if err == nil {
				defer rowsTmpl.Close()
				for rowsTmpl.Next() {
					var docID int
					var t Template
					if errScan := rowsTmpl.Scan(&docID, &t.Greeting, &t.Body, &t.Footer); errScan == nil {
						templatesMap[docID] = t
					}
				}
			}
		}

		for _, a := range alerts {
			clinic := a.ClinicName
			if clinic == "" {
				clinic = "ClinicFlow"
			}
			
			// Load custom template in-memory
			tmpl, exists := templatesMap[a.DoctorID]
			var greeting, body, footer string
			if exists {
				greeting, body, footer = tmpl.Greeting, tmpl.Body, tmpl.Footer
			} else {
				greeting = "Dear {patient_name},"
				body = "We regret to inform you that Dr. {doctor_name} is unavailable on {original_date}. Your appointment #APP-{appointment_id} is in our rescheduling queue, and we will update you with new details shortly."
				footer = "Thank you for your understanding. - {clinic_name}"
			}

			replacer := strings.NewReplacer(
				"{patient_name}", a.PatientName,
				"{doctor_name}", a.DoctorName,
				"{original_date}", a.OriginalDate,
				"{appointment_id}", strconv.Itoa(a.AppointmentID),
				"{clinic_name}", clinic,
			)
			msg := greeting + "\n\n" + body + "\n\n" + footer
			messageText := replacer.Replace(msg)

			facID := 0
			if a.FacilityID != nil {
				facID = *a.FacilityID
			}

			errSend := services.SendWhatsApp(facID, a.PatientPhone, messageText)
			if errSend != nil {
				log.Printf("[Worker] Failed to send unavailability WhatsApp to %s: %v", a.PatientPhone, errSend)
				continue
			}

			_, _ = db.Pool.Exec(ctx, "UPDATE reschedule_queue SET notification_sent = TRUE WHERE id = $1", a.ID)
		}
	} else {
		log.Printf("[Worker] Failed to query pending reschedules: %v", err)
	}

	// 2. Process Rescheduled Alerts (status = 'rescheduled')
	reschedQuery := `
		SELECT rq.id, rq.appointment_id, p.name, p.phone, u.name, rq.original_date::text, 
		       s.slot_date::text, s.start_time::text, u.clinic_name, u.id, rq.facility_id
		FROM reschedule_queue rq
		JOIN patients p ON rq.patient_id = p.id
		JOIN users u ON rq.doctor_id = u.id
		JOIN appointment_slots s ON rq.new_slot_id = s.id
		WHERE rq.status = 'rescheduled'
	`
	rowsResched, errResched := db.Pool.Query(ctx, reschedQuery)
	if errResched == nil {
		type ReschedAlert struct {
			ID            int
			AppointmentID int
			PatientName   string
			PatientPhone  string
			DoctorName    string
			OriginalDate  string
			NewDate       string
			NewTime       string
			ClinicName    string
			DoctorID      int
			FacilityID    *int
		}
		var alerts []ReschedAlert
		for rowsResched.Next() {
			var a ReschedAlert
			if errScan := rowsResched.Scan(&a.ID, &a.AppointmentID, &a.PatientName, &a.PatientPhone, &a.DoctorName, &a.OriginalDate, &a.NewDate, &a.NewTime, &a.ClinicName, &a.DoctorID, &a.FacilityID); errScan == nil {
				alerts = append(alerts, a)
			}
		}
		rowsResched.Close()

		// Prefetch templates to avoid N+1 lookups
		doctorIDsMap := make(map[int]bool)
		var doctorIDs []int
		for _, a := range alerts {
			if !doctorIDsMap[a.DoctorID] {
				doctorIDsMap[a.DoctorID] = true
				doctorIDs = append(doctorIDs, a.DoctorID)
			}
		}
		templatesMap := make(map[int]Template)
		if len(doctorIDs) > 0 {
			rowsTmpl, err := db.Pool.Query(ctx, `
				SELECT doctor_id, greeting, body, footer 
				FROM whatsapp_templates 
				WHERE template_key = 'appointment_rescheduled' AND doctor_id = ANY($1)
			`, doctorIDs)
			if err == nil {
				defer rowsTmpl.Close()
				for rowsTmpl.Next() {
					var docID int
					var t Template
					if errScan := rowsTmpl.Scan(&docID, &t.Greeting, &t.Body, &t.Footer); errScan == nil {
						templatesMap[docID] = t
					}
				}
			}
		}

		for _, a := range alerts {
			clinic := a.ClinicName
			if clinic == "" {
				clinic = "ClinicFlow"
			}
			
			// Load custom template in-memory
			tmpl, exists := templatesMap[a.DoctorID]
			var greeting, body, footer string
			if exists {
				greeting, body, footer = tmpl.Greeting, tmpl.Body, tmpl.Footer
			} else {
				greeting = "Dear {patient_name},"
				body = "Your appointment #APP-{appointment_id} with Dr. {doctor_name} originally on {original_date} has been successfully rescheduled.\n\n*New Details:*\n*Date:* {new_date}\n*Time:* {new_time}"
				footer = "Thank you. - {clinic_name}"
			}

			replacer := strings.NewReplacer(
				"{patient_name}", a.PatientName,
				"{doctor_name}", a.DoctorName,
				"{original_date}", a.OriginalDate,
				"{appointment_id}", strconv.Itoa(a.AppointmentID),
				"{new_date}", a.NewDate,
				"{new_time}", a.NewTime,
				"{clinic_name}", clinic,
			)
			msg := greeting + "\n\n" + body + "\n\n" + footer
			messageText := replacer.Replace(msg)

			facID := 0
			if a.FacilityID != nil {
				facID = *a.FacilityID
			}

			errSend := services.SendWhatsApp(facID, a.PatientPhone, messageText)
			if errSend != nil {
				log.Printf("[Worker] Failed to send rescheduled WhatsApp to %s: %v", a.PatientPhone, errSend)
				continue
			}

			_, _ = db.Pool.Exec(ctx, "UPDATE reschedule_queue SET status = 'notified', notification_sent = TRUE WHERE id = $1", a.ID)
		}
	} else {
		log.Printf("[Worker] Failed to query rescheduled entries: %v", errResched)
	}

	return nil
}

// checkRecurringPaymentReminders queries unpaid bills and sends reminders every 15 days
func checkRecurringPaymentReminders(ctx context.Context) error {
	query := `
		SELECT b.id, b.description, b.remaining_amount, p.name, p.phone, d.clinic_name, d.id as doctor_id, b.facility_id
		FROM bills b
		JOIN patients p ON b.patient_id = p.id
		JOIN users d ON b.doctor_id = d.id
		WHERE b.status != 'SETTLED'
		  AND b.remaining_amount > 0
		  AND COALESCE(b.last_reminder_sent_at, b.created_at) <= NOW() - INTERVAL '15 days'
	`
	rows, err := db.Pool.Query(ctx, query)
	if err != nil {
		return fmt.Errorf("failed to query payment reminders: %v", err)
	}
	defer rows.Close()

	type Reminder struct {
		ID          int
		Description string
		Amount      float64
		CustName    string
		CustPhone   string
		ClinicName  string
		DoctorID    int
		FacilityID  *int
	}

	var reminders []Reminder
	for rows.Next() {
		var r Reminder
		err := rows.Scan(&r.ID, &r.Description, &r.Amount, &r.CustName, &r.CustPhone, &r.ClinicName, &r.DoctorID, &r.FacilityID)
		if err != nil {
			log.Printf("[Worker] Error scanning reminder row: %v", err)
			continue
		}
		reminders = append(reminders, r)
	}

	appURL := os.Getenv("WEBAUTHN_RP_ORIGIN")
	if appURL == "" {
		appURL = "http://localhost:3000"
	}

	// Prefetch templates to avoid N+1 lookups
	doctorIDsMap := make(map[int]bool)
	var doctorIDs []int
	for _, r := range reminders {
		if !doctorIDsMap[r.DoctorID] {
			doctorIDsMap[r.DoctorID] = true
			doctorIDs = append(doctorIDs, r.DoctorID)
		}
	}

	templatesMap := make(map[int]Template)
	if len(doctorIDs) > 0 {
		rowsTmpl, err := db.Pool.Query(ctx, `
			SELECT doctor_id, greeting, body, footer 
			FROM whatsapp_templates 
			WHERE template_key = 'overdue_reminder' AND doctor_id = ANY($1)
		`, doctorIDs)
		if err == nil {
			defer rowsTmpl.Close()
			for rowsTmpl.Next() {
				var docID int
				var t Template
				if errScan := rowsTmpl.Scan(&docID, &t.Greeting, &t.Body, &t.Footer); errScan == nil {
					templatesMap[docID] = t
				}
			}
		}
	}

	for _, r := range reminders {
		clinicName := r.ClinicName
		if clinicName == "" {
			clinicName = "Our Clinic"
		}

		// Try to load custom template in-memory
		tmpl, exists := templatesMap[r.DoctorID]
		var greeting, body, footer string
		if exists {
			greeting, body, footer = tmpl.Greeting, tmpl.Body, tmpl.Footer
		} else {
			// Use defaults
			greeting = "Dear {patient_name},"
			body = "This is a friendly reminder from {clinic_name} that an outstanding balance of ₹{remaining_amount} is due for your bill ({description})."
			footer = "You can view your details and receipt here: {bill_link}"
		}

		msgTemplate := greeting + "\n\n" + body + "\n\n" + footer
		replacer := strings.NewReplacer(
			"{patient_name}", r.CustName,
			"{clinic_name}", clinicName,
			"{remaining_amount}", fmt.Sprintf("%.2f", r.Amount),
			"{description}", r.Description,
			"{bill_link}", fmt.Sprintf("%s/dashboard?view=bill&id=%d", appURL, r.ID),
		)
		messageText := replacer.Replace(msgTemplate)

		facID := 0
		if r.FacilityID != nil {
			facID = *r.FacilityID
		}

		err = services.SendWhatsApp(facID, r.CustPhone, messageText)
		if err != nil {
			log.Printf("[Worker] Failed to send payment reminder WhatsApp to patient %s (%s): %v", r.CustName, r.CustPhone, err)
			continue
		}

		_, err = db.Pool.Exec(ctx, "UPDATE bills SET last_reminder_sent_at = NOW() WHERE id = $1", r.ID)
		if err != nil {
			log.Printf("[Worker] Failed to update last_reminder_sent_at for ID %d: %v", r.ID, err)
		}
	}

	return nil
}

// checkAppointmentReminders checks for upcoming appointments and sends WhatsApp reminders
func checkAppointmentReminders(ctx context.Context) error {
	query := `
		SELECT a.id, a.appointment_date, a.reason, p.name as patient_name, p.phone as patient_phone, 
		       d.name as doctor_name, COALESCE(d.clinic_name, '') as clinic_name, d.id as doctor_id, a.facility_id
		FROM appointments a
		JOIN patients p ON a.patient_id = p.id
		JOIN users d ON a.doctor_id = d.id
		WHERE a.status = 'PENDING'
		  AND a.reminder_sent = FALSE
		  AND a.appointment_date::date <= CURRENT_DATE + INTERVAL '1 day'
		  AND a.appointment_date >= NOW()
	`
	rows, err := db.Pool.Query(ctx, query)
	if err != nil {
		return fmt.Errorf("failed to query appointment reminders: %v", err)
	}
	defer rows.Close()

	type ApptReminder struct {
		ID              int
		AppointmentDate time.Time
		Reason          string
		PatientName     string
		PatientPhone    string
		DoctorName      string
		ClinicName      string
		DoctorID        int
		FacilityID      *int
	}

	var reminders []ApptReminder
	for rows.Next() {
		var a ApptReminder
		var reason *string
		err := rows.Scan(&a.ID, &a.AppointmentDate, &reason, &a.PatientName, &a.PatientPhone, &a.DoctorName, &a.ClinicName, &a.DoctorID, &a.FacilityID)
		if err != nil {
			log.Printf("[Worker] Error scanning appointment reminder row: %v", err)
			continue
		}
		if reason != nil {
			a.Reason = *reason
		}
		reminders = append(reminders, a)
	}

	// Prefetch templates to avoid N+1 lookups
	doctorIDsMap := make(map[int]bool)
	var doctorIDs []int
	for _, a := range reminders {
		if !doctorIDsMap[a.DoctorID] {
			doctorIDsMap[a.DoctorID] = true
			doctorIDs = append(doctorIDs, a.DoctorID)
		}
	}

	templatesMap := make(map[int]Template)
	if len(doctorIDs) > 0 {
		rowsTmpl, err := db.Pool.Query(ctx, `
			SELECT doctor_id, greeting, body, footer 
			FROM whatsapp_templates 
			WHERE template_key = 'appointment_reminder' AND doctor_id = ANY($1)
		`, doctorIDs)
		if err == nil {
			defer rowsTmpl.Close()
			for rowsTmpl.Next() {
				var docID int
				var t Template
				if errScan := rowsTmpl.Scan(&docID, &t.Greeting, &t.Body, &t.Footer); errScan == nil {
					templatesMap[docID] = t
				}
			}
		}
	}

	for _, a := range reminders {
		clinicName := a.ClinicName
		if clinicName == "" {
			clinicName = "Our Clinic"
		}

		// Try to load custom template in-memory
		tmpl, exists := templatesMap[a.DoctorID]
		var greeting, body, footer string
		if exists {
			greeting, body, footer = tmpl.Greeting, tmpl.Body, tmpl.Footer
		} else {
			// Use defaults
			greeting = "Dear {patient_name},"
			body = "This is a reminder that you have an upcoming appointment with Dr. {doctor_name} at *{clinic_name}*.\n\n*Time:* {appointment_time}\n*Reason:* {reason}"
			footer = "Please arrive 10 minutes early. If you need to reschedule, please contact the clinic."
		}

		msgTemplate := greeting + "\n\n" + body + "\n\n" + footer
		replacer := strings.NewReplacer(
			"{patient_name}", a.PatientName,
			"{doctor_name}", a.DoctorName,
			"{clinic_name}", clinicName,
			"{appointment_time}", a.AppointmentDate.Format("Mon, Jan 2 at 3:04 PM"),
			"{reason}", a.Reason,
		)
		messageText := replacer.Replace(msgTemplate)

		facID := 0
		if a.FacilityID != nil {
			facID = *a.FacilityID
		}

		err = services.SendWhatsApp(facID, a.PatientPhone, messageText)
		if err != nil {
			log.Printf("[Worker] Failed to send appointment reminder WhatsApp to patient %s (%s): %v", a.PatientName, a.PatientPhone, err)
			continue
		}

		_, err = db.Pool.Exec(ctx, "UPDATE appointments SET reminder_sent = TRUE WHERE id = $1", a.ID)
		if err != nil {
			log.Printf("[Worker] Failed to update appointment reminder status for ID %d: %v", a.ID, err)
		}
	}

	return nil
}
