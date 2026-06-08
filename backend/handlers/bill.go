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

	ctx := r.Context()

	// Verify patient and fetch details
	var pt struct {
		Name  string
		Phone string
	}
	err = db.Pool.QueryRow(ctx, "SELECT name, phone FROM patients WHERE id = $1 AND doctor_id = $2", patientID, doctorID).Scan(&pt.Name, &pt.Phone)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Patient not found"})
		return
	}

	// Fetch doctor/clinic details
	var doc struct {
		ClinicName string
	}
	err = db.Pool.QueryRow(ctx, "SELECT clinic_name FROM doctors WHERE id = $1", doctorID).Scan(&doc.ClinicName)
	if err != nil {
		log.Printf("CreateBill clinic fetch error: %v", err)
		doc.ClinicName = "Our Clinic"
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
			log.Printf("CreateBill upload error: %v", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to upload receipt"})
			return
		}
		invoiceURL = &url
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
		INSERT INTO bills (patient_id, doctor_id, description, total_amount, remaining_amount, status, promised_due_date, invoice_url, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		RETURNING id
	`
	var billID int
	err = tx.QueryRow(ctx, queryBill, patientID, doctorID, description, calculatedTotal, remainingAmount, billStatus, promisedDueDate, invoiceURL, createdAt).Scan(&billID)
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

	// Dispatch WhatsApp Message (Asynchronously to avoid blocking client response)
	go func() {
		// Fetch doctor custom template or default
		tmpl := GetTemplateForDoctor(context.Background(), doctorID, "bill_notification")

		// Build payment details string
		paymentDetails := ""
		if amountPaid > 0 {
			paymentDetails = fmt.Sprintf("Amount Paid: ₹%.2f (%s)\n", amountPaid, paymentMode)
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

		// Send WhatsApp
		err := services.SendWhatsApp(pt.Phone, messageText)
		if err != nil {
			log.Printf("WhatsApp billing dispatch failed for Patient %s (%s): %v", pt.Name, pt.Phone, err)
		} else {
			// Update notified status
			_, _ = db.Pool.Exec(context.Background(), "UPDATE bills SET notified = TRUE WHERE id = $1", billID)
		}
	}()

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
	var b Bill
	queryBill := `
		SELECT b.id, b.patient_id, p.name as patient_name, p.phone as patient_phone, 
		       b.doctor_id, d.clinic_name, b.description, b.total_amount, 
		       b.remaining_amount, b.status, b.promised_due_date, b.invoice_url, b.created_at, b.notified
		FROM bills b
		JOIN patients p ON b.patient_id = p.id
		LEFT JOIN doctors d ON b.doctor_id = d.id
		WHERE b.id = $1 AND p.doctor_id = $2
	`
	err = db.Pool.QueryRow(ctx, queryBill, id, doctorID).Scan(
		&b.ID, &b.PatientID, &b.PatientName, &b.PatientPhone, &b.DoctorID, &b.ClinicName,
		&b.Description, &b.TotalAmount, &b.RemainingAmount, &b.Status, &b.PromisedDueDate, &b.InvoiceURL, &b.CreatedAt, &b.Notified,
	)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Bill not found"})
		return
	}

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
	countQuery := `
		SELECT COUNT(*)
		FROM bills b
		JOIN patients p ON b.patient_id = p.id
		WHERE p.doctor_id = $1
		  AND ($2 = '' OR p.name ILIKE '%' || $2 || '%')
	`
	var totalCount int
	err := db.Pool.QueryRow(r.Context(), countQuery, doctorID, search).Scan(&totalCount)
	if err != nil {
		log.Printf("ListBills count error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "An internal error occurred"})
		return
	}

	// Fetch page of bills
	query := `
		SELECT b.id, b.patient_id, p.name as patient_name, p.phone as patient_phone,
		       b.doctor_id, COALESCE(d.clinic_name, '') as clinic_name, b.description, b.total_amount,
		       b.remaining_amount, b.status, b.promised_due_date, b.invoice_url, b.created_at, b.notified
		FROM bills b
		JOIN patients p ON b.patient_id = p.id
		LEFT JOIN doctors d ON b.doctor_id = d.id
		WHERE p.doctor_id = $1
		  AND ($2 = '' OR p.name ILIKE '%' || $2 || '%')
		ORDER BY b.created_at DESC
		LIMIT $3 OFFSET $4
	`
	rows, err := db.Pool.Query(r.Context(), query, doctorID, search, limit, offset)
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
