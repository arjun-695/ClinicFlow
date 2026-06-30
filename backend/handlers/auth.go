// Package handlers provides authentication and session endpoints, including
// signup, login, logout, Google OAuth, and session validation.
package handlers

import (
	"crypto/hmac"
	"crypto/md5"
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
	"backend/services"

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

	activeFacilityID, _ := GetActiveFacilityID(r, shopkeeperID)
	cacheKey := "doctor:profile:" + strconv.Itoa(shopkeeperID) + ":" + strconv.Itoa(activeFacilityID)
	var cachedResponse map[string]interface{}
	if db.GetCache(r.Context(), cacheKey, &cachedResponse) {
		writeJSON(w, http.StatusOK, cachedResponse)
		return
	}

	// Retrieve user details from DB
	var email, name, clinicName, phone, role string
	var location, photoURL, specialization, hospitalName *string
	query := `SELECT email, name, clinic_name, phone, role, location, photo_url, specialization, hospital_name FROM users WHERE id = $1`
	err = db.Pool.QueryRow(r.Context(), query, shopkeeperID).Scan(&email, &name, &clinicName, &phone, &role, &location, &photoURL, &specialization, &hospitalName)
	if err != nil {
		log.Printf("CheckSession query error: %v", err)
		writeJSON(w, http.StatusOK, map[string]interface{}{"status": "Unauthenticated"})
		return
	}

	// Fetch facilities associated with the user
	type SessionFacility struct {
		ID   int    `json:"id"`
		Name string `json:"name"`
		Type string `json:"type"`
		Role string `json:"role"`
	}
	facilities := []SessionFacility{}
	rows, err := db.Pool.Query(r.Context(), `
		SELECT f.id, f.name, f.type, uf.role 
		FROM facilities f 
		JOIN user_facilities uf ON f.id = uf.facility_id 
		JOIN users u ON uf.user_id = u.id
		WHERE uf.user_id = $1
		AND (u.role = 'DOCTOR' OR f.type = 'HOSPITAL')
	`, shopkeeperID)
	if err == nil {
		for rows.Next() {
			var f SessionFacility
			if errScan := rows.Scan(&f.ID, &f.Name, &f.Type, &f.Role); errScan == nil {
				facilities = append(facilities, f)
			}
		}
		rows.Close()
	}

	// Override active clinic/hospital name if activeFacilityID is set
	var activeFacilityName string
	for _, f := range facilities {
		if f.ID == activeFacilityID {
			activeFacilityName = f.Name
			if f.Type == "HOSPITAL" {
				hospitalName = &f.Name
			}
			break
		}
	}
	if activeFacilityName != "" {
		clinicName = activeFacilityName
	}

	userMap := map[string]interface{}{
		"id":                 shopkeeperID,
		"email":              email,
		"name":               name,
		"clinic_name":        clinicName,
		"shop_name":          clinicName, // backwards compatibility
		"phone":              phone,
		"role":               role,
		"facilities":         facilities,
		"active_facility_id": activeFacilityID,
	}
	if location != nil { userMap["location"] = *location } else { userMap["location"] = "" }
	if photoURL != nil { userMap["photo_url"] = *photoURL } else { userMap["photo_url"] = "" }
	if specialization != nil { userMap["specialization"] = *specialization } else { userMap["specialization"] = "" }
	if hospitalName != nil { userMap["hospital_name"] = *hospitalName } else { userMap["hospital_name"] = "" }

	res := map[string]interface{}{
		"status": "Authenticated",
		"user":   userMap,
	}
	db.SetCache(r.Context(), cacheKey, res, 1*time.Hour)

	writeJSON(w, http.StatusOK, res)
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
		Role       string `json:"role"`
	}

	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
		return
	}

	input.Email = strings.TrimSpace(strings.ToLower(input.Email))
	input.Name = CapitalizeName(input.Name)
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

	role := "DOCTOR"
	if input.Role != "" {
		role = strings.ToUpper(input.Role)
	}

	query := `
		INSERT INTO users (email, password_hash, name, clinic_name, phone, role)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id
	`
	var id int
	err = db.Pool.QueryRow(r.Context(), query, input.Email, string(hashed), input.Name, clinicName, input.Phone, role).Scan(&id)
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
			"role":        role,
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
	var name, clinicName, phone, role string
	var googleID string

	query := `SELECT id, password_hash, name, clinic_name, phone, google_id, role FROM users WHERE email = $1`
	err := db.Pool.QueryRow(r.Context(), query, input.Email).Scan(&id, &passwordHash, &name, &clinicName, &phone, &googleID, &role)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Invalid email or password"})
		return
	}

	if googleID != "" && passwordHash == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "This account uses Google Sign-In. Please log in with Google."})
		return
	}

	if passwordHash == "" {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Invalid email or password"})
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
			"role":        role,
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
	var dbName, dbClinicName, dbPhone, dbRole string

	query := `SELECT id, google_id, name, clinic_name, phone, role FROM users WHERE email = $1`
	err = db.Pool.QueryRow(r.Context(), query, claims.Email).Scan(&id, &googleID, &dbName, &dbClinicName, &dbPhone, &dbRole)
	
	if err != nil || id == 0 {
		// New User signup via Google
		insertQuery := `
			INSERT INTO users (email, name, clinic_name, google_id, role)
			VALUES ($1, $2, $3, $4, 'DOCTOR')
			RETURNING id
		`
		claims.Name = CapitalizeName(claims.Name)
		clinicName := claims.Name + "'s Clinic"
		err = db.Pool.QueryRow(r.Context(), insertQuery, claims.Email, claims.Name, clinicName, claims.Sub).Scan(&id)
		if err != nil {
			log.Printf("Google OAuth DB insert failed: %v", err)
			http.Error(w, "Database error", http.StatusInternalServerError)
			return
		}
	} else if googleID == "" {
		// Existing email-only user linking Google
		updateQuery := `UPDATE users SET google_id = $1 WHERE id = $2`
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
	redirectURL := frontendOrigin + "/dashboard"
	http.Redirect(w, r, redirectURL, http.StatusSeeOther)
}

// UpdateProfile updates the profile information for the doctor
func UpdateProfile(w http.ResponseWriter, r *http.Request) {
	var input struct {
		ClinicName     string `json:"clinic_name"`
		Name           string `json:"name"`
		Phone          string `json:"phone"`
		Location       string `json:"location"`
		PhotoURL       string `json:"photo_url"`
		Specialization string `json:"specialization"`
		HospitalName   string `json:"hospital_name"`
	}

	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
		return
	}

	input.Name = CapitalizeName(input.Name)

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
		UPDATE users
		SET clinic_name = $1, name = $2, phone = $3, location = $4, photo_url = $5, specialization = $6, hospital_name = $7
		WHERE id = $8
	`
	_, err := db.Pool.Exec(r.Context(), updateQuery, input.ClinicName, input.Name, input.Phone, input.Location, input.PhotoURL, input.Specialization, input.HospitalName, doctorID)
	if err != nil {
		log.Printf("UpdateProfile DB update error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "An internal error occurred"})
		return
	}

	// Fetch updated profile
	var email, name, clinicName, phone, role string
	var locationPtr, photoURLPtr, specializationPtr, hospitalNamePtr *string
	selectQuery := `SELECT email, name, clinic_name, phone, role, location, photo_url, specialization, hospital_name FROM users WHERE id = $1`
	err = db.Pool.QueryRow(r.Context(), selectQuery, doctorID).Scan(&email, &name, &clinicName, &phone, &role, &locationPtr, &photoURLPtr, &specializationPtr, &hospitalNamePtr)
	if err != nil {
		log.Printf("UpdateProfile DB select error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "An internal error occurred"})
		return
	}

	// Invalidate cache
	db.InvalidateCache(r.Context(), "doctor:profile:"+strconv.Itoa(doctorID)+":*")

	userMap := map[string]interface{}{
		"id":          doctorID,
		"email":       email,
		"name":        name,
		"clinic_name": clinicName,
		"phone":       phone,
		"role":        role,
	}
	if locationPtr != nil { userMap["location"] = *locationPtr } else { userMap["location"] = "" }
	if photoURLPtr != nil { userMap["photo_url"] = *photoURLPtr } else { userMap["photo_url"] = "" }
	if specializationPtr != nil { userMap["specialization"] = *specializationPtr } else { userMap["specialization"] = "" }
	if hospitalNamePtr != nil { userMap["hospital_name"] = *hospitalNamePtr } else { userMap["hospital_name"] = "" }

	writeJSON(w, http.StatusOK, userMap)
}

// RoleSetup completes the onboarding process for user, doctor or hospital admin roles
func RoleSetup(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Role           string `json:"role"`
		Location       string `json:"location"`
		PhotoURL       string `json:"photo_url"`
		Specialization string `json:"specialization"`
		HospitalName   string `json:"hospital_name"`
		Name           string `json:"name"`
		Phone          string `json:"phone"`
	}

	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
		return
	}

	userID, ok := r.Context().Value(ShopkeeperIDKey).(int)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	input.Role = strings.ToUpper(input.Role)
	if input.Role != "USER" && input.Role != "DOCTOR" && input.Role != "HOSPITAL_ADMIN" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid role specified"})
		return
	}

	clinicName := input.HospitalName
	if clinicName == "" {
		clinicName = input.Name + "'s Clinic"
	}

	updateQuery := `
		UPDATE users
		SET role = $1, location = $2, photo_url = $3, specialization = $4, hospital_name = $5, clinic_name = $6, name = COALESCE(NULLIF($7, ''), name), phone = COALESCE(NULLIF($8, ''), phone)
		WHERE id = $9
	`
	_, err := db.Pool.Exec(r.Context(), updateQuery, input.Role, input.Location, input.PhotoURL, input.Specialization, input.HospitalName, clinicName, input.Name, input.Phone, userID)
	if err != nil {
		log.Printf("RoleSetup update error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to save profile setup"})
		return
	}

	// Only insert default facility if user has none associated
	var exists bool
	_ = db.Pool.QueryRow(r.Context(), "SELECT EXISTS(SELECT 1 FROM user_facilities WHERE user_id = $1)", userID).Scan(&exists)
	if !exists {
		var facilityID int
		facType := "CLINIC"
		if input.Role == "HOSPITAL_ADMIN" {
			facType = "HOSPITAL"
		}
		err = db.Pool.QueryRow(r.Context(), "INSERT INTO facilities (name, type) VALUES ($1, $2) RETURNING id", clinicName, facType).Scan(&facilityID)
		if err == nil {
			_, _ = db.Pool.Exec(r.Context(), "INSERT INTO user_facilities (user_id, facility_id, role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING", userID, facilityID, input.Role)
		}
	}

	// Invalidate cache
	db.InvalidateCache(r.Context(), "doctor:profile:"+strconv.Itoa(userID)+":*")
	db.InvalidateCache(r.Context(), "user:role:"+strconv.Itoa(userID))

	writeJSON(w, http.StatusOK, map[string]string{"message": "Profile setup completed successfully"})
}

// InviteStaff allows a HOSPITAL_ADMIN to onboard a DOCTOR or PHARMACIST staff member
func InviteStaff(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Email        string   `json:"email"`
		Phone        string   `json:"phone"`
		Role         string   `json:"role"`
		AccessLevels []string `json:"access_levels"`
	}

	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
		return
	}

	adminID, ok := r.Context().Value(ShopkeeperIDKey).(int)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	// Verify caller is HOSPITAL_ADMIN
	var adminRole string
	var hospitalName string
	err := db.Pool.QueryRow(r.Context(), "SELECT role, clinic_name FROM users WHERE id = $1", adminID).Scan(&adminRole, &hospitalName)
	if err != nil || adminRole != "HOSPITAL_ADMIN" {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "Only Hospital Admins can invite staff"})
		return
	}

	input.Role = strings.ToUpper(input.Role)
	if input.Role != "DOCTOR" && input.Role != "PHARMACIST" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Staff role must be either DOCTOR or PHARMACIST"})
		return
	}

	// Generate invite token and send OTP
	b := make([]byte, 32)
	rand.Read(b)
	token := hex.EncodeToString(b)

	// Construct onboarding link
	origin := os.Getenv("WEBAUTHN_RP_ORIGIN")
	if origin == "" {
		origin = "http://localhost:3000"
	}
	onboardLink := fmt.Sprintf("%s/onboard?token=%s", origin, token)

	// Get admin's active facility
	facilityID, err := GetActiveFacilityID(r, adminID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to get active facility"})
		return
	}

	// Send OTP using the service (uses Apps Script OTP server or falls back to local WhatsApp/email)
	otpHash, rawOTP, err := services.SendOTPInvites(input.Email, input.Phone, "ClinicFlow Staff Invite", onboardLink)
	if err != nil {
		log.Printf("InviteStaff send OTP error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to dispatch invite verification code"})
		return
	}

	expiresAt := time.Now().Add(24 * time.Hour)
	insertQuery := `
		INSERT INTO user_invites (admin_id, email, role, access_levels, phone, token, otp_code, expires_at, facility_id)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		ON CONFLICT (email) DO UPDATE 
		SET admin_id = EXCLUDED.admin_id, role = EXCLUDED.role, access_levels = EXCLUDED.access_levels, phone = EXCLUDED.phone, token = EXCLUDED.token, otp_code = EXCLUDED.otp_code, expires_at = EXCLUDED.expires_at, is_used = false, facility_id = EXCLUDED.facility_id
	`
	_, err = db.Pool.Exec(r.Context(), insertQuery, adminID, input.Email, input.Role, input.AccessLevels, input.Phone, token, otpHash, expiresAt, facilityID)
	if err != nil {
		log.Printf("InviteStaff DB insert error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to generate staff invitation"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"message": "Staff invited successfully",
		"token":   token, // returned for client-side routing convenience
		"otp":     rawOTP,
	})
}

// VerifyInvite checks if an invite token & OTP are valid
func VerifyInvite(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Token string `json:"token"`
		OTP   string `json:"otp"`
	}

	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
		return
	}

	// Find the invite
	var id int
	var expectedHash string
	var expiresAt time.Time
	var isUsed bool
	var role string
	var email string
	var phone *string // can be null in db

	query := `SELECT id, otp_code, expires_at, is_used, role, email, phone FROM user_invites WHERE token = $1`
	err := db.Pool.QueryRow(r.Context(), query, input.Token).Scan(&id, &expectedHash, &expiresAt, &isUsed, &role, &email, &phone)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Invitation not found or invalid"})
		return
	}

	if isUsed {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invitation has already been used"})
		return
	}

	if time.Now().After(expiresAt) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invitation has expired"})
		return
	}

	// Compute MD5 of input OTP
	hasher := md5.New()
	hasher.Write([]byte(input.OTP))
	inputHash := hex.EncodeToString(hasher.Sum(nil))

	// Match OTP
	if inputHash != expectedHash {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Invalid verification code"})
		return
	}

	phoneVal := ""
	if phone != nil {
		phoneVal = *phone
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"message": "Invitation verified successfully",
		"email":   email,
		"role":    role,
		"phone":   phoneVal,
	})
}

// AcceptInvite registers the invited staff member using invite details
func AcceptInvite(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Token          string `json:"token"`
		OTP            string `json:"otp"`
		Password       string `json:"password"`
		Name           string `json:"name"`
		Phone          string `json:"phone"`
		Specialization string `json:"specialization"`
		Location       string `json:"location"`
		PhotoURL       string `json:"photo_url"`
	}

	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
		return
	}

	// Verify the invite again
	var inviteID int
	var adminID int
	var expectedHash string
	var expiresAt time.Time
	var isUsed bool
	var role string
	var email string
	var inviteFacilityID *int

	query := `SELECT id, admin_id, otp_code, expires_at, is_used, role, email, facility_id FROM user_invites WHERE token = $1`
	err := db.Pool.QueryRow(r.Context(), query, input.Token).Scan(&inviteID, &adminID, &expectedHash, &expiresAt, &isUsed, &role, &email, &inviteFacilityID)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Invitation not found or invalid"})
		return
	}

	if isUsed {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invitation has already been used"})
		return
	}

	if time.Now().After(expiresAt) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invitation has expired"})
		return
	}

	hasher := md5.New()
	hasher.Write([]byte(input.OTP))
	inputHash := hex.EncodeToString(hasher.Sum(nil))

	if inputHash != expectedHash {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Invalid verification code"})
		return
	}

	// Retrieve Admin's hospital/clinic name
	var hospitalName string
	err = db.Pool.QueryRow(r.Context(), "SELECT clinic_name FROM users WHERE id = $1", adminID).Scan(&hospitalName)
	if err != nil {
		hospitalName = "ClinicFlow Hospital"
	}

	// Check if user already exists
	var newUserID int
	var existingHash *string
	var existingName string
	err = db.Pool.QueryRow(r.Context(), "SELECT id, password_hash, name FROM users WHERE email = $1", email).Scan(&newUserID, &existingHash, &existingName)
	if err == nil {
		// User already exists!
		// Verify password if they have one set
		if existingHash != nil && *existingHash != "" {
			err = bcrypt.CompareHashAndPassword([]byte(*existingHash), []byte(input.Password))
			if err != nil {
				writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Incorrect password for existing account"})
				return
			}
		} else {
			// Set password if not set (e.g. Google OAuth only users)
			hashed, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
			if err == nil {
				_, _ = db.Pool.Exec(r.Context(), "UPDATE users SET password_hash = $1 WHERE id = $2", string(hashed), newUserID)
			}
		}

		// Update fields if provided
		if input.Name != "" && existingName == "" {
			_, _ = db.Pool.Exec(r.Context(), "UPDATE users SET name = $1 WHERE id = $2", input.Name, newUserID)
		}
		if input.Phone != "" {
			_, _ = db.Pool.Exec(r.Context(), "UPDATE users SET phone = $1 WHERE id = $2", input.Phone, newUserID)
		}
		if input.Specialization != "" {
			_, _ = db.Pool.Exec(r.Context(), "UPDATE users SET specialization = $1 WHERE id = $2", input.Specialization, newUserID)
		}
		if input.Location != "" {
			_, _ = db.Pool.Exec(r.Context(), "UPDATE users SET location = $1 WHERE id = $2", input.Location, newUserID)
		}
	} else {
		// Create user
		hashed, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Internal server error"})
			return
		}

		insertQuery := `
			INSERT INTO users (email, password_hash, name, clinic_name, phone, role, location, photo_url, specialization, hospital_name)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $4)
			RETURNING id
		`
		err = db.Pool.QueryRow(r.Context(), insertQuery, email, string(hashed), input.Name, hospitalName, input.Phone, role, input.Location, input.PhotoURL, input.Specialization).Scan(&newUserID)
		if err != nil {
			log.Printf("AcceptInvite user insert error: %v", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Account registration failed"})
			return
		}
	}

	// Associate staff user with the invited facility
	if inviteFacilityID != nil {
		_, _ = db.Pool.Exec(r.Context(), "INSERT INTO user_facilities (user_id, facility_id, role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING", newUserID, *inviteFacilityID, role)
	}

	// Mark invite as used
	_, _ = db.Pool.Exec(r.Context(), "UPDATE user_invites SET is_used = true WHERE id = $1", inviteID)

	// Set session cookie
	token := CreateSessionToken(newUserID)
	http.SetCookie(w, &http.Cookie{
		Name:     "auth_session",
		Value:    token,
		Path:     "/",
		MaxAge:   86400,
		HttpOnly: true,
		Secure:   isSecureCookie(),
		SameSite: http.SameSiteLaxMode,
	})

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"message": "Staff registration completed successfully",
		"user": map[string]interface{}{
			"id":          newUserID,
			"email":       email,
			"name":        input.Name,
			"clinic_name": hospitalName,
			"phone":       input.Phone,
			"role":        role,
		},
	})
}
