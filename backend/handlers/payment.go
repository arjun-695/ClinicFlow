// Package handlers serves contract detail and payment logging endpoints,
// including transactional updates to remaining balances and payment history.
package handlers

import (
	"encoding/json"
	"fmt"
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

type PaymentInput struct {
	BillID      int     `json:"contract_id"` // Backwards compatibility for frontend
	AmountPaid  float64 `json:"amount_paid"`
	PaymentMode string  `json:"payment_mode"` // CASH, ONLINE_UPI, BANK_TRANSFER
	Remarks     string  `json:"remarks"`
	PaymentDate string  `json:"payment_date"` // Custom overridable datetime
}

type PaymentRecord struct {
	ID          int       `json:"id"`
	ContractID  int       `json:"contract_id"` // Backwards compatibility for frontend
	AmountPaid  float64   `json:"amount_paid"`
	PaymentMode string    `json:"payment_mode"`
	Remarks     string    `json:"remarks"`
	PaymentDate time.Time `json:"payment_date"`
}

type Contract struct {
	ID              int        `json:"id"`
	CustomerID      int        `json:"customer_id"`
	Description     string     `json:"description"`
	TotalAmount     float64    `json:"total_amount"`
	RemainingAmount float64    `json:"remaining_amount"`
	Status          string     `json:"status"`
	PromisedDueDate *time.Time `json:"promised_due_date"`
	InvoiceURL      *string    `json:"invoice_url"`
	CreatedAt       time.Time  `json:"created_at"`
	Notified        bool       `json:"notified"`
}

// GetContractDetails returns bill details with its payment installment timeline (mapped to "ContractDetails" for compatibility)
func GetContractDetails(w http.ResponseWriter, r *http.Request) {
	idStr := r.URL.Query().Get("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid bill ID"})
		return
	}

	shopkeeperID, ok := r.Context().Value(ShopkeeperIDKey).(int)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	ctx := r.Context()

	// 1. Fetch Bill Details
	var cc Contract
	queryBill := `
		SELECT b.id, b.patient_id, b.description, b.total_amount, b.remaining_amount, b.status, b.promised_due_date, b.invoice_url, b.created_at, b.notified
		FROM bills b
		JOIN patients p ON b.patient_id = p.id
		WHERE b.id = $1 AND p.doctor_id = $2
	`
	err = db.Pool.QueryRow(ctx, queryBill, id, shopkeeperID).Scan(
		&cc.ID, &cc.CustomerID, &cc.Description, &cc.TotalAmount, &cc.RemainingAmount, &cc.Status, &cc.PromisedDueDate, &cc.InvoiceURL, &cc.CreatedAt, &cc.Notified,
	)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Bill not found"})
		return
	}

	// 2. Fetch Patient Details
	var cust struct {
		Name  string `json:"name"`
		Phone string `json:"phone"`
	}
	err = db.Pool.QueryRow(ctx, "SELECT name, phone FROM patients WHERE id = $1 AND doctor_id = $2", cc.CustomerID, shopkeeperID).Scan(&cust.Name, &cust.Phone)
	if err != nil {
		log.Printf("Failed to load patient for bill %d: %v", id, err)
	}

	// 3. Fetch Payments (Installment Timeline)
	queryPayments := `
		SELECT id, bill_id, amount_paid, payment_mode, remarks, payment_date
		FROM payments
		WHERE bill_id = $1
		ORDER BY payment_date DESC
	`
	rows, err := db.Pool.Query(ctx, queryPayments, id)
	if err != nil {
		log.Printf("GetContractDetails payments query error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "An internal error occurred"})
		return
	}
	defer rows.Close()

	payments := []PaymentRecord{}
	for rows.Next() {
		var p PaymentRecord
		err := rows.Scan(&p.ID, &p.ContractID, &p.AmountPaid, &p.PaymentMode, &p.Remarks, &p.PaymentDate)
		if err != nil {
			log.Printf("GetContractDetails payment scan error: %v", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "An internal error occurred"})
			return
		}
		payments = append(payments, p)
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"contract": cc,   // Keep key for compatibility
		"customer": cust, // Keep key for compatibility
		"payments": payments,
	})
}

