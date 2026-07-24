package handlers

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"unicode"

	"backend/db"
)

// CapitalizeName formats a name string so that the first letter of both surname and last name (each word) is capitalized.
func CapitalizeName(name string) string {
	words := strings.Fields(name)
	for i, word := range words {
		runes := []rune(strings.ToLower(word))
		if len(runes) > 0 {
			runes[0] = unicode.ToUpper(runes[0])
		}
		words[i] = string(runes)
	}
	return strings.Join(words, " ")
}

// GetActiveFacilityID returns the active facility ID from the X-Facility-ID header.
// If not provided, it fetches the first associated facility for the user.
func GetActiveFacilityID(r *http.Request, userID int) (int, error) {
	facilityIDStr := r.Header.Get("X-Facility-ID")
	if facilityIDStr != "" {
		if id, err := strconv.Atoi(facilityIDStr); err == nil && id > 0 {
			// Membership in user_facilities is the workspace authorization source of
			// truth. Do not also gate it on the user's global role: that made valid
			// memberships disappear from the switcher and reject their selection.
			var exists bool
			query := `
				SELECT EXISTS(
					SELECT 1 
					FROM user_facilities uf
					WHERE uf.user_id = $1 AND uf.facility_id = $2
				)
			`
			err := db.Pool.QueryRow(r.Context(), query, userID, id).Scan(&exists)
			if err == nil && exists {
				return id, nil
			}
		}
	}

	// Fall back to a deterministic workspace the user belongs to.
	var firstFacilityID int
	fallbackQuery := `
		SELECT uf.facility_id 
		FROM user_facilities uf
		WHERE uf.user_id = $1
		ORDER BY uf.facility_id ASC
		LIMIT 1
	`
	err := db.Pool.QueryRow(r.Context(), fallbackQuery, userID).Scan(&firstFacilityID)
	if err != nil {
		return 0, fmt.Errorf("user is not associated with any authorized facility: %w", err)
	}
	return firstFacilityID, nil
}

// parsePagination extracts and validates limit and offset from query parameters.
// Default limit is 50, max is 100. Default offset is 0.
func parsePagination(r *http.Request) (limit, offset int) {
	limitStr := r.URL.Query().Get("limit")
	offsetStr := r.URL.Query().Get("offset")

	limit = 50
	if limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
			limit = l
		}
	}
	if limit > 100 {
		limit = 100
	}

	offset = 0
	if offsetStr != "" {
		if o, err := strconv.Atoi(offsetStr); err == nil && o >= 0 {
			offset = o
		}
	}

	return limit, offset
}
