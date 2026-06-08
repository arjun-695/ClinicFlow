// Package services initializes and operates the WhatsApp client used for QR
// pairing, connection tracking, and outbound message delivery.
package services

import (
	"context"
	"fmt"
	"log"
	"os"
	"regexp"
	"sync"
	"sync/atomic"
	"time"

	_ "github.com/lib/pq"
	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/proto/waE2E"
	"go.mau.fi/whatsmeow/store/sqlstore"
	"go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"
	waLog "go.mau.fi/whatsmeow/util/log"
	"google.golang.org/protobuf/proto"
)

var (
	WAClient    *whatsmeow.Client
	LatestQR    string
	QRMutex     sync.RWMutex
	IsConnected atomic.Bool
)

func InitWhatsApp() {
	dbConnStr := os.Getenv("DATABASE_URL")
	if dbConnStr == "" {
		log.Println("WARNING: DATABASE_URL not set, WhatsApp client cannot initialize")
		return
	}

	// whatsmeow requires its own logging system
	dbLog := waLog.Stdout("Database", "WARN", true)
	
	// Initialize sqlstore using postgres driver with background context
	container, err := sqlstore.New(context.Background(), "postgres", dbConnStr, dbLog)
	if err != nil {
		log.Fatalf("Failed to initialize whatsmeow sqlstore: %v", err)
	}

	deviceStore, err := container.GetFirstDevice(context.Background())
	if err != nil {
		log.Fatalf("Failed to get whatsmeow device: %v", err)
	}

	clientLog := waLog.Stdout("Client", "WARN", true)
	WAClient = whatsmeow.NewClient(deviceStore, clientLog)

	// Set up event handlers
	WAClient.AddEventHandler(eventHandler)

	if WAClient.Store.ID == nil {
		// No logged-in device, listen to QR code stream
		qrChan, err := WAClient.GetQRChannel(context.Background())
		if err != nil {
			log.Printf("Failed to get QR channel: %v", err)
			return
		}

		go func() {
			for qr := range qrChan {
				if qr.Event == "code" {
					QRMutex.Lock()
					LatestQR = qr.Code
					QRMutex.Unlock()
					fmt.Println("New WhatsApp QR code generated. Scan this in the frontend pairing screen.")
				} else {
					log.Printf("WhatsApp QR channel event: %s", qr.Event)
				}
			}
		}()
	} else {
		IsConnected.Store(true)
		fmt.Println("WhatsApp client is already authenticated and linked!")
	}

	err = WAClient.Connect()
	if err != nil {
		log.Printf("Failed to connect whatsmeow client: %v", err)
	}
}

func eventHandler(evt interface{}) {
	switch evt.(type) {
	case *events.Connected:
		IsConnected.Store(true)
		QRMutex.Lock()
		LatestQR = ""
		QRMutex.Unlock()
		log.Println("WhatsApp connected successfully!")
	case *events.LoggedOut:
		IsConnected.Store(false)
		log.Println("WhatsApp client logged out!")
	}
}

// SendWhatsApp sends a WhatsApp text message to the specified phone number
func SendWhatsApp(phone string, message string) error {
	if WAClient == nil {
		return fmt.Errorf("whatsapp client is not initialized")
	}

	if !IsConnected.Load() {
		return fmt.Errorf("whatsapp client is not authenticated/connected")
	}

	// Clean up phone number (remove +, spaces, hyphens, parentheses)
	re := regexp.MustCompile(`[^\d]`)
	cleaned := re.ReplaceAllString(phone, "")

	// Require full international format — don't assume country code
	if len(cleaned) < 7 || len(cleaned) > 15 {
		return fmt.Errorf("phone number must include country code and be 7-15 digits")
	}

	recipientJID := types.JID{
		User:   cleaned,
		Server: types.DefaultUserServer,
	}

	msg := &waE2E.Message{
		Conversation: proto.String(message),
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	_, err := WAClient.SendMessage(ctx, recipientJID, msg)
	if err != nil {
		return fmt.Errorf("failed to send message: %v", err)
	}

	log.Printf("WhatsApp message sent successfully to %s", cleaned)
	return nil
}

// PairWithPhoneNumber initiates a phone-number-based pairing flow instead of
// QR scanning. It calls whatsmeow's PairPhone which returns a short pairing
// code the user must enter in WhatsApp → Linked Devices → Link with phone number.
func PairWithPhoneNumber(phone string) (string, error) {
	if WAClient == nil {
		return "", fmt.Errorf("whatsapp client is not initialized")
	}

	if IsConnected.Load() {
		return "", fmt.Errorf("whatsapp is already connected")
	}

	// Clean up phone number — remove non-digit characters
	re := regexp.MustCompile(`[^\d]`)
	cleaned := re.ReplaceAllString(phone, "")

	if len(cleaned) < 7 || len(cleaned) > 15 {
		return "", fmt.Errorf("phone number must include country code and be 7-15 digits")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	code, err := WAClient.PairPhone(
		ctx,
		cleaned,
		true,                         // show push notification
		whatsmeow.PairClientChrome,   // client type
		"ClinicFlow (Web)",            // display name (must be "Name (Platform)" format)
	)
	if err != nil {
		return "", fmt.Errorf("phone pairing failed: %v", err)
	}

	return code, nil
}
