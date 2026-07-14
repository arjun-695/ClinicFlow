// Package services initializes and operates multi-tenant WhatsApp clients used for QR
// pairing, connection tracking, and outbound message delivery scoped to facilities.
package services

import (
	"context"
	"fmt"
	"log"
	"os"
	"regexp"
	"strings"
	"sync"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/proto/waE2E"
	"go.mau.fi/whatsmeow/store/sqlstore"
	"go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"
	waLog "go.mau.fi/whatsmeow/util/log"
	"google.golang.org/protobuf/proto"

	"backend/db"
)

type FacilityWhatsAppState struct {
	Client          *whatsmeow.Client
	LatestQR        string
	QRChannelActive bool
	LastQRTime      time.Time
	IsConnected     bool
}

var (
	WhatsAppStates      = make(map[int]*FacilityWhatsAppState)
	WhatsAppStatesMutex sync.RWMutex
	container           *sqlstore.Container
	clientLog           waLog.Logger
	sendSemaphore       = make(chan struct{}, 5) // Cap concurrent outbound sends to 5
)

func GetWhatsAppState(facilityID int) *FacilityWhatsAppState {
	WhatsAppStatesMutex.Lock()
	defer WhatsAppStatesMutex.Unlock()

	state, exists := WhatsAppStates[facilityID]
	if !exists {
		state = &FacilityWhatsAppState{}
		WhatsAppStates[facilityID] = state
	}
	return state
}

