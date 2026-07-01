package services

import (
	"crypto/md5"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math/big"
	"net/http"
	"net/smtp"
	"net/url"
	"os"
	"strings"
	"time"
)

// OTPResult holds the generated OTP and its MD5 hash
type OTPResult struct {
	OTP  string
	Hash string
}

// GenerateLocalOTP creates a random 6-digit numeric OTP and its MD5 hash
func GenerateLocalOTP() (*OTPResult, error) {
	otp := ""
	for i := 0; i < 6; i++ {
		num, err := rand.Int(rand.Reader, big.NewInt(10))
		if err != nil {
			return nil, err
		}
		otp += fmt.Sprintf("%d", num.Int64())
	}

	hasher := md5.New()
	hasher.Write([]byte(otp))
	hash := hex.EncodeToString(hasher.Sum(nil))

	return &OTPResult{
		OTP:  otp,
		Hash: hash,
	}, nil
}

// SendOTPInvites sends the OTP.
// First tries the Google Apps Script OTP Generator if configured, otherwise falls back to local dispatch.
func SendOTPInvites(facilityID int, email string, phone string, appName string, onboardLink string) (string, string, error) {
	otpGeneratorURL := os.Getenv("OTP_GENERATOR_URL")
	
	if otpGeneratorURL != "" {
		log.Printf("[OTP Service] Attempting to send OTP via Apps Script to %s", email)
		
		u, err := url.Parse(otpGeneratorURL)
		if err != nil {
			return "", "", fmt.Errorf("invalid OTP_GENERATOR_URL: %w", err)
		}
		
		q := u.Query()
		q.Set("to", email)
		q.Set("app_name", appName)
		u.RawQuery = q.Encode()

		client := &http.Client{Timeout: 10 * time.Second}
		resp, err := client.Get(u.String())
		if err == nil && resp.StatusCode == http.StatusOK {
			defer resp.Body.Close()
			var result struct {
				Code int `json:"code"`
				Data struct {
					Hash string `json:"hash"`
				} `json:"data"`
				Message string `json:"message"`
			}
			bodyBytes, _ := io.ReadAll(resp.Body)
			if errJson := json.Unmarshal(bodyBytes, &result); errJson == nil && result.Code == 200 {
				log.Printf("[OTP Service] Successfully sent OTP via Apps Script. Received hash: %s", result.Data.Hash)
				return result.Data.Hash, "", nil
			}
			log.Printf("[OTP Service] Apps Script returned error response: %s", string(bodyBytes))
		} else {
			if err != nil {
				log.Printf("[OTP Service] Apps Script request failed: %v", err)
			} else {
				log.Printf("[OTP Service] Apps Script returned status: %d", resp.StatusCode)
			}
		}
	}

	// Local Fallback
	log.Println("[OTP Service] Running local OTP generation fallback...")
	otpRes, err := GenerateLocalOTP()
	if err != nil {
		return "", "", err
	}

	// Dispatch SMTP email sending asynchronously
	go func() {
		// Try sending email via local SMTP if configured
		smtpHost := os.Getenv("SMTP_HOST")
		smtpPort := os.Getenv("SMTP_PORT") // e.g. "587"
		smtpUser := os.Getenv("SMTP_USER")
		smtpPass := os.Getenv("SMTP_PASS")
		smtpFrom := os.Getenv("SMTP_FROM")

		if smtpHost != "" && smtpUser != "" && smtpPass != "" {
			addr := smtpHost + ":" + smtpPort
			auth := smtp.PlainAuth("", smtpUser, smtpPass, smtpHost)
			
			subject := fmt.Sprintf("Subject: OTP | %s Verification Code\r\n", appName)
			mime := "MIME-version: 1.0;\r\nContent-Type: text/html; charset=\"UTF-8\";\r\n\r\n"
			
			body := fmt.Sprintf(`
				<h2>ClinicFlow Staff Invitation</h2>
				<p>You have been invited to join as a staff member on <strong>%s</strong>.</p>
				<p>Click the link below to accept the invitation and complete your profile:</p>
				<p><a href="%s" style="display: inline-block; padding: 10px 20px; background-color: #4f46e5; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">Accept Invitation & Register</a></p>
				<p>Alternatively, copy and visit this link: <a href="%s">%s</a></p>
				<p>Use the verification code below to verify your invitation when prompted:</p>
				<div style="font-size: 24px; font-weight: bold; background: #f3f4f6; padding: 15px; border-radius: 5px; text-align: center; width: 200px; margin: 20px 0;">
					%s
				</div>
				<p>This code is valid for 24 hours.</p>
			`, appName, onboardLink, onboardLink, onboardLink, otpRes.OTP)
			
			msg := []byte(subject + mime + body)
			err = smtp.SendMail(addr, auth, smtpFrom, []string{email}, msg)
			if err == nil {
				log.Printf("[OTP Service] Successfully sent local email OTP to %s", email)
			} else {
				log.Printf("[OTP Service] Failed to send email via SMTP: %v", err)
			}
		}
	}()

	// Dispatch OTP to phone via WhatsApp asynchronously in parallel
	if phone != "" {
		go func() {
			cleanedPhone := strings.TrimPrefix(phone, "+")
			message := fmt.Sprintf("[ClinicFlow] You have been invited to join as a staff member.\nOnboarding Link: %s\nVerification Code: %s\nValid for 24 hours.", onboardLink, otpRes.OTP)
			errWs := SendWhatsApp(facilityID, cleanedPhone, message)
			if errWs == nil {
				log.Printf("[OTP Service] Successfully sent local WhatsApp OTP to %s", phone)
			} else {
				log.Printf("[OTP Service] Failed to send WhatsApp OTP: %v", errWs)
			}
		}()
	}

	return otpRes.Hash, otpRes.OTP, nil
}
