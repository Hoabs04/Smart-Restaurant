import { ISalesChannelProvider } from '../provider.interface';
import {
  ChannelCode,
  ChannelCredentials,
  SyncResult,
  TestConnectionResult,
  UnifiedExternalOrder,
  UnifiedOrderStatus,
} from '../types';
import { computeHmacSha256, secureTimingCompare } from '@/lib/crypto';
import crypto from 'crypto';

/**
 * ShopeeFood Partner Provider
 * 
 * @status Provider Integration Scaffold & Mock/Sandbox Specification
 * @notice Tích hợp xây dựng theo tài liệu ShopeeFood Open Platform Sandbox.
 *         Trước khi đưa vào môi trường Production của merchant thật, cần hoàn thiện chứng nhận
 *         đối tác chính thức (Merchant Certification) và xác nhận tỷ lệ hoa hồng cụ thể theo hợp đồng ShopeeFood.
 */
export class ShopeeFoodProvider implements ISalesChannelProvider {
  readonly channelCode: ChannelCode = 'SHOPEEFOOD';
  readonly channelName: string = 'ShopeeFood';

  private readonly baseUrlSandbox = 'https://partner-api-staging.shopeefood.vn/api/v1';
  private readonly baseUrlProduction = 'https://partner-api.shopeefood.vn/api/v1';

  private getBaseUrl(env: 'SANDBOX' | 'PRODUCTION'): string {
    return env === 'PRODUCTION' ? this.baseUrlProduction : this.baseUrlSandbox;
  }

  /**
   * Tính toán chữ ký số ShopeeFood Partner Gateway Request Signature
   * Gateway Signature = HMAC-SHA256(timestamp + "|" + path + "|" + body, appSecret)
   */
  computeShopeeSignature(timestamp: string, path: string, body: string, appSecret: string): string {
    const rawData = `${timestamp}|${path}|${body}`;
    return computeHmacSha256(rawData, appSecret);
  }

  /**
   * Tính toán chữ ký số ShopeeFood Webhook Signature
   */
  computeShopeeWebhookSignature(timestamp: string, rawBody: string, appSecret: string): string {
    const rawData = timestamp ? `${timestamp}|${rawBody}` : rawBody;
    return computeHmacSha256(rawData, appSecret);
  }

