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

	// Run schema migrations/alterations
	_, err = Pool.Exec(context.Background(), `
		ALTER TABLE bills ADD COLUMN IF NOT EXISTS last_reminder_sent_at TIMESTAMPTZ;
		ALTER TABLE appointments ADD COLUMN IF NOT EXISTS reminder_sent BOOLEAN NOT NULL DEFAULT FALSE;
		ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS consultation_charges NUMERIC(12, 2) NOT NULL DEFAULT 0.0;
		ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(12, 2) NOT NULL DEFAULT 0.0;
	`)
	if err != nil {
		log.Printf("Warning: Failed to run DB schema upgrades: %v", err)
	}

	fmt.Println("Successfully connected to the database!")
}
