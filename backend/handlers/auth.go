// Package handlers provides authentication and session endpoints, including
// signup, login, logout, Google OAuth, and session validation.
package handlers

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"backend/db"

	"golang.org/x/crypto/bcrypt"
)

// ContextKey is the type for context keys
type ContextKey string

// ShopkeeperIDKey is the key to retrieve shopkeeper ID from request context
const ShopkeeperIDKey ContextKey = "shopkeeper_id"

var (
	sessionSecret []byte
)

// isSecureCookie determines whether cookies should be marked Secure based on
// the configured origin. In production (HTTPS) this returns true; in local
// development over plain HTTP it returns false so the browser will actually
// store and send the cookies.
func isSecureCookie() bool {
	origin := os.Getenv("WEBAUTHN_RP_ORIGIN")
	return strings.HasPrefix(origin, "https://")
}

// InitSessionSecret initializes the HMAC signing key for session tokens
func InitSessionSecret() {
	secret := os.Getenv("SESSION_SECRET")
	if secret == "" {
		// Generate random secret — sessions won't persist across restarts
		b := make([]byte, 32)
		if _, err := rand.Read(b); err != nil {
			log.Fatalf("Failed to generate session secret: %v", err)
		}
		sessionSecret = b
		log.Println("WARNING: SESSION_SECRET not set, generated random secret (sessions won't persist across restarts)")
		return
	}
	decoded, err := hex.DecodeString(secret)
	if err != nil {
		// Use raw string bytes as fallback
		sessionSecret = []byte(secret)
	} else {
		sessionSecret = decoded
	}
}

// CreateSessionToken creates a signed session token with timestamp and shopkeeper ID
func CreateSessionToken(shopkeeperID int) string {
	timestamp := strconv.FormatInt(time.Now().Unix(), 10)
	payload := fmt.Sprintf("%s.%d", timestamp, shopkeeperID)
	mac := hmac.New(sha256.New, sessionSecret)
	mac.Write([]byte(payload))
	sig := hex.EncodeToString(mac.Sum(nil))
	token := fmt.Sprintf("%s.%s", payload, sig)
	return base64.URLEncoding.EncodeToString([]byte(token))
}

// ValidateSessionToken validates a signed session token, checks expiry, returns shopkeeper ID
func ValidateSessionToken(token string) (int, error) {
	decoded, err := base64.URLEncoding.DecodeString(token)
	if err != nil {
		return 0, fmt.Errorf("invalid token encoding")
	}

	parts := strings.SplitN(string(decoded), ".", 3)
	if len(parts) != 3 {
		return 0, fmt.Errorf("invalid token format")
	}

	timestamp, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		return 0, fmt.Errorf("invalid timestamp")
	}

	shopkeeperID, err := strconv.Atoi(parts[1])
	if err != nil {
		return 0, fmt.Errorf("invalid shopkeeper ID")
	}

	// Check 24-hour expiry
	if time.Now().Unix()-timestamp > 24*3600 {
		return 0, fmt.Errorf("session expired")
	}

	// Verify HMAC signature
	payload := fmt.Sprintf("%s.%s", parts[0], parts[1])
	mac := hmac.New(sha256.New, sessionSecret)
	mac.Write([]byte(payload))
	expectedSig := hex.EncodeToString(mac.Sum(nil))
	if !hmac.Equal([]byte(parts[2]), []byte(expectedSig)) {
		return 0, fmt.Errorf("invalid signature")
	}

	return shopkeeperID, nil
}

// writeJSON writes a JSON response with the given status code
func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

// CheckSession returns the current user profile if authenticated
func CheckSession(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie("auth_session")
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]interface{}{"status": "Unauthenticated"})
		return
	}

	shopkeeperID, err := ValidateSessionToken(cookie.Value)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]interface{}{"status": "Unauthenticated"})
		return
	}

	// Retrieve doctor details from DB
	var email, name, clinicName, phone string
	query := `SELECT email, name, clinic_name, phone FROM doctors WHERE id = $1`
	err = db.Pool.QueryRow(r.Context(), query, shopkeeperID).Scan(&email, &name, &clinicName, &phone)
	if err != nil {
		log.Printf("CheckSession query error: %v", err)
		writeJSON(w, http.StatusOK, map[string]interface{}{"status": "Unauthenticated"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status": "Authenticated",
		"user": map[string]interface{}{
			"id":          shopkeeperID,
			"email":       email,
			"name":        name,
			"clinic_name": clinicName,
			"shop_name":   clinicName, // backwards compatibility
			"phone":       phone,
		},
	})
}

