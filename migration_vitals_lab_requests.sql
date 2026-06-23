-- migration_vitals_lab_requests.sql

-- 1. Update lab_requests table to reference prescriptions
ALTER TABLE lab_requests ADD COLUMN IF NOT EXISTS prescription_id INT REFERENCES prescriptions(id) ON DELETE CASCADE;

-- Add unique constraint on (prescription_id, test_name)
-- We use a DO block to avoid error if constraint already exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'unique_prescription_test'
    ) THEN
        ALTER TABLE lab_requests ADD CONSTRAINT unique_prescription_test UNIQUE (prescription_id, test_name);
    END IF;
END $$;

-- 2. Update patient_vitals table with additional metrics
ALTER TABLE patient_vitals ADD COLUMN IF NOT EXISTS encounter_id INT REFERENCES appointments(id) ON DELETE SET NULL;
ALTER TABLE patient_vitals ADD COLUMN IF NOT EXISTS pulse INT NULL;
ALTER TABLE patient_vitals ADD COLUMN IF NOT EXISTS spo2 INT NULL;
ALTER TABLE patient_vitals ADD COLUMN IF NOT EXISTS temperature NUMERIC(4,1) NULL;
ALTER TABLE patient_vitals ADD COLUMN IF NOT EXISTS custom_metrics JSONB NULL;
