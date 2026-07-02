package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"backend/db"
	"backend/services"

	"github.com/jackc/pgx/v5"
)

type BillItem struct {
	ID        int     `json:"id"`
	BillID    int     `json:"bill_id"`
	ItemName  string  `json:"item_name"`
	Quantity  int     `json:"quantity"`
	UnitPrice float64 `json:"unit_price"`
	Dosage    string  `json:"dosage"`
}

type Bill struct {
	ID              int        `json:"id"`
	PatientID       int        `json:"patient_id"`
	PatientName     string     `json:"patient_name"`
	PatientPhone    string     `json:"patient_phone"`
	PatientGender   string     `json:"patient_gender,omitempty"`
	PatientAge      int        `json:"patient_age,omitempty"`
	Weight          string     `json:"weight,omitempty"`
	BP              string     `json:"bp,omitempty"`
	Pulse           string     `json:"pulse,omitempty"`
	Temp            string     `json:"temp,omitempty"`
	DoctorID        int        `json:"doctor_id"`
	ClinicName      string     `json:"clinic_name"`
	Description     string     `json:"description"`
	TotalAmount     float64    `json:"total_amount"`
	RemainingAmount float64    `json:"remaining_amount"`
	Status          string     `json:"status"`
	PromisedDueDate *time.Time `json:"promised_due_date"`
	InvoiceURL      *string    `json:"invoice_url"`
	CreatedAt       time.Time  `json:"created_at"`
	Notified        bool       `json:"notified"`
	FacilityID      *int       `json:"facility_id,omitempty"`
}

type BillDetail struct {
	Bill     Bill            `json:"bill"`
	Items    []BillItem      `json:"items"`
	Payments []PaymentRecord `json:"payments"`
}