// Logout clears the auth session cookie
func Logout(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name:     "auth_session",
		Value:    "",
		Path:     "/",
		Expires:  time.Unix(0, 0),
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   isSecureCookie(),
		SameSite: http.SameSiteLaxMode,
	})
	writeJSON(w, http.StatusOK, map[string]string{"message": "Logged out successfully"})
}

// Signup handles registering a new shopkeeper account
func Signup(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Email      string `json:"email"`
		Password   string `json:"password"`
		Name       string `json:"name"`
		ClinicName string `json:"clinic_name"`
		ShopName   string `json:"shop_name"`
		Phone      string `json:"phone"`
	}

	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
		return
	}

	input.Email = strings.TrimSpace(strings.ToLower(input.Email))
	input.Name = strings.TrimSpace(input.Name)
	clinicName := input.ClinicName
	if clinicName == "" {
		clinicName = input.ShopName
	}
	clinicName = strings.TrimSpace(clinicName)
	input.Phone = strings.TrimSpace(input.Phone)

	if input.Email == "" || input.Password == "" || input.Name == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Email, password, and name are required"})
		return
	}

	if len(input.Password) < 6 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Password must be at least 6 characters"})
		return
	}

	hashed, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
	if err != nil {
		log.Printf("Bcrypt hash error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "An internal error occurred"})
		return
	}

	if clinicName == "" {
		clinicName = "My Clinic"
	}

	query := `
		INSERT INTO doctors (email, password_hash, name, clinic_name, phone)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id
	`
	var id int
	err = db.Pool.QueryRow(r.Context(), query, input.Email, string(hashed), input.Name, clinicName, input.Phone).Scan(&id)
	if err != nil {
		log.Printf("Signup DB error: %v", err)
		if strings.Contains(err.Error(), "unique constraint") {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "An account with this email already exists"})
		} else {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "An internal error occurred"})
		}
		return
	}

	token := CreateSessionToken(id)
	http.SetCookie(w, &http.Cookie{
		Name:     "auth_session",
		Value:    token,
		Path:     "/",
		MaxAge:   86400, // 24 hours
		HttpOnly: true,
		Secure:   isSecureCookie(),
		SameSite: http.SameSiteLaxMode,
	})

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"message": "Account created successfully",
		"user": map[string]interface{}{
			"id":          id,
			"email":       input.Email,
			"name":        input.Name,
			"clinic_name": clinicName,
			"shop_name":   clinicName,
			"phone":       input.Phone,
		},
	})
}

// Login handles logging in with Email & Password
func Login(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}

	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
		return
	}

	input.Email = strings.TrimSpace(strings.ToLower(input.Email))

	if input.Email == "" || input.Password == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Email and password are required"})
		return
	}

	var id int
	var passwordHash string
	var name, clinicName, phone string

	query := `SELECT id, password_hash, name, clinic_name, phone FROM doctors WHERE email = $1`
	err := db.Pool.QueryRow(r.Context(), query, input.Email).Scan(&id, &passwordHash, &name, &clinicName, &phone)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Invalid email or password"})
		return
	}

	if passwordHash == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "This account uses Google Sign-In. Please log in with Google."})
		return
	}

	err = bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(input.Password))
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Invalid email or password"})
		return
	}

	token := CreateSessionToken(id)
	http.SetCookie(w, &http.Cookie{
		Name:     "auth_session",
		Value:    token,
		Path:     "/",
		MaxAge:   86400, // 24 hours
		HttpOnly: true,
		Secure:   isSecureCookie(),
		SameSite: http.SameSiteLaxMode,
	})

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"message": "Logged in successfully",
		"user": map[string]interface{}{
			"id":          id,
			"email":       input.Email,
			"name":        name,
			"clinic_name": clinicName,
			"shop_name":   clinicName,
			"phone":       phone,
		},
	})
}

