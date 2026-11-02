import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';

export interface PaymentConfig {
  enabled: boolean;
  bankBin: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
}

export interface OrderQrPaymentData {
  configured: boolean;
  message?: string;
  bankBin?: string;
  bankName?: string;
  accountNumber?: string;
  accountName?: string;
  amount?: number;
  orderCode?: string;
  transferContent?: string;
  qrDataUrl?: string;
  vietQrUrl?: string;
}

function ensureEnvLoaded() {
  if (process.env.PAYMENT_QR_ENABLED !== undefined) return;
  try {
    const envPath = path.join(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf-8');
      content.split(/\r?\n/).forEach(line => {
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
 * Đọc cấu hình tài khoản ngân hàng từ biến môi trường
 */
export function getPaymentConfig(): PaymentConfig | null {
  ensureEnvLoaded();
  const enabled = process.env.PAYMENT_QR_ENABLED === 'true';
  const bankBin = process.env.PAYMENT_BANK_BIN?.trim() || '';
  const bankName = process.env.PAYMENT_BANK_NAME?.trim() || '';
  const accountNumber = process.env.PAYMENT_ACCOUNT_NUMBER?.trim() || '';
  const accountName = process.env.PAYMENT_ACCOUNT_NAME?.trim() || '';

  if (!enabled || !bankBin || !bankName || !accountNumber || !accountName) {
    return null;
  }

  return {
    enabled,
    bankBin,
    bankName,
    accountNumber,
    accountName,
  };
}

/**
 * Tạo nội dung chuyển khoản chuẩn theo mã order
 * Ví dụ: THANHTOAN ORD-20261026-A12B
 */
export function buildTransferContent(orderCode: string): string {
  const cleanCode = (orderCode || '').trim().toUpperCase();
  return `THANHTOAN ${cleanCode}`;
}

/**
 * Tạo mã QR chuyển khoản ngân hàng chuẩn VietQR mô phỏng
 * Lưu ý: Số tiền (totalAmount) BẮT BUỘC phải lấy từ Server tính toán trong DB, tuyệt đối không lấy từ Client.
 */
export async function generateOrderQrCode(params: {
  orderCode: string;
  totalAmount: number;
}): Promise<OrderQrPaymentData> {
  const config = getPaymentConfig();

  if (!config) {
    return {
      configured: false,
      message: 'Chưa cấu hình thông tin QR chuyển khoản.',
    };
  }

  const { bankBin, bankName, accountNumber, accountName } = config;
  const { orderCode, totalAmount } = params;

  // Đảm bảo số tiền không âm và làm tròn số nguyên
  const amount = Math.max(0, Math.round(Number(totalAmount) || 0));
  const transferContent = buildTransferContent(orderCode);

  // Định dạng chuẩn Quick Link VietQR (Napas247)
  const vietQrUrl = `https://img.vietqr.io/image/${bankBin}-${accountNumber}-compact.png?amount=${amount}&addInfo=${encodeURIComponent(
    transferContent
  )}&accountName=${encodeURIComponent(accountName)}`;

  // Chuỗi payload chứa đầy đủ thông tin để quét QR offline / local
  // Tuân thủ tối thiểu: Ngân hàng, Số tài khoản, Tên tài khoản, Số tiền, Nội dung chuyển khoản
  const qrPayload = [
    `VIETQR:`,
    `BANK=${bankName} (${bankBin})`,
    `ACCOUNT=${accountNumber}`,
    `NAME=${accountName}`,
    `AMOUNT=${amount}`,
    `CONTENT=${transferContent}`,
    `URL=${vietQrUrl}`,
  ].join('|');

  try {
    // Tạo ảnh QR Code base64 Data URL độc lập, hoạt động hoàn toàn offline không phụ thuộc internet
    const qrDataUrl = await QRCode.toDataURL(vietQrUrl || qrPayload, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 320,
      color: {
        dark: '#0f172a', // Màu than đậm sắc nét tương thích Light Theme
        light: '#ffffff', // Nền trắng tinh khôi
      },
    });

    return {
      configured: true,
      bankBin,
      bankName,
      accountNumber,
      accountName,
      amount,
      orderCode,
      transferContent,
      qrDataUrl,
      vietQrUrl,
    };
  } catch (error) {
    console.error('Lỗi khi tạo ảnh QR Code với thư viện qrcode:', error);
    // Fallback an toàn với link VietQR nếu thư viện gặp sự cố, không làm crash app
    return {
      configured: true,
      bankBin,
      bankName,
      accountNumber,
      accountName,
      amount,
      orderCode,
      transferContent,
      vietQrUrl,
    };
  }
}
