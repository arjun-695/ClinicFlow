-- migration_roles_queue_labs.sql

-- 1. Create role enum and rename doctors to users
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('USER', 'DOCTOR', 'PHARMACIST', 'HOSPITAL_ADMIN');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE queue_status_type AS ENUM ('WAITING', 'IN_CONSULTATION', 'COMPLETED', 'CANCELLED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Rename doctors table to users
DO $$ BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'doctors') THEN
        ALTER TABLE doctors RENAME TO users;
    END IF;
END $$;

-- 2. Add role-related columns to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS role user_role DEFAULT 'DOCTOR';
ALTER TABLE users ADD COLUMN IF NOT EXISTS location VARCHAR(255) NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_url TEXT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS specialization VARCHAR(100) NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS hospital_name VARCHAR(100) NULL;

-- 3. Create staff onboarding invites table
CREATE TABLE IF NOT EXISTS user_invites (
    id SERIAL PRIMARY KEY,
    admin_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL UNIQUE,
    role user_role NOT NULL,
    access_levels TEXT[] NULL,
    phone VARCHAR(20) NULL,
    token VARCHAR(100) NOT NULL UNIQUE,
    otp_code VARCHAR(64) NOT NULL,
    is_used BOOLEAN DEFAULT FALSE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_invites_token ON user_invites(token);
CREATE INDEX IF NOT EXISTS idx_user_invites_email ON user_invites(email);

-- 4. Create queue management table
CREATE TABLE IF NOT EXISTS queue_entries (
    id SERIAL PRIMARY KEY,
    doctor_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    patient_id INT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    encounter_id VARCHAR(100) NULL,
    status queue_status_type DEFAULT 'WAITING',
    queue_order INT NOT NULL,
    check_in_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    consultation_start_time TIMESTAMP WITH TIME ZONE NULL,
    consultation_end_time TIMESTAMP WITH TIME ZONE NULL,
    estimated_wait_minutes INT DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_queue_entries_doctor ON queue_entries(doctor_id, status);
CREATE INDEX IF NOT EXISTS idx_queue_entries_order ON queue_entries(doctor_id, queue_order);

-- 5. Create lab requests and reports tables
CREATE TABLE IF NOT EXISTS lab_requests (
    id SERIAL PRIMARY KEY,
    patient_id INT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    doctor_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    test_name VARCHAR(150) NOT NULL,
    status VARCHAR(50) DEFAULT 'REQUESTED',
    requested_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    medplum_id VARCHAR(100) NULL
);

CREATE INDEX IF NOT EXISTS idx_lab_requests_patient ON lab_requests(patient_id);
CREATE INDEX IF NOT EXISTS idx_lab_requests_doctor ON lab_requests(doctor_id);

CREATE TABLE IF NOT EXISTS lab_reports (
    id SERIAL PRIMARY KEY,
    lab_request_id INT NOT NULL REFERENCES lab_requests(id) ON DELETE CASCADE,
    report_url TEXT NOT NULL,
    result_summary TEXT NULL,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    medplum_id VARCHAR(100) NULL
);

-- 6. Create patient vitals tracking table
CREATE TABLE IF NOT EXISTS patient_vitals (
    id SERIAL PRIMARY KEY,
    patient_id INT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    weight_kg NUMERIC(5,2) NULL,
    blood_pressure VARCHAR(20) NULL,
    heart_rate INT NULL,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    medplum_weight_id VARCHAR(100) NULL,
    medplum_bp_id VARCHAR(100) NULL,
    medplum_hr_id VARCHAR(100) NULL
);

CREATE INDEX IF NOT EXISTS idx_patient_vitals_patient ON patient_vitals(patient_id, recorded_at DESC);

-- 7. Create facilities and user_facilities tables for multi-facility support
CREATE TABLE IF NOT EXISTS facilities (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(50) NOT NULL DEFAULT 'CLINIC',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_facilities (
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    facility_id INT REFERENCES facilities(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL,
    PRIMARY KEY (user_id, facility_id)
);

-- 8. Add facility_id columns to operational tables
ALTER TABLE bills ADD COLUMN IF NOT EXISTS facility_id INT REFERENCES facilities(id) ON DELETE SET NULL;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS facility_id INT REFERENCES facilities(id) ON DELETE SET NULL;
ALTER TABLE queue_entries ADD COLUMN IF NOT EXISTS facility_id INT REFERENCES facilities(id) ON DELETE SET NULL;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS facility_id INT REFERENCES facilities(id) ON DELETE SET NULL;
ALTER TABLE medicines ADD COLUMN IF NOT EXISTS facility_id INT REFERENCES facilities(id) ON DELETE SET NULL;
ALTER TABLE lab_requests ADD COLUMN IF NOT EXISTS facility_id INT REFERENCES facilities(id) ON DELETE SET NULL;
ALTER TABLE patient_vitals ADD COLUMN IF NOT EXISTS facility_id INT REFERENCES facilities(id) ON DELETE SET NULL;
ALTER TABLE user_invites ADD COLUMN IF NOT EXISTS facility_id INT REFERENCES facilities(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bills_facility ON bills(facility_id);
CREATE INDEX IF NOT EXISTS idx_patients_facility ON patients(facility_id);
CREATE INDEX IF NOT EXISTS idx_queue_entries_facility ON queue_entries(facility_id);
