package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"time"

	"backend/db"
	"backend/services"
)

type DispensingRecord struct {
	ID             int       `json:"id"`
	FacilityID     int       `json:"facility_id"`
	PrescriptionID int       `json:"prescription_id"`
	PatientID      int       `json:"patient_id"`
	PatientName    string    `json:"patient_name"`
	DispensedBy    int       `json:"dispensed_by"`
	DispenserName  string    `json:"dispenser_name"`
	BillID         *int      `json:"bill_id"`
	Status         string    `json:"status"` // pending, dispensed, partially_dispensed
	DispensedAt    time.Time `json:"dispensed_at"`
	CreatedAt      time.Time `json:"created_at"`
	Items          []struct {
		ID                 int     `json:"id"`
		DispensingID       int     `json:"dispensing_id"`
		PrescriptionItemID int     `json:"prescription_item_id"`
		MedicineName       string  `json:"medicine_name"`
		MedicineID         *int    `json:"medicine_id"`
		TabletsGiven       int     `json:"tablets_given"`
		CostPerTablet      float64 `json:"cost_per_tablet"`
		LineTotal          float64 `json:"line_total"`
		IsNIL              bool    `json:"is_nil"`
		NILReason          string  `json:"nil_reason"`
	} `json:"items,omitempty"`
}

// ListPendingPrescriptions returns all active and partially_dispensed prescriptions.
// Restricts to PHARMACIST role.
func ListPendingPrescriptions(w http.ResponseWriter, r *http.Request) {
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

	limit, offset := parsePagination(r)

	query := `
		SELECT rx.id, rx.patient_id, p.name as patient_name, rx.doctor_id, u.name as doctor_name, 
		       rx.appointment_id, rx.diagnosis, rx.notes, rx.status, rx.created_at
		FROM prescriptions rx
		JOIN patients p ON rx.patient_id = p.id
		JOIN users u ON rx.doctor_id = u.id
		WHERE rx.facility_id = $1 AND rx.status IN ('active', 'partially_dispensed')
		ORDER BY rx.created_at ASC
		LIMIT $2 OFFSET $3
	`
	rows, err := db.Pool.Query(r.Context(), query, facilityID, limit, offset)
	if err != nil {
		log.Printf("ListPendingPrescriptions query error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to query pending prescriptions"})
		return
	}
	defer rows.Close()

	prescriptions := []Prescription{}
	for rows.Next() {
		var rx Prescription
		err := rows.Scan(&rx.ID, &rx.PatientID, &rx.PatientName, &rx.DoctorID, &rx.DoctorName, &rx.AppointmentID, &rx.Diagnosis, &rx.Notes, &rx.Status, &rx.CreatedAt)
		if err != nil {
			log.Printf("ListPendingPrescriptions scan error: %v", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to scan records"})
			return
		}

		// Load items for this prescription so pharmacist knows what to dispense
		itemsQuery := `
			SELECT id, prescription_id, medicine_name, medicine_id, dosage, frequency, duration, quantity, instructions
			FROM prescription_items
			WHERE prescription_id = $1
		`
		iRows, err := db.Pool.Query(r.Context(), itemsQuery, rx.ID)
		if err == nil {
			items := []RxItem{}
			for iRows.Next() {
				var it RxItem
				if errScan := iRows.Scan(&it.ID, &it.PrescriptionID, &it.MedicineName, &it.MedicineID, &it.Dosage, &it.Frequency, &it.Duration, &it.Quantity, &it.Instructions); errScan == nil {
					items = append(items, it)
				}
			}
			iRows.Close()
			rx.Items = items
		}

		prescriptions = append(prescriptions, rx)
	}

	writeJSON(w, http.StatusOK, prescriptions)
}

