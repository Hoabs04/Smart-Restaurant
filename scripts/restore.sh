#!/bin/bash
# ==============================================================================
# Script Khôi phục (Restore) Cơ sở dữ liệu PostgreSQL / Amazon RDS
# Đề tài: Hệ thống Quản lý Nhà hàng Thông minh trên nền tảng AWS
# ==============================================================================

set -e

if [ -z "$1" ]; then
  echo "❌ Lỗi: Vui lòng cung cấp đường dẫn file backup (.sql hoặc .sql.gz)"
  echo "Cách dùng: ./scripts/restore.sh backups/smart_restaurant_backup_YYYYMMDD_HHMMSS.sql.gz"
  exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "${BACKUP_FILE}" ]; then
  echo "❌ Lỗi: File ${BACKUP_FILE} không tồn tại."
  exit 1
fi

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-smart_restaurant}"
DB_USER="${DB_USER:-postgres}"

echo "🔄 Bắt đầu phục hồi cơ sở dữ liệu ${DB_NAME} từ file ${BACKUP_FILE}..."

if [[ "${BACKUP_FILE}" == *.gz ]]; then
  gunzip -c "${BACKUP_FILE}" | PGPASSWORD="${DB_PASSWORD:-postgres_password}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}"
else
  PGPASSWORD="${DB_PASSWORD:-postgres_password}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -f "${BACKUP_FILE}"
fi

echo "✅ Phục hồi cơ sở dữ liệu thành công."
echo "Thời điểm hoàn tất: $(date)"