// CreateBill generates a new bill and registers its item lines, logging payments and sending to WhatsApp.
func CreateBill(w http.ResponseWriter, r *http.Request) {
	// Support multipart form up to 10MB to handle receipt upload
	err := r.ParseMultipartForm(10 << 20)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Failed to parse form data"})
		return
	}

	patientIDStr := r.FormValue("patient_id")
	description := r.FormValue("description")
	promisedDueDateStr := r.FormValue("promised_due_date")
	createdAtStr := r.FormValue("created_at")
	itemsJSON := r.FormValue("items") // Array of bill items as JSON string
	amountPaidStr := r.FormValue("amount_paid")
	paymentMode := r.FormValue("payment_mode") // CASH, ONLINE_UPI, BANK_TRANSFER
	paymentRemarks := r.FormValue("payment_remarks")

	patientID, err := strconv.Atoi(patientIDStr)
	if err != nil || patientID <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Valid patient_id is required"})
		return
	}

	var items []struct {
		ItemName  string  `json:"item_name"`
		Quantity  int     `json:"quantity"`
		UnitPrice float64 `json:"unit_price"`
		Dosage    string  `json:"dosage"`
	}
	if itemsJSON != "" {
		if err := json.Unmarshal([]byte(itemsJSON), &items); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid items format. Must be JSON array."})
			return
		}
	}

	if len(items) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "At least one item is required in the bill"})
		return
	}

	// Calculate total amount from items
	var calculatedTotal float64
	for _, item := range items {
		if item.ItemName == "" || item.Quantity <= 0 || item.UnitPrice < 0 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid item properties. Item name, quantity > 0, and unit price >= 0 are required."})
			return
		}
		calculatedTotal += float64(item.Quantity) * item.UnitPrice
	}
	calculatedTotal = math.Round(calculatedTotal*100) / 100

	// Handle upfront payment
	var amountPaid float64
	if amountPaidStr != "" {
		amountPaid, err = strconv.ParseFloat(amountPaidStr, 64)
		if err != nil || amountPaid < 0 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid paid amount"})
			return
		}
	}

	if amountPaid > calculatedTotal {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Paid amount cannot exceed total bill amount"})
		return
	}

	var promisedDueDate *time.Time
	if promisedDueDateStr != "" {
		parsedDate, err := time.Parse("2006-01-02", promisedDueDateStr)
		if err == nil {
			promisedDueDate = &parsedDate
		}
	}

	createdAt := time.Now()
	if createdAtStr != "" {
		if parsedTime, err := time.Parse(time.RFC3339, createdAtStr); err == nil {
			createdAt = parsedTime
		} else if parsedTime, err = time.Parse("2006-01-02T15:04", createdAtStr); err == nil {
			createdAt = parsedTime
		}
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

	ctx := r.Context()

	// Verify patient and fetch details
	var pt struct {
		Name  string
		Phone string
	}
	err = db.Pool.QueryRow(ctx, "SELECT name, phone FROM patients WHERE id = $1 AND doctor_id = $2 AND facility_id = $3", patientID, doctorID, facilityID).Scan(&pt.Name, &pt.Phone)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Patient not found"})
		return
	}

	// Fetch doctor/clinic details
	var doc struct {
		ClinicName string
		Location   string
	}
	var locationVal *string
	err = db.Pool.QueryRow(ctx, "SELECT clinic_name, location FROM users WHERE id = $1", doctorID).Scan(&doc.ClinicName, &locationVal)
	if err != nil {
		log.Printf("CreateBill clinic fetch error: %v", err)
		doc.ClinicName = "Our Clinic"
	} else if locationVal != nil {
		doc.Location = *locationVal
	}

	// Process receipt file attachment if present
	var invoiceURL *string

	file, fileHeader, err := r.FormFile("invoice")
	if err == nil {
		defer file.Close()

		if fileHeader.Size > 5*1024*1024 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "File size must be under 5MB"})
			return
		}

		fileBytes, err := io.ReadAll(file)
		if err != nil {
			log.Printf("CreateBill file read error: %v", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to read uploaded file"})
			return
		}

		detectedMIME := http.DetectContentType(fileBytes)
		if detectedMIME != "image/png" && detectedMIME != "image/jpeg" && detectedMIME != "application/pdf" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Only PNG, JPEG, and PDF files are allowed"})
			return
		}

		url, err := services.UploadReceipt(fileBytes, fileHeader.Filename, detectedMIME)
		if err != nil {
			log.Printf("CreateBill upload warning (proceeding without Supabase URL): %v", err)
		} else {
			invoiceURL = &url
		}

	}

	// Begin ACID Database Transaction
	tx, err := db.Pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		log.Printf("CreateBill begin transaction error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "An internal error occurred"})
		return
	}
	defer tx.Rollback(ctx)

	// Determine status and remaining balance
	remainingAmount := calculatedTotal - amountPaid
	var billStatus string
	if remainingAmount == 0 {
		billStatus = "SETTLED"
	} else if amountPaid > 0 {
		billStatus = "PARTIALLY_PAID"
	} else {
		billStatus = "PENDING"
	}

	// Insert bill record
	queryBill := `
		INSERT INTO bills (patient_id, doctor_id, description, total_amount, remaining_amount, status, promised_due_date, invoice_url, created_at, facility_id)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		RETURNING id
	`
	var billID int
	err = tx.QueryRow(ctx, queryBill, patientID, doctorID, description, calculatedTotal, remainingAmount, billStatus, promisedDueDate, invoiceURL, createdAt, facilityID).Scan(&billID)
	if err != nil {
		log.Printf("CreateBill insert bill error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "An internal error occurred"})
		return
	}

	// Insert bill items
	queryItem := `
		INSERT INTO bill_items (bill_id, item_name, quantity, unit_price, dosage)
		VALUES ($1, $2, $3, $4, $5)
	`
	for _, item := range items {
		_, err = tx.Exec(ctx, queryItem, billID, item.ItemName, item.Quantity, item.UnitPrice, item.Dosage)
		if err != nil {
			log.Printf("CreateBill insert item error: %v", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "An internal error occurred"})
			return
		}

		// Update stock in medicines catalog if item matches a medicine name
		updateStockQuery := `
			UPDATE medicines 
			SET stock = GREATEST(0, stock - $1)
			WHERE name = $2 AND doctor_id = $3
		`
		_, _ = tx.Exec(ctx, updateStockQuery, item.Quantity, item.ItemName, doctorID)
	}

	// Log upfront payment record if amountPaid > 0
	var paymentID int
	if amountPaid > 0 {
		if paymentMode == "" {
			paymentMode = "CASH"
		}
		if paymentRemarks == "" {
			paymentRemarks = "Upfront payment during billing"
		}
		queryPayment := `
			INSERT INTO payments (bill_id, amount_paid, payment_mode, remarks, payment_date)
			VALUES ($1, $2, $3, $4, $5)
			RETURNING id
		`
		err = tx.QueryRow(ctx, queryPayment, billID, amountPaid, paymentMode, paymentRemarks, createdAt).Scan(&paymentID)
		if err != nil {
			log.Printf("CreateBill insert payment error: %v", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "An internal error occurred"})
			return
		}
	}

	// Commit Transaction
	err = tx.Commit(ctx)
	if err != nil {
		log.Printf("CreateBill commit error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "An internal error occurred"})
		return
	}

	// Invalidate caches
	db.InvalidateCache(ctx, "patient:detail:"+strconv.Itoa(doctorID)+":"+strconv.Itoa(patientID))
	db.InvalidateCache(ctx, "patients:list:"+strconv.Itoa(doctorID)+":*")

	// Dispatch WhatsApp Message (Asynchronously to avoid blocking client response)
	skipWhatsApp := r.FormValue("skip_whatsapp") == "true"
	if !skipWhatsApp {
		go func(fID int) {
			// Fetch doctor custom template or default
			tmpl := GetTemplateForDoctor(context.Background(), doctorID, "bill_notification")

			// Determine currency symbol based on location
			currencySymbol := "$"
			loc := strings.ToLower(doc.Location)
			if strings.Contains(loc, "india") || strings.Contains(loc, "in") {
				currencySymbol = "₹"
			} else if strings.Contains(loc, "europe") || strings.Contains(loc, "eu") {
				currencySymbol = "€"
			} else if strings.Contains(loc, "uk") || strings.Contains(loc, "gbp") {
				currencySymbol = "£"
			}

			// Build payment details string
			paymentDetails := ""
			if amountPaid > 0 {
				paymentDetails = fmt.Sprintf("Amount Paid: %s%.2f (%s)\n", currencySymbol, amountPaid, paymentMode)
			}

			// Build items list
			itemsList := ""
			if len(items) > 0 {
				for i, item := range items {
					dosageStr := ""
					if item.Dosage != "" {
						dosageStr = fmt.Sprintf(" [%s]", item.Dosage)
					}
					itemsList += fmt.Sprintf("%d. %s (Qty: %d) - %s%.2f/unit%s\n", i+1, item.ItemName, item.Quantity, currencySymbol, item.UnitPrice, dosageStr)
				}
			}

			appURL := os.Getenv("WEBAUTHN_RP_ORIGIN")
			if appURL == "" {
				appURL = "http://localhost:3000"
			}
			billLink := fmt.Sprintf("%s/dashboard?view=bill&id=%d", appURL, billID)

			// Combine template sections
			msgTemplate := tmpl.Greeting + "\n\n" + tmpl.Body + "\n\n" + tmpl.Footer

			// Replace placeholders
			replacer := strings.NewReplacer(
				"{patient_name}", pt.Name,
				"{total_amount}", fmt.Sprintf("%.2f", calculatedTotal),
				"{clinic_name}", doc.ClinicName,
				"{payment_details}", paymentDetails,
				"{remaining_amount}", fmt.Sprintf("%.2f", remainingAmount),
				"{items_list}", itemsList,
				"{bill_link}", billLink,
				"{description}", description,
			)
			messageText := replacer.Replace(msgTemplate)

			// Send WhatsApp via Twilio
			var billURL string
			if invoiceURL != nil {
				billURL = *invoiceURL
			}

			err := services.SendTwilioWhatsApp(fID, pt.Phone, messageText, billURL)
			if err != nil {
				log.Printf("Twilio WhatsApp billing dispatch failed for Patient %s (%s): %v", pt.Name, pt.Phone, err)
			} else {
				// Update notified status
				_, _ = db.Pool.Exec(context.Background(), "UPDATE bills SET notified = TRUE WHERE id = $1", billID)
			}
		}(facilityID)
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"bill_id":          billID,
		"total_amount":     calculatedTotal,
		"remaining_amount": remainingAmount,
		"status":           billStatus,
		"invoice_url":      invoiceURL,
		"created_at":       createdAt,
	})
}

