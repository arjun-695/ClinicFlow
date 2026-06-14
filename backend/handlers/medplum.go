package handlers

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"math/big"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"backend/db"

	"github.com/golang-jwt/jwt/v5"
)

// MedplumClaims represents the custom JWT claims returned by Medplum access tokens
type MedplumClaims struct {
	Username string `json:"username"`
	Scope    string `json:"scope"`
	Profile  string `json:"profile"`
	Email    string `json:"email"`
	jwt.RegisteredClaims
}

// JWK represents a single JSON Web Key from the JWKS endpoint
type JWK struct {
	Kid string `json:"kid"`
	Kty string `json:"kty"`
	Alg string `json:"alg"`
	Use string `json:"use"`
	N   string `json:"n,omitempty"`
	E   string `json:"e,omitempty"`
	Crv string `json:"crv,omitempty"`
	X   string `json:"x,omitempty"`
	Y   string `json:"y,omitempty"`
}

// JWKS represents a JSON Web Key Set
type JWKS struct {
	Keys []JWK `json:"keys"`
}

var (
	jwksCache      *JWKS
	jwksCacheMutex sync.RWMutex
	jwksCacheTime  time.Time
)

// FetchJWKS retrieves and caches the JSON Web Key Set from Medplum
func FetchJWKS() (*JWKS, error) {
	jwksCacheMutex.RLock()
	// Cache JWKS for 1 hour to ensure high performance
	if jwksCache != nil && time.Since(jwksCacheTime) < 1*time.Hour {
		defer jwksCacheMutex.RUnlock()
		return jwksCache, nil
	}
	jwksCacheMutex.RUnlock()

	jwksCacheMutex.Lock()
	defer jwksCacheMutex.Unlock()

	// Double-check after acquiring write lock
	if jwksCache != nil && time.Since(jwksCacheTime) < 1*time.Hour {
		return jwksCache, nil
	}

	jwksURL := os.Getenv("MEDPLUM_JWKS_URL")
	if jwksURL == "" {
		return nil, fmt.Errorf("MEDPLUM_JWKS_URL is not configured")
	}

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get(jwksURL)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch JWKS: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("JWKS endpoint returned status: %d", resp.StatusCode)
	}

	var jwks JWKS
	if err := json.NewDecoder(resp.Body).Decode(&jwks); err != nil {
		return nil, fmt.Errorf("failed to parse JWKS payload: %w", err)
	}

	jwksCache = &jwks
	jwksCacheTime = time.Now()
	log.Printf("[Medplum Sidecar] Successfully fetched and cached %d public key(s)", len(jwks.Keys))

	return jwksCache, nil
}

// parseRSAPublicKey parses RSA parameters (modulus, exponent) into an rsa.PublicKey
func parseRSAPublicKey(nStr, eStr string) (*rsa.PublicKey, error) {
	nBytes, err := base64.RawURLEncoding.DecodeString(strings.TrimRight(nStr, "="))
	if err != nil {
		nBytes, err = base64.URLEncoding.DecodeString(nStr)
		if err != nil {
			return nil, fmt.Errorf("failed to decode RSA modulus n: %w", err)
		}
	}
	eBytes, err := base64.RawURLEncoding.DecodeString(strings.TrimRight(eStr, "="))
	if err != nil {
		eBytes, err = base64.URLEncoding.DecodeString(eStr)
		if err != nil {
			return nil, fmt.Errorf("failed to decode RSA exponent e: %w", err)
		}
	}
	var e int
	for _, b := range eBytes {
		e = (e << 8) + int(b)
	}
	return &rsa.PublicKey{
		N: new(big.Int).SetBytes(nBytes),
		E: e,
	}, nil
}

