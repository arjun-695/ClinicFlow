// Package main boots the HTTP API, wires middleware and routes, initializes
// the database and WhatsApp services, and starts the background worker before
// serving the ClinicFlow backend.
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"sync"
	"syscall"
	"time"

	"backend/db"
	"backend/handlers"
	"backend/services"
	"backend/worker"

	"github.com/joho/godotenv"
)

// --- Rate Limiter ---
type visitor struct {
	tokens   float64
	lastSeen time.Time
}

type rateLimiter struct {
	mu       sync.Mutex
	visitors map[string]*visitor
	rate     float64 // tokens per second
	burst    float64 // max tokens
}

func newRateLimiter(requestsPerMinute float64) *rateLimiter {
	rl := &rateLimiter{
		visitors: make(map[string]*visitor),
		rate:     requestsPerMinute / 60.0,
		burst:    requestsPerMinute,
	}
	// Cleanup stale entries every 3 minutes
	go func() {
		ticker := time.NewTicker(3 * time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			rl.mu.Lock()
			for ip, v := range rl.visitors {
				if time.Since(v.lastSeen) > 5*time.Minute {
					delete(rl.visitors, ip)
				}
			}
			rl.mu.Unlock()
		}
	}()
	return rl
}

func (rl *rateLimiter) allow(ip string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	v, exists := rl.visitors[ip]
	if !exists {
		rl.visitors[ip] = &visitor{tokens: rl.burst - 1, lastSeen: time.Now()}
		return true
	}

	// Refill tokens based on elapsed time
	elapsed := time.Since(v.lastSeen).Seconds()
	v.tokens += elapsed * rl.rate
	if v.tokens > rl.burst {
		v.tokens = rl.burst
	}
	v.lastSeen = time.Now()

	if v.tokens < 1 {
		return false
	}
	v.tokens--
	return true
}

var (
	generalLimiter  = newRateLimiter(100) // 100 req/min
	whatsappLimiter = newRateLimiter(5)   // 5 req/min for WhatsApp send
)

// --- Auth Middleware ---
func authMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var token string

		// 1. Try to extract bearer token from Authorization header
		authHeader := r.Header.Get("Authorization")
		if strings.HasPrefix(authHeader, "Bearer ") {
			token = strings.TrimPrefix(authHeader, "Bearer ")
		}

		// 2. Fallback to auth_session cookie
		if token == "" {
			cookie, err := r.Cookie("auth_session")
			if err == nil {
				token = cookie.Value
			}
		}

		if token == "" {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(map[string]string{"error": "Authentication token required"})
			return
		}

		shopkeeperID, err := handlers.ValidateSessionToken(token)
		if err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(map[string]string{"error": "Session expired or invalid"})
			return
		}

		// Verify user still exists in the database (handles truncated/reset database state)
		var exists bool
		err = db.Pool.QueryRow(r.Context(), "SELECT EXISTS(SELECT 1 FROM users WHERE id = $1)", shopkeeperID).Scan(&exists)
		if err != nil || !exists {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(map[string]string{"error": "Session expired or invalid"})
			return
		}

		ctx := context.WithValue(r.Context(), handlers.ShopkeeperIDKey, shopkeeperID)
		next.ServeHTTP(w, r.WithContext(ctx))
	}
}

// --- Rate Limit Middleware ---
func rateLimitMiddleware(limiter *rateLimiter, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Strip port from RemoteAddr to get the actual client IP.
		// Without this, each TCP connection (with a unique ephemeral port)
		// is treated as a separate visitor, completely bypassing rate limits.
		ip, _, err := net.SplitHostPort(r.RemoteAddr)
		if err != nil {
			ip = r.RemoteAddr // fallback for unexpected format
		}
		// If behind a reverse proxy, use the first IP in X-Forwarded-For
		// (the original client). Ignore appended proxy IPs.
		if fwd := r.Header.Get("X-Forwarded-For"); fwd != "" {
			parts := strings.Split(fwd, ",")
			ip = strings.TrimSpace(parts[0])
		}
		if !limiter.allow(ip) {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusTooManyRequests)
			json.NewEncoder(w).Encode(map[string]string{"error": "Too many requests. Please try again later."})
			return
		}
		next.ServeHTTP(w, r)
	}
}

// --- Body Size Limit Middleware ---
func bodySizeLimit(maxBytes int64, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Body != nil {
			r.Body = http.MaxBytesReader(w, r.Body, maxBytes)
		}
		next.ServeHTTP(w, r)
	}
}

