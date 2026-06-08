// Package services uploads receipt files to Supabase Storage and returns the
// public URL used by contract records.
package services

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

// Allowed MIME types for receipt uploads
var allowedMIMETypes = map[string]bool{
	"image/png":       true,
	"image/jpeg":      true,
	"application/pdf": true,
}

// Filename sanitization regex — allow only alphanumeric, underscore, dash, dot
var safeFilenameRegex = regexp.MustCompile(`[^a-zA-Z0-9_\-.]`)

// UploadReceipt uploads file bytes to Supabase Storage and returns the public URL
func UploadReceipt(fileBytes []byte, originalFilename string, mimeType string) (string, error) {
	projectRef := os.Getenv("SUPABASE_PROJECT_REF")
	secretKey := os.Getenv("SUPABASE_SECRET_KEY")
	bucketName := os.Getenv("SUPABASE_BUCKET_NAME")

	if projectRef == "" || secretKey == "" || bucketName == "" {
		return "", fmt.Errorf("missing Supabase environment configuration")
	}

	// Enforce file size limit (5MB)
	if len(fileBytes) > 5*1024*1024 {
		return "", fmt.Errorf("file size exceeds 5MB limit")
	}

	// Detect actual MIME type from file content (don't trust client header)
	detectedMIME := http.DetectContentType(fileBytes)
	if !allowedMIMETypes[detectedMIME] {
		return "", fmt.Errorf("file type not allowed: %s (only PNG, JPEG, PDF accepted)", detectedMIME)
	}

	// Use detected MIME type, not client-provided
	mimeType = detectedMIME

	// Sanitize filename: strip path separators, only allow safe characters
	ext := filepath.Ext(originalFilename)
	base := strings.TrimSuffix(filepath.Base(originalFilename), ext)
	base = safeFilenameRegex.ReplaceAllString(base, "_")
	if base == "" {
		base = "receipt"
	}
	// Limit base filename length
	if len(base) > 50 {
		base = base[:50]
	}
	uniqueFilename := fmt.Sprintf("%s_%d%s", base, time.Now().UnixNano(), ext)

	// API URL for uploading to the bucket
	uploadURL := fmt.Sprintf("https://%s.supabase.co/storage/v1/object/%s/%s", projectRef, bucketName, uniqueFilename)

	req, err := http.NewRequest("POST", uploadURL, bytes.NewReader(fileBytes))
	if err != nil {
		return "", fmt.Errorf("failed to create upload request: %v", err)
	}

	req.Header.Set("Authorization", "Bearer "+secretKey)
	req.Header.Set("Content-Type", mimeType)

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("failed to send upload request to Supabase: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("supabase upload failed with status %d: %s", resp.StatusCode, string(respBody))
	}

	// Construct and return the public URL for accessing the receipt
	publicURL := fmt.Sprintf("https://%s.supabase.co/storage/v1/object/public/%s/%s", projectRef, bucketName, uniqueFilename)
	return publicURL, nil
}