// parseECPublicKey parses Elliptic Curve parameters into an ecdsa.PublicKey
func parseECPublicKey(crv, xStr, yStr string) (*ecdsa.PublicKey, error) {
	var curve elliptic.Curve
	switch crv {
	case "P-256":
		curve = elliptic.P256()
	case "P-384":
		curve = elliptic.P384()
	case "P-521":
		curve = elliptic.P521()
	default:
		return nil, fmt.Errorf("unsupported curve: %s", crv)
	}

	xBytes, err := base64.RawURLEncoding.DecodeString(strings.TrimRight(xStr, "="))
	if err != nil {
		xBytes, err = base64.URLEncoding.DecodeString(xStr)
		if err != nil {
			return nil, fmt.Errorf("failed to decode EC coordinate x: %w", err)
		}
	}

	yBytes, err := base64.RawURLEncoding.DecodeString(strings.TrimRight(yStr, "="))
	if err != nil {
		yBytes, err = base64.URLEncoding.DecodeString(yStr)
		if err != nil {
			return nil, fmt.Errorf("failed to decode EC coordinate y: %w", err)
		}
	}

	return &ecdsa.PublicKey{
		Curve: curve,
		X:     new(big.Int).SetBytes(xBytes),
		Y:     new(big.Int).SetBytes(yBytes),
	}, nil
}

// ValidateMedplumToken parses and validates a Medplum JWT access token using the cached JWKS
func ValidateMedplumToken(tokenString string) (*MedplumClaims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &MedplumClaims{}, func(token *jwt.Token) (interface{}, error) {
		// Verify signature algorithm
		if _, ok := token.Method.(*jwt.SigningMethodRSA); !ok {
			if _, ok := token.Method.(*jwt.SigningMethodECDSA); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
			}
		}

		kid, ok := token.Header["kid"].(string)
		if !ok {
			return nil, fmt.Errorf("missing kid in token header")
		}

		jwks, err := FetchJWKS()
		if err != nil {
			return nil, err
		}

		// Look for matching key
		for _, key := range jwks.Keys {
			if key.Kid == kid {
				if key.Kty == "RSA" {
					return parseRSAPublicKey(key.N, key.E)
				} else if key.Kty == "EC" {
					return parseECPublicKey(key.Crv, key.X, key.Y)
				}
				return nil, fmt.Errorf("unsupported key type: %s", key.Kty)
			}
		}

		return nil, fmt.Errorf("key id %s not found in JWKS", kid)
	})

	if err != nil {
		return nil, err
	}

	claims, ok := token.Claims.(*MedplumClaims)
	if !ok || !token.Valid {
		return nil, fmt.Errorf("invalid token claims")
	}

	// Validate issuer if configured
	expectedIssuer := os.Getenv("MEDPLUM_ISSUER")
	if expectedIssuer != "" && claims.Issuer != expectedIssuer {
		return nil, fmt.Errorf("invalid token issuer: %s (expected %s)", claims.Issuer, expectedIssuer)
	}

	return claims, nil
}

// nameFromEmail parses a capitalized doctor name from their email address username
func nameFromEmail(email string) string {
	parts := strings.Split(email, "@")
	if len(parts) == 0 {
		return "Doctor"
	}
	username := parts[0]
	username = strings.ReplaceAll(username, ".", " ")
	username = strings.ReplaceAll(username, "_", " ")
	words := strings.Fields(username)
	for i, word := range words {
		if len(word) > 0 {
			words[i] = strings.ToUpper(word[:1]) + strings.ToLower(word[1:])
		}
	}
	return strings.Join(words, " ")
}

