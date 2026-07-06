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

# 1.5 Run Database Migrations
Write-Host "Checking for database connection to run migrations..." -ForegroundColor Blue
$envFile = "$PSScriptRoot\backend\.env"
if (Test-Path $envFile) {
    $dbUrlLine = Get-Content $envFile | Where-Object { $_ -match "^DATABASE_URL=" }
    if ($dbUrlLine) {
        $dbUrl = $dbUrlLine.Split("=", 2)[1].Trim()
        Write-Host "Executing migration_indexing.sql against database..." -ForegroundColor Blue
        # Resolve psql.exe path
        $psqlPath = "C:\Program Files\PostgreSQL\18\bin\psql.exe"
        if (Test-Path $psqlPath) {
            & $psqlPath -d $dbUrl -f "$PSScriptRoot\migration_indexing.sql"
            if ($LASTEXITCODE -eq 0) {
                Write-Host "Successfully applied migration_indexing.sql!" -ForegroundColor Green
            } else {
                Write-Warning "Migration execution failed with exit code $LASTEXITCODE."
            }
        } else {
            # Try path-based lookup
            $psqlCmd = Get-Command psql -ErrorAction SilentlyContinue
            if ($psqlCmd) {
                & psql -d $dbUrl -f "$PSScriptRoot\migration_indexing.sql"
                if ($LASTEXITCODE -eq 0) {
                    Write-Host "Successfully applied migration_indexing.sql!" -ForegroundColor Green
                } else {
                    Write-Warning "Migration execution failed with exit code $LASTEXITCODE."
                }
            } else {
                Write-Warning "psql.exe not found at '$psqlPath' or in PATH. Please run migration_indexing.sql manually."
            }
        }
    } else {
        Write-Warning "DATABASE_URL not found in '$envFile'. Skipping migration execution."
    }
} else {
    Write-Warning "'$envFile' file not found. Skipping migration execution."
}


# 2. Start Go Backend (whatsmeow + REST API)
Write-Host "Step 2: Launching Go REST API backend..." -ForegroundColor Blue
Start-Process powershell -ArgumentList "-NoExit", "-Command", "go run ." -WorkingDirectory "$PSScriptRoot\backend" -WindowStyle Normal

# 3. Start Next.js Frontend
Write-Host "Step 3: Launching Next.js frontend..." -ForegroundColor Blue
Start-Process powershell -ArgumentList "-NoExit", "-Command", "npm run dev" -WorkingDirectory "$PSScriptRoot\frontend" -WindowStyle Normal


Write-Host "---------------------------------------------" -ForegroundColor Green
Write-Host "All services have been launched!" -ForegroundColor Green
Write-Host "- Database: Running on localhost:5432" -ForegroundColor Slate
Write-Host "- Go REST API: Running on http://localhost:8081" -ForegroundColor Slate
Write-Host "- Next.js UI: Running on http://localhost:3000" -ForegroundColor Slate
Write-Host "Please check the spawned console windows for live logs." -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Green
