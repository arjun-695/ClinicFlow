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
			// Verify user is associated with this facility
			var exists bool
			err := db.Pool.QueryRow(r.Context(), "SELECT EXISTS(SELECT 1 FROM user_facilities WHERE user_id = $1 AND facility_id = $2)", userID, id).Scan(&exists)
			if err == nil && exists {
				return id, nil
			}
		}
	}

	// Fallback to the first facility associated with the user
	var firstFacilityID int
	err := db.Pool.QueryRow(r.Context(), "SELECT facility_id FROM user_facilities WHERE user_id = $1 LIMIT 1", userID).Scan(&firstFacilityID)
	if err != nil {
		return 0, fmt.Errorf("user is not associated with any facility: %w", err)
	}
	return firstFacilityID, nil
}
