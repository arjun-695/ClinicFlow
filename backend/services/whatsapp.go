// Package services initializes and operates the WhatsApp client used for QR
// pairing, connection tracking, and outbound message delivery.
package services

import (
	"context"
	"fmt"
	"log"
	"os"
	"regexp"
	"strings"
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
	WAClient        *whatsmeow.Client
	LatestQR        string
	QRMutex         sync.RWMutex
	IsConnected     atomic.Bool
	QRChannelActive atomic.Bool
	LastQRTime      time.Time
)

func StartQRStream() {
	if WAClient == nil || WAClient.Store.ID != nil {
		if WAClient != nil && WAClient.Store.ID != nil {
			IsConnected.Store(true)
		}
		return
	}

	if QRChannelActive.Swap(true) {
		// Already active
		return
	}

	qrChan, err := WAClient.GetQRChannel(context.Background())
	if err != nil {
		log.Printf("Failed to get QR channel: %v", err)
		QRChannelActive.Store(false)
		return
	}

	go func() {
		defer QRChannelActive.Store(false)
		for qr := range qrChan {
			if qr.Event == "code" {
				QRMutex.Lock()
				LatestQR = qr.Code
				LastQRTime = time.Now()
				QRMutex.Unlock()
				log.Println("[WhatsApp] New QR code generated.")
			} else {
				log.Printf("[WhatsApp] QR channel event: %s", qr.Event)
				if qr.Event == "timeout" || qr.Event == "error" {
					QRMutex.Lock()
					LatestQR = ""
					QRMutex.Unlock()
				}
			}
		}
	}()
}