// DispensePrescription dispenses medications, decrements inventory stock, and auto-generates invoice.
// Restricts to PHARMACIST role.
func DispensePrescription(w http.ResponseWriter, r *http.Request) {
	var input struct {
		PrescriptionID int     `json:"prescription_id"`
		AmountPaid     float64 `json:"amount_paid"`
		Items          []struct {
			PrescriptionItemID int     `json:"prescription_item_id"`
			MedicineID         *int    `json:"medicine_id"`
			TabletsGiven       int     `json:"tablets_given"`
			CostPerTablet      float64 `json:"cost_per_tablet"`
			IsNIL              bool    `json:"is_nil"`
			NILReason          string  `json:"nil_reason"`
		} `json:"items"`
	}

	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
		return
	}

	if input.PrescriptionID <= 0 || len(input.Items) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Prescription ID and items are required"})
		return
	}

	pharmacistID, ok := r.Context().Value(ShopkeeperIDKey).(int)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	facilityID, err := GetActiveFacilityID(r, pharmacistID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to get active facility"})
		return
	}

	// Fetch prescription details
	var patientID, doctorID int
	var rxStatus string
	err = db.Pool.QueryRow(r.Context(), `
		SELECT patient_id, doctor_id, status FROM prescriptions WHERE id = $1 AND facility_id = $2
	`, input.PrescriptionID, facilityID).Scan(&patientID, &doctorID, &rxStatus)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Prescription not found"})
		return
	}

	if rxStatus == "dispensed" || rxStatus == "cancelled" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Prescription is already fully dispensed or cancelled"})
		return
	}

	tx, err := db.Pool.Begin(r.Context())
	if err != nil {
		log.Printf("DispensePrescription transaction begin error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Database error"})
		return
	}
	defer tx.Rollback(r.Context())

	// 1. Create Dispensing Record
	var dispensingID int
	dispQuery := `
		INSERT INTO dispensing_records (facility_id, prescription_id, patient_id, dispensed_by, status, dispensed_at)
		VALUES ($1, $2, $3, $4, 'dispensed', now())
		RETURNING id
	`
	err = tx.QueryRow(r.Context(), dispQuery, facilityID, input.PrescriptionID, patientID, pharmacistID).Scan(&dispensingID)
	if err != nil {
		log.Printf("DispensePrescription create record error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to create dispensing ledger"})
		return
	}

	var invoiceItems []struct {
		Name      string
		Quantity  int
		UnitPrice float64
		Dosage    string
	}

	grandTotal := 0.0
	isFullyDispensed := true

	// 2. Process items
	for _, item := range input.Items {
		var medicineName, dosage string
		var prescribedQty int
		err = tx.QueryRow(r.Context(), `
			SELECT medicine_name, dosage, quantity FROM prescription_items WHERE id = $1 AND prescription_id = $2
		`, item.PrescriptionItemID, input.PrescriptionID).Scan(&medicineName, &dosage, &prescribedQty)
		if err != nil {
			log.Printf("DispensePrescription fetch Rx item error: %v", err)
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid prescription item ID"})
			return
		}

		lineTotal := 0.0
		if !item.IsNIL {
			lineTotal = float64(item.TabletsGiven) * item.CostPerTablet
			grandTotal += lineTotal

			// Check and deduct inventory stock
			if item.MedicineID != nil {
				var stock int
				err = tx.QueryRow(r.Context(), "SELECT stock FROM medicines WHERE id = $1 FOR UPDATE", item.MedicineID).Scan(&stock)
				if err != nil {
					log.Printf("DispensePrescription stock lookup error: %v", err)
					writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Inventory lookup error"})
					return
				}
				if stock < item.TabletsGiven {
					writeJSON(w, http.StatusBadRequest, map[string]string{"error": fmt.Sprintf("Insufficient stock for medicine '%s'. Available: %d, Requested: %d", medicineName, stock, item.TabletsGiven)})
					return
				}

				_, err = tx.Exec(r.Context(), "UPDATE medicines SET stock = stock - $1 WHERE id = $2", item.TabletsGiven, item.MedicineID)
				if err != nil {
					log.Printf("DispensePrescription stock deduct error: %v", err)
					writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to update stock"})
					return
				}
			}

			// Add to invoice items
			invoiceItems = append(invoiceItems, struct {
				Name      string
				Quantity  int
				UnitPrice float64
				Dosage    string
			}{
				Name:      medicineName,
				Quantity:  item.TabletsGiven,
				UnitPrice: item.CostPerTablet,
				Dosage:    dosage,
			})

			if item.TabletsGiven < prescribedQty {
				isFullyDispensed = false
			}
		} else {
			// NIL Medicine Out of Stock - Print ₹0 message on invoice
			invoiceItems = append(invoiceItems, struct {
				Name      string
				Quantity  int
				UnitPrice float64
				Dosage    string
			}{
				Name:      "NIL — " + medicineName + " (" + item.NILReason + ")",
				Quantity:  1,
				UnitPrice: 0,
				Dosage:    dosage,
			})
		}

		// Insert into dispensing_items
		_, err = tx.Exec(r.Context(), `
			INSERT INTO dispensing_items (dispensing_id, prescription_item_id, medicine_id, tablets_given, cost_per_tablet, line_total, is_nil, nil_reason)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		`, dispensingID, item.PrescriptionItemID, item.MedicineID, item.TabletsGiven, item.CostPerTablet, lineTotal, item.IsNIL, item.NILReason)
		if err != nil {
			log.Printf("DispensePrescription insert item error: %v", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to record dispensing item"})
			return
		}
	}

	// 3. Auto-generate Bill Invoice
	var billID int
	description := fmt.Sprintf("Pharmacy Invoice — Rx #%d", input.PrescriptionID)

	remainingAmount := grandTotal - input.AmountPaid
	var billStatus string
	if remainingAmount <= 0 {
		billStatus = "SETTLED"
		remainingAmount = 0
	} else if input.AmountPaid > 0 {
		billStatus = "PARTIALLY_PAID"
	} else {
		billStatus = "PENDING"
	}

	billQuery := `
		INSERT INTO bills (patient_id, doctor_id, description, total_amount, remaining_amount, status, facility_id, promised_due_date, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
		RETURNING id
	`
	// Promise due date defaults to 7 days from now
	promisedDate := time.Now().AddDate(0, 0, 7)
	err = tx.QueryRow(r.Context(), billQuery, patientID, doctorID, description, grandTotal, remainingAmount, billStatus, facilityID, promisedDate).Scan(&billID)
	if err != nil {
		log.Printf("DispensePrescription create bill error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to auto-generate bill"})
		return
	}

	// Insert invoice items into bill_items
	for _, bi := range invoiceItems {
		_, err = tx.Exec(r.Context(), `
			INSERT INTO bill_items (bill_id, item_name, quantity, unit_price, dosage)
			VALUES ($1, $2, $3, $4, $5)
		`, billID, bi.Name, bi.Quantity, bi.UnitPrice, bi.Dosage)
		if err != nil {
			log.Printf("DispensePrescription insert bill item error: %v", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to populate invoice lines"})
			return
		}
	}

	// 4. Log co-payment record if AmountPaid > 0
	if input.AmountPaid > 0 {
		_, err = tx.Exec(r.Context(), `
			INSERT INTO payments (bill_id, amount_paid, payment_mode, remarks, payment_date)
			VALUES ($1, $2, 'CASH', 'Upfront co-payment during dispensing', now())
		`, billID, input.AmountPaid)
		if err != nil {
			log.Printf("DispensePrescription create payment error: %v", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to log dispensing co-payment"})
			return
		}
	}

	// 5. Link dispensing record to the bill
	_, err = tx.Exec(r.Context(), "UPDATE dispensing_records SET bill_id = $1 WHERE id = $2", billID, dispensingID)
	if err != nil {
		log.Printf("DispensePrescription update bill_id link error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to link billing invoice"})
		return
	}

	// 6. Update Prescription Status
	newRxStatus := "dispensed"
	if !isFullyDispensed {
		newRxStatus = "partially_dispensed"
	}
	_, err = tx.Exec(r.Context(), "UPDATE prescriptions SET status = $1 WHERE id = $2", newRxStatus, input.PrescriptionID)
	if err != nil {
		log.Printf("DispensePrescription update Rx status error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to update prescription status"})
		return
	}

	if err = tx.Commit(r.Context()); err != nil {
		log.Printf("DispensePrescription tx commit error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Transaction commit failed"})
		return
	}

	// Invalidate caches (Both detail and list, facility-wide)
	db.InvalidateCache(r.Context(), "patient:detail:*:"+strconv.Itoa(patientID))
	db.InvalidateCache(r.Context(), "patients:list:*:"+strconv.Itoa(facilityID)+":*")

	// Dispatch WhatsApp message separately (asynchronously)
	go func(fID int) {
		var pName, pPhone string
		_ = db.Pool.QueryRow(context.Background(), "SELECT name, phone FROM patients WHERE id = $1", patientID).Scan(&pName, &pPhone)
		if pPhone == "" {
			return
		}

		var clinicName string
		_ = db.Pool.QueryRow(context.Background(), "SELECT clinic_name FROM users WHERE id = $1", doctorID).Scan(&clinicName)
		if clinicName == "" {
			clinicName = "Clinically"
		}

		appURL := os.Getenv("WEBAUTHN_RP_ORIGIN")
		if appURL == "" {
			appURL = "http://localhost:3000"
		}
		billLink := fmt.Sprintf("%s/dashboard?view=bill&id=%d", appURL, billID)

		itemsStr := ""
		for idx, it := range invoiceItems {
			itemsStr += fmt.Sprintf("%d. %s (Qty: %d) - ₹%.2f/unit\n", idx+1, it.Name, it.Quantity, it.UnitPrice)
		}

		messageText := fmt.Sprintf(
			"Dear %s,\n\nYour pharmacy bill for prescription #%d has been generated at *%s*.\n\n*Medicines Dispensed:*\n%s\nTotal Amount: *₹%.2f*\nAmount Paid: ₹%.2f\nRemaining Balance: *₹%.2f*\n\nView invoice & download receipt here:\n%s",
			pName,
			input.PrescriptionID,
			clinicName,
			itemsStr,
			grandTotal,
			input.AmountPaid,
			remainingAmount,
			billLink,
		)

		errSend := services.SendWhatsApp(fID, pPhone, messageText)
		if errSend != nil {
			log.Printf("WhatsApp pharmacy bill dispatch failed for Patient %s (%s): %v", pName, pPhone, errSend)
		}
	}(facilityID)

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"dispensing_id": dispensingID,
		"bill_id":       billID,
		"status":        newRxStatus,
		"message":       "Prescription dispensed and billing invoice generated successfully",
	})
}

