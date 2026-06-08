// Package handlers exposes expense tracking endpoints for creating and listing
// shopkeeper expenses with date and payment-mode validation.
package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"time"

	"backend/db"
)

type Expense struct {
	ID          int       `json:"id"`
	Description string    `json:"description"`
	Amount      float64   `json:"amount"`
	PaymentMode string    `json:"payment_mode"` // CASH, ONLINE_UPI, BANK_TRANSFER
	ExpenseDate time.Time `json:"expense_date"`
	CreatedAt   time.Time `json:"created_at"`
}

func CreateExpense(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Description string  `json:"description"`
		Amount      float64 `json:"amount"`
		PaymentMode string  `json:"payment_mode"` // CASH, ONLINE_UPI, BANK_TRANSFER
		ExpenseDate string  `json:"expense_date"` // Custom overridable datetime
	}

	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
		return
	}

	if input.Description == "" || input.Amount <= 0 || input.PaymentMode == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "description, positive amount, and payment_mode are required"})
		return
	}

	if len(input.Description) > 500 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Description must be 500 characters or fewer"})
		return
	}

	// Validate payment mode enum
	if input.PaymentMode != "CASH" && input.PaymentMode != "ONLINE_UPI" && input.PaymentMode != "BANK_TRANSFER" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "payment_mode must be 'CASH', 'ONLINE_UPI', or 'BANK_TRANSFER'"})
		return
	}

	expenseDate := time.Now()
	if input.ExpenseDate != "" {
		if t, err := time.Parse(time.RFC3339, input.ExpenseDate); err == nil {
			expenseDate = t
		} else if t, err = time.Parse("2006-01-02T15:04", input.ExpenseDate); err == nil {
			expenseDate = t
		}
	}

	shopkeeperID, ok := r.Context().Value(ShopkeeperIDKey).(int)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	query := `
		INSERT INTO expenses (shopkeeper_id, description, amount, payment_mode, expense_date)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, created_at
	`
	var id int
	var createdAt time.Time
	err := db.Pool.QueryRow(r.Context(), query, shopkeeperID, input.Description, input.Amount, input.PaymentMode, expenseDate).Scan(&id, &createdAt)
	if err != nil {
		log.Printf("CreateExpense DB error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "An internal error occurred"})
		return
	}

	writeJSON(w, http.StatusOK, Expense{
		ID:          id,
		Description: input.Description,
		Amount:      input.Amount,
		PaymentMode: input.PaymentMode,
		ExpenseDate: expenseDate,
		CreatedAt:   createdAt,
	})
}

// ListExpenses lists all expenses for the logged-in doctor (paginated)
func ListExpenses(w http.ResponseWriter, r *http.Request) {
	shopkeeperID, ok := r.Context().Value(ShopkeeperIDKey).(int)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	limitStr := r.URL.Query().Get("limit")
	offsetStr := r.URL.Query().Get("offset")
	
	limit := 50
	if limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
			limit = l
		}
	}
	if limit > 100 {
		limit = 100
	}

	offset := 0
	if offsetStr != "" {
		if o, err := strconv.Atoi(offsetStr); err == nil && o >= 0 {
			offset = o
		}
	}

	query := `
		SELECT id, description, amount, payment_mode, expense_date, created_at
		FROM expenses
		WHERE shopkeeper_id = $1
		ORDER BY expense_date DESC, created_at DESC
		LIMIT $2 OFFSET $3
	`
	rows, err := db.Pool.Query(r.Context(), query, shopkeeperID, limit, offset)
	if err != nil {
		log.Printf("ListExpenses DB error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "An internal error occurred"})
		return
	}
	defer rows.Close()

	expenses := []Expense{}
	for rows.Next() {
		var e Expense
		err := rows.Scan(&e.ID, &e.Description, &e.Amount, &e.PaymentMode, &e.ExpenseDate, &e.CreatedAt)
		if err != nil {
			log.Printf("ListExpenses scan error: %v", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "An internal error occurred"})
			return
		}
		expenses = append(expenses, e)
	}

	writeJSON(w, http.StatusOK, expenses)
}