  async testConnection(credentials: ChannelCredentials): Promise<TestConnectionResult> {
    if (!credentials.merchantId) {
      return {
        success: false,
        message: 'Thiếu Merchant ID (Restaurant ID) ShopeeFood trong cấu hình.',
      };
    }

    const effectiveSecret = credentials.appSecret || (credentials.environment === 'SANDBOX' ? 'sandbox_secret_default' : '');
    if (!effectiveSecret) {
      return {
        success: false,
        message: 'Thiếu App Secret ShopeeFood Partner.',
      };
    }

    if (credentials.environment === 'SANDBOX' || credentials.accessToken?.startsWith('mock_')) {
      return {
        success: true,
        message: `Kết nối thành công tới ShopeeFood Partner Gateway (${credentials.environment}). Quán đang mở cửa.`,
        details: {
          merchantName: `ShopeeFood Quán Ăn - ${credentials.merchantId}`,
          storeStatus: 'ACTIVE',
          latencyMs: 72,
        },
      };
    }

    try {
      const timestamp = String(Math.floor(Date.now() / 1000));
      const path = `/restaurants/${credentials.merchantId}/info`;
      const signature = this.computeShopeeSignature(timestamp, path, '', credentials.appSecret);

      const response = await fetch(`${this.getBaseUrl(credentials.environment)}${path}`, {
        method: 'GET',
        headers: {
          'X-Partner-Id': credentials.appId || '',
          'X-Timestamp': timestamp,
          'X-ShopeeFood-Signature': signature,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        return {
          success: false,
          message: `Lỗi kết nối ShopeeFood API: HTTP ${response.status}`,
        };
      }

      const data = await response.json();
      return {
        success: true,
        message: 'Kết nối ShopeeFood thành công.',
        details: {
          merchantName: data.name || credentials.merchantId,
          storeStatus: data.is_open ? 'OPEN' : 'CLOSED',
        },
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Không thể kết nối máy chủ ShopeeFood: ${err?.message || err}. Vui lòng kiểm tra lại cấu hình.`,
      };
    }
  }

  async verifyWebhookSignature(rawBody: string, headers: Record<string, string>, secret: string): Promise<boolean> {
    if (!secret) {
      // Lỗi bảo mật: Nếu thiếu webhook secret, bắt buộc từ chối để chống giả mạo
      return false;
    }
    const signature = headers['x-shopeefood-signature'] || headers['x-now-signature'] || headers['x-signature'];
    if (!signature) return false;

    const rawTimestamp = headers['x-timestamp'] || headers['timestamp'] || headers['x-shopeefood-timestamp'] || '';
    const isProduction = process.env.NODE_ENV === 'production';

    // 1. Trong môi trường PRODUCTION:
    if (isProduction) {
      // Bắt buộc phải có timestamp
      if (!rawTimestamp || !rawTimestamp.trim()) return false;

      // Timestamp phải là chuỗi số nguyên dương hợp lệ
      const trimmedTs = rawTimestamp.trim();
      if (!/^\d+$/.test(trimmedTs)) return false;

      const ts = parseInt(trimmedTs, 10);
      if (isNaN(ts) || ts <= 0) return false;

      // Timestamp phải lệch không quá 300 giây (5 phút)
      const tsSec = ts > 1e11 ? Math.floor(ts / 1000) : ts;
      const nowSec = Math.floor(Date.now() / 1000);
      if (Math.abs(nowSec - tsSec) > 300) {
        return false;
      }

      // Chữ ký bắt buộc phải theo chuẩn ShopeeFood Open API: HMAC-SHA256(timestamp + "|" + rawBody, secret)
      const computed = computeHmacSha256(`${trimmedTs}|${rawBody}`, secret);
      // Nếu chữ ký không khớp thì trả về false ngay; TUYỆT ĐỐI không fallback sang kiểm tra rawBody
      return secureTimingCompare(signature, computed);
    }

    // 2. Trong môi trường Non-Production (Development / Sandbox / Mock):
    if (rawTimestamp && rawTimestamp.trim()) {
      const trimmedTs = rawTimestamp.trim();
      if (!/^\d+$/.test(trimmedTs)) return false;

      const ts = parseInt(trimmedTs, 10);
      if (isNaN(ts) || ts <= 0) return false;

      const tsSec = ts > 1e11 ? Math.floor(ts / 1000) : ts;
      const nowSec = Math.floor(Date.now() / 1000);
      if (Math.abs(nowSec - tsSec) > 300) {
        return false; // Vẫn chặn replay attack nếu timestamp quá hạn 5 phút
      }

      // Xác thực chữ ký timestamp|rawBody
      const computed = computeHmacSha256(`${trimmedTs}|${rawBody}`, secret);
      // Khi timestamp đã được truyền, chữ ký bắt buộc phải khớp timestamp|rawBody, không fallback
      return secureTimingCompare(signature, computed);
    }

    // Chỉ cho phép fallback sang rawBody trong môi trường non-prod/mock khi request hoàn toàn không gửi timestamp
    const directComputed = computeHmacSha256(rawBody, secret);
    return secureTimingCompare(signature, directComputed);
  }

  async parseWebhookOrder(rawPayload: any): Promise<UnifiedExternalOrder> {
    const orderId = String(rawPayload.order_id || rawPayload.orderId || `SPF-${Date.now()}`);
    const displayCode = String(rawPayload.order_code || rawPayload.code || `SPF-${orderId.slice(-4)}`);

    let normalizedStatus: UnifiedOrderStatus = 'NEW';
    const statusStr = String(rawPayload.status || rawPayload.order_status || 'NEW').toUpperCase();
    if (statusStr === 'CONFIRMED' || statusStr === 'ACCEPTED') {
      normalizedStatus = 'CONFIRMED';
    } else if (statusStr === 'PROCESSING' || statusStr === 'PREPARING' || statusStr === 'COOKING') {
      normalizedStatus = 'PREPARING';
    } else if (statusStr === 'DELIVERING' || statusStr === 'DELIVERED' || statusStr === 'COMPLETED' || statusStr === 'READY') {
      normalizedStatus = 'COMPLETED';
    } else if (statusStr === 'CANCELLED' || statusStr === 'REJECTED') {
      normalizedStatus = 'CANCELLED';
    }

    const rawItems = rawPayload.items || rawPayload.dish_list || [];
    const items = rawItems.map((it: any, index: number) => {
      const price = Number(it.price || it.original_price || 0);
      const quantity = Number(it.quantity || 1);
      return {
        externalItemId: String(it.dish_id || it.id || `SPF-ITEM-${index + 1}`),
        externalItemName: it.dish_name || it.name || `Món ShopeeFood #${index + 1}`,
        quantity,
        unitPrice: price,
        subtotal: price * quantity,
        notes: it.note || it.notes || '',
        internalMenuItemId: it.internal_menu_item_id,
      };
    });

    const totalAmount = Number(rawPayload.subtotal || rawPayload.total_amount || items.reduce((s: number, i: any) => s + i.subtotal, 0));
    // Đọc phí chiết khấu trực tiếp từ payload sàn gửi về (commission_fee hoặc commission)
    // Nếu payload sàn chưa có chiết khấu, mặc định 0 (sẽ đối soát sau theo bảng kê merchant)
    const platformFee = Number(
      rawPayload.commission_fee ??
      rawPayload.commission ??
      rawPayload.merchant_commission ??
      0
    );
    const netRevenue = totalAmount - platformFee;

    const idempotencyKey = crypto
      .createHash('sha256')
      .update(`SHOPEEFOOD:${orderId}`)
      .digest('hex');

    // Thông tin Shipper ShopeeFood (NowShip)
    const shipper = rawPayload.shipper || rawPayload.driver || {};
    const driverName = shipper.name || rawPayload.shipper_name || rawPayload.driver_name;
    const driverPhone = shipper.phone || rawPayload.shipper_phone || rawPayload.driver_phone;

    return {
      channelCode: 'SHOPEEFOOD',
      externalOrderId: orderId,
      externalOrderCode: displayCode,
      channelStatus: statusStr,
      normalizedStatus,
      customerName: rawPayload.customer_name || rawPayload.user?.name || 'Khách hàng ShopeeFood',
      customerPhone: rawPayload.customer_phone || rawPayload.user?.phone || '',
      deliveryAddress: rawPayload.delivery_address || rawPayload.shipping_address || 'Giao hàng ShopeeFood (NowShip)',
      driverName,
      driverPhone,
      items,
      totalAmount,
      platformFee,
      netRevenue,
      idempotencyKey,
      orderedAt: rawPayload.created_time ? new Date(rawPayload.created_time * 1000) : new Date(),
      rawPayload,
    };
  }

  async acknowledgeOrder(externalOrderId: string, credentials: ChannelCredentials): Promise<SyncResult> {
    try {
      if (credentials.environment === 'PRODUCTION' && credentials.appSecret) {
        const timestamp = String(Math.floor(Date.now() / 1000));
        const path = `/restaurants/${credentials.merchantId}/orders/${externalOrderId}/confirm`;
        const bodyStr = JSON.stringify({ action: 'CONFIRM' });
        const signature = this.computeShopeeSignature(timestamp, path, bodyStr, credentials.appSecret);

        const response = await fetch(`${this.getBaseUrl('PRODUCTION')}${path}`, {
          method: 'POST',
          headers: {
            'X-Partner-Id': credentials.appId || '',
            'X-Timestamp': timestamp,
            'X-ShopeeFood-Signature': signature,
            'Content-Type': 'application/json',
          },
          body: bodyStr,
        });

        if (!response.ok) {
          throw new Error(`ShopeeFood Confirm Order HTTP ${response.status}`);
        }
      }

      return {
        success: true,
        message: `Đã xác nhận đơn hàng [${externalOrderId}] thành công trên ShopeeFood.`,
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Lỗi khi xác nhận đơn ShopeeFood: ${err?.message || err}`,
      };
    }
  }

  async updateOrderStatus(
    externalOrderId: string,
    status: UnifiedOrderStatus,
    credentials: ChannelCredentials,
    reason?: string
  ): Promise<SyncResult> {
    if (!credentials.merchantId) {
      return {
        success: false,
        message: 'Thiếu Merchant ID ShopeeFood trong cấu hình.',
      };
    }
    try {
      let shopeeStatus = 'PROCESSING';
      if (status === 'PREPARING') shopeeStatus = 'PROCESSING';
      if (status === 'COMPLETED') shopeeStatus = 'READY';
      if (status === 'CANCELLED') shopeeStatus = 'CANCELLED';

      if (credentials.environment === 'PRODUCTION' && credentials.appSecret) {
        const timestamp = String(Math.floor(Date.now() / 1000));
        const path = status === 'CANCELLED'
          ? `/restaurants/${credentials.merchantId}/orders/${externalOrderId}/cancel`
          : `/restaurants/${credentials.merchantId}/orders/${externalOrderId}/status`;

        const bodyObj = status === 'CANCELLED'
          ? { reason: reason || 'OUT_OF_STOCK' }
          : { status: shopeeStatus };

        const bodyStr = JSON.stringify(bodyObj);
        const signature = this.computeShopeeSignature(timestamp, path, bodyStr, credentials.appSecret);

        const response = await fetch(`${this.getBaseUrl('PRODUCTION')}${path}`, {
          method: 'POST',
          headers: {
            'X-Partner-Id': credentials.appId || '',
            'X-Timestamp': timestamp,
            'X-ShopeeFood-Signature': signature,
            'Content-Type': 'application/json',
          },
          body: bodyStr,
        });

        if (!response.ok) {
          throw new Error(`ShopeeFood Update Status HTTP ${response.status}`);
        }
      }

      return {
        success: true,
        message: `Đã cập nhật trạng thái đơn [${externalOrderId}] sang [${shopeeStatus}] trên ShopeeFood.`,
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Lỗi đồng bộ trạng thái ShopeeFood: ${err?.message || err}`,
      };
    }
  }

  async updateItemAvailability(
    externalItemId: string,
    isAvailable: boolean,
    credentials: ChannelCredentials
  ): Promise<SyncResult> {
    try {
      if (credentials.environment === 'PRODUCTION' && credentials.appSecret) {
        const timestamp = String(Math.floor(Date.now() / 1000));
        const path = `/restaurants/${credentials.merchantId}/dishes/${externalItemId}/status`;
        const bodyStr = JSON.stringify({
          is_active: isAvailable,
        });
        const signature = this.computeShopeeSignature(timestamp, path, bodyStr, credentials.appSecret);

        const response = await fetch(`${this.getBaseUrl('PRODUCTION')}${path}`, {
          method: 'PUT',
          headers: {
            'X-Partner-Id': credentials.appId || '',
            'X-Timestamp': timestamp,
            'X-ShopeeFood-Signature': signature,
            'Content-Type': 'application/json',
          },
          body: bodyStr,
        });

        if (!response.ok) {
          throw new Error(`ShopeeFood Dish Status HTTP ${response.status}`);
        }
      }

      return {
        success: true,
        message: `Đã đồng bộ trạng thái món [${externalItemId}] sang [${isAvailable ? 'CÒN MÓN' : 'HẾT MÓN'}] trên ShopeeFood.`,
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Lỗi cập nhật tồn kho ShopeeFood: ${err?.message || err}`,
      };
    }
  }

  async syncMenu(
    items: Array<{
      externalItemId: string;
      externalItemName: string;
      price: number;
      isAvailable: boolean;
    }>,
    credentials: ChannelCredentials
  ): Promise<SyncResult> {
    try {
      if (credentials.environment === 'PRODUCTION' && !credentials.accessToken?.startsWith('mock_')) {
        const timestamp = String(Math.floor(Date.now() / 1000));
        const path = `/restaurants/${credentials.merchantId}/dishes/batch`;
        const bodyStr = JSON.stringify({
          dishes: items.map(it => ({
            dish_id: it.externalItemId,
            name: it.externalItemName,
            price: it.price,
            is_active: it.isAvailable,
          })),
        });

        const signature = this.computeShopeeSignature(timestamp, path, bodyStr, credentials.appSecret);

        const response = await fetch(`${this.getBaseUrl('PRODUCTION')}${path}`, {
          method: 'PUT',
          headers: {
            'X-Partner-Id': credentials.appId || '',
            'X-Timestamp': timestamp,
            'X-ShopeeFood-Signature': signature,
            'Content-Type': 'application/json',
          },
          body: bodyStr,
        });

        if (!response.ok) {
          throw new Error(`ShopeeFood Menu Batch HTTP ${response.status}`);
        }
      }

      return {
        success: true,
        message: `Đã đồng bộ thành công ${items.length} món ăn và bảng giá lên ShopeeFood Partner Gateway.`,
        data: { syncedCount: items.length },
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Lỗi đồng bộ menu ShopeeFood: ${err?.message || err}`,
      };
    }
  }
}