// GetBillDetails returns a bill, its items, and its payment history
func GetBillDetails(w http.ResponseWriter, r *http.Request) {
	idStr := r.URL.Query().Get("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid bill ID"})
		return
	}

	doctorID, ok := r.Context().Value(ShopkeeperIDKey).(int)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	ctx := r.Context()

	// Load Bill
	var role, phone string
	err = db.Pool.QueryRow(ctx, "SELECT role, phone FROM users WHERE id = $1", doctorID).Scan(&role, &phone)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	facilityID, err := GetActiveFacilityID(r, doctorID)
	if err != nil && role != "USER" {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to get active facility"})
		return
	}

	var b Bill
	var queryBill string
	if role == "USER" {
		queryBill = `
			SELECT b.id, b.patient_id, p.name as patient_name, p.phone as patient_phone, 
			       COALESCE(p.gender, '') as patient_gender, COALESCE(p.age, 0) as patient_age,
			       b.doctor_id, COALESCE(d.clinic_name, '') as clinic_name, b.description, b.total_amount, 
			       b.remaining_amount, b.status, b.promised_due_date, b.invoice_url, b.created_at, b.notified
			FROM bills b
			JOIN patients p ON b.patient_id = p.id
			LEFT JOIN users d ON b.doctor_id = d.id
			WHERE b.id = $1 AND p.phone = $2
		`
		err = db.Pool.QueryRow(ctx, queryBill, id, phone).Scan(
			&b.ID, &b.PatientID, &b.PatientName, &b.PatientPhone, &b.PatientGender, &b.PatientAge, &b.DoctorID, &b.ClinicName,
			&b.Description, &b.TotalAmount, &b.RemainingAmount, &b.Status, &b.PromisedDueDate, &b.InvoiceURL, &b.CreatedAt, &b.Notified,
		)
	} else {
		queryBill = `
			SELECT b.id, b.patient_id, p.name as patient_name, p.phone as patient_phone, 
			       COALESCE(p.gender, '') as patient_gender, COALESCE(p.age, 0) as patient_age,
			       b.doctor_id, COALESCE(d.clinic_name, '') as clinic_name, b.description, b.total_amount, 
			       b.remaining_amount, b.status, b.promised_due_date, b.invoice_url, b.created_at, b.notified
			FROM bills b
			JOIN patients p ON b.patient_id = p.id
			LEFT JOIN users d ON b.doctor_id = d.id
			WHERE b.id = $1 AND p.facility_id = $2
		`
		err = db.Pool.QueryRow(ctx, queryBill, id, facilityID).Scan(
			&b.ID, &b.PatientID, &b.PatientName, &b.PatientPhone, &b.PatientGender, &b.PatientAge, &b.DoctorID, &b.ClinicName,
			&b.Description, &b.TotalAmount, &b.RemainingAmount, &b.Status, &b.PromisedDueDate, &b.InvoiceURL, &b.CreatedAt, &b.Notified,
		)
	}
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Bill not found"})
		return
	}

	// Fetch latest vitals for this patient if available
	vitalsQuery := `
		SELECT COALESCE(weight_kg::text, ''), COALESCE(blood_pressure, ''), COALESCE(pulse::text, ''), COALESCE(temperature::text, '')
		FROM vitals
		WHERE patient_id = $1
		ORDER BY recorded_at DESC
		LIMIT 1
	`
	var weight, bp, pulse, temp string
	_ = db.Pool.QueryRow(ctx, vitalsQuery, b.PatientID).Scan(&weight, &bp, &pulse, &temp)
	b.Weight = weight
	b.BP = bp
	b.Pulse = pulse
	b.Temp = temp

	// Load Bill Items
	queryItems := `
		SELECT id, bill_id, item_name, quantity, unit_price, dosage
		FROM bill_items
		WHERE bill_id = $1
		ORDER BY id ASC
	`
	rowsItems, err := db.Pool.Query(ctx, queryItems, id)
	if err != nil {
		log.Printf("GetBillDetails items query error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "An internal error occurred"})
		return
	}
	defer rowsItems.Close()

	items := []BillItem{}
	for rowsItems.Next() {
		var bi BillItem
		err := rowsItems.Scan(&bi.ID, &bi.BillID, &bi.ItemName, &bi.Quantity, &bi.UnitPrice, &bi.Dosage)
		if err != nil {
			log.Printf("GetBillDetails item scan error: %v", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "An internal error occurred"})
			return
		}
		items = append(items, bi)
	}

	// Load Payments
	queryPayments := `
		SELECT id, bill_id, amount_paid, payment_mode, remarks, payment_date
		FROM payments
		WHERE bill_id = $1
		ORDER BY payment_date DESC
	`
	rowsPayments, err := db.Pool.Query(ctx, queryPayments, id)
	if err != nil {
		log.Printf("GetBillDetails payments query error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "An internal error occurred"})
		return
	}
	defer rowsPayments.Close()

	payments := []PaymentRecord{}
	for rowsPayments.Next() {
		var pr PaymentRecord
		err := rowsPayments.Scan(&pr.ID, &pr.ContractID, &pr.AmountPaid, &pr.PaymentMode, &pr.Remarks, &pr.PaymentDate) // Keep ContractID key map
		if err != nil {
			log.Printf("GetBillDetails payment scan error: %v", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "An internal error occurred"})
			return
		}
		payments = append(payments, pr)
	}

	writeJSON(w, http.StatusOK, BillDetail{
		Bill:     b,
		Items:    items,
		Payments: payments,
	})
}