// GetOrCreateDoctorFromClaims checks if a doctor exists in the database by email, 
// and creates one if they do not exist (auto-provisioning)
func GetOrCreateDoctorFromClaims(ctx context.Context, claims *MedplumClaims) (int, error) {
	email := strings.TrimSpace(strings.ToLower(claims.Email))
	if email == "" {
		// Fallback to username if email scope is not present in token
		if claims.Username != "" && strings.Contains(claims.Username, "@") {
			email = strings.TrimSpace(strings.ToLower(claims.Username))
		} else {
			return 0, fmt.Errorf("medplum token does not contain a valid email address")
		}
	}

	var id int
	query := `SELECT id FROM doctors WHERE email = $1`
	err := db.Pool.QueryRow(ctx, query, email).Scan(&id)
	if err == nil {
		return id, nil
	}

	// User not found in DB - Auto-provision profile
	name := nameFromEmail(email)
	clinicName := name + "'s Clinic"

	insertQuery := `
		INSERT INTO doctors (email, password_hash, name, clinic_name, phone)
		VALUES ($1, NULL, $2, $3, '')
		RETURNING id
	`
	err = db.Pool.QueryRow(ctx, insertQuery, email, name, clinicName).Scan(&id)
	if err != nil {
		return 0, fmt.Errorf("failed to auto-provision doctor account: %w", err)
	}

	log.Printf("[Medplum Sidecar] Auto-provisioned local account for doctor: %s (ID: %d)", email, id)
	return id, nil
}

