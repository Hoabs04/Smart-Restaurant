# ==============================================================================
# PowerShell Script Restore Cơ sở dữ liệu PostgreSQL (Windows)
# ==============================================================================

param(
    [Parameter(Mandatory=$true)]
    [string]$BackupFile,
    [string]$DbHost = "localhost",
    [int]$DbPort = 5432,
    [string]$DbName = "smart_restaurant",
    [string]$DbUser = "postgres",
    [string]$DbPassword = "postgres_password"
)

if (-not (Test-Path $BackupFile)) {
    Write-Host "❌ Lỗi: File $BackupFile không tồn tại." -ForegroundColor Red
    exit 1
}

Write-Host "🔄 Bắt đầu phục hồi cơ sở dữ liệu $DbName từ $BackupFile..." -ForegroundColor Cyan

$env:PGPASSWORD = $DbPassword
& psql -h $DbHost -p $DbPort -U $DbUser -d $DbName -f $BackupFile

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Khôi phục cơ sở dữ liệu thành công." -ForegroundColor Green
} else {
    Write-Host "❌ Khôi phục thất bại hoặc không tìm thấy lệnh psql." -ForegroundColor Red
}