// GoogleLogin redirects the user to the Google OAuth consent screen
func GoogleLogin(w http.ResponseWriter, r *http.Request) {
	clientID := os.Getenv("GOOGLE_CLIENT_ID")
	redirectURI := os.Getenv("GOOGLE_REDIRECT_URI")
	if clientID == "" || redirectURI == "" {
		http.Error(w, "Google OAuth is not configured on the server", http.StatusNotImplemented)
		return
	}

	// Generate a simple random state to prevent CSRF
	b := make([]byte, 16)
	rand.Read(b)
	state := hex.EncodeToString(b)

	// Save state in a temporary cookie
	http.SetCookie(w, &http.Cookie{
		Name:     "google_oauth_state",
		Value:    state,
		Path:     "/",
		MaxAge:   300, // 5 minutes
		HttpOnly: true,
		Secure:   isSecureCookie(),
		SameSite: http.SameSiteLaxMode,
	})

	// Capture the frontend origin from Referer header
	frontendOrigin := "http://localhost:3000" // default fallback
	if ref := r.Header.Get("Referer"); ref != "" {
		if u, err := url.Parse(ref); err == nil {
			frontendOrigin = u.Scheme + "://" + u.Host
		}
	}

	// Save origin in a temporary cookie
	http.SetCookie(w, &http.Cookie{
		Name:     "google_oauth_origin",
		Value:    frontendOrigin,
		Path:     "/",
		MaxAge:   300, // 5 minutes
		HttpOnly: true,
		Secure:   isSecureCookie(),
		SameSite: http.SameSiteLaxMode,
	})

	googleAuthURL := fmt.Sprintf(
		"https://accounts.google.com/o/oauth2/v2/auth?client_id=%s&redirect_uri=%s&response_type=code&scope=openid%%20email%%20profile&state=%s",
		url.QueryEscape(clientID),
		url.QueryEscape(redirectURI),
		state,
	)

	http.Redirect(w, r, googleAuthURL, http.StatusTemporaryRedirect)
}