// GetDispensingRecord returns details of a single completed dispensing record and items.
func GetDispensingRecord(w http.ResponseWriter, r *http.Request) {
	dispIDStr := r.URL.Query().Get("id")
	dispID, err := strconv.Atoi(dispIDStr)
	if err != nil || dispID <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid dispensing ID"})
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

	var dr DispensingRecord
	drQuery := `
		SELECT dr.id, dr.facility_id, dr.prescription_id, dr.patient_id, p.name as patient_name, 
		       dr.dispensed_by, u.name as dispenser_name, dr.bill_id, dr.status, dr.created_at
		FROM dispensing_records dr
		JOIN patients p ON dr.patient_id = p.id
		JOIN users u ON dr.dispensed_by = u.id
		WHERE dr.id = $1 AND dr.facility_id = $2
	`
	err = db.Pool.QueryRow(r.Context(), drQuery, dispID, facilityID).Scan(
		&dr.ID, &dr.FacilityID, &dr.PrescriptionID, &dr.PatientID, &dr.PatientName, &dr.DispensedBy, &dr.DispenserName, &dr.BillID, &dr.Status, &dr.CreatedAt,
	)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Dispensing record not found"})
		return
	}

	// Fetch items
	itemsQuery := `
		SELECT di.id, di.dispensing_id, di.prescription_item_id, pi.medicine_name, di.medicine_id, di.tablets_given, di.cost_per_tablet, di.line_total, di.is_nil, di.nil_reason
		FROM dispensing_items di
		JOIN prescription_items pi ON di.prescription_item_id = pi.id
		WHERE di.dispensing_id = $1
		ORDER BY di.id ASC
	`
	rows, err := db.Pool.Query(r.Context(), itemsQuery, dispID)
	if err != nil {
		log.Printf("GetDispensingRecord items query error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to load dispensing line items"})
		return
	}
	defer rows.Close()

	type DispItem struct {
		ID                 int     `json:"id"`
		DispensingID       int     `json:"dispensing_id"`
		PrescriptionItemID int     `json:"prescription_item_id"`
		MedicineName       string  `json:"medicine_name"`
		MedicineID         *int    `json:"medicine_id"`
		TabletsGiven       int     `json:"tablets_given"`
		CostPerTablet      float64 `json:"cost_per_tablet"`
		LineTotal          float64 `json:"line_total"`
		IsNIL              bool    `json:"is_nil"`
		NILReason          string  `json:"nil_reason"`
	}

	items := []DispItem{}
	for rows.Next() {
		var it DispItem
		err := rows.Scan(&it.ID, &it.DispensingID, &it.PrescriptionItemID, &it.MedicineName, &it.MedicineID, &it.TabletsGiven, &it.CostPerTablet, &it.LineTotal, &it.IsNIL, &it.NILReason)
		if err != nil {
			log.Printf("GetDispensingRecord item scan error: %v", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to read database records"})
			return
		}
		items = append(items, it)
	}

	// Map items back
	dr.Items = make([]struct {
		ID                 int     `json:"id"`
		DispensingID       int     `json:"dispensing_id"`
		PrescriptionItemID int     `json:"prescription_item_id"`
		MedicineName       string  `json:"medicine_name"`
		MedicineID         *int    `json:"medicine_id"`
		TabletsGiven       int     `json:"tablets_given"`
		CostPerTablet      float64 `json:"cost_per_tablet"`
		LineTotal          float64 `json:"line_total"`
		IsNIL              bool    `json:"is_nil"`
		NILReason          string  `json:"nil_reason"`
	}, len(items))

	for idx, val := range items {
		dr.Items[idx] = struct {
			ID                 int     `json:"id"`
			DispensingID       int     `json:"dispensing_id"`
			PrescriptionItemID int     `json:"prescription_item_id"`
			MedicineName       string  `json:"medicine_name"`
			MedicineID         *int    `json:"medicine_id"`
			TabletsGiven       int     `json:"tablets_given"`
			CostPerTablet      float64 `json:"cost_per_tablet"`
			LineTotal          float64 `json:"line_total"`
			IsNIL              bool    `json:"is_nil"`
			NILReason          string  `json:"nil_reason"`
		}{
			ID:                 val.ID,
			DispensingID:       val.DispensingID,
			PrescriptionItemID: val.PrescriptionItemID,
			MedicineName:       val.MedicineName,
			MedicineID:         val.MedicineID,
			TabletsGiven:       val.TabletsGiven,
			CostPerTablet:      val.CostPerTablet,
			LineTotal:          val.LineTotal,
			IsNIL:              val.IsNIL,
			NILReason:          val.NILReason,
		}
	}

	writeJSON(w, http.StatusOK, dr)
}