func main() {
	// Load environment variables from .env file
	if err := godotenv.Load(); err != nil {
		log.Println("Warning: No .env file found, relying on system environment variables")
	}

	// Initialize session signing key
	handlers.InitSessionSecret()

	// Initialize Database Pool
	db.InitDB()
	defer db.Pool.Close()

	// Initialize Redis Cache
	db.InitRedis()



	// Initialize whatsmeow WhatsApp client
	services.InitWhatsApp()

	// Start Background Cron Notification Worker
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	worker.StartWorker(ctx)

	// Set up router
	mux := http.NewServeMux()

	// --- Public Auth Endpoints (no auth middleware) ---
	mux.HandleFunc("GET /api/auth/session", rateLimitMiddleware(generalLimiter, handlers.CheckSession))
	mux.HandleFunc("GET /api/auth/logout", rateLimitMiddleware(generalLimiter, handlers.Logout))
	mux.HandleFunc("POST /api/auth/signup", rateLimitMiddleware(generalLimiter, bodySizeLimit(1<<20, handlers.Signup)))
	mux.HandleFunc("POST /api/auth/login", rateLimitMiddleware(generalLimiter, bodySizeLimit(1<<20, handlers.Login)))
	mux.HandleFunc("GET /api/auth/google/login", rateLimitMiddleware(generalLimiter, handlers.GoogleLogin))
	mux.HandleFunc("GET /api/auth/google/callback", rateLimitMiddleware(generalLimiter, handlers.GoogleCallback))
	mux.HandleFunc("PUT /api/auth/profile", rateLimitMiddleware(generalLimiter, authMiddleware(bodySizeLimit(1<<20, handlers.UpdateProfile))))
	mux.HandleFunc("POST /api/auth/role-setup", rateLimitMiddleware(generalLimiter, authMiddleware(bodySizeLimit(1<<20, handlers.RoleSetup))))
	mux.HandleFunc("POST /api/admin/invite", rateLimitMiddleware(generalLimiter, authMiddleware(handlers.RequireAdmin(bodySizeLimit(1<<20, handlers.InviteStaff)))))
	mux.HandleFunc("POST /api/auth/invite/verify", rateLimitMiddleware(generalLimiter, bodySizeLimit(1<<20, handlers.VerifyInvite)))
	mux.HandleFunc("POST /api/auth/invite/accept", rateLimitMiddleware(generalLimiter, bodySizeLimit(1<<20, handlers.AcceptInvite)))

	// --- Protected Business Endpoints (require auth) ---
	// Patients / Customers (Aliases)
	mux.HandleFunc("GET /api/patients", rateLimitMiddleware(generalLimiter, authMiddleware(handlers.ListPatients)))
	mux.HandleFunc("POST /api/patients", rateLimitMiddleware(generalLimiter, authMiddleware(handlers.RequireMedicalStaffOrReceptionist(bodySizeLimit(1<<20, handlers.CreatePatient)))))
	mux.HandleFunc("GET /api/patients/detail", rateLimitMiddleware(generalLimiter, authMiddleware(handlers.GetPatient)))
	mux.HandleFunc("GET /api/customers", rateLimitMiddleware(generalLimiter, authMiddleware(handlers.ListPatients)))
	mux.HandleFunc("POST /api/customers", rateLimitMiddleware(generalLimiter, authMiddleware(handlers.RequireMedicalStaffOrReceptionist(bodySizeLimit(1<<20, handlers.CreatePatient)))))
	mux.HandleFunc("GET /api/customers/detail", rateLimitMiddleware(generalLimiter, authMiddleware(handlers.GetPatient)))

	// Patient-Doctor Assignments
	mux.HandleFunc("POST /api/patients/assign-doctor", rateLimitMiddleware(generalLimiter, authMiddleware(handlers.RequireAdminOrReceptionist(bodySizeLimit(1<<20, handlers.AssignPatientToDoctor)))))
	mux.HandleFunc("DELETE /api/patients/unassign-doctor", rateLimitMiddleware(generalLimiter, authMiddleware(handlers.RequireAdminOrReceptionist(bodySizeLimit(1<<20, handlers.RemovePatientFromDoctor)))))
	mux.HandleFunc("GET /api/patients/doctors", rateLimitMiddleware(generalLimiter, authMiddleware(handlers.ListDoctorsForPatient)))
	mux.HandleFunc("GET /api/doctors/patients", rateLimitMiddleware(generalLimiter, authMiddleware(handlers.RequireDoctor(handlers.ListPatientsForDoctor))))
	mux.HandleFunc("GET /api/facility/doctors", rateLimitMiddleware(generalLimiter, authMiddleware(handlers.ListFacilityDoctors)))

	// Prescriptions
	mux.HandleFunc("POST /api/prescriptions", rateLimitMiddleware(generalLimiter, authMiddleware(handlers.RequireDoctor(bodySizeLimit(1<<20, handlers.CreatePrescription)))))
	mux.HandleFunc("POST /api/prescriptions/upload-pdf", rateLimitMiddleware(generalLimiter, authMiddleware(handlers.RequireDoctor(bodySizeLimit(10<<20, handlers.UploadPrescriptionAndBillPDF)))))
	mux.HandleFunc("GET /api/prescriptions", rateLimitMiddleware(generalLimiter, authMiddleware(handlers.ListPrescriptions)))
	mux.HandleFunc("GET /api/prescriptions/detail", rateLimitMiddleware(generalLimiter, authMiddleware(handlers.GetPrescription)))
	mux.HandleFunc("PUT /api/prescriptions", rateLimitMiddleware(generalLimiter, authMiddleware(handlers.RequireDoctor(bodySizeLimit(1<<20, handlers.UpdatePrescription)))))

	// Pharmacy
	mux.HandleFunc("GET /api/pharmacy/queue", rateLimitMiddleware(generalLimiter, authMiddleware(handlers.RequirePharmacistOrAdmin(handlers.ListPendingPrescriptions))))
	mux.HandleFunc("POST /api/pharmacy/dispense", rateLimitMiddleware(generalLimiter, authMiddleware(handlers.RequirePharmacistOrAdmin(bodySizeLimit(1<<20, handlers.DispensePrescription)))))
	mux.HandleFunc("GET /api/pharmacy/dispensing", rateLimitMiddleware(generalLimiter, authMiddleware(handlers.RequirePharmacistOrAdmin(handlers.GetDispensingRecord))))

	// Availability & Slots
	mux.HandleFunc("POST /api/doctors/availability", rateLimitMiddleware(generalLimiter, authMiddleware(handlers.RoleMiddleware("DOCTOR", "HOSPITAL_ADMIN")(bodySizeLimit(1<<20, handlers.SetDoctorAvailability)))))
	mux.HandleFunc("GET /api/doctors/availability", rateLimitMiddleware(generalLimiter, authMiddleware(handlers.GetDoctorAvailability)))
	mux.HandleFunc("POST /api/slots/generate", rateLimitMiddleware(generalLimiter, authMiddleware(handlers.RoleMiddleware("DOCTOR", "HOSPITAL_ADMIN")(bodySizeLimit(1<<20, handlers.GenerateSlots)))))
	mux.HandleFunc("POST /api/slots/confirm", rateLimitMiddleware(generalLimiter, authMiddleware(handlers.RoleMiddleware("DOCTOR", "HOSPITAL_ADMIN")(bodySizeLimit(1<<20, handlers.ConfirmSlots)))))
	mux.HandleFunc("GET /api/slots", rateLimitMiddleware(generalLimiter, authMiddleware(handlers.ListSlots)))
	mux.HandleFunc("PUT /api/slots", rateLimitMiddleware(generalLimiter, authMiddleware(handlers.RequireAdmin(bodySizeLimit(1<<20, handlers.EditSlot)))))
	mux.HandleFunc("DELETE /api/slots", rateLimitMiddleware(generalLimiter, authMiddleware(handlers.RequireAdmin(bodySizeLimit(1<<20, handlers.CancelSlot)))))
	mux.HandleFunc("POST /api/doctors/unavailable", rateLimitMiddleware(generalLimiter, authMiddleware(handlers.RoleMiddleware("DOCTOR", "HOSPITAL_ADMIN")(bodySizeLimit(1<<20, handlers.MarkDoctorUnavailable)))))
	mux.HandleFunc("GET /api/reschedule-queue", rateLimitMiddleware(generalLimiter, authMiddleware(handlers.RequireAdmin(handlers.ListRescheduleQueue))))
	mux.HandleFunc("PUT /api/reschedule-queue", rateLimitMiddleware(generalLimiter, authMiddleware(handlers.RequireAdmin(bodySizeLimit(1<<20, handlers.ResolveReschedule)))))

	// Appointments
	mux.HandleFunc("POST /api/appointments", rateLimitMiddleware(generalLimiter, authMiddleware(bodySizeLimit(1<<20, handlers.CreateAppointment))))
	mux.HandleFunc("GET /api/appointments", rateLimitMiddleware(generalLimiter, authMiddleware(handlers.ListAppointments)))
	mux.HandleFunc("PUT /api/appointments/status", rateLimitMiddleware(generalLimiter, authMiddleware(bodySizeLimit(1<<20, handlers.UpdateAppointmentStatus))))

	// Bills / Contracts (Aliases)
	mux.HandleFunc("POST /api/bills", rateLimitMiddleware(generalLimiter, authMiddleware(handlers.RequirePharmacistOrAdmin(handlers.CreateBill))))
	mux.HandleFunc("POST /api/bills/upload-invoice", rateLimitMiddleware(generalLimiter, authMiddleware(handlers.UploadInvoice)))
	mux.HandleFunc("GET /api/bills/detail", rateLimitMiddleware(generalLimiter, authMiddleware(handlers.GetBillDetails)))
	mux.HandleFunc("GET /api/bills", rateLimitMiddleware(generalLimiter, authMiddleware(handlers.ListBills)))
	mux.HandleFunc("POST /api/contracts", rateLimitMiddleware(generalLimiter, authMiddleware(handlers.RequirePharmacistOrAdmin(handlers.CreateBill))))
	mux.HandleFunc("GET /api/contracts/detail", rateLimitMiddleware(generalLimiter, authMiddleware(handlers.GetBillDetails)))

	// Medicines Inventory
	mux.HandleFunc("GET /api/medicines", rateLimitMiddleware(generalLimiter, authMiddleware(handlers.ListMedicines)))
	mux.HandleFunc("POST /api/medicines", rateLimitMiddleware(generalLimiter, authMiddleware(handlers.RequirePharmacistOrAdmin(bodySizeLimit(1<<20, handlers.CreateMedicine)))))
	mux.HandleFunc("PUT /api/medicines", rateLimitMiddleware(generalLimiter, authMiddleware(handlers.RequirePharmacistOrAdmin(bodySizeLimit(1<<20, handlers.UpdateMedicine)))))
	mux.HandleFunc("DELETE /api/medicines", rateLimitMiddleware(generalLimiter, authMiddleware(handlers.RequirePharmacistOrAdmin(bodySizeLimit(1<<20, handlers.DeleteMedicine)))))

	// Facilities
	mux.HandleFunc("GET /api/facilities", rateLimitMiddleware(generalLimiter, authMiddleware(handlers.ListFacilities)))
	mux.HandleFunc("GET /api/facilities/staff", rateLimitMiddleware(generalLimiter, authMiddleware(handlers.ListFacilityStaff)))
	mux.HandleFunc("POST /api/facilities", rateLimitMiddleware(generalLimiter, authMiddleware(bodySizeLimit(1<<20, handlers.CreateFacility))))

	// Analytics
	mux.HandleFunc("GET /api/analytics", rateLimitMiddleware(generalLimiter, authMiddleware(handlers.GetAnalytics)))

	// Payments
	mux.HandleFunc("POST /api/payments", rateLimitMiddleware(generalLimiter, authMiddleware(bodySizeLimit(1<<20, handlers.LogPayment))))

	// Suppliers
	mux.HandleFunc("GET /api/suppliers", rateLimitMiddleware(generalLimiter, authMiddleware(handlers.ListSupplierDues)))
	mux.HandleFunc("POST /api/suppliers", rateLimitMiddleware(generalLimiter, authMiddleware(bodySizeLimit(1<<20, handlers.CreateSupplierDue))))

	// Expenses
	mux.HandleFunc("GET /api/expenses", rateLimitMiddleware(generalLimiter, authMiddleware(handlers.ListExpenses)))
	mux.HandleFunc("POST /api/expenses", rateLimitMiddleware(generalLimiter, authMiddleware(bodySizeLimit(1<<20, handlers.CreateExpense))))

	// WhatsApp
	mux.HandleFunc("GET /api/whatsapp/qr", rateLimitMiddleware(generalLimiter, authMiddleware(handlers.GetWhatsAppQR)))
	mux.HandleFunc("GET /api/whatsapp/status", rateLimitMiddleware(generalLimiter, authMiddleware(handlers.GetWhatsAppStatus)))
	mux.HandleFunc("POST /api/whatsapp/test", rateLimitMiddleware(whatsappLimiter, authMiddleware(bodySizeLimit(1<<20, handlers.SendWhatsAppTest))))
	mux.HandleFunc("POST /api/whatsapp/pair-phone", rateLimitMiddleware(whatsappLimiter, authMiddleware(bodySizeLimit(1<<20, handlers.PairWhatsAppPhone))))
	mux.HandleFunc("GET /api/whatsapp/templates", rateLimitMiddleware(generalLimiter, authMiddleware(handlers.GetWhatsAppTemplates)))
	mux.HandleFunc("PUT /api/whatsapp/templates", rateLimitMiddleware(generalLimiter, authMiddleware(bodySizeLimit(1<<20, handlers.UpdateWhatsAppTemplate))))

	// Queue Management
	mux.HandleFunc("POST /api/queue/checkin", rateLimitMiddleware(generalLimiter, authMiddleware(bodySizeLimit(1<<20, handlers.CheckInPatient))))
	mux.HandleFunc("GET /api/queue", rateLimitMiddleware(generalLimiter, authMiddleware(handlers.ListQueue)))
	mux.HandleFunc("PUT /api/queue/status", rateLimitMiddleware(generalLimiter, authMiddleware(bodySizeLimit(1<<20, handlers.UpdateQueueStatus))))
	mux.HandleFunc("PUT /api/queue/reorder", rateLimitMiddleware(generalLimiter, authMiddleware(bodySizeLimit(1<<20, handlers.ReorderQueue))))
	mux.HandleFunc("GET /api/queue/stream", rateLimitMiddleware(generalLimiter, handlers.ServeQueueWS))
	mux.HandleFunc("DELETE /api/queue", rateLimitMiddleware(generalLimiter, authMiddleware(handlers.DeleteQueueEntry)))

	// Lab and Vitals
	mux.HandleFunc("POST /api/labs/request", rateLimitMiddleware(generalLimiter, authMiddleware(bodySizeLimit(1<<20, handlers.RequestLabTest))))
	mux.HandleFunc("POST /api/labs/upload", rateLimitMiddleware(generalLimiter, authMiddleware(bodySizeLimit(1<<20, handlers.UploadLabReport))))
	mux.HandleFunc("GET /api/labs", rateLimitMiddleware(generalLimiter, authMiddleware(handlers.ListLabRequests)))
	mux.HandleFunc("POST /api/vitals", rateLimitMiddleware(generalLimiter, authMiddleware(bodySizeLimit(1<<20, handlers.LogPatientVitals))))
	mux.HandleFunc("GET /api/vitals", rateLimitMiddleware(generalLimiter, authMiddleware(handlers.GetPatientVitals)))

	// Configure HTTP server
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	addr := ":" + port
	if strings.Contains(port, ":") {
		addr = port
	}

	server := &http.Server{
		Addr:         addr,
		Handler:      corsMiddleware(mux),
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, os.Interrupt, syscall.SIGTERM)

	go func() {
		fmt.Printf("Go Backend REST API listening on http://localhost:%s\n", port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server failed to start: %v", err)
		}
	}()

	<-quit
	log.Println("Shutting down server...")
	cancel() // Stop the background worker

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

	if err := server.Shutdown(shutdownCtx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}
	log.Println("Server stopped gracefully.")
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		allowedOrigin := strings.TrimSpace(strings.TrimSuffix(os.Getenv("WEBAUTHN_RP_ORIGIN"), "/"))
		if allowedOrigin == "" {
			allowedOrigin = "http://localhost:3000"
		}

		isAllowed := origin == allowedOrigin || 
			origin == "http://localhost:3000" || 
			origin == "http://localhost:3001" || 
			origin == "http://127.0.0.1:3000" || 
			origin == "http://127.0.0.1:3001" || 
			strings.HasSuffix(origin, ":3000") || 
			strings.HasSuffix(origin, ":3001")

		if !isAllowed && origin != "" {
			if extra := os.Getenv("ALLOWED_ORIGINS"); extra != "" {
				for _, o := range strings.Split(extra, ",") {
					if origin == strings.TrimSpace(strings.TrimSuffix(o, "/")) {
						isAllowed = true
						break
					}
				}
			}
		}

		if isAllowed {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, Cookie, X-Facility-ID")
		}

		// Handle preflight OPTIONS request
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}