// LogPayment executes ACID-compliant database transaction for recording partial/full payments
func LogPayment(w http.ResponseWriter, r *http.Request) {
	var input PaymentInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
		return
	}

	if input.BillID <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Valid bill ID is required"})
		return
	}

	if input.AmountPaid <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Payment amount must be greater than zero"})
		return
	}

	if len(input.Remarks) > 500 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Remarks must be 500 characters or fewer"})
		return
	}

	paymentDate := time.Now()
	if input.PaymentDate != "" {
		if t, err := time.Parse(time.RFC3339, input.PaymentDate); err == nil {
			paymentDate = t
		} else if t, err = time.Parse("2006-01-02T15:04", input.PaymentDate); err == nil {
			paymentDate = t
		}
	}

	if input.PaymentMode != "CASH" && input.PaymentMode != "ONLINE_UPI" && input.PaymentMode != "BANK_TRANSFER" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Payment mode must be 'CASH', 'ONLINE_UPI', or 'BANK_TRANSFER'"})
		return
	}

	shopkeeperID, ok := r.Context().Value(ShopkeeperIDKey).(int)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	ctx := r.Context()

	// 1. Begin Database Transaction
	tx, err := db.Pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		log.Printf("LogPayment begin transaction error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "An internal error occurred"})
		return
	}
	defer tx.Rollback(ctx)

	// 2. Select bill state and LOCK row for update (ACID compliance)
	var cc struct {
		ID              int
		PatientID       int
		RemainingAmount float64
		TotalAmount     float64
		Status          string
		Description     string
		PatientName     string
		PatientPhone    string
		ClinicName      string
	}
	querySelect := `
		SELECT b.id, b.patient_id, b.remaining_amount, b.total_amount, b.status,
		       b.description, p.name, p.phone, COALESCE(d.clinic_name, 'Our Clinic')
		FROM bills b
		JOIN patients p ON b.patient_id = p.id
		LEFT JOIN doctors d ON b.doctor_id = d.id
		WHERE b.id = $1 AND p.doctor_id = $2 
		FOR UPDATE OF b
	`
	err = tx.QueryRow(ctx, querySelect, input.BillID, shopkeeperID).Scan(
		&cc.ID,
		&cc.PatientID,
		&cc.RemainingAmount,
		&cc.TotalAmount,
		&cc.Status,
		&cc.Description,
		&cc.PatientName,
		&cc.PatientPhone,
		&cc.ClinicName,
	)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Bill not found"})
		return
	}

	// 3. Prevent payments if bill is already settled
	if cc.RemainingAmount == 0 || cc.Status == "SETTLED" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Bill is already fully settled"})
		return
	}

	// 4. Calculate new remaining amount and check constraints
	newRemaining := math.Round((cc.RemainingAmount-input.AmountPaid)*100) / 100
	if newRemaining < 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{
			"error": fmt.Sprintf("Payment amount (₹%.2f) exceeds outstanding remaining balance (₹%.2f)", input.AmountPaid, cc.RemainingAmount),
		})
		return
	}

	// 5. Determine updated status
	var newStatus string
	if newRemaining == 0 {
		newStatus = "SETTLED"
	} else {
		newStatus = "PARTIALLY_PAID"
	}

	// 6. Insert installment timeline record
	queryInsertPayment := `
		INSERT INTO payments (bill_id, amount_paid, payment_mode, remarks, payment_date)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id
	`
	var paymentID int
	err = tx.QueryRow(ctx, queryInsertPayment, input.BillID, input.AmountPaid, input.PaymentMode, input.Remarks, paymentDate).Scan(&paymentID)
	if err != nil {
		log.Printf("LogPayment insert error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "An internal error occurred"})
		return
	}

	// 7. Update bill remaining amount and status
	queryUpdateBill := `
		UPDATE bills 
		SET remaining_amount = $1, status = $2
		WHERE id = $3
	`
	_, err = tx.Exec(ctx, queryUpdateBill, newRemaining, newStatus, input.BillID)
	if err != nil {
		log.Printf("LogPayment update bill error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "An internal error occurred"})
		return
	}

	// 8. Commit Transaction (ACID complete)
	err = tx.Commit(ctx)
	if err != nil {
		log.Printf("LogPayment commit error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "An internal error occurred"})
		return
	}

	// Invalidate caches
	db.InvalidateCache(ctx, "patient:detail:"+strconv.Itoa(shopkeeperID)+":"+strconv.Itoa(cc.PatientID))
	db.InvalidateCache(ctx, "patients:list:"+strconv.Itoa(shopkeeperID)+":*")

	go func() {
		appURL := os.Getenv("WEBAUTHN_RP_ORIGIN")
		if appURL == "" {
			appURL = "http://localhost:3000"
		}
		billLink := fmt.Sprintf("%s/dashboard?view=bill&id=%d", appURL, input.BillID)

		remarks := strings.TrimSpace(input.Remarks)
		if remarks == "" {
			remarks = "Installment payment"
		}

		messageText := fmt.Sprintf(
			"Dear %s,\n\nWe received your installment payment of *₹%.2f* via *%s* for invoice #INV-%d at *%s*.\n\nPrevious Balance: ₹%.2f\nRemaining Balance: *₹%.2f*\nStatus: %s\nNotes: %s\n\nView your receipt here:\n%s",
			cc.PatientName,
			input.AmountPaid,
			input.PaymentMode,
			input.BillID,
			cc.ClinicName,
			cc.RemainingAmount,
			newRemaining,
			newStatus,
			remarks,
			billLink,
		)

		if err := services.SendWhatsApp(cc.PatientPhone, messageText); err != nil {
			log.Printf("WhatsApp installment dispatch failed for Patient %s (%s): %v", cc.PatientName, cc.PatientPhone, err)
		}
	}()

	// Return response payload
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"payment_id":       paymentID,
		"contract_id":      input.BillID,
		"amount_paid":      input.AmountPaid,
		"remaining_amount": newRemaining,
		"status":           newStatus,
		"payment_date":     paymentDate,
	})
}