func StartQRStream(facilityID int) {
	if container == nil {
		log.Println("[WhatsApp] sqlstore container is not initialized, cannot start QR stream")
		return
	}

	state := GetWhatsAppState(facilityID)
	if state.Client == nil {
		deviceStore := container.NewDevice()
		client := whatsmeow.NewClient(deviceStore, clientLog)
		client.AutoTrustIdentity = true
		client.AutomaticMessageRerequestFromPhone = true

		client.AddEventHandler(func(evt interface{}) {
			eventHandler(facilityID, client, evt)
		})
		state.Client = client
	}

	if state.Client.Store.ID != nil {
		WhatsAppStatesMutex.Lock()
		state.IsConnected = true
		WhatsAppStatesMutex.Unlock()
		return
	}

	WhatsAppStatesMutex.Lock()
	if state.QRChannelActive {
		WhatsAppStatesMutex.Unlock()
		return
	}
	state.QRChannelActive = true
	WhatsAppStatesMutex.Unlock()

	qrChan, err := state.Client.GetQRChannel(context.Background())
	if err != nil {
		log.Printf("[WhatsApp] Failed to get QR channel for facility %d: %v", facilityID, err)
		WhatsAppStatesMutex.Lock()
		state.QRChannelActive = false
		WhatsAppStatesMutex.Unlock()
		return
	}

	go func() {
		defer func() {
			WhatsAppStatesMutex.Lock()
			state.QRChannelActive = false
			WhatsAppStatesMutex.Unlock()
		}()

		for qr := range qrChan {
			if qr.Event == "code" {
				WhatsAppStatesMutex.Lock()
				state.LatestQR = qr.Code
				state.LastQRTime = time.Now()
				WhatsAppStatesMutex.Unlock()
				log.Printf("[WhatsApp] New QR code generated for facility %d.", facilityID)
			} else {
				log.Printf("[WhatsApp] QR channel event for facility %d: %s", facilityID, qr.Event)
				if qr.Event == "timeout" || qr.Event == "error" {
					WhatsAppStatesMutex.Lock()
					state.LatestQR = ""
					WhatsAppStatesMutex.Unlock()
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

	// Create facility_whatsapp_sessions mapping table dynamically
	_, err := db.Pool.Exec(context.Background(), `
		CREATE TABLE IF NOT EXISTS facility_whatsapp_sessions (
			facility_id INT PRIMARY KEY REFERENCES facilities(id) ON DELETE CASCADE,
			jid VARCHAR(100) NOT NULL,
			created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
		)
	`)
	if err != nil {
		log.Fatalf("Failed to create facility_whatsapp_sessions table: %v", err)
	}

	// whatsmeow requires its own logging system
	dbLog := waLog.Stdout("Database", "OFF", true)
	clientLog = waLog.Stdout("Client", "OFF", true)

	// Initialize sqlstore using pgx driver with background context
	container, err = sqlstore.New(context.Background(), "pgx", dbConnStr, dbLog)
	if err != nil {
		log.Fatalf("Failed to initialize whatsmeow sqlstore: %v", err)
	}

	// Query existing pairings and connect them
	rows, err := db.Pool.Query(context.Background(), "SELECT facility_id, jid FROM facility_whatsapp_sessions")
	if err != nil {
		log.Printf("Failed to load facility WhatsApp sessions: %v", err)
		return
	}
	defer rows.Close()

	for rows.Next() {
		var facilityID int
		var jidStr string
		if err := rows.Scan(&facilityID, &jidStr); err == nil {
			parsedJID, err := types.ParseJID(jidStr)
			if err != nil {
				log.Printf("[WhatsApp] Failed to parse JID %s: %v", jidStr, err)
				continue
			}

			deviceStore, err := container.GetDevice(context.Background(), parsedJID)
			if err != nil || deviceStore == nil {
				log.Printf("[WhatsApp] Failed to load device store for %s: %v", jidStr, err)
				continue
			}

			client := whatsmeow.NewClient(deviceStore, clientLog)
			client.AutoTrustIdentity = true
			client.AutomaticMessageRerequestFromPhone = true

			state := GetWhatsAppState(facilityID)
			state.Client = client
			state.IsConnected = false // will be updated via Connected event

			client.AddEventHandler(func(evt interface{}) {
				eventHandler(facilityID, client, evt)
			})

			err = client.Connect()
			if err != nil {
				log.Printf("[WhatsApp] Failed to connect whatsmeow client for facility %d: %v", facilityID, err)
			} else {
				log.Printf("[WhatsApp] Initiated connection for facility %d", facilityID)
			}
		}
	}
}

func eventHandler(facilityID int, client *whatsmeow.Client, evt interface{}) {
	switch v := evt.(type) {
	case *events.Connected:
		state := GetWhatsAppState(facilityID)
		WhatsAppStatesMutex.Lock()
		state.IsConnected = true
		state.LatestQR = ""
		WhatsAppStatesMutex.Unlock()
		log.Printf("[WhatsApp] Facility %d connected successfully!", facilityID)

		// Persist the JID session mapping when connected
		if client.Store.ID != nil {
			jidStr := client.Store.ID.String()
			_, err := db.Pool.Exec(context.Background(), `
				INSERT INTO facility_whatsapp_sessions (facility_id, jid)
				VALUES ($1, $2)
				ON CONFLICT (facility_id) DO UPDATE SET jid = EXCLUDED.jid
			`, facilityID, jidStr)
			if err != nil {
				log.Printf("[WhatsApp] Failed to persist JID mapping for facility %d: %v", facilityID, err)
			}
		}

	case *events.LoggedOut:
		state := GetWhatsAppState(facilityID)
		WhatsAppStatesMutex.Lock()
		state.IsConnected = false
		state.LatestQR = ""
		WhatsAppStatesMutex.Unlock()
		log.Printf("[WhatsApp] Facility %d logged out!", facilityID)

		// Remove the persistent session record
		_, err := db.Pool.Exec(context.Background(), "DELETE FROM facility_whatsapp_sessions WHERE facility_id = $1", facilityID)
		if err != nil {
			log.Printf("[WhatsApp] Failed to remove session mapping for facility %d: %v", facilityID, err)
		}

	case *events.AppStateSyncError:
		log.Printf("[WhatsApp] AppState sync error for facility %d: %s (FullSync=%t): %v", facilityID, v.Name, v.FullSync, v.Error)
		go func() {
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			defer cancel()
			if v.FullSync {
				log.Printf("[WhatsApp] AppStateSyncError persists after full sync. Sending recovery peer message...")
				msg := whatsmeow.BuildAppStateRecoveryRequest(v.Name)
				_, err := client.SendPeerMessage(ctx, msg)
				if err != nil {
					log.Printf("[WhatsApp] Failed to send app state recovery request for %s: %v", v.Name, err)
				}
			} else {
				log.Printf("[WhatsApp] Attempting full AppState resync for %s...", v.Name)
				err := client.FetchAppState(ctx, v.Name, true, false)
				if err != nil {
					log.Printf("[WhatsApp] Failed to force FetchAppState for %s: %v", v.Name, err)
				}
			}
		}()
	}
}

// SendWhatsApp sends a WhatsApp text message using the specified facility's client connection
func SendWhatsApp(facilityID int, phone string, message string) error {
	// Acquire semaphore with a bounded timeout to fail fast if queue is full
	acquireCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	select {
	case sendSemaphore <- struct{}{}:
		cancel()
		defer func() { <-sendSemaphore }()
	case <-acquireCtx.Done():
		cancel()
		return fmt.Errorf("semaphore acquire timeout: send queue is full")
	}

	state := GetWhatsAppState(facilityID)
	if state.Client == nil {
		return fmt.Errorf("whatsapp client is not initialized for this facility")
	}

	WhatsAppStatesMutex.RLock()
	isConnected := state.IsConnected
	WhatsAppStatesMutex.RUnlock()

	if !isConnected {
		return fmt.Errorf("whatsapp client is not authenticated/connected for this facility")
	}

	// Clean up phone number (remove +, spaces, hyphens, parentheses)
	re := regexp.MustCompile(`[^\d]`)
	cleaned := re.ReplaceAllString(phone, "")

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

	_, err := state.Client.SendMessage(ctx, recipientJID, msg)
	if err != nil {
		return fmt.Errorf("failed to send message: %v", err)
	}

	log.Printf("[WhatsApp] Message sent successfully to %s for facility %d", cleaned, facilityID)
	return nil
}

// SendWhatsAppWithAttachment uploads the provided file to WhatsApp and sends it as a document or image message with a caption
func SendWhatsAppWithAttachment(facilityID int, phone string, message string, fileBytes []byte, filename string, mimeType string) error {
	// Acquire semaphore with a bounded timeout to fail fast if queue is full
	acquireCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	select {
	case sendSemaphore <- struct{}{}:
		cancel()
		defer func() { <-sendSemaphore }()
	case <-acquireCtx.Done():
		cancel()
		return fmt.Errorf("semaphore acquire timeout: send queue is full")
	}

	state := GetWhatsAppState(facilityID)
	if state.Client == nil {
		return fmt.Errorf("whatsapp client is not initialized for this facility")
	}

	WhatsAppStatesMutex.RLock()
	isConnected := state.IsConnected
	WhatsAppStatesMutex.RUnlock()

	if !isConnected {
		return fmt.Errorf("whatsapp client is not authenticated/connected for this facility")
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

		log.Printf("[WhatsApp] Facility %d: Uploading file: name=%s, size=%d bytes, mime=%s", facilityID, filename, len(fileBytes), mimeType)
		ctx, uploadCancel := context.WithTimeout(context.Background(), 45*time.Second)
		resp, err := state.Client.Upload(ctx, fileBytes, mediaType)
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
		msg = &waE2E.Message{
			Conversation: proto.String(message),
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	_, err := state.Client.SendMessage(ctx, recipientJID, msg)
	if err != nil {
		return fmt.Errorf("failed to send message: %v", err)
	}

	log.Printf("[WhatsApp] Message with attachment sent successfully to %s for facility %d", cleaned, facilityID)
	return nil
}

// PairWithPhoneNumber initiates a phone-number-based pairing flow instead of QR scanning
func PairWithPhoneNumber(facilityID int, phone string) (string, error) {
	state := GetWhatsAppState(facilityID)
	if state.Client == nil {
		return "", fmt.Errorf("whatsapp client is not initialized for this facility")
	}

	WhatsAppStatesMutex.RLock()
	isConnected := state.IsConnected
	WhatsAppStatesMutex.RUnlock()

	if isConnected {
		return "", fmt.Errorf("whatsapp is already connected for this facility")
	}

	// Ensure the websocket is connected to the WhatsApp server
	if !state.Client.IsConnected() {
		log.Printf("[WhatsApp] Connecting client for facility %d to WhatsApp servers...", facilityID)
		err := state.Client.Connect()
		if err != nil {
			return "", fmt.Errorf("whatsapp client not connected and failed to reconnect: %w", err)
		}
		// Wait up to 5 seconds for connection
		for i := 0; i < 10; i++ {
			if state.Client.IsConnected() {
				break
			}
			time.Sleep(500 * time.Millisecond)
		}
		if !state.Client.IsConnected() {
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

	code, err := state.Client.PairPhone(
		ctx,
		cleaned,
		true,
		whatsmeow.PairClientChrome,
		"Chrome (Windows)",
	)
	if err != nil {
		return "", fmt.Errorf("phone pairing failed: %v", err)
	}

	return code, nil
}
