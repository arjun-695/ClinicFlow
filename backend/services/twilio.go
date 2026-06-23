package services

import (
	"fmt"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

// SendTwilioWhatsApp sends a WhatsApp message (with an optional PDF invoice URL) using Twilio.
// If Twilio env vars are not set, it falls back to the whatsmeow client.
func SendTwilioWhatsApp(toPhone string, message string, mediaURL string) error {
	accountSid := os.Getenv("TWILIO_ACCOUNT_SID")
	authToken := os.Getenv("TWILIO_AUTH_TOKEN")
	fromNumber := os.Getenv("TWILIO_FROM_NUMBER") // Format: whatsapp:+14155238886

	if accountSid == "" || authToken == "" || fromNumber == "" {
		log.Println("[Twilio Service] Twilio credentials missing. Falling back to whatsmeow WhatsApp client...")
		
		// Clean the phone number prefix for whatsmeow
		cleanedPhone := strings.TrimPrefix(toPhone, "+")
		cleanedPhone = strings.TrimPrefix(cleanedPhone, "whatsapp:")

		if mediaURL != "" {
			// Fetch the media file bytes from the public URL to send via whatsmeow
			client := &http.Client{Timeout: 15 * time.Second}
			resp, err := client.Get(mediaURL)
			if err == nil && resp.StatusCode == http.StatusOK {
				defer resp.Body.Close()
				var fileBytes []byte
				fileBytes, err = ioReadAll(resp.Body)
				if err == nil {
					filename := "invoice.pdf"
					mimeType := "application/pdf"
					errMedia := SendWhatsAppWithAttachment(cleanedPhone, message, fileBytes, filename, mimeType)
					if errMedia == nil {
						log.Printf("[Twilio Fallback] Successfully sent PDF attachment via whatsmeow to %s", cleanedPhone)
						return nil
					}
					log.Printf("[Twilio Fallback] Failed to send attachment via whatsmeow: %v", errMedia)
				}
			}
		}

		// Fallback to plain text message
		err := SendWhatsApp(cleanedPhone, message)
		if err != nil {
			log.Printf("[Twilio Fallback] failed to send text message: %v", err)
			return err
		}
		return nil
	}

	// Make sure the recipient's phone number is prefixed with "whatsapp:"
	if !strings.HasPrefix(toPhone, "whatsapp:") {
		toPhone = "whatsapp:" + toPhone
	}
	if !strings.HasPrefix(fromNumber, "whatsapp:") {
		fromNumber = "whatsapp:" + fromNumber
	}

	twilioURL := fmt.Sprintf("https://api.twilio.com/2010-04-01/Accounts/%s/Messages.json", accountSid)
	
	form := url.Values{}
	form.Set("From", fromNumber)
	form.Set("To", toPhone)
	form.Set("Body", message)
	if mediaURL != "" {
		form.Set("MediaUrl", mediaURL)
	}

	req, err := http.NewRequest("POST", twilioURL, strings.NewReader(form.Encode()))
	if err != nil {
		return err
	}

	req.SetBasicAuth(accountSid, authToken)
	req.Header.Add("Content-Type", "application/x-www-form-urlencoded")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("twilio api request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		return fmt.Errorf("twilio api returned non-ok status: %d", resp.StatusCode)
	}

	log.Printf("[Twilio Service] Message successfully queued to Twilio for delivery to %s", toPhone)
	return nil
}

// ioReadAll helper to avoid importing io in some versions of go
func ioReadAll(r ioReader) ([]byte, error) {
	var buf []byte
	tmp := make([]byte, 1024)
	for {
		n, err := r.Read(tmp)
		if n > 0 {
			buf = append(buf, tmp[:n]...)
		}
		if err != nil {
			if err.Error() == "EOF" {
				return buf, nil
			}
			return nil, err
		}
	}
}

type ioReader interface {
	Read(p []byte) (n int, err error)
}
