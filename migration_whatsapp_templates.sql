-- WhatsApp Message Templates (per-doctor customization)
CREATE TABLE IF NOT EXISTS whatsapp_templates (
    id SERIAL PRIMARY KEY,
    doctor_id INT NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
    template_key VARCHAR(50) NOT NULL,
    greeting TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    footer TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(doctor_id, template_key)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_doctor ON whatsapp_templates(doctor_id);
