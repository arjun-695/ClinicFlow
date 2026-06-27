package handlers

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"backend/db"
)

// RoleMiddleware checks if the authenticated user's role is in the allowed list.
// The roles comparison is case-insensitive.
func RoleMiddleware(allowedRoles ...string) func(http.HandlerFunc) http.HandlerFunc {
	return func(next http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			userID, ok := r.Context().Value(ShopkeeperIDKey).(int)
			if !ok {
				writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized: session invalid or missing"})
				return
			}

			role, err := getUserRole(r.Context(), userID)
			if err != nil {
				log.Printf("RBAC: Failed to get user role for ID %d: %v", userID, err)
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "An internal error occurred"})
				return
			}

			// Normalize user's role to uppercase
			normalizedUserRole := strings.ToUpper(role)

			// Check if user's role is in allowedRoles list
			isAllowed := false
			for _, allowedRole := range allowedRoles {
				if normalizedUserRole == strings.ToUpper(allowedRole) {
					isAllowed = true
					break
				}
			}

			if !isAllowed {
				writeJSON(w, http.StatusForbidden, map[string]string{"error": "Forbidden: insufficient permissions"})
				return
			}

			next(w, r)
		}
	}
}

// getUserRole gets the user's role from cache or database
func getUserRole(ctx context.Context, userID int) (string, error) {
	cacheKey := fmt.Sprintf("user:role:%d", userID)
	var cachedRole string

	// Attempt to load from cache
	if db.GetCache(ctx, cacheKey, &cachedRole) {
		return cachedRole, nil
	}

	// Fallback to database query
	var dbRole string
	query := "SELECT role FROM users WHERE id = $1"
	err := db.Pool.QueryRow(ctx, query, userID).Scan(&dbRole)
	if err != nil {
		return "", err
	}

	// Store in cache for 1 hour
	db.SetCache(ctx, cacheKey, dbRole, 1*time.Hour)

	return dbRole, nil
}

// RequireAdmin restricts endpoint access to HOSPITAL_ADMIN only
func RequireAdmin(next http.HandlerFunc) http.HandlerFunc {
	return RoleMiddleware("HOSPITAL_ADMIN")(next)
}

// RequireDoctor restricts endpoint access to DOCTOR only
func RequireDoctor(next http.HandlerFunc) http.HandlerFunc {
	return RoleMiddleware("DOCTOR")(next)
}

// RequirePharmacist restricts endpoint access to PHARMACIST only
func RequirePharmacist(next http.HandlerFunc) http.HandlerFunc {
	return RoleMiddleware("PHARMACIST")(next)
}

// RequireAdminOrReceptionist restricts endpoint access to HOSPITAL_ADMIN (or receptionist fallback)
func RequireAdminOrReceptionist(next http.HandlerFunc) http.HandlerFunc {
	return RoleMiddleware("HOSPITAL_ADMIN", "RECEPTIONIST")(next)
}

// RequireMedicalStaffOrReceptionist restricts endpoint access to DOCTOR, HOSPITAL_ADMIN, and RECEPTIONIST
func RequireMedicalStaffOrReceptionist(next http.HandlerFunc) http.HandlerFunc {
	return RoleMiddleware("DOCTOR", "HOSPITAL_ADMIN", "RECEPTIONIST")(next)
}

// RequireMedicalStaff restricts endpoint access to DOCTOR and HOSPITAL_ADMIN
func RequireMedicalStaff(next http.HandlerFunc) http.HandlerFunc {
	return RoleMiddleware("DOCTOR", "HOSPITAL_ADMIN")(next)
}

// RequirePharmacistOrAdmin restricts endpoint access to PHARMACIST, HOSPITAL_ADMIN, and DOCTOR
func RequirePharmacistOrAdmin(next http.HandlerFunc) http.HandlerFunc {
	return RoleMiddleware("PHARMACIST", "HOSPITAL_ADMIN", "DOCTOR")(next)
}
