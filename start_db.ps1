# start_db.ps1
$PG_DIR = "C:\Program Files\PostgreSQL\18"
$DATA_DIR = "$PSScriptRoot\db_data"

# Check if PostgreSQL bin exists
if (-not (Test-Path "$PG_DIR\bin\initdb.exe")) {
    Write-Error "PostgreSQL 18 binaries not found at '$PG_DIR'. Please verify the path."
    Exit 1
}

# Check if data dir exists, if not, initialize
if (-not (Test-Path $DATA_DIR)) {
    Write-Host "Initializing PostgreSQL database cluster at '$DATA_DIR'..." -ForegroundColor Green
    & "$PG_DIR\bin\initdb.exe" -D $DATA_DIR -U postgres -A scram-sha-256 -W
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Database initialization failed."
        Exit $LASTEXITCODE
    }
}

Write-Host "Starting PostgreSQL database server on port 5432..." -ForegroundColor Green
& "$PG_DIR\bin\postgres.exe" -D $DATA_DIR -p 5432
