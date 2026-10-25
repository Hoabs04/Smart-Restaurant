import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Định dạng tiền tệ Việt Nam Đồng (VND)
 */
export function formatCurrency(amount: number | string | null | undefined): string {
  const num = typeof amount === 'number' ? amount : Number(amount || 0);
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(num);
}

/**
 * Định dạng ngày giờ chuẩn tiếng Việt
 */
export function formatDateTime(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return '--';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '--';

  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
}

/**
 * Tính số phút và giây đã trôi qua kể từ thời điểm gửi bếp
 */
export function getWaitTimeSeconds(sentAt: string | Date): number {
  const sent = new Date(sentAt).getTime();
  const now = Date.now();
  return Math.max(0, Math.floor((now - sent) / 1000));
}

/**
 * Định dạng chuỗi thời gian chờ (ví dụ: "12 phút 30 giây" hoặc "08:45")
 */
export function formatWaitTime(sentAt: string | Date): string {
  const totalSeconds = getWaitTimeSeconds(sentAt);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) {
    return `${minutes}p ${seconds.toString().padStart(2, '0')}s`;
  }
  return `${seconds}s`;
}

/**
 * Kiểm tra xem batch hoặc món có bị chờ quá 10 phút không
 * Quy tắc: Tại đúng 10 phút (600s) CHƯA cảnh báo, chỉ cảnh báo khi > 600s!
 */
export function isOverdueWarning(sentAt: string | Date, thresholdMinutes = 10): boolean {
  const totalSeconds = getWaitTimeSeconds(sentAt);
  return totalSeconds > thresholdMinutes * 60;
}

/**
 * Xác định trạng thái tồn kho kèm nhãn chữ và màu sắc
 * Quy tắc:
 * 0: Hết hàng
 * 1 - 4: Sắp hết (dưới ngưỡng 5)
 * >= 5: Bình thường (Còn hàng)
 */
export function getStockStatusInfo(stock: number, lowStockThreshold = 5) {
  if (stock <= 0) {
    return {
      status: 'OUT_OF_STOCK',
      label: 'Hết hàng',
      badgeClass: 'bg-red-100 text-red-700 border-red-300 dark:bg-red-950/50 dark:text-red-400 dark:border-red-800',
      isAvailable: false,
    };
  }
  if (stock < lowStockThreshold) {
    return {
      status: 'LOW_STOCK',
      label: `Sắp hết (${stock} phần)`,
      badgeClass: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/50 dark:text-amber-400 dark:border-amber-800',
      isAvailable: true,
    };
  }
  return {
    status: 'NORMAL',
    label: `Còn ${stock} phần`,
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-800',
    isAvailable: true,
  };
}
