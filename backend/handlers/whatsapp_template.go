package handlers

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"backend/db"
)

type WhatsAppTemplate struct {
	ID          int       `json:"id"`
	DoctorID    int       `json:"doctor_id"`
	TemplateKey string    `json:"template_key"`
	Greeting    string    `json:"greeting"`
	Body        string    `json:"body"`
	Footer      string    `json:"footer"`
	CreatedAt   time.Time `json:"created_at"`
}

// Default templates
var defaultTemplates = map[string]WhatsAppTemplate{
	"bill_notification": {
		TemplateKey: "bill_notification",
		Greeting:    "Dear {patient_name},",
		Body:        "Your medical bill of *₹{total_amount}* has been generated at *{clinic_name}*.\n{payment_details}Outstanding Balance: *₹{remaining_amount}*\n\n*Details / Prescribed Items:*\n{items_list}",
		Footer:      "View your complete transaction receipt here:\n{bill_link}",
	},
	"overdue_reminder": {
		TemplateKey: "overdue_reminder",
		Greeting:    "Dear {patient_name},",
		Body:        "This is a friendly reminder from {clinic_name} that an outstanding balance of ₹{remaining_amount} is due for your bill ({description}).",
		Footer:      "You can view your details and receipt here: {bill_link}",
	},
}

// GetWhatsAppTemplates returns doctor's saved templates or defaults
func GetWhatsAppTemplates(w http.ResponseWriter, r *http.Request) {
	doctorID, ok := r.Context().Value(ShopkeeperIDKey).(int)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	query := `SELECT id, doctor_id, template_key, greeting, body, footer, created_at FROM whatsapp_templates WHERE doctor_id = $1`
	rows, err := db.Pool.Query(r.Context(), query, doctorID)
	if err != nil {
		log.Printf("GetWhatsAppTemplates DB error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "An internal error occurred"})
		return
	}
	defer rows.Close()

	saved := make(map[string]WhatsAppTemplate)
	for rows.Next() {
		var t WhatsAppTemplate
		if err := rows.Scan(&t.ID, &t.DoctorID, &t.TemplateKey, &t.Greeting, &t.Body, &t.Footer, &t.CreatedAt); err != nil {
			log.Printf("GetWhatsAppTemplates scan error: %v", err)
			continue
		}
		saved[t.TemplateKey] = t
	}

	// Merge with defaults: return saved if exists, otherwise default
	result := make(map[string]WhatsAppTemplate)
	for key, def := range defaultTemplates {
		if s, ok := saved[key]; ok {
			result[key] = s
		} else {
			def.DoctorID = doctorID
			result[key] = def
		}
	}

	writeJSON(w, http.StatusOK, result)
}

// UpdateWhatsAppTemplate upserts a template for a specific key
func UpdateWhatsAppTemplate(w http.ResponseWriter, r *http.Request) {
	doctorID, ok := r.Context().Value(ShopkeeperIDKey).(int)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	var input struct {
		TemplateKey string `json:"template_key"`
		Greeting    string `json:"greeting"`
		Body        string `json:"body"`
		Footer      string `json:"footer"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
		return
	}

	if input.TemplateKey != "bill_notification" && input.TemplateKey != "overdue_reminder" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Template key must be 'bill_notification' or 'overdue_reminder'"})
		return
	}

	query := `
		INSERT INTO whatsapp_templates (doctor_id, template_key, greeting, body, footer)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (doctor_id, template_key)
		DO UPDATE SET greeting = $3, body = $4, footer = $5
		RETURNING id, created_at
	`
	var id int
	var createdAt time.Time
	err := db.Pool.QueryRow(r.Context(), query, doctorID, input.TemplateKey, input.Greeting, input.Body, input.Footer).Scan(&id, &createdAt)
	if err != nil {
		log.Printf("UpdateWhatsAppTemplate DB error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "An internal error occurred"})
		return
	}

	writeJSON(w, http.StatusOK, WhatsAppTemplate{
		ID:          id,
		DoctorID:    doctorID,
		TemplateKey: input.TemplateKey,
		Greeting:    input.Greeting,
		Body:        input.Body,
		Footer:      input.Footer,
		CreatedAt:   createdAt,
	})
}

// GetTemplateForDoctor fetches template from DB or returns default
func GetTemplateForDoctor(ctx context.Context, doctorID int, templateKey string) WhatsAppTemplate {
	var t WhatsAppTemplate
	err := db.Pool.QueryRow(ctx,
		"SELECT id, doctor_id, template_key, greeting, body, footer, created_at FROM whatsapp_templates WHERE doctor_id = $1 AND template_key = $2",
		doctorID, templateKey).Scan(&t.ID, &t.DoctorID, &t.TemplateKey, &t.Greeting, &t.Body, &t.Footer, &t.CreatedAt)
	if err != nil {
		// Return default
		if def, ok := defaultTemplates[templateKey]; ok {
			def.DoctorID = doctorID
			return def
		}
	}
	return t
}
