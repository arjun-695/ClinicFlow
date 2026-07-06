-- Migration: Database Indexing for Performance Optimization
-- This migration converts sequential scans into index scans on growing tables.

-- NOTE: The boot-time columns added in backend/db/db.go (reminder_sent, last_reminder_sent_at)
-- must exist before these indexes are created, so index creation must run after those columns exist.

-- 1. Index for patients.phone composite with facility_id
CREATE INDEX IF NOT EXISTS idx_patients_facility_phone ON patients(facility_id, phone);

-- 2. Index for bills.doctor_id
CREATE INDEX IF NOT EXISTS idx_bills_doctor ON bills(doctor_id);

-- 3. Index for lab_reports.lab_request_id
CREATE INDEX IF NOT EXISTS idx_lab_reports_lab_request ON lab_reports(lab_request_id);

-- 4. Composite index for dispensing_records(patient_id, dispensed_by, bill_id)
CREATE INDEX IF NOT EXISTS idx_dispensing_records_composite ON dispensing_records(patient_id, dispensed_by, bill_id);

-- 5. Composite index for reschedule_queue(patient_id, doctor_id, appointment_id)
CREATE INDEX IF NOT EXISTS idx_reschedule_queue_composite ON reschedule_queue(patient_id, doctor_id, appointment_id);

-- 6. Composite index for appointments(status, reminder_sent, appointment_date)
CREATE INDEX IF NOT EXISTS idx_appointments_reminder ON appointments(status, reminder_sent, appointment_date);

-- 7. Partial index on bills (status != 'SETTLED') covering remaining_amount/last_reminder_sent_at
CREATE INDEX IF NOT EXISTS idx_bills_recurring_reminder ON bills(last_reminder_sent_at, remaining_amount) WHERE status != 'SETTLED';

-- 8. Composite index for queue_entries(facility_id, check_in_time, status)
CREATE INDEX IF NOT EXISTS idx_queue_entries_facility_checkin_status ON queue_entries(facility_id, check_in_time, status);

-- 9. Composite index for bills(facility_id, created_at DESC)
CREATE INDEX IF NOT EXISTS idx_bills_facility_created_at_desc ON bills(facility_id, created_at DESC);