func InitWhatsApp() {
	dbConnStr := os.Getenv("DATABASE_URL")
	if dbConnStr == "" {
		log.Println("WARNING: DATABASE_URL not set, WhatsApp client cannot initialize")
		return
	}

	// whatsmeow requires its own logging system
	dbLog := waLog.Stdout("Database", "OFF", true)
	
	// Initialize sqlstore using postgres driver with background context
	container, err := sqlstore.New(context.Background(), "postgres", dbConnStr, dbLog)
	if err != nil {
		log.Fatalf("Failed to initialize whatsmeow sqlstore: %v", err)
	}
 
	deviceStore, err := container.GetFirstDevice(context.Background())
	if err != nil {
		log.Fatalf("Failed to get whatsmeow device: %v", err)
	}
 
	clientLog := waLog.Stdout("Client", "OFF", true)
	WAClient = whatsmeow.NewClient(deviceStore, clientLog)
	WAClient.AutoTrustIdentity = true
	WAClient.AutomaticMessageRerequestFromPhone = true

	// Set up event handlers
	WAClient.AddEventHandler(eventHandler)

	if WAClient.Store.ID == nil {
		StartQRStream()
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
	switch v := evt.(type) {
	case *events.Connected:
		IsConnected.Store(true)
		QRMutex.Lock()
		LatestQR = ""
		QRMutex.Unlock()
		log.Println("WhatsApp connected successfully!")
	case *events.LoggedOut:
		IsConnected.Store(false)
		log.Println("WhatsApp client logged out!")
	case *events.AppStateSyncError:
		log.Printf("WhatsApp AppState sync error for %s (FullSync=%t): %v", v.Name, v.FullSync, v.Error)
		// Trigger an automatic recovery sync or recovery request
		go func() {
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			defer cancel()
			if v.FullSync {
				log.Printf("AppStateSyncError persists after full sync. Sending recovery peer message...")
				msg := whatsmeow.BuildAppStateRecoveryRequest(v.Name)
				_, err := WAClient.SendPeerMessage(ctx, msg)
				if err != nil {
					log.Printf("Failed to send app state recovery request for %s: %v", v.Name, err)
				}
			} else {
				log.Printf("Attempting full AppState resync for %s...", v.Name)
				err := WAClient.FetchAppState(ctx, v.Name, true, false)
				if err != nil {
					log.Printf("Failed to force FetchAppState for %s: %v", v.Name, err)
				} else {
					log.Printf("FetchAppState successfully completed for %s", v.Name)
				}
			}
		}()
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

// SendWhatsAppWithAttachment uploads the provided file to WhatsApp and sends it as a document or image message with a caption
func SendWhatsAppWithAttachment(phone string, message string, fileBytes []byte, filename string, mimeType string) error {
	if WAClient == nil {
		return fmt.Errorf("whatsapp client is not initialized")
	}

	if !IsConnected.Load() {
		return fmt.Errorf("whatsapp client is not authenticated/connected")
	}

	// Clean up phone number
	re := regexp.MustCompile(`[^\d]`)
	cleaned := re.ReplaceAllString(phone, "")

	if len(cleaned) < 7 || len(cleaned) > 15 {
		return fmt.Errorf("phone number must include country code and be 7-15 digits")
	}

	recipientJID := types.JID{
		User:   cleaned,
		Server: types.DefaultUserServer,
	}

	var msg *waE2E.Message

	if len(fileBytes) > 0 {
		var mediaType whatsmeow.MediaType
		if strings.HasPrefix(mimeType, "image/") {
			mediaType = whatsmeow.MediaImage
		} else {
			mediaType = whatsmeow.MediaDocument
		}

		log.Printf("[WhatsApp] Uploading file: name=%s, size=%d bytes, mime=%s", filename, len(fileBytes), mimeType)
		ctx, uploadCancel := context.WithTimeout(context.Background(), 45*time.Second)
		resp, err := WAClient.Upload(ctx, fileBytes, mediaType)
		uploadCancel()
		if err != nil {
			return fmt.Errorf("failed to upload attachment to WhatsApp: %v", err)
		}

		log.Printf("[WhatsApp] Upload success: URL=%s, DirectPath=%s, RespLength=%d", resp.URL, resp.DirectPath, resp.FileLength)

		rawLength := uint64(len(fileBytes))

		if mediaType == whatsmeow.MediaImage {
			msg = &waE2E.Message{
				ImageMessage: &waE2E.ImageMessage{
					URL:           proto.String(resp.URL),
					DirectPath:    proto.String(resp.DirectPath),
					Mimetype:      proto.String(mimeType),
					FileSHA256:    resp.FileSHA256,
					FileEncSHA256: resp.FileEncSHA256,
					MediaKey:      resp.MediaKey,
					FileLength:    proto.Uint64(rawLength),
					Caption:       proto.String(message),
				},
			}
		} else {
			msg = &waE2E.Message{
				DocumentMessage: &waE2E.DocumentMessage{
					URL:           proto.String(resp.URL),
					DirectPath:    proto.String(resp.DirectPath),
					Mimetype:      proto.String(mimeType),
					FileSHA256:    resp.FileSHA256,
					FileEncSHA256: resp.FileEncSHA256,
					MediaKey:      resp.MediaKey,
					FileLength:    proto.Uint64(rawLength),
					FileName:      proto.String(filename),
					Title:         proto.String(filename),
					Caption:       proto.String(message),
				},
			}
		}
	} else {
		// Fallback to text message
		msg = &waE2E.Message{
			Conversation: proto.String(message),
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	_, err := WAClient.SendMessage(ctx, recipientJID, msg)
	if err != nil {
		return fmt.Errorf("failed to send message: %v", err)
	}

	log.Printf("WhatsApp message with attachment sent successfully to %s", cleaned)
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

	// Ensure the websocket is connected to the WhatsApp server
	if !WAClient.IsConnected() {
		log.Println("[WhatsApp] Client is not connected to the WhatsApp servers. Attempting to connect...")
		err := WAClient.Connect()
		if err != nil {
			return "", fmt.Errorf("whatsapp client not connected and failed to reconnect: %w", err)
		}
		// Wait up to 5 seconds for connection to be established
		for i := 0; i < 10; i++ {
			if WAClient.IsConnected() {
				break
			}
			time.Sleep(500 * time.Millisecond)
		}
		if !WAClient.IsConnected() {
			return "", fmt.Errorf("websocket connection to WhatsApp servers is not active. Please check your internet connection")
		}
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
		"Chrome (Windows)",           // display name (must be "Browser (OS)" format)
	)
	if err != nil {
		return "", fmt.Errorf("phone pairing failed: %v", err)
	}

	return code, nil
}
