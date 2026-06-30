package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"

	"backend/db"
)

type Facility struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
	Type string `json:"type"`
	Role string `json:"role"`
}

func ListFacilities(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(ShopkeeperIDKey).(int)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	query := `
		SELECT f.id, f.name, f.type, uf.role
		FROM facilities f
		JOIN user_facilities uf ON f.id = uf.facility_id
		JOIN users u ON uf.user_id = u.id
		WHERE uf.user_id = $1
		AND (u.role = 'DOCTOR' OR f.type = 'HOSPITAL')
		ORDER BY f.name ASC
	`
	rows, err := db.Pool.Query(r.Context(), query, userID)
	if err != nil {
		log.Printf("ListFacilities DB error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "An internal error occurred"})
		return
	}
	defer rows.Close()

	facilities := []Facility{}
	for rows.Next() {
		var f Facility
		if err := rows.Scan(&f.ID, &f.Name, &f.Type, &f.Role); err != nil {
			log.Printf("ListFacilities scan error: %v", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "An internal error occurred"})
			return
		}
		facilities = append(facilities, f)
	}

	writeJSON(w, http.StatusOK, facilities)
}

func CreateFacility(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(ShopkeeperIDKey).(int)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	var input struct {
		Name string `json:"name"`
		Type string `json:"type"` // CLINIC or HOSPITAL
		Role string `json:"role"` // DOCTOR or HOSPITAL_ADMIN
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
		return
	}

	if input.Name == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Facility name is required"})
		return
	}
	if input.Type != "CLINIC" && input.Type != "HOSPITAL" {
		input.Type = "CLINIC"
	}
	if input.Role == "" {
		// Try to read user's role
		err := db.Pool.QueryRow(r.Context(), "SELECT role FROM users WHERE id = $1", userID).Scan(&input.Role)
		if err != nil {
			input.Role = "HOSPITAL_ADMIN"
		}
	}

	// Start a transaction
	tx, err := db.Pool.Begin(r.Context())
	if err != nil {
		log.Printf("CreateFacility begin tx error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "An internal error occurred"})
		return
	}
	defer tx.Rollback(r.Context())

	// Insert facility
	var facilityID int
	err = tx.QueryRow(r.Context(), "INSERT INTO facilities (name, type) VALUES ($1, $2) RETURNING id", input.Name, input.Type).Scan(&facilityID)
	if err != nil {
		log.Printf("CreateFacility insert facility error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "An internal error occurred"})
		return
	}

	// Associate user with facility
	_, err = tx.Exec(r.Context(), "INSERT INTO user_facilities (user_id, facility_id, role) VALUES ($1, $2, $3)", userID, facilityID, input.Role)
	if err != nil {
		log.Printf("CreateFacility associate user error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "An internal error occurred"})
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		log.Printf("CreateFacility commit error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "An internal error occurred"})
		return
	}

	// Invalidate cache
	db.InvalidateCache(r.Context(), "doctor:profile:"+strconv.Itoa(userID)+":*")

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"message":     "Facility created successfully",
		"facility_id": facilityID,
		"name":        input.Name,
		"type":        input.Type,
		"role":        input.Role,
	})
}

type StaffMember struct {
	ID             int     `json:"id"`
	Name           string  `json:"name"`
	Email          string  `json:"email"`
	Phone          string  `json:"phone"`
	Role           string  `json:"role"`
	Specialization *string `json:"specialization"`
	Location       *string `json:"location"`
}

func ListFacilityStaff(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(ShopkeeperIDKey).(int)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	facilityID, err := GetActiveFacilityID(r, userID)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Failed to resolve active facility"})
		return
	}

	query := `
		SELECT u.id, u.name, u.email, u.phone, uf.role, u.specialization, u.location
		FROM users u
		JOIN user_facilities uf ON u.id = uf.user_id
		WHERE uf.facility_id = $1
		ORDER BY u.name ASC
	`
	rows, err := db.Pool.Query(r.Context(), query, facilityID)
	if err != nil {
		log.Printf("ListFacilityStaff DB error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "An internal error occurred"})
		return
	}
	defer rows.Close()

	staff := []StaffMember{}
	for rows.Next() {
		var s StaffMember
		if err := rows.Scan(&s.ID, &s.Name, &s.Email, &s.Phone, &s.Role, &s.Specialization, &s.Location); err != nil {
			log.Printf("ListFacilityStaff scan error: %v", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "An internal error occurred"})
			return
		}
		staff = append(staff, s)
	}

	writeJSON(w, http.StatusOK, staff)
}

