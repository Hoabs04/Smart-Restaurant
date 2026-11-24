import fs from 'fs';
import path from 'path';

let envLoaded = false;

/**
 * Nạp biến môi trường từ file .env cục bộ nếu chưa có trong process.env (chỉ dùng cho dev/test).
 */
export function loadEnvIfMissing(): void {
  if (envLoaded) return;
  envLoaded = true;
  try {
    const envPath = path.join(process.cwd(), '.env');
    if (!fs.existsSync(envPath)) return;

    const content = fs.readFileSync(envPath, 'utf-8');
    content.split(/\r?\n/).forEach((line: string) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        if (!(key in process.env)) {
          process.env[key] = val;
        }
      }
    });
  } catch {
    // Bỏ qua nếu không thể đọc file .env
  }
}
