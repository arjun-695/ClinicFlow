-- migration_rbac_pharmacy_slots.sql

-- =============================================
-- 1. RBAC: Patient-Doctor Many-to-Many Junction
-- =============================================
CREATE TABLE IF NOT EXISTS patient_doctors (
    id SERIAL PRIMARY KEY,
    patient_id INT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    doctor_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    facility_id INT NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
    assigned_by INT REFERENCES users(id),
    assigned_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(patient_id, doctor_id, facility_id)
);
CREATE INDEX IF NOT EXISTS idx_pd_doctor ON patient_doctors(doctor_id);
CREATE INDEX IF NOT EXISTS idx_pd_patient ON patient_doctors(patient_id);
CREATE INDEX IF NOT EXISTS idx_pd_facility ON patient_doctors(facility_id);

-- =============================================
-- 2. Data Migration for Option A (Patient-Doctor mapping copy)
-- =============================================
INSERT INTO patient_doctors (patient_id, doctor_id, facility_id)
SELECT id, doctor_id, facility_id FROM patients
WHERE doctor_id IS NOT NULL AND facility_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- =============================================
-- 3. PRESCRIPTIONS
-- =============================================
CREATE TABLE IF NOT EXISTS prescriptions (
    id SERIAL PRIMARY KEY,
    facility_id INT NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
    patient_id INT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    doctor_id INT NOT NULL REFERENCES users(id),
    appointment_id INT REFERENCES appointments(id),
    diagnosis TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active',  -- active, dispensed, partially_dispensed, cancelled
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rx_patient ON prescriptions(patient_id);
CREATE INDEX IF NOT EXISTS idx_rx_doctor ON prescriptions(doctor_id);
CREATE INDEX IF NOT EXISTS idx_rx_facility ON prescriptions(facility_id);
CREATE INDEX IF NOT EXISTS idx_rx_status ON prescriptions(status);

CREATE TABLE IF NOT EXISTS prescription_items (
    id SERIAL PRIMARY KEY,
    prescription_id INT NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
    medicine_name TEXT NOT NULL,          -- free text (doctor may prescribe non-inventory items)
    medicine_id INT REFERENCES medicines(id),  -- nullable link to inventory
    dosage TEXT NOT NULL DEFAULT '',       -- e.g., "500mg"
    frequency TEXT NOT NULL DEFAULT '',    -- e.g., "twice daily"
    duration TEXT NOT NULL DEFAULT '',     -- e.g., "7 days"
    quantity INTEGER NOT NULL DEFAULT 0,  -- total prescribed quantity
    instructions TEXT NOT NULL DEFAULT '', -- e.g., "after meals"
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rxi_prescription ON prescription_items(prescription_id);

-- =============================================
-- 4. PHARMACY DISPENSING
-- =============================================
CREATE TABLE IF NOT EXISTS dispensing_records (
    id SERIAL PRIMARY KEY,
    facility_id INT NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
    prescription_id INT NOT NULL REFERENCES prescriptions(id),
    patient_id INT NOT NULL REFERENCES patients(id),
    dispensed_by INT NOT NULL REFERENCES users(id),  -- pharmacist user
    bill_id INT REFERENCES bills(id),                -- generated invoice
    status TEXT NOT NULL DEFAULT 'pending', -- pending, dispensed, partially_dispensed
    dispensed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_disp_prescription ON dispensing_records(prescription_id);
CREATE INDEX IF NOT EXISTS idx_disp_facility ON dispensing_records(facility_id);
CREATE INDEX IF NOT EXISTS idx_disp_status ON dispensing_records(status);

CREATE TABLE IF NOT EXISTS dispensing_items (
    id SERIAL PRIMARY KEY,
    dispensing_id INT NOT NULL REFERENCES dispensing_records(id) ON DELETE CASCADE,
    prescription_item_id INT NOT NULL REFERENCES prescription_items(id),
    medicine_id INT REFERENCES medicines(id),
    tablets_given INTEGER NOT NULL DEFAULT 0,
    cost_per_tablet NUMERIC(12,2) NOT NULL DEFAULT 0,
    line_total NUMERIC(12,2) NOT NULL DEFAULT 0,    -- tablets_given * cost_per_tablet
    is_nil BOOLEAN NOT NULL DEFAULT false,           -- out of stock flag
    nil_reason TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dispi_dispensing ON dispensing_items(dispensing_id);

-- =============================================
-- 5. DOCTOR AVAILABILITY & APPOINTMENT SLOTS
-- =============================================
CREATE TABLE IF NOT EXISTS doctor_availability (
    id SERIAL PRIMARY KEY,
    facility_id INT NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
    doctor_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sun,6=Sat
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    slot_duration_minutes INTEGER NOT NULL DEFAULT 60, -- 1 hour default
    max_patients_per_slot INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(facility_id, doctor_id, day_of_week)
);
CREATE INDEX IF NOT EXISTS idx_avail_doctor ON doctor_availability(doctor_id);

CREATE TABLE IF NOT EXISTS appointment_slots (
    id SERIAL PRIMARY KEY,
    facility_id INT NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
    doctor_id INT NOT NULL REFERENCES users(id),
    slot_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    max_patients INTEGER NOT NULL DEFAULT 1,
    booked_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'available', -- available, full, cancelled, blocked
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(facility_id, doctor_id, slot_date, start_time)
);
CREATE INDEX IF NOT EXISTS idx_slot_doctor_date ON appointment_slots(doctor_id, slot_date);
CREATE INDEX IF NOT EXISTS idx_slot_facility_date ON appointment_slots(facility_id, slot_date);
CREATE INDEX IF NOT EXISTS idx_slot_status ON appointment_slots(status);

-- Link appointments to slots
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS slot_id INT REFERENCES appointment_slots(id);
CREATE INDEX IF NOT EXISTS idx_appt_slot ON appointments(slot_id);

-- =============================================
-- 6. DOCTOR UNAVAILABILITY / CANCELLATION
-- =============================================
CREATE TABLE IF NOT EXISTS doctor_unavailability (
    id SERIAL PRIMARY KEY,
    facility_id INT NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
    doctor_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    unavailable_date DATE NOT NULL,
    reason TEXT NOT NULL DEFAULT '',
    triggered_by INT NOT NULL REFERENCES users(id),  -- admin or doctor who triggered
    notification_status TEXT NOT NULL DEFAULT 'pending', -- pending, in_progress, completed, failed
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(facility_id, doctor_id, unavailable_date)
);
CREATE INDEX IF NOT EXISTS idx_unavail_doctor_date ON doctor_unavailability(doctor_id, unavailable_date);

-- Reschedule queue for admin resolution
CREATE TABLE IF NOT EXISTS reschedule_queue (
    id SERIAL PRIMARY KEY,
    facility_id INT NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
    appointment_id INT NOT NULL REFERENCES appointments(id),
    patient_id INT NOT NULL REFERENCES patients(id),
    doctor_id INT NOT NULL REFERENCES users(id),
    original_date DATE NOT NULL,
    original_slot_id INT REFERENCES appointment_slots(id),
    new_slot_id INT REFERENCES appointment_slots(id),   -- NULL = needs admin resolution
    status TEXT NOT NULL DEFAULT 'pending',  -- pending, rescheduled, cancelled, notified
    notification_sent BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_resched_facility ON reschedule_queue(facility_id);
CREATE INDEX IF NOT EXISTS idx_resched_status ON reschedule_queue(status);
