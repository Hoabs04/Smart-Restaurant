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
    [string]$DbPassword = $env:DB_PASSWORD
)

if (-not (Test-Path $BackupFile)) {
    Write-Host "❌ Lỗi: File $BackupFile không tồn tại." -ForegroundColor Red
    exit 1
}

if (-not $DbPassword -and -not $env:DATABASE_URL) {
    Write-Host "❌ Lỗi: Vui lòng truyền -DbPassword hoặc thiết lập biến môi trường DB_PASSWORD / DATABASE_URL." -ForegroundColor Red
    exit 1
}

Write-Host "🔄 Bắt đầu phục hồi cơ sở dữ liệu $DbName từ $BackupFile..." -ForegroundColor Cyan

$prevPgPass = $env:PGPASSWORD
try {
    if ($env:DATABASE_URL) {
        & psql -v ON_ERROR_STOP=1 $env:DATABASE_URL -f $BackupFile
    } else {
        $env:PGPASSWORD = $DbPassword
        & psql -v ON_ERROR_STOP=1 -h $DbHost -p $DbPort -U $DbUser -d $DbName -f $BackupFile
    }

    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Khôi phục cơ sở dữ liệu thành công." -ForegroundColor Green
    } else {
        Write-Host "❌ Khôi phục thất bại (exit code: $LASTEXITCODE)." -ForegroundColor Red
        exit 1
    }
} finally {
    if ($null -eq $prevPgPass) {
        Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    } else {
        $env:PGPASSWORD = $prevPgPass
    }
}
