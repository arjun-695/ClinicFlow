// Package handlers exposes WhatsApp status, QR, and test-message endpoints
// backed by the shared WhatsApp service client.
package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"regexp"

	"backend/services"
)

var waPhoneRegex = regexp.MustCompile(`^\+?[\d]{7,15}$`)

func GetWhatsAppQR(w http.ResponseWriter, r *http.Request) {
	services.QRMutex.RLock()
	qr := services.LatestQR
	services.QRMutex.RUnlock()

	var status string
	if services.IsConnected.Load() {
		status = "CONNECTED"
		qr = ""
	} else if qr == "" {
		status = "INITIALIZING"
	} else {
		status = "DISCONNECTED"
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"status": status,
		"qr":     qr,
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
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"status":       "Pairing code generated",
		"pairing_code": code,
	})
}
