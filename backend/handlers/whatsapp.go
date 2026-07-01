// Package handlers exposes WhatsApp status, QR, and test-message endpoints
// backed by the shared WhatsApp service client.
package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"regexp"
	"strings"
	"time"

	"backend/services"
)

var waPhoneRegex = regexp.MustCompile(`^\+?[\d]{7,15}$`)

func GetWhatsAppQR(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(ShopkeeperIDKey).(int)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	facilityID, isAuthorized, err := CheckWhatsAppAccess(r, userID)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	if !isAuthorized {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "Forbidden: you do not have permission to view WhatsApp for this workspace"})
		return
	}

	state := services.GetWhatsAppState(facilityID)

	services.WhatsAppStatesMutex.RLock()
	qr := state.LatestQR
	lastQRTime := state.LastQRTime
	isConnected := state.IsConnected
	services.WhatsAppStatesMutex.RUnlock()

	// If not connected, not paired, and the QR stream loop has timed out or is stale
	if !isConnected && state.Client != nil && state.Client.Store.ID == nil {
		if qr == "" || time.Since(lastQRTime) > 25*time.Second || !state.QRChannelActive {
			log.Printf("[WhatsApp] QR stream stale or inactive for facility %d. Re-initializing whatsmeow QR channel...", facilityID)
			state.Client.Disconnect()
			time.Sleep(100 * time.Millisecond) // brief pause to disconnect
			services.StartQRStream(facilityID)
			err := state.Client.Connect()
			if err != nil {
				log.Printf("[WhatsApp] Connect error on QR refresh for facility %d: %v", facilityID, err)
			}

			// Block for up to 2 seconds to wait for a fresh QR to arrive in the stream
			for i := 0; i < 20; i++ {
				time.Sleep(100 * time.Millisecond)
				services.WhatsAppStatesMutex.RLock()
				qr = state.LatestQR
				services.WhatsAppStatesMutex.RUnlock()
				if qr != "" {
					break
				}
			}
		}
	}

	var status string
	phone := ""
	services.WhatsAppStatesMutex.RLock()
	isConnected = state.IsConnected
	services.WhatsAppStatesMutex.RUnlock()

	if isConnected {
		status = "CONNECTED"
		qr = ""
		if state.Client != nil && state.Client.Store.ID != nil {
			phone = state.Client.Store.ID.User
		}
	} else if qr == "" {
		status = "INITIALIZING"
	} else {
		status = "DISCONNECTED"
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"status": status,
		"qr":     qr,
		"phone":  phone,
	})
}

func GetWhatsAppStatus(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(ShopkeeperIDKey).(int)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	facilityID, isAuthorized, err := CheckWhatsAppAccess(r, userID)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	if !isAuthorized {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "Forbidden: you do not have permission to view WhatsApp for this workspace"})
		return
	}

	state := services.GetWhatsAppState(facilityID)

	services.WhatsAppStatesMutex.RLock()
	connected := state.IsConnected
	services.WhatsAppStatesMutex.RUnlock()

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"connected": connected,
	})
}

func SendWhatsAppTest(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(ShopkeeperIDKey).(int)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	facilityID, isAuthorized, err := CheckWhatsAppAccess(r, userID)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	if !isAuthorized {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "Forbidden: you do not have permission to manage WhatsApp for this workspace"})
		return
	}

	var input struct {
		Phone   string `json:"phone"`
		Message string `json:"message"`
	}

	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
		return
	}

	if input.Phone == "" || input.Message == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Phone and Message are required"})
		return
	}

	if !waPhoneRegex.MatchString(input.Phone) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid phone number format. Use digits with optional + prefix."})
		return
	}

	if len(input.Message) > 1000 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Message must be 1000 characters or fewer"})
		return
	}

	err = services.SendWhatsApp(facilityID, input.Phone, input.Message)
	if err != nil {
		log.Printf("SendWhatsAppTest error for facility %d: %v", facilityID, err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to send WhatsApp message"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "Message sent successfully"})
}

// PairWhatsAppPhone handles phone-number-based WhatsApp device linking.
func PairWhatsAppPhone(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(ShopkeeperIDKey).(int)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	facilityID, isAuthorized, err := CheckWhatsAppAccess(r, userID)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	if !isAuthorized {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "Forbidden: you do not have permission to manage WhatsApp for this workspace"})
		return
	}

	var input struct {
		Phone string `json:"phone"`
	}

	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
		return
	}

	if input.Phone == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Phone number is required"})
		return
	}

	if !waPhoneRegex.MatchString(input.Phone) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid phone number format. Use digits with optional + prefix (e.g. +919999999999)."})
		return
	}

	code, err := services.PairWithPhoneNumber(facilityID, input.Phone)
	if err != nil {
		log.Printf("PairWhatsAppPhone error for facility %d: %v", facilityID, err)
		errMsg := err.Error()
		if strings.Contains(errMsg, "400") || strings.Contains(errMsg, "bad-request") {
			errMsg = "WhatsApp rejected the phone number (400 Bad Request). Please ensure you have included your country code (e.g. 919876543210 for India, 12025550199 for US) and that this number is registered on WhatsApp."
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": errMsg})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"status":       "Pairing code generated",
		"pairing_code": code,
	})
}

// DisconnectWhatsApp logs out the linked WhatsApp device and resets state (Admin/Clinic Doctor only)
func DisconnectWhatsApp(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(ShopkeeperIDKey).(int)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	facilityID, isAuthorized, err := CheckWhatsAppAccess(r, userID)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	if !isAuthorized {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "Forbidden: you do not have permission to manage WhatsApp for this workspace"})
		return
	}

	state := services.GetWhatsAppState(facilityID)
	if state.Client == nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "WhatsApp client is not initialized for this facility"})
		return
	}

	// Call whatsmeow Logout to unlink the device and clear session store
	err = state.Client.Logout(r.Context())
	if err != nil {
		// Fallback: manually disconnect if Logout fails
		log.Printf("[WhatsApp] Logout failed for facility %d: %v, attempting manual disconnect", facilityID, err)
		state.Client.Disconnect()
	}

	// Reset shared states
	services.WhatsAppStatesMutex.Lock()
	state.IsConnected = false
	state.LatestQR = ""
	services.WhatsAppStatesMutex.Unlock()

	writeJSON(w, http.StatusOK, map[string]string{"message": "WhatsApp disconnected successfully"})
}
