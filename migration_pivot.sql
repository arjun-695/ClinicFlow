-- Enums for payment mode types (already exists in schema.sql but we ensure it does here)
DO $$ BEGIN
    CREATE TYPE payment_mode_type AS ENUM ('CASH', 'ONLINE_UPI', 'BANK_TRANSFER');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Enums for appointment status
DO $$ BEGIN
    CREATE TYPE appointment_status_type AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Enums for contract (bill) status (already exists as contract_status, we can keep it or create/use it)
DO $$ BEGIN
    CREATE TYPE contract_status AS ENUM ('PENDING', 'PARTIALLY_PAID', 'SETTLED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 1. Rename shopkeepers to doctors
DO $$ BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'shopkeepers') THEN
        ALTER TABLE shopkeepers RENAME TO doctors;
    END IF;
END $$;

-- Ensure clinic_name column exists
DO $$ BEGIN
    IF EXISTS (SELECT FROM pg_attribute WHERE attrelid = 'doctors'::regclass AND attname = 'shop_name') THEN
        ALTER TABLE doctors RENAME COLUMN shop_name TO clinic_name;
    END IF;
END $$;

-- 2. Rename customers to patients
DO $$ BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'customers') THEN
        ALTER TABLE customers RENAME TO patients;
    END IF;
END $$;

-- Ensure doctor_id column exists
DO $$ BEGIN
    IF EXISTS (SELECT FROM pg_attribute WHERE attrelid = 'patients'::regclass AND attname = 'shopkeeper_id') THEN
        ALTER TABLE patients RENAME COLUMN shopkeeper_id TO doctor_id;
    END IF;
END $$;

-- Add clinical demographics to patients if not exist
ALTER TABLE patients ADD COLUMN IF NOT EXISTS gender VARCHAR(10) DEFAULT 'Male';
ALTER TABLE patients ADD COLUMN IF NOT EXISTS age INT DEFAULT 0;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS medical_history TEXT DEFAULT '';

-- 3. Create appointments table
CREATE TABLE IF NOT EXISTS appointments (
    id SERIAL PRIMARY KEY,
    patient_id INT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    doctor_id INT NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
    appointment_date TIMESTAMP WITH TIME ZONE NOT NULL,
    status appointment_status_type DEFAULT 'PENDING',
    reason TEXT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Rename customer_contracts to bills
DO $$ BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'customer_contracts') THEN
        ALTER TABLE customer_contracts RENAME TO bills;
    END IF;
END $$;

-- Ensure patient_id column exists in bills
DO $$ BEGIN
    IF EXISTS (SELECT FROM pg_attribute WHERE attrelid = 'bills'::regclass AND attname = 'customer_id') THEN
        ALTER TABLE bills RENAME COLUMN customer_id TO patient_id;
    END IF;
END $$;

-- Add doctor_id to bills if not exist (so we can quickly reference doctor, default to 1 or patient's doctor)
ALTER TABLE bills ADD COLUMN IF NOT EXISTS doctor_id INT REFERENCES doctors(id) ON DELETE SET NULL;

-- 5. Create medicines inventory table
CREATE TABLE IF NOT EXISTS medicines (
    id SERIAL PRIMARY KEY,
    doctor_id INT NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    stock INT DEFAULT 0,
    price NUMERIC(12, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT check_positive_price CHECK (price >= 0)
);

-- 6. Create bill_items table
CREATE TABLE IF NOT EXISTS bill_items (
    id SERIAL PRIMARY KEY,
    bill_id INT NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
    item_name VARCHAR(100) NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    unit_price NUMERIC(12, 2) NOT NULL,
    dosage VARCHAR(50) NULL,
    CONSTRAINT check_positive_quantity CHECK (quantity > 0),
    CONSTRAINT check_positive_unit_price CHECK (unit_price >= 0)
);

-- 7. Rename contract_id to bill_id in payments table
DO $$ BEGIN
    IF EXISTS (SELECT FROM pg_attribute WHERE attrelid = 'payments'::regclass AND attname = 'contract_id') THEN
        ALTER TABLE payments RENAME COLUMN contract_id TO bill_id;
    END IF;
END $$;

-- Ensure payments table is referencing bills
DO $$ BEGIN
    -- Add foreign key constraint if missing
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'payments_bill_id_fkey'
    ) THEN
        -- Check if table has the reference, if not, add it
        ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_contract_id_fkey;
        ALTER TABLE payments ADD CONSTRAINT payments_bill_id_fkey FOREIGN KEY (bill_id) REFERENCES bills(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Create indexes for the new/renamed tables
CREATE INDEX IF NOT EXISTS idx_patients_doctor ON patients(doctor_id);
CREATE INDEX IF NOT EXISTS idx_appointments_doctor ON appointments(doctor_id, appointment_date);
CREATE INDEX IF NOT EXISTS idx_appointments_patient ON appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_bills_patient ON bills(patient_id);
CREATE INDEX IF NOT EXISTS idx_bill_items_bill ON bill_items(bill_id);
CREATE INDEX IF NOT EXISTS idx_payments_bill ON payments(bill_id);
CREATE INDEX IF NOT EXISTS idx_medicines_doctor ON medicines(doctor_id);