// TryMedplumLogin attempts to authenticate credentials against Medplum, exchanges the code,
// auto-provisions the user locally, and returns the doctor ID, name, clinic_name, phone, and access token.
func TryMedplumLogin(ctx context.Context, email, password string) (int, string, string, string, string, error) {
	issuer := os.Getenv("MEDPLUM_ISSUER")
	if issuer == "" {
		return 0, "", "", "", "", fmt.Errorf("MEDPLUM_ISSUER is not configured")
	}
	baseURL := strings.TrimSuffix(issuer, "/")

	// 1. Authenticate with Medplum /auth/login
	loginURL := baseURL + "/auth/login"
	loginBody, err := json.Marshal(map[string]string{
		"email":     email,
		"password":  password,
		"projectId": "new", // default to 'new' project creation if not exist
	})
	if err != nil {
		return 0, "", "", "", "", fmt.Errorf("failed to marshal login body: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", loginURL, strings.NewReader(string(loginBody)))
	if err != nil {
		return 0, "", "", "", "", fmt.Errorf("failed to create login request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return 0, "", "", "", "", fmt.Errorf("failed to call Medplum login: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		var errData map[string]interface{}
		json.NewDecoder(resp.Body).Decode(&errData)
		if errData != nil {
			if errMsg, ok := errData["error"].(string); ok {
				return 0, "", "", "", "", fmt.Errorf("%s", errMsg)
			}
		}
		return 0, "", "", "", "", fmt.Errorf("Medplum login failed with status: %d", resp.StatusCode)
	}

	var loginData struct {
		Code string `json:"code"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&loginData); err != nil {
		return 0, "", "", "", "", fmt.Errorf("failed to parse Medplum login response: %w", err)
	}

	if loginData.Code == "" {
		return 0, "", "", "", "", fmt.Errorf("no authorization code returned from Medplum")
	}

	// 2. Exchange authorization code for token via /oauth2/token
	tokenURL := baseURL + "/oauth2/token"
	formValues := strings.NewReader(fmt.Sprintf("grant_type=authorization_code&code=%s", loginData.Code))
	tokenReq, err := http.NewRequestWithContext(ctx, "POST", tokenURL, formValues)
	if err != nil {
		return 0, "", "", "", "", fmt.Errorf("failed to create token request: %w", err)
	}
	tokenReq.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	tokenResp, err := client.Do(tokenReq)
	if err != nil {
		return 0, "", "", "", "", fmt.Errorf("failed to call Medplum token exchange: %w", err)
	}
	defer tokenResp.Body.Close()

	if tokenResp.StatusCode != http.StatusOK {
		return 0, "", "", "", "", fmt.Errorf("Medplum token exchange failed with status: %d", tokenResp.StatusCode)
	}

	var tokenData struct {
		AccessToken string `json:"access_token"`
	}
	if err := json.NewDecoder(tokenResp.Body).Decode(&tokenData); err != nil {
		return 0, "", "", "", "", fmt.Errorf("failed to parse Medplum token response: %w", err)
	}

	if tokenData.AccessToken == "" {
		return 0, "", "", "", "", fmt.Errorf("no access token received from Medplum")
	}

	// 3. Validate access token and auto-provision the doctor locally
	claims, err := ValidateMedplumToken(tokenData.AccessToken)
	if err != nil {
		return 0, "", "", "", "", fmt.Errorf("failed to validate newly acquired Medplum token: %w", err)
	}

	doctorID, err := GetOrCreateDoctorFromClaims(ctx, claims)
	if err != nil {
		return 0, "", "", "", "", fmt.Errorf("failed to provision doctor: %w", err)
	}

	// Retrieve latest doctor details from DB
	var dbName, dbClinicName, dbPhone string
	query := `SELECT name, clinic_name, phone FROM doctors WHERE id = $1`
	err = db.Pool.QueryRow(ctx, query, doctorID).Scan(&dbName, &dbClinicName, &dbPhone)
	if err != nil {
		return 0, "", "", "", "", fmt.Errorf("failed to fetch doctor details: %w", err)
	}

	return doctorID, dbName, dbClinicName, dbPhone, tokenData.AccessToken, nil
}

// TryMedplumGoogleLogin authenticates a Google ID Token against Medplum, exchanges the code,
// and returns the Medplum access token.
func TryMedplumGoogleLogin(ctx context.Context, idToken string) (string, error) {
	issuer := os.Getenv("MEDPLUM_ISSUER")
	if issuer == "" {
		return "", fmt.Errorf("MEDPLUM_ISSUER is not configured")
	}
	baseURL := strings.TrimSuffix(issuer, "/")

	googleClientID := os.Getenv("GOOGLE_CLIENT_ID")
	if googleClientID == "" {
		return "", fmt.Errorf("GOOGLE_CLIENT_ID is not configured")
	}

	// 1. Authenticate with Medplum /auth/google
	googleURL := baseURL + "/auth/google"
	bodyData, err := json.Marshal(map[string]interface{}{
		"googleClientId":   googleClientID,
		"googleCredential": idToken,
		"projectId":        "new",
		"createUser":       true,
	})
	if err != nil {
		return "", fmt.Errorf("failed to marshal Google login body: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", googleURL, strings.NewReader(string(bodyData)))
	if err != nil {
		return "", fmt.Errorf("failed to create Google login request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("failed to call Medplum Google login: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		var errData map[string]interface{}
		json.NewDecoder(resp.Body).Decode(&errData)
		if errData != nil {
			if errMsg, ok := errData["error"].(string); ok {
				return "", fmt.Errorf("%s", errMsg)
			}
		}
		return "", fmt.Errorf("Medplum Google login failed with status: %d", resp.StatusCode)
	}

	var loginData struct {
		Code string `json:"code"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&loginData); err != nil {
		return "", fmt.Errorf("failed to parse Medplum Google login response: %w", err)
	}

	if loginData.Code == "" {
		return "", fmt.Errorf("no authorization code returned from Medplum")
	}

	// 2. Exchange code for tokens via /oauth2/token
	tokenURL := baseURL + "/oauth2/token"
	formValues := strings.NewReader(fmt.Sprintf("grant_type=authorization_code&code=%s", loginData.Code))
	tokenReq, err := http.NewRequestWithContext(ctx, "POST", tokenURL, formValues)
	if err != nil {
		return "", fmt.Errorf("failed to create token request: %w", err)
	}
	tokenReq.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	tokenResp, err := client.Do(tokenReq)
	if err != nil {
		return "", fmt.Errorf("failed to call Medplum token exchange: %w", err)
	}
	defer tokenResp.Body.Close()

	if tokenResp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("Medplum token exchange failed with status: %d", tokenResp.StatusCode)
	}

	var tokenData struct {
		AccessToken string `json:"access_token"`
	}
	if err := json.NewDecoder(tokenResp.Body).Decode(&tokenData); err != nil {
		return "", fmt.Errorf("failed to parse Medplum token response: %w", err)
	}

	return tokenData.AccessToken, nil
}
