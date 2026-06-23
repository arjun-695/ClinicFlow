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
		defer func() {
			if r := recover(); r != nil {
				log.Printf("[Worker] PANIC recovered: %v", r)
			}
		}()

		// Run once on startup
		runNotificationChecks(ctx)

		for {
			select {
			case <-ticker.C:
				func() {
					defer func() {
						if r := recover(); r != nil {
							log.Printf("[Worker] PANIC recovered during check: %v", r)
						}
					}()
					runNotificationChecks(ctx)
				}()
			case <-ctx.Done():
				ticker.Stop()
				log.Println("Notification worker stopped.")
				return
			}
		}
	}()
}

func runNotificationChecks(ctx context.Context) {
	log.Println("[Worker] Running scheduled clinic database checks for due notifications...")
	if err := checkCustomerPromises(ctx); err != nil {
		log.Printf("[Worker] Patient bills check failed: %v", err)
	}
	if err := checkSupplierDues(ctx); err != nil {
		log.Printf("[Worker] Supplier dues check failed: %v", err)
	}
	if err := checkRescheduleQueue(ctx); err != nil {
		log.Printf("[Worker] Reschedule queue check failed: %v", err)
	}
}

func checkCustomerPromises(ctx context.Context) error {
	// Query bills that are overdue/due and not yet notified, joining with doctors to get the clinic name
	query := `
		SELECT b.id, b.description, b.remaining_amount, b.promised_due_date, p.name, p.phone, d.clinic_name, d.id as doctor_id
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
	}

	var duePromises []Promise
	for rows.Next() {
		var p Promise
		err := rows.Scan(&p.ID, &p.Description, &p.Amount, &p.DueDate, &p.CustName, &p.CustPhone, &p.ClinicName, &p.DoctorID)
		if err != nil {
			log.Printf("[Worker] Error scanning bill row: %v", err)
			continue
		}
		duePromises = append(duePromises, p)
	}

	for _, p := range duePromises {
		clinicName := p.ClinicName
		if clinicName == "" {
			clinicName = "Our Clinic"
		}
		
		// Try to load custom template
		var greeting, body, footer string
		err := db.Pool.QueryRow(ctx, 
			"SELECT greeting, body, footer FROM whatsapp_templates WHERE doctor_id = $1 AND template_key = 'overdue_reminder'",
			p.DoctorID).Scan(&greeting, &body, &footer)
		if err != nil {
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

		err = services.SendWhatsApp(p.CustPhone, messageText)
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
	query := `
		SELECT sd.id, sd.supplier_name, sd.amount, sd.due_date, d.phone
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
	}

	var dueSuppliers []Due
	for rows.Next() {
		var d Due
		err := rows.Scan(&d.ID, &d.SupplierName, &d.Amount, &d.DueDate, &d.DoctorPhone)
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

		err := services.SendWhatsApp(d.DoctorPhone, messageText)
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
		SELECT rq.id, rq.appointment_id, p.name, p.phone, u.name, rq.original_date::text, u.clinic_name, u.id
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
		}
		var alerts []PendingAlert
		for rows.Next() {
			var a PendingAlert
			if errScan := rows.Scan(&a.ID, &a.AppointmentID, &a.PatientName, &a.PatientPhone, &a.DoctorName, &a.OriginalDate, &a.ClinicName, &a.DoctorID); errScan == nil {
				alerts = append(alerts, a)
			}
		}
		rows.Close()

		for _, a := range alerts {
			clinic := a.ClinicName
			if clinic == "" {
				clinic = "ClinicFlow"
			}
			var greeting, body, footer string
			errTemplate := db.Pool.QueryRow(ctx, 
				"SELECT greeting, body, footer FROM whatsapp_templates WHERE doctor_id = $1 AND template_key = 'doctor_unavailable'",
				a.DoctorID).Scan(&greeting, &body, &footer)
			if errTemplate != nil {
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

			errSend := services.SendWhatsApp(a.PatientPhone, messageText)
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
		       s.slot_date::text, s.start_time::text, u.clinic_name, u.id
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
		}
		var alerts []ReschedAlert
		for rowsResched.Next() {
			var a ReschedAlert
			if errScan := rowsResched.Scan(&a.ID, &a.AppointmentID, &a.PatientName, &a.PatientPhone, &a.DoctorName, &a.OriginalDate, &a.NewDate, &a.NewTime, &a.ClinicName, &a.DoctorID); errScan == nil {
				alerts = append(alerts, a)
			}
		}
		rowsResched.Close()

		for _, a := range alerts {
			clinic := a.ClinicName
			if clinic == "" {
				clinic = "ClinicFlow"
			}
			var greeting, body, footer string
			errTemplate := db.Pool.QueryRow(ctx, 
				"SELECT greeting, body, footer FROM whatsapp_templates WHERE doctor_id = $1 AND template_key = 'appointment_rescheduled'",
				a.DoctorID).Scan(&greeting, &body, &footer)
			if errTemplate != nil {
				greeting = "Dear {patient_name},"
				body = "Your appointment #APP-{appointment_id} with Dr. {doctor_name} originally on {original_date} has been rescheduled to {new_date} at {new_time}."
				footer = "Thank you for choosing {clinic_name}."
			}

			newTime := a.NewTime
			if len(newTime) > 5 {
				newTime = newTime[:5]
			}

			replacer := strings.NewReplacer(
				"{patient_name}", a.PatientName,
				"{doctor_name}", a.DoctorName,
				"{original_date}", a.OriginalDate,
				"{new_date}", a.NewDate,
				"{new_time}", newTime,
				"{appointment_id}", strconv.Itoa(a.AppointmentID),
				"{clinic_name}", clinic,
			)
			msg := greeting + "\n\n" + body + "\n\n" + footer
			messageText := replacer.Replace(msg)

			errSend := services.SendWhatsApp(a.PatientPhone, messageText)
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
