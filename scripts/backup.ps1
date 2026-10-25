# ==============================================================================
# PowerShell Script Backup Cơ sở dữ liệu PostgreSQL (Windows)
# ==============================================================================

param(
    [string]$DbHost = "localhost",
    [int]$DbPort = 5432,
    [string]$DbName = "smart_restaurant",
    [string]$DbUser = "postgres",
    [string]$DbPassword = "postgres_password"
)

$backupDir = Join-Path $PSScriptRoot "..\backups"
if (-not (Test-Path $backupDir)) {
    New-Item -ItemType Directory -Path $backupDir | Out-Null
}

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupFile = Join-Path $backupDir "smart_restaurant_backup_$timestamp.sql"

Write-Host "📦 Đang thực hiện sao lưu cơ sở dữ liệu $DbName..." -ForegroundColor Cyan

$env:PGPASSWORD = $DbPassword
& pg_dump -h $DbHost -p $DbPort -U $DbUser -d $DbName -f $backupFile

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Sao lưu thành công: $backupFile" -ForegroundColor Green
} else {
    Write-Host "⚠️ pg_dump không có sẵn trên máy host. Thư mục dữ liệu PGlite được lưu tại .db_pglite" -ForegroundColor Yellow
}
