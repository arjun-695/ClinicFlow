package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings"

	"backend/db"
)

type Facility struct {
	ID      int    `json:"id"`
	Name    string `json:"name"`
	Type    string `json:"type"`
	Role    string `json:"role"`
	Address string `json:"address"`
	Phone   string `json:"phone"`
}

func ListFacilities(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(ShopkeeperIDKey).(int)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	query := `
		SELECT f.id, f.name, f.type, COALESCE(uf.role, 'HOSPITAL_ADMIN') as role, COALESCE(f.address, '') as address, COALESCE(f.phone, '') as phone
		FROM facilities f
		JOIN user_facilities uf ON f.id = uf.facility_id
		WHERE uf.user_id = $1
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
		if err := rows.Scan(&f.ID, &f.Name, &f.Type, &f.Role, &f.Address, &f.Phone); err != nil {
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

	// Sanitize and validate facility name
	input.Name = strings.TrimSpace(input.Name)
	if input.Name == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Facility name is required"})
		return
	}

	// Sanitize and validate facility type
	input.Type = strings.ToUpper(strings.TrimSpace(input.Type))
	if input.Type != "CLINIC" && input.Type != "HOSPITAL" {
		input.Type = "CLINIC"
	}

	// The creator of a workspace is always assigned the HOSPITAL_ADMIN role for this workspace
	input.Role = "HOSPITAL_ADMIN"

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
		"id":          facilityID,
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
		SELECT u.id, u.name, u.email, u.phone, uf.role, u.specialization, u.location
		FROM users u
		JOIN user_facilities uf ON u.id = uf.user_id
		WHERE uf.facility_id = $1
		ORDER BY u.name ASC
		LIMIT $2 OFFSET $3
	`
	rows, err := db.Pool.Query(r.Context(), query, facilityID, limit, offset)
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

// DeleteFacilityStaff removes a staff member from the current workspace (facility) (Admin only)
func DeleteFacilityStaff(w http.ResponseWriter, r *http.Request) {
	adminID, ok := r.Context().Value(ShopkeeperIDKey).(int)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	facilityID, err := GetActiveFacilityID(r, adminID)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Failed to resolve active facility"})
		return
	}

	var adminFacilityRole string
	err = db.Pool.QueryRow(r.Context(), "SELECT role FROM user_facilities WHERE user_id = $1 AND facility_id = $2", adminID, facilityID).Scan(&adminFacilityRole)
	if err != nil || strings.ToUpper(adminFacilityRole) != "HOSPITAL_ADMIN" {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "Forbidden: only workspace administrators can remove staff"})
		return
	}

	staffIDStr := r.URL.Query().Get("id")
	if staffIDStr == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Staff ID is required"})
		return
	}

	staffID, err := strconv.Atoi(staffIDStr)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid staff ID"})
		return
	}

	if staffID == adminID {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "You cannot remove yourself from the workspace"})
		return
	}

	// Delete from user_facilities matching staff ID and active facility ID
	_, err = db.Pool.Exec(r.Context(), "DELETE FROM user_facilities WHERE user_id = $1 AND facility_id = $2", staffID, facilityID)
	if err != nil {
		log.Printf("DeleteFacilityStaff DB error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to remove staff from facility"})
		return
	}

	// Invalidate role cache and profile cache for the deleted user
	db.InvalidateCache(r.Context(), "user:exists:"+strconv.Itoa(staffID))
	db.InvalidateCache(r.Context(), "user:role:"+strconv.Itoa(staffID))
	db.InvalidateCache(r.Context(), "doctor:profile:"+strconv.Itoa(staffID)+":*")

	writeJSON(w, http.StatusOK, map[string]string{"message": "Staff member removed from workspace successfully"})
}

