import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 12 bytes recommended for GCM
const AUTH_TAG_LENGTH = 16;

function loadEnvIfMissing() {
  if (process.env.SALES_CHANNEL_ENCRYPTION_KEY && process.env.JWT_SECRET) return;
  try {
    const envPath = path.join(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf-8');
      content.split(/\r?\n/).forEach((line: string) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (!(key in process.env)) {
            process.env[key] = val;
          }
        }
      });
    }
  } catch {}
}

/**
 * Lấy encryption key 32 bytes từ biến môi trường.
 * Nếu chưa cấu hình SALES_CHANNEL_ENCRYPTION_KEY, tạo một key phái sinh an toàn từ JWT_SECRET hoặc fallback chuẩn.
 */
function getEncryptionKey(): Buffer {
  loadEnvIfMissing();
  const customKey = process.env.SALES_CHANNEL_ENCRYPTION_KEY;
  if (customKey && customKey.length >= 32) {
    return crypto.createHash('sha256').update(customKey).digest();
  }

  // Trong môi trường production, bắt buộc phải có key mã hóa riêng biệt, không được fallback
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Lỗi bảo mật nghiêm trọng: Thiếu biến môi trường SALES_CHANNEL_ENCRYPTION_KEY (tối thiểu 32 ký tự) trong môi trường production.');
  }

  const jwtSecret = process.env.JWT_SECRET || 'smart_restaurant_dev_only_secret_key_minimum_32_chars_2026';
  return crypto.createHash('sha256').update(`sales_channel_salt:${jwtSecret}`).digest();
}

/**
 * Mã hóa chuỗi nhạy cảm bằng thuật toán AES-256-GCM
 * Định dạng xuất: iv:authTag:ciphertext (dạng Hex)
 */
export function encryptSecret(plainText: string): string {
  if (!plainText) return '';
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Giải mã chuỗi đã mã hóa bằng AES-256-GCM
 */
export function decryptSecret(encryptedPayload: string): string {
  if (!encryptedPayload) return '';

  const parts = encryptedPayload.split(':');
  if (parts.length !== 3) {
    // Nếu payload cũ hoặc không đúng định dạng thì trả về chuỗi rỗng
    return '';
  }

  const [ivHex, authTagHex, encryptedHex] = parts;
  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  try {
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('Lỗi giải mã secret:', err);
    return '';
  }
}

/**
 * Tạo chữ ký HMAC-SHA256 cho webhook
 */
export function computeHmacSha256(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * So sánh an toàn 2 chuỗi chữ ký (tránh Timing Attack)
 */
export function secureTimingCompare(a: string, b: string): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

const SENSITIVE_KEYS = new Set([
  'app_secret',
  'appsecret',
  'secret',
  'access_token',
  'accesstoken',
  'refresh_token',
  'refreshtoken',
  'webhook_secret',
  'webhooksecret',
  'password',
  'token',
  'authorization',
  'api_key',
  'apikey',
  'credit_card',
]);

const PII_PHONE_KEYS = new Set([
  'phone',
  'customerphone',
  'driverphone',
  'phonenumber',
  'telephone',
  'mobile',
  'shipperphone',
]);

/**
 * Lọc và che giấu các trường nhạy cảm trong dữ liệu trước khi log hoặc lưu vào DB
 */
export function sanitizeForLogging(data: any): any {
  if (data === null || data === undefined) return data;
  if (typeof data !== 'object') return data;

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeForLogging(item));
  }

  const cleaned: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase().replace(/[-_]/g, '');
    if (SENSITIVE_KEYS.has(lowerKey) || lowerKey.includes('secret') || lowerKey.includes('token') || lowerKey.includes('password')) {
      cleaned[key] = '***REDACTED***';
    } else if (PII_PHONE_KEYS.has(lowerKey) && typeof value === 'string') {
      cleaned[key] = maskPhoneNumber(value);
    } else if (typeof value === 'object' && value !== null) {
      cleaned[key] = sanitizeForLogging(value);
    } else {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

/**
 * Che giấu thông tin cá nhân (PII) như số điện thoại (ví dụ: 097****233)
 */
export function maskPhoneNumber(phone?: string | null): string {
  if (!phone) return '';
  const cleaned = phone.trim();
  if (cleaned.length < 6) return '***';
  return `${cleaned.slice(0, 3)}****${cleaned.slice(-3)}`;
}

