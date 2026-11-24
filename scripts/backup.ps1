# ==============================================================================
# PowerShell Script Backup Cơ sở dữ liệu PostgreSQL (Windows)
# ==============================================================================

param(
    [string]$DbHost = "localhost",
    [int]$DbPort = 5432,
    [string]$DbName = "smart_restaurant",
    [string]$DbUser = "postgres",
    [string]$DbPassword = $env:DB_PASSWORD
)

if (-not $DbPassword -and -not $env:DATABASE_URL) {
    Write-Host "❌ Lỗi: Vui lòng truyền -DbPassword hoặc thiết lập biến môi trường DB_PASSWORD / DATABASE_URL." -ForegroundColor Red
    exit 1
}

$backupDir = Join-Path $PSScriptRoot "..\backups"
if (-not (Test-Path $backupDir)) {
    New-Item -ItemType Directory -Path $backupDir | Out-Null
}

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupFile = Join-Path $backupDir "smart_restaurant_backup_$timestamp.sql"

Write-Host "📦 Đang thực hiện sao lưu cơ sở dữ liệu $DbName..." -ForegroundColor Cyan

$prevPgPass = $env:PGPASSWORD
try {
    if ($env:DATABASE_URL) {
        & pg_dump $env:DATABASE_URL -f $backupFile
    } else {
        $env:PGPASSWORD = $DbPassword
        & pg_dump -h $DbHost -p $DbPort -U $DbUser -d $DbName -f $backupFile
    }

    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Sao lưu thành công: $backupFile" -ForegroundColor Green
    } else {
        Write-Host "❌ Sao lưu thất bại (exit code: $LASTEXITCODE)." -ForegroundColor Red
        exit 1
    }
} finally {
    if ($null -eq $prevPgPass) {
        Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    } else {
        $env:PGPASSWORD = $prevPgPass
    }
}
