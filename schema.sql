-- Enums for safe state management
DO $$ BEGIN
    CREATE TYPE contract_status AS ENUM ('PENDING', 'PARTIALLY_PAID', 'SETTLED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE payment_mode_type AS ENUM ('CASH', 'ONLINE_UPI', 'BANK_TRANSFER');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Customers Directory
CREATE TABLE IF NOT EXISTS customers (
    id SERIAL PRIMARY KEY,
    shopkeeper_id INT NOT NULL DEFAULT 1, 
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(15) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Independent Contracts Table
CREATE TABLE IF NOT EXISTS customer_contracts (
    id SERIAL PRIMARY KEY,
    customer_id INT REFERENCES customers(id) ON DELETE CASCADE,
    description TEXT NOT NULL,          
    total_amount NUMERIC(12, 2) NOT NULL,
    remaining_amount NUMERIC(12, 2) NOT NULL,
    status contract_status DEFAULT 'PENDING',
    promised_due_date DATE NULL,        
    invoice_url TEXT NULL,              -- Link to Supabase Storage stored PNG/JPG/PDF
    notified BOOLEAN DEFAULT FALSE,     -- WhatsApp notification sent flag
    created_at TIMESTAMP WITH TIME ZONE NOT NULL, -- User-controlled overridable timestamp
    
    CONSTRAINT check_positive_amounts CHECK (total_amount > 0 AND remaining_amount >= 0)
);

-- Payment Installments Timeline
CREATE TABLE IF NOT EXISTS payments (
    id SERIAL PRIMARY KEY,
    contract_id INT REFERENCES customer_contracts(id) ON DELETE CASCADE,
    amount_paid NUMERIC(12, 2) NOT NULL,
    payment_mode payment_mode_type DEFAULT 'CASH', 
    remarks TEXT NULL,
    payment_date TIMESTAMP WITH TIME ZONE NOT NULL, -- User-controlled overridable timestamp
    
    CONSTRAINT check_valid_payment CHECK (amount_paid > 0)
);

-- Supplier Payables Directory
CREATE TABLE IF NOT EXISTS supplier_dues (
    id SERIAL PRIMARY KEY,
    shopkeeper_id INT NOT NULL DEFAULT 1,
    supplier_name VARCHAR(100) NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    due_date DATE NOT NULL,
    notified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT check_positive_supplier_amount CHECK (amount > 0)
);

-- Daily Expenses Directory (No default to Cash; explicitly set payment_mode)
CREATE TABLE IF NOT EXISTS expenses (
    id SERIAL PRIMARY KEY,
    shopkeeper_id INT NOT NULL DEFAULT 1,
    description TEXT NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    payment_mode payment_mode_type NOT NULL, -- Required, not default CASH
    expense_date TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Shopkeepers Directory (Authentication)
CREATE TABLE IF NOT EXISTS shopkeepers (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NULL,
    name VARCHAR(100) NOT NULL,
    shop_name VARCHAR(100) NOT NULL DEFAULT 'My Store',
    phone VARCHAR(15) NOT NULL DEFAULT '',
    google_id VARCHAR(255) NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_contracts_customer ON customer_contracts(customer_id);
CREATE INDEX IF NOT EXISTS idx_payments_contract ON payments(contract_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status_due ON customer_contracts(status, promised_due_date) WHERE status != 'SETTLED';
CREATE INDEX IF NOT EXISTS idx_supplier_dues_date ON supplier_dues(due_date, notified) WHERE notified = FALSE;
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date DESC);

-- Migration: Add notified column if missing from existing customer_contracts table
DO $$ BEGIN
    ALTER TABLE customer_contracts ADD COLUMN IF NOT EXISTS notified BOOLEAN DEFAULT FALSE;
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;
