// Package handlers manages supplier dues endpoints for creating and listing
// payable reminders owned by the authenticated shopkeeper.
package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"time"

	"backend/db"
)

type SupplierDue struct {
	ID           int       `json:"id"`
	SupplierName string    `json:"supplier_name"`
	Amount       float64   `json:"amount"`
	DueDate      time.Time `json:"due_date"`
	Notified     bool      `json:"notified"`
	CreatedAt    time.Time `json:"created_at"`
}

func CreateSupplierDue(w http.ResponseWriter, r *http.Request) {
	var input struct {
		SupplierName string  `json:"supplier_name"`
		Amount       float64 `json:"amount"`
		DueDate      string  `json:"due_date"` // yyyy-mm-dd
	}

	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
		return
	}

	if input.SupplierName == "" || input.Amount <= 0 || input.DueDate == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "supplier_name, positive amount, and due_date are required"})
		return
	}

	if len(input.SupplierName) > 100 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Supplier name must be 100 characters or fewer"})
		return
	}

	parsedDate, err := time.Parse("2006-01-02", input.DueDate)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "due_date must be in yyyy-mm-dd format"})
		return
	}

	shopkeeperID, ok := r.Context().Value(ShopkeeperIDKey).(int)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	query := `
		INSERT INTO supplier_dues (shopkeeper_id, supplier_name, amount, due_date)
		VALUES ($1, $2, $3, $4)
		RETURNING id, notified, created_at
	`
	var id int
	var notified bool
	var createdAt time.Time
	err = db.Pool.QueryRow(r.Context(), query, shopkeeperID, input.SupplierName, input.Amount, parsedDate).Scan(&id, &notified, &createdAt)
	if err != nil {
		log.Printf("CreateSupplierDue DB error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "An internal error occurred"})
		return
	}

	writeJSON(w, http.StatusOK, SupplierDue{
		ID:           id,
		SupplierName: input.SupplierName,
		Amount:       input.Amount,
		DueDate:      parsedDate,
		Notified:     notified,
		CreatedAt:    createdAt,
	})
}

// ListSupplierDues lists all supplier dues for the logged-in doctor (paginated)
func ListSupplierDues(w http.ResponseWriter, r *http.Request) {
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
		SELECT id, supplier_name, amount, due_date, notified, created_at
		FROM supplier_dues
		WHERE shopkeeper_id = $1
		ORDER BY due_date ASC, created_at DESC
		LIMIT $2 OFFSET $3
	`
	rows, err := db.Pool.Query(r.Context(), query, shopkeeperID, limit, offset)
	if err != nil {
		log.Printf("ListSupplierDues DB error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "An internal error occurred"})
		return
	}
	defer rows.Close()

	dues := []SupplierDue{}
	for rows.Next() {
		var d SupplierDue
		err := rows.Scan(&d.ID, &d.SupplierName, &d.Amount, &d.DueDate, &d.Notified, &d.CreatedAt)
		if err != nil {
			log.Printf("ListSupplierDues scan error: %v", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "An internal error occurred"})
			return
		}
		dues = append(dues, d)
	}

	writeJSON(w, http.StatusOK, dues)
}