// GoogleCallback processes the callback redirect from Google
func GoogleCallback(w http.ResponseWriter, r *http.Request) {
	clientID := os.Getenv("GOOGLE_CLIENT_ID")
	clientSecret := os.Getenv("GOOGLE_CLIENT_SECRET")
	redirectURI := os.Getenv("GOOGLE_REDIRECT_URI")
	
	// Determine frontend origin dynamically from cookie
	frontendOrigin := "http://localhost:3000"
	if originCookie, err := r.Cookie("google_oauth_origin"); err == nil && originCookie.Value != "" {
		frontendOrigin = originCookie.Value
	} else if envOrigin := os.Getenv("WEBAUTHN_RP_ORIGIN"); envOrigin != "" {
		frontendOrigin = envOrigin
	}

	if clientID == "" || clientSecret == "" || redirectURI == "" {
		http.Error(w, "Google OAuth is not configured on the server", http.StatusNotImplemented)
		return
	}

	code := r.URL.Query().Get("code")
	state := r.URL.Query().Get("state")

	// Validate state
	stateCookie, err := r.Cookie("google_oauth_state")
	if err != nil || stateCookie.Value != state {
		http.Error(w, "State verification failed. Possible CSRF attack.", http.StatusBadRequest)
		return
	}

	// Clear the state and origin cookies
	http.SetCookie(w, &http.Cookie{
		Name:     "google_oauth_state",
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		Expires:  time.Unix(0, 0),
		HttpOnly: true,
		Secure:   isSecureCookie(),
	})
	http.SetCookie(w, &http.Cookie{
		Name:     "google_oauth_origin",
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		Expires:  time.Unix(0, 0),
		HttpOnly: true,
		Secure:   isSecureCookie(),
	})

	// Exchange Auth Code for Tokens
	tokenReqVal := url.Values{}
	tokenReqVal.Set("code", code)
	tokenReqVal.Set("client_id", clientID)
	tokenReqVal.Set("client_secret", clientSecret)
	tokenReqVal.Set("redirect_uri", redirectURI)
	tokenReqVal.Set("grant_type", "authorization_code")

	resp, err := http.PostForm("https://oauth2.googleapis.com/token", tokenReqVal)
	if err != nil {
		log.Printf("Google Token exchange request failed: %v", err)
		http.Error(w, "Failed to connect to Google", http.StatusInternalServerError)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		log.Printf("Google token exchange returned non-200 code: %d, body: %s", resp.StatusCode, string(bodyBytes))
		http.Error(w, "Google token exchange failed", http.StatusBadRequest)
		return
	}

	var tokenResponse struct {
		IDToken string `json:"id_token"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&tokenResponse); err != nil {
		http.Error(w, "Failed to parse Google response", http.StatusInternalServerError)
		return
	}

	// Decode ID Token JWT Payload
	parts := strings.Split(tokenResponse.IDToken, ".")
	if len(parts) < 2 {
		http.Error(w, "Invalid ID Token received", http.StatusBadRequest)
		return
	}

	payloadSegment := parts[1]
	if l := len(payloadSegment) % 4; l > 0 {
		payloadSegment += strings.Repeat("=", 4-l)
	}

	decodedBytes, err := base64.URLEncoding.DecodeString(payloadSegment)
	if err != nil {
		log.Printf("Base64 decode error on ID Token payload: %v", err)
		http.Error(w, "Failed to decode profile details", http.StatusInternalServerError)
		return
	}

	var claims struct {
		Email string `json:"email"`
		Name  string `json:"name"`
		Sub   string `json:"sub"` // Google ID
	}
	if err := json.Unmarshal(decodedBytes, &claims); err != nil {
		http.Error(w, "Failed to unmarshal profile details", http.StatusInternalServerError)
		return
	}

	claims.Email = strings.TrimSpace(strings.ToLower(claims.Email))
	if claims.Email == "" {
		http.Error(w, "No email address found in Google account profile", http.StatusBadRequest)
		return
	}

	// Check if user exists, otherwise create them
	var id int
	var googleID string
	var dbName, dbClinicName, dbPhone string

	query := `SELECT id, google_id, name, clinic_name, phone FROM doctors WHERE email = $1`
	err = db.Pool.QueryRow(r.Context(), query, claims.Email).Scan(&id, &googleID, &dbName, &dbClinicName, &dbPhone)
	
	if err != nil || id == 0 {
		// New User signup via Google
		insertQuery := `
			INSERT INTO doctors (email, name, clinic_name, google_id)
			VALUES ($1, $2, $3, $4)
			RETURNING id
		`
		clinicName := claims.Name + "'s Clinic"
		err = db.Pool.QueryRow(r.Context(), insertQuery, claims.Email, claims.Name, clinicName, claims.Sub).Scan(&id)
		if err != nil {
			log.Printf("Google OAuth DB insert failed: %v", err)
			http.Error(w, "Database error", http.StatusInternalServerError)
			return
		}
	} else if googleID == "" {
		// Existing email-only user linking Google
		updateQuery := `UPDATE doctors SET google_id = $1 WHERE id = $2`
		_, err = db.Pool.Exec(r.Context(), updateQuery, claims.Sub, id)
		if err != nil {
			log.Printf("Google OAuth DB update failed: %v", err)
			http.Error(w, "Database error", http.StatusInternalServerError)
			return
		}
	}

	// Login and set session cookie
	token := CreateSessionToken(id)
	http.SetCookie(w, &http.Cookie{
		Name:     "auth_session",
		Value:    token,
		Path:     "/",
		MaxAge:   86400, // 24 hours
		HttpOnly: true,
		Secure:   isSecureCookie(),
		SameSite: http.SameSiteLaxMode,
	})

	// Redirect back to frontend dashboard
	http.Redirect(w, r, frontendOrigin+"/dashboard", http.StatusSeeOther)
}

// UpdateProfile updates the profile information for the doctor
func UpdateProfile(w http.ResponseWriter, r *http.Request) {
	var input struct {
		ClinicName string `json:"clinic_name"`
		Name       string `json:"name"`
		Phone      string `json:"phone"`
	}

	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
		return
	}

	if input.Name == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Name is required"})
		return
	}

	if input.ClinicName == "" {
		input.ClinicName = "My Clinic"
	}

	doctorID, ok := r.Context().Value(ShopkeeperIDKey).(int)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	updateQuery := `
		UPDATE doctors
		SET clinic_name = $1, name = $2, phone = $3
		WHERE id = $4
	`
	_, err := db.Pool.Exec(r.Context(), updateQuery, input.ClinicName, input.Name, input.Phone, doctorID)
	if err != nil {
		log.Printf("UpdateProfile DB update error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "An internal error occurred"})
		return
	}

	// Fetch updated profile
	var email, name, clinicName, phone string
	selectQuery := `SELECT email, name, clinic_name, phone FROM doctors WHERE id = $1`
	err = db.Pool.QueryRow(r.Context(), selectQuery, doctorID).Scan(&email, &name, &clinicName, &phone)
	if err != nil {
		log.Printf("UpdateProfile DB select error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "An internal error occurred"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"id":          doctorID,
		"email":       email,
		"name":        name,
		"clinic_name": clinicName,
		"phone":       phone,
	})
}
