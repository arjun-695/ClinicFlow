package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

	"backend/db"
)

type Medicine struct {
	ID        int       `json:"id"`
	DoctorID  int       `json:"doctor_id"`
	Name      string    `json:"name"`
	Stock     int       `json:"stock"`
	Price     float64   `json:"price"`
	CreatedAt time.Time `json:"created_at"`
}

// CreateMedicine adds a new medicine card to doctor's inventory
func CreateMedicine(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Name  string  `json:"name"`
		Stock int     `json:"stock"`
		Price float64 `json:"price"`
	}

	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
		return
	}

	if input.Name == "" || input.Price < 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Valid name and positive price are required"})
		return
	}

	doctorID, ok := r.Context().Value(ShopkeeperIDKey).(int)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	query := `
		INSERT INTO medicines (doctor_id, name, stock, price)
		VALUES ($1, $2, $3, $4)
		RETURNING id, created_at
	`
	var id int
	var createdAt time.Time
	err := db.Pool.QueryRow(r.Context(), query, doctorID, input.Name, input.Stock, input.Price).Scan(&id, &createdAt)
	if err != nil {
		log.Printf("CreateMedicine DB error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "An internal error occurred"})
		return
	}

	writeJSON(w, http.StatusOK, Medicine{
		ID:        id,
		DoctorID:  doctorID,
		Name:      input.Name,
		Stock:     input.Stock,
		Price:     input.Price,
		CreatedAt: createdAt,
	})
}

// ListMedicines fetches medicine list for doctor
func ListMedicines(w http.ResponseWriter, r *http.Request) {
	doctorID, ok := r.Context().Value(ShopkeeperIDKey).(int)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	query := `
		SELECT id, doctor_id, name, stock, price, created_at
		FROM medicines
		WHERE doctor_id = $1
		ORDER BY name ASC
	`
	rows, err := db.Pool.Query(r.Context(), query, doctorID)
	if err != nil {
		log.Printf("ListMedicines DB error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "An internal error occurred"})
		return
	}
	defer rows.Close()

	medicines := []Medicine{}
	for rows.Next() {
		var m Medicine
		err := rows.Scan(&m.ID, &m.DoctorID, &m.Name, &m.Stock, &m.Price, &m.CreatedAt)
		if err != nil {
			log.Printf("ListMedicines scan error: %v", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "An internal error occurred"})
			return
		}
		medicines = append(medicines, m)
	}

	writeJSON(w, http.StatusOK, medicines)
}

// UpdateMedicine updates an existing medicine catalog item for the doctor
func UpdateMedicine(w http.ResponseWriter, r *http.Request) {
	var input struct {
		ID    int     `json:"id"`
		Name  string  `json:"name"`
		Stock int     `json:"stock"`
		Price float64 `json:"price"`
	}

	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
		return
	}

	if input.ID <= 0 || input.Name == "" || input.Price < 0 || input.Stock < 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid fields: valid id, non-empty name, non-negative price and stock are required"})
		return
	}

	doctorID, ok := r.Context().Value(ShopkeeperIDKey).(int)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	query := `
		UPDATE medicines
		SET name = $1, stock = $2, price = $3
		WHERE id = $4 AND doctor_id = $5
		RETURNING id, doctor_id, name, stock, price, created_at
	`
	var m Medicine
	err := db.Pool.QueryRow(r.Context(), query, input.Name, input.Stock, input.Price, input.ID, doctorID).
		Scan(&m.ID, &m.DoctorID, &m.Name, &m.Stock, &m.Price, &m.CreatedAt)
	if err != nil {
		log.Printf("UpdateMedicine DB error: %v", err)
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Medicine not found or unauthorized"})
		return
	}

	writeJSON(w, http.StatusOK, m)
}

// DeleteMedicine removes a medicine catalog item for the doctor
func DeleteMedicine(w http.ResponseWriter, r *http.Request) {
	var input struct {
		ID int `json:"id"`
	}

	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
		return
	}

	if input.ID <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Valid id is required"})
		return
	}

	doctorID, ok := r.Context().Value(ShopkeeperIDKey).(int)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	query := `
		DELETE FROM medicines
		WHERE id = $1 AND doctor_id = $2
	`
	result, err := db.Pool.Exec(r.Context(), query, input.ID, doctorID)
	if err != nil {
		log.Printf("DeleteMedicine DB error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "An internal error occurred"})
		return
	}

	if result.RowsAffected() == 0 {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Medicine not found or unauthorized"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "Medicine deleted successfully"})
}
