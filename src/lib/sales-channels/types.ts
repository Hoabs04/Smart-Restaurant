/**
 * Types & Data Contracts cho Module Kênh Bán Hàng (Sales Channels)
 */

export type ChannelCode = 'GRABFOOD' | 'SHOPEEFOOD' | 'BEFOOD' | 'MOCK';

export type UnifiedOrderStatus = 
  | 'NEW'         // Đơn mới từ sàn gửi về
  | 'CONFIRMED'   // Nhà hàng đã xác nhận đơn
  | 'PREPARING'   // Đang nấu / chế biến trong bếp
  | 'COMPLETED'   // Đã hoàn tất chế biến / Tài xế đã lấy món
  | 'CANCELLED';  // Đã hủy

export type ConnectionStatus = 'UNCONFIGURED' | 'CONNECTED' | 'ERROR' | 'DISABLED';

export interface UnifiedOrderItem {
  externalItemId: string;         // ID món trên sàn (vd: "GF-ITEM-101")
  externalItemName: string;       // Tên món hiển thị trên sàn
  quantity: number;
  unitPrice: number;              // Đơn giá bán trên sàn (VND)
  subtotal: number;
  notes?: string;                 // Ghi chú của khách (ít đá, cay vừa...)
  internalMenuItemId?: string;    // ID món tương ứng trong hệ thống nội bộ
  internalMenuItemName?: string;  // Tên món trong menu nội bộ
}

export interface UnifiedExternalOrder {
  channelCode: ChannelCode;
  externalOrderId: string;        // ID đơn duy nhất trên sàn
  externalOrderCode: string;      // Mã đơn hiển thị cho tài xế/khách (vd: "GF-8921")
  channelStatus: string;          // Trạng thái nguyên bản trên sàn
  normalizedStatus: UnifiedOrderStatus;
  customerName?: string;
  customerPhone?: string;
  deliveryAddress?: string;
  driverName?: string;
  driverPhone?: string;
  items: UnifiedOrderItem[];
  totalAmount: number;            // Tổng tiền khách thanh toán
  platformFee: number;           // Chiết khấu/phí dịch vụ sàn
  netRevenue: number;             // Doanh thu thực nhận = totalAmount - platformFee
  idempotencyKey: string;         // Khóa chống tạo trùng đơn
  orderedAt: Date;
  rawPayload?: Record<string, any>;
}

export interface ChannelCredentials {
  merchantId: string;
  storeId?: string;
  appId?: string;
  appSecret: string;
  accessToken?: string;
  refreshToken?: string;
  tokenExpiresAt?: Date;
  webhookSecret?: string;
  environment: 'SANDBOX' | 'PRODUCTION';
}

export interface SyncResult {
  success: boolean;
  message: string;
  data?: any;
  error?: string;
}

export interface TestConnectionResult {
  success: boolean;
  message: string;
  details?: {
    merchantName?: string;
    storeStatus?: string;
    latencyMs?: number;
  };
}

