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
	services.QRMutex.RLock()
	qr := services.LatestQR
	lastQRTime := services.LastQRTime
	services.QRMutex.RUnlock()

	// If not connected, not paired, and the QR stream loop has timed out or is stale
	if !services.IsConnected.Load() && services.WAClient != nil && services.WAClient.Store.ID == nil {
		if qr == "" || time.Since(lastQRTime) > 25*time.Second || !services.QRChannelActive.Load() {
			log.Println("[WhatsApp] QR stream stale or inactive. Re-initializing whatsmeow QR channel...")
			services.WAClient.Disconnect()
			time.Sleep(100 * time.Millisecond) // brief pause to disconnect
			services.StartQRStream()
			err := services.WAClient.Connect()
			if err != nil {
				log.Printf("[WhatsApp] Connect error on QR refresh: %v", err)
			}

			// Block for up to 2 seconds to wait for a fresh QR to arrive in the stream
			for i := 0; i < 20; i++ {
				time.Sleep(100 * time.Millisecond)
				services.QRMutex.RLock()
				qr = services.LatestQR
				services.QRMutex.RUnlock()
				if qr != "" {
					break
				}
			}
		}
	}

	var status string
	phone := ""
	if services.IsConnected.Load() {
		status = "CONNECTED"
		qr = ""
		if services.WAClient != nil && services.WAClient.Store.ID != nil {
			phone = services.WAClient.Store.ID.User
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
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"connected": services.IsConnected.Load(),
	})
}

func SendWhatsAppTest(w http.ResponseWriter, r *http.Request) {
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

	err := services.SendWhatsApp(input.Phone, input.Message)
	if err != nil {
		log.Printf("SendWhatsAppTest error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to send WhatsApp message"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "Message sent successfully"})
}

// PairWhatsAppPhone handles phone-number-based WhatsApp device linking.
// Instead of scanning a QR code, the user enters their phone number and
// receives a short pairing code to enter in WhatsApp → Linked Devices.
func PairWhatsAppPhone(w http.ResponseWriter, r *http.Request) {
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

	code, err := services.PairWithPhoneNumber(input.Phone)
	if err != nil {
		log.Printf("PairWhatsAppPhone error: %v", err)
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

// DisconnectWhatsApp logs out the linked WhatsApp device and resets state (Admin only)
func DisconnectWhatsApp(w http.ResponseWriter, r *http.Request) {
	if services.WAClient == nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "WhatsApp client is not initialized"})
		return
	}

	// Verify caller has permissions (since WhatsApp settings are for admins)
	userID, ok := r.Context().Value(ShopkeeperIDKey).(int)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	userRole, err := getUserRole(r.Context(), userID)
	if err != nil || userRole != "HOSPITAL_ADMIN" {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "Only Hospital Admins can disconnect WhatsApp"})
		return
	}

	// Call whatsmeow Logout to unlink the device and clear session store
	err = services.WAClient.Logout(r.Context())
	if err != nil {
		// Fallback: manually disconnect if Logout fails
		log.Printf("[WhatsApp] Logout failed: %v, attempting manual disconnect", err)
		services.WAClient.Disconnect()
	}

	// Reset shared states
	services.IsConnected.Store(false)
	services.QRMutex.Lock()
	services.LatestQR = ""
	services.QRMutex.Unlock()

	writeJSON(w, http.StatusOK, map[string]string{"message": "WhatsApp disconnected successfully"})
}
