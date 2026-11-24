/**
 * Chuẩn hóa tham số phân trang limit an toàn (tránh NaN, số âm hoặc DoS query quá lớn).
 */
export function parseBoundedLimit(
  rawValue: string | null | undefined,
  defaultLimit = 50,
  maxLimit = 200
): number {
  if (!rawValue) return defaultLimit;
  const parsed = Number.parseInt(rawValue, 10);
  if (Number.isNaN(parsed) || parsed < 1) return defaultLimit;
  return Math.min(parsed, maxLimit);
}

/**
 * Parse JSON an toàn từ chuỗi DB/request, trả fallback nếu malformed.
 */
export function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
