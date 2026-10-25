#!/bin/bash
# ==============================================================================
# Script Backup Cơ sở dữ liệu PostgreSQL / Amazon RDS
# Đề tài: Hệ thống Quản lý Nhà hàng Thông minh trên nền tảng AWS
# ==============================================================================

set -e

BACKUP_DIR="./backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/smart_restaurant_backup_${TIMESTAMP}.sql.gz"

mkdir -p "${BACKUP_DIR}"

# Lấy thông tin từ biến môi trường hoặc tham số
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-smart_restaurant}"
DB_USER="${DB_USER:-postgres}"

echo "📦 Đang thực hiện sao lưu cơ sở dữ liệu ${DB_NAME} từ ${DB_HOST}:${DB_PORT}..."

if [ -n "${DATABASE_URL}" ]; then
  pg_dump "${DATABASE_URL}" | gzip > "${BACKUP_FILE}"
else
  PGPASSWORD="${DB_PASSWORD:-postgres_password}" pg_dump -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" | gzip > "${BACKUP_FILE}"
fi

FILE_SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
echo "✅ Sao lưu thành công: ${BACKUP_FILE} (Kích thước: ${FILE_SIZE})"
echo "Thời điểm sao lưu: $(date)"