func UpdateFacility(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(ShopkeeperIDKey).(int)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	var input struct {
		ID      int    `json:"id"`
		Name    string `json:"name"`
		Address string `json:"address"`
		Phone   string `json:"phone"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
		return
	}

	if input.ID <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Facility ID is required"})
		return
	}

	if strings.TrimSpace(input.Name) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Facility name is required and cannot be empty"})
		return
	}

	// Verify user is associated with this facility
	var role string
	err := db.Pool.QueryRow(r.Context(), `
		SELECT role FROM user_facilities WHERE user_id = $1 AND facility_id = $2
	`, userID, input.ID).Scan(&role)
	if err != nil {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "Forbidden: you do not have access to this facility"})
		return
	}

	// Hospital admins and doctors can update facility info
	normalizedRole := strings.ToUpper(role)
	if normalizedRole != "HOSPITAL_ADMIN" && normalizedRole != "DOCTOR" {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "Forbidden: only admins or doctors can update facility info"})
		return
	}

	_, err = db.Pool.Exec(r.Context(), `
		UPDATE facilities
		SET name = $1, address = $2, phone = $3
		WHERE id = $4
	`, strings.TrimSpace(input.Name), input.Address, input.Phone, input.ID)
	if err != nil {
		log.Printf("UpdateFacility DB error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to update facility info"})
		return
	}

	// Invalidate profile cache for all users sharing this facility
	rows, err := db.Pool.Query(r.Context(), "SELECT user_id FROM user_facilities WHERE facility_id = $1", input.ID)
	if err != nil {
		log.Printf("UpdateFacility user lookup error: %v", err)
	} else {
		defer rows.Close()
		for rows.Next() {
			var uID int
			if err := rows.Scan(&uID); err != nil {
				log.Printf("UpdateFacility row scan error: %v", err)
				continue
			}
			db.InvalidateCache(r.Context(), "doctor:profile:"+strconv.Itoa(uID)+":*")
		}
		if err := rows.Err(); err != nil {
			log.Printf("UpdateFacility row iteration error: %v", err)
		}
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "Facility details updated successfully"})
}

// DeleteFacility deletes a workspace (facility) after verifying authorization
func DeleteFacility(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(ShopkeeperIDKey).(int)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	facilityIDStr := r.URL.Query().Get("id")
	if facilityIDStr == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Facility ID is required"})
		return
	}

	facilityID, err := strconv.Atoi(facilityIDStr)
	if err != nil || facilityID <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid facility ID"})
		return
	}

	// Verify user belongs to this facility and has deletion permission (HOSPITAL_ADMIN or clinic doctor)
	var userFacRole, facType string
	err = db.Pool.QueryRow(r.Context(), `
		SELECT COALESCE(uf.role, 'HOSPITAL_ADMIN'), f.type 
		FROM user_facilities uf 
		JOIN facilities f ON uf.facility_id = f.id 
		WHERE uf.user_id = $1 AND uf.facility_id = $2
	`, userID, facilityID).Scan(&userFacRole, &facType)
	if err != nil {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "Forbidden: you do not belong to this workspace"})
		return
	}

	userFacRoleUpper := strings.ToUpper(userFacRole)
	facTypeUpper := strings.ToUpper(facType)

	canDelete := userFacRoleUpper == "HOSPITAL_ADMIN" || (facTypeUpper == "CLINIC" && (userFacRoleUpper == "DOCTOR" || userFacRoleUpper == "HOSPITAL_ADMIN"))
	if !canDelete {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "Forbidden: only workspace administrators or clinic owners can delete this workspace"})
		return
	}

	// Read associations and delete the workspace in one transaction. The foreign
	// key on user_facilities cascades, so deleting it separately is unnecessary
	// and leaves a race between authorization and deletion.
	tx, err := db.Pool.Begin(r.Context())
	if err != nil {
		log.Printf("DeleteFacility tx begin error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "An internal error occurred"})
		return
	}
	defer tx.Rollback(r.Context())

	rows, err := tx.Query(r.Context(), "SELECT user_id FROM user_facilities WHERE facility_id = $1", facilityID)
	var affectedUserIDs []int
	if err == nil {
		for rows.Next() {
			var uID int
			if errScan := rows.Scan(&uID); errScan == nil {
				affectedUserIDs = append(affectedUserIDs, uID)
			}
		}
		rows.Close()
	}
	if len(affectedUserIDs) == 0 {
		affectedUserIDs = []int{userID}
	}

	result, err := tx.Exec(r.Context(), "DELETE FROM facilities WHERE id = $1", facilityID)
	if err != nil {
		log.Printf("DeleteFacility facility delete error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to delete workspace"})
		return
	}
	if result.RowsAffected() != 1 {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Workspace no longer exists"})
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		log.Printf("DeleteFacility commit error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "An internal error occurred"})
		return
	}

	// Invalidate profile cache for all affected users
	for _, uID := range affectedUserIDs {
		db.InvalidateCache(r.Context(), "doctor:profile:"+strconv.Itoa(uID)+":*")
		db.InvalidateCache(r.Context(), "user:role:"+strconv.Itoa(uID))
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "Workspace deleted successfully"})
}
