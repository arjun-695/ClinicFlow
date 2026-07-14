// Package db initializes and exposes the shared PostgreSQL connection pool
// used by the backend handlers, services, and worker tasks.
package db

import (
	"context"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

var Pool *pgxpool.Pool

func InitDB() {
	connStr := os.Getenv("DATABASE_URL")
	if connStr == "" {
		log.Fatal("DATABASE_URL environment variable is required but not set. Please configure it in .env or system environment.")
	}

	config, err := pgxpool.ParseConfig(connStr)
	if err != nil {
		log.Fatalf("Unable to parse database URL: %v\n", err)
	}

	// Connection pool settings
	config.MaxConns = 50
	config.MinConns = 2
	config.MaxConnIdleTime = 30 * time.Minute

	Pool, err = pgxpool.NewWithConfig(context.Background(), config)
	if err != nil {
		log.Fatalf("Unable to connect to database: %v\n", err)
	}

	// Test the connection
	err = Pool.Ping(context.Background())
	if err != nil {
		log.Fatalf("Database connection check failed: %v\n", err)
	}

	// Run full schema migrations in correct order
	migrationFiles := []string{
		"schema.sql",
		"migration_pivot.sql",
		"migration_roles_queue_labs.sql",
		"migration_rbac_pharmacy_slots.sql",
		"migration_vitals_lab_requests.sql",
		"migration_whatsapp_templates.sql",
		"migration_indexing.sql",
	}

	for _, file := range migrationFiles {
		if err := runSQLFile(context.Background(), Pool, file); err != nil {
			log.Printf("Migration warning for %s: %v. Continuing...", file, err)
		}
	}

	// Run schema migrations/alterations
	_, err = Pool.Exec(context.Background(), `
		ALTER TABLE bills ADD COLUMN IF NOT EXISTS last_reminder_sent_at TIMESTAMPTZ;
		ALTER TABLE appointments ADD COLUMN IF NOT EXISTS reminder_sent BOOLEAN NOT NULL DEFAULT FALSE;
		ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS consultation_charges NUMERIC(12, 2) NOT NULL DEFAULT 0.0;
		ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(12, 2) NOT NULL DEFAULT 0.0;
		ALTER TABLE bills ADD COLUMN IF NOT EXISTS prescription_id INT REFERENCES prescriptions(id) ON DELETE SET NULL;
		ALTER TABLE facilities ADD COLUMN IF NOT EXISTS address TEXT;
		ALTER TABLE facilities ADD COLUMN IF NOT EXISTS phone VARCHAR(50);

		-- DOB tracking additions
		ALTER TABLE patients ADD COLUMN IF NOT EXISTS dob DATE;
		ALTER TABLE users ADD COLUMN IF NOT EXISTS dob DATE;

		-- Medicine deletion foreign key fixes
		ALTER TABLE prescription_items DROP CONSTRAINT IF EXISTS prescription_items_medicine_id_fkey;
		ALTER TABLE prescription_items ADD CONSTRAINT prescription_items_medicine_id_fkey FOREIGN KEY (medicine_id) REFERENCES medicines(id) ON DELETE SET NULL;

		ALTER TABLE dispensing_items DROP CONSTRAINT IF EXISTS dispensing_items_medicine_id_fkey;
		ALTER TABLE dispensing_items ADD CONSTRAINT dispensing_items_medicine_id_fkey FOREIGN KEY (medicine_id) REFERENCES medicines(id) ON DELETE SET NULL;

		CREATE INDEX IF NOT EXISTS idx_bills_recurring_reminder ON bills(last_reminder_sent_at, remaining_amount) WHERE status != 'SETTLED';
		CREATE INDEX IF NOT EXISTS idx_appointments_reminder ON appointments(status, reminder_sent, appointment_date);
		CREATE INDEX IF NOT EXISTS idx_prescriptions_consultation_charges ON prescriptions(consultation_charges);
		CREATE INDEX IF NOT EXISTS idx_prescriptions_amount_paid ON prescriptions(amount_paid);
		CREATE INDEX IF NOT EXISTS idx_bills_prescription ON bills(prescription_id);
	`)
	if err != nil {
		log.Printf("Warning: Failed to run DB schema upgrades: %v", err)
	}

	fmt.Println("Successfully connected to the database!")
}

func findMigrationFile(filename string) (string, error) {
	paths := []string{
		filename,
		"../" + filename,
		"../../" + filename,
	}
	for _, p := range paths {
		if _, err := os.Stat(p); err == nil {
			return p, nil
		}
	}
	return "", fmt.Errorf("migration file %s not found in any expected paths", filename)
}

func runSQLFile(ctx context.Context, pool *pgxpool.Pool, filename string) error {
	path, err := findMigrationFile(filename)
	if err != nil {
		return err
	}
	content, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("failed to read migration file %s: %v", filename, err)
	}
	_, err = pool.Exec(ctx, string(content))
	if err != nil {
		return fmt.Errorf("failed to execute migration file %s: %v", filename, err)
	}
	log.Printf("Successfully applied migration file: %s", filename)
	return nil
}