// ListBills handles fetching bills with patient names for the doctor
func ListBills(w http.ResponseWriter, r *http.Request) {
	doctorID, ok := r.Context().Value(ShopkeeperIDKey).(int)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	search := r.URL.Query().Get("search")

	offsetStr := r.URL.Query().Get("offset")
	offset := 0
	if offsetStr != "" {
		if val, err := strconv.Atoi(offsetStr); err == nil && val >= 0 {
			offset = val
		}
	}

	limitStr := r.URL.Query().Get("limit")
	limit := 20
	if limitStr != "" {
		if val, err := strconv.Atoi(limitStr); err == nil && val > 0 {
			limit = val
		}
	}
	if limit > 50 {
		limit = 50
	}

	// Get total count of bills matching criteria
	var role, phone string
	var err error
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

	var totalCount int
	var countQuery string
	if role == "USER" {
		countQuery = `
			SELECT COUNT(*)
			FROM bills b
			JOIN patients p ON b.patient_id = p.id
			WHERE p.phone = $1
		`
		err = db.Pool.QueryRow(r.Context(), countQuery, phone).Scan(&totalCount)
	} else {
		countQuery = `
			SELECT COUNT(*)
			FROM bills b
			JOIN patients p ON b.patient_id = p.id
			WHERE p.doctor_id = $1 AND b.facility_id = $3
			  AND ($2 = '' OR p.name ILIKE '%' || $2 || '%')
		`
		err = db.Pool.QueryRow(r.Context(), countQuery, doctorID, search, facilityID).Scan(&totalCount)
	}
	if err != nil {
		log.Printf("ListBills count error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "An internal error occurred"})
		return
	}

	// Fetch page of bills
	var query string
	var rows interface {
		Next() bool
		Scan(dest ...any) error
		Close()
	}
	if role == "USER" {
		query = `
			SELECT b.id, b.patient_id, p.name as patient_name, p.phone as patient_phone,
			       b.doctor_id, COALESCE(d.clinic_name, '') as clinic_name, b.description, b.total_amount,
			       b.remaining_amount, b.status, b.promised_due_date, b.invoice_url, b.created_at, b.notified
			FROM bills b
			JOIN patients p ON b.patient_id = p.id
			LEFT JOIN users d ON b.doctor_id = d.id
			WHERE p.phone = $1
			ORDER BY b.created_at DESC
			LIMIT $2 OFFSET $3
		`
		rows, err = db.Pool.Query(r.Context(), query, phone, limit, offset)
	} else {
		query = `
			SELECT b.id, b.patient_id, p.name as patient_name, p.phone as patient_phone,
			       b.doctor_id, COALESCE(d.clinic_name, '') as clinic_name, b.description, b.total_amount,
			       b.remaining_amount, b.status, b.promised_due_date, b.invoice_url, b.created_at, b.notified
			FROM bills b
			JOIN patients p ON b.patient_id = p.id
			LEFT JOIN users d ON b.doctor_id = d.id
			WHERE p.doctor_id = $1 AND b.facility_id = $5
			  AND ($2 = '' OR p.name ILIKE '%' || $2 || '%')
			ORDER BY b.created_at DESC
			LIMIT $3 OFFSET $4
		`
		rows, err = db.Pool.Query(r.Context(), query, doctorID, search, limit, offset, facilityID)
	}
	if err != nil {
		log.Printf("ListBills query error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "An internal error occurred"})
		return
	}
	defer rows.Close()

	bills := []Bill{}
	for rows.Next() {
		var b Bill
		err := rows.Scan(
			&b.ID, &b.PatientID, &b.PatientName, &b.PatientPhone,
			&b.DoctorID, &b.ClinicName, &b.Description, &b.TotalAmount,
			&b.RemainingAmount, &b.Status, &b.PromisedDueDate, &b.InvoiceURL,
			&b.CreatedAt, &b.Notified,
		)
		if err != nil {
			log.Printf("ListBills scan error: %v", err)
			continue
		}
		bills = append(bills, b)
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"bills":       bills,
		"total_count": totalCount,
		"offset":      offset,
		"limit":       limit,
	})
}

// UploadInvoice handles uploading a generated PDF invoice for an existing bill, uploading to Supabase, and dispatching it via WhatsApp.
func UploadInvoice(w http.ResponseWriter, r *http.Request) {
	err := r.ParseMultipartForm(10 << 20) // 10MB max
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Failed to parse form data"})
		return
	}

	billIDStr := r.FormValue("bill_id")
	billID, err := strconv.Atoi(billIDStr)
	if err != nil || billID <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Valid bill_id is required"})
		return
	}

	doctorID, ok := r.Context().Value(ShopkeeperIDKey).(int)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	ctx := r.Context()

	// Fetch bill and patient details to verify ownership and construct the message
	var b Bill
	queryBill := `
		SELECT b.id, b.patient_id, p.name as patient_name, p.phone as patient_phone, 
		       b.doctor_id, COALESCE(d.clinic_name, '') as clinic_name, b.description, b.total_amount, 
		       b.remaining_amount, b.status, b.promised_due_date, b.invoice_url, b.created_at, b.notified,
		       b.facility_id
		FROM bills b
		JOIN patients p ON b.patient_id = p.id
		LEFT JOIN users d ON b.doctor_id = d.id
		WHERE b.id = $1 AND p.doctor_id = $2
	`
	err = db.Pool.QueryRow(ctx, queryBill, billID, doctorID).Scan(
		&b.ID, &b.PatientID, &b.PatientName, &b.PatientPhone, &b.DoctorID, &b.ClinicName,
		&b.Description, &b.TotalAmount, &b.RemainingAmount, &b.Status, &b.PromisedDueDate, &b.InvoiceURL, &b.CreatedAt, &b.Notified,
		&b.FacilityID,
	)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Bill not found or unauthorized"})
		return
	}

	file, fileHeader, err := r.FormFile("invoice")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invoice file is required"})
		return
	}
	defer file.Close()

	if fileHeader.Size > 5*1024*1024 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "File size must be under 5MB"})
		return
	}

	fileBytes, err := io.ReadAll(file)
	if err != nil {
		log.Printf("UploadInvoice file read error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to read uploaded file"})
		return
	}

	detectedMIME := http.DetectContentType(fileBytes)
	if detectedMIME != "image/png" && detectedMIME != "image/jpeg" && detectedMIME != "application/pdf" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Only PNG, JPEG, and PDF files are allowed"})
		return
	}

	// Upload receipt file to Supabase and update database
	url, err := services.UploadReceipt(fileBytes, fileHeader.Filename, detectedMIME)
	if err != nil {
		log.Printf("UploadInvoice upload warning (proceeding without Supabase URL): %v", err)
	} else {
		_, err = db.Pool.Exec(ctx, "UPDATE bills SET invoice_url = $1 WHERE id = $2", url, billID)
		if err != nil {
			log.Printf("UploadInvoice database update error: %v", err)
		}
		b.InvoiceURL = &url
	}

	// Load bill items to construct the WhatsApp message
	queryItems := `
		SELECT id, bill_id, item_name, quantity, unit_price, dosage
		FROM bill_items
		WHERE bill_id = $1
		ORDER BY id ASC
	`
	rowsItems, err := db.Pool.Query(ctx, queryItems, billID)
	if err != nil {
		log.Printf("UploadInvoice items query error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "An internal error occurred"})
		return
	}
	defer rowsItems.Close()

	var items []struct {
		ItemName  string
		Quantity  int
		UnitPrice float64
		Dosage    string
	}
	for rowsItems.Next() {
		var item struct {
			ID        int
			BillID    int
			ItemName  string
			Quantity  int
			UnitPrice float64
			Dosage    string
		}
		err = rowsItems.Scan(&item.ID, &item.BillID, &item.ItemName, &item.Quantity, &item.UnitPrice, &item.Dosage)
		if err != nil {
			log.Printf("UploadInvoice item scan error: %v", err)
			continue
		}
		items = append(items, struct {
			ItemName  string
			Quantity  int
			UnitPrice float64
			Dosage    string
		}{
			ItemName:  item.ItemName,
			Quantity:  item.Quantity,
			UnitPrice: item.UnitPrice,
			Dosage:    item.Dosage,
		})
	}

	activeFacID, _ := GetActiveFacilityID(r, doctorID)

	// Dispatch WhatsApp Message (Asynchronously to avoid blocking client response)
	go func(fID int) {
		tmpl := GetTemplateForDoctor(context.Background(), doctorID, "bill_notification")

		// Fetch latest prescription amount paid for this patient
		var rxAmountPaid float64
		_ = db.Pool.QueryRow(context.Background(), `
			SELECT COALESCE(amount_paid, 0.0) 
			FROM prescriptions 
			WHERE patient_id = $1 
			ORDER BY created_at DESC LIMIT 1
		`, b.PatientID).Scan(&rxAmountPaid)

		// Build payment details string
		paymentDetails := ""
		totalPaid := b.TotalAmount - b.RemainingAmount
		if totalPaid > 0 {
			var payMode string
			_ = db.Pool.QueryRow(context.Background(), "SELECT payment_mode FROM payments WHERE bill_id = $1 ORDER BY payment_date DESC LIMIT 1", billID).Scan(&payMode)
			if payMode == "" {
				payMode = "CASH"
			}
			paymentDetails = fmt.Sprintf("Amount Paid: ₹%.2f (%s)\n", totalPaid, payMode)
		}
		if rxAmountPaid > 0 {
			paymentDetails += fmt.Sprintf("Prescription Upfront Paid: ₹%.2f\n", rxAmountPaid)
		}

		// Build items list
		itemsList := ""
		if len(items) > 0 {
			for i, item := range items {
				dosageStr := ""
				if item.Dosage != "" {
					dosageStr = fmt.Sprintf(" [%s]", item.Dosage)
				}
				itemsList += fmt.Sprintf("%d. %s (Qty: %d) - ₹%.2f/unit%s\n", i+1, item.ItemName, item.Quantity, item.UnitPrice, dosageStr)
			}
		}

		appURL := os.Getenv("WEBAUTHN_RP_ORIGIN")
		if appURL == "" {
			appURL = "http://localhost:3000"
		}
		billLink := fmt.Sprintf("%s/dashboard?view=bill&id=%d", appURL, billID)

		// Combine template sections
		msgTemplate := tmpl.Greeting + "\n\n" + tmpl.Body + "\n\n" + tmpl.Footer

		// Replace placeholders
		replacer := strings.NewReplacer(
			"{patient_name}", b.PatientName,
			"{total_amount}", fmt.Sprintf("%.2f", b.TotalAmount),
			"{clinic_name}", b.ClinicName,
			"{payment_details}", paymentDetails,
			"{remaining_amount}", fmt.Sprintf("%.2f", b.RemainingAmount),
			"{items_list}", itemsList,
			"{bill_link}", billLink,
			"{description}", b.Description,
		)
		messageText := replacer.Replace(msgTemplate)

		facID := fID
		if b.FacilityID != nil {
			facID = *b.FacilityID
		}

		// Send WhatsApp with attachment
		err = services.SendWhatsAppWithAttachment(facID, b.PatientPhone, messageText, fileBytes, fileHeader.Filename, detectedMIME)
		if err != nil {
			log.Printf("WhatsApp billing dispatch failed (UploadInvoice) for Patient %s (%s): %v", b.PatientName, b.PatientPhone, err)
		} else {
			_, _ = db.Pool.Exec(context.Background(), "UPDATE bills SET notified = TRUE WHERE id = $1", billID)
		}
	}(activeFacID)

	// Invalidate caches
	db.InvalidateCache(ctx, "patient:detail:"+strconv.Itoa(doctorID)+":"+strconv.Itoa(b.PatientID))
	db.InvalidateCache(ctx, "patients:list:"+strconv.Itoa(doctorID)+":*")

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"success":     true,
		"bill_id":     billID,
		"invoice_url": b.InvoiceURL,
	})
}

