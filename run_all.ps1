# run_all.ps1
Write-Host "=============================================" -ForegroundColor Green
Write-Host "          Starting KhataFlow Services        " -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Green

# 1. Start PostgreSQL 18 Database
Write-Host "Step 1: Launching local PostgreSQL database..." -ForegroundColor Blue
Start-Process powershell -ArgumentList "-NoExit", "-File", ".\start_db.ps1" -WindowStyle Normal

# Wait 3 seconds for database to start up
Write-Host "Waiting for database to initialize..." -ForegroundColor Yellow
Start-Sleep -Seconds 3

# 2. Start Go Backend (whatsmeow + REST API)
Write-Host "Step 2: Launching Go REST API backend..." -ForegroundColor Blue
Start-Process powershell -ArgumentList "-NoExit", "-Command", "go run ." -WorkingDirectory "$PSScriptRoot\backend" -WindowStyle Normal

# 3. Start Next.js Frontend
Write-Host "Step 3: Launching Next.js frontend..." -ForegroundColor Blue
Start-Process powershell -ArgumentList "-NoExit", "-Command", "npm run dev" -WorkingDirectory "$PSScriptRoot\frontend" -WindowStyle Normal

# 4. Start Medplum Server (Sidecar FHIR API)
Write-Host "Step 4: Launching Medplum Server..." -ForegroundColor Blue
Start-Process powershell -ArgumentList "-NoExit", "-Command", "npm run dev" -WorkingDirectory "$PSScriptRoot\medplum\packages\server" -WindowStyle Normal

Write-Host "---------------------------------------------" -ForegroundColor Green
Write-Host "All services have been launched!" -ForegroundColor Green
Write-Host "- Database: Running on localhost:5432" -ForegroundColor Slate
Write-Host "- Go REST API: Running on http://localhost:8080" -ForegroundColor Slate
Write-Host "- Next.js UI: Running on http://localhost:3000" -ForegroundColor Slate
Write-Host "- Medplum API: Running on http://localhost:8103" -ForegroundColor Slate
Write-Host "Please check the spawned console windows for live logs." -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Green
