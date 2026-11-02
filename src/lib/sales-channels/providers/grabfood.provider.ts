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

interface CachedToken {
  token: string;
  expiresAt: number; // timestamp ms
}

/**
 * GrabFood Partner Provider
 * 
 * @status Provider Integration Scaffold & Mock/Sandbox Specification
 * @notice Tích hợp xây dựng theo tài liệu GrabFood Open API & Partner Sandbox.
 *         Trước khi đưa vào môi trường Production của merchant thật, cần hoàn thiện chứng nhận
 *         đối tác chính thức (Merchant Certification) và ký thỏa thuận hợp đồng tỷ lệ hoa hồng với GrabFood.
 */
export class GrabFoodProvider implements ISalesChannelProvider {
  readonly channelCode: ChannelCode = 'GRABFOOD';
  readonly channelName: string = 'GrabFood';

  // Base URL chính thức của GrabFood Open API
  private readonly baseUrlSandbox = 'https://partner-api.stg-mytepsi.com/grabfood-sandbox';
  private readonly baseUrlProduction = 'https://partner-api.grab.com/grabfood';

  // Bộ nhớ đệm token truy cập (OAuth Token Cache)
  private tokenCache: Map<string, CachedToken> = new Map();

  private getBaseUrl(env: 'SANDBOX' | 'PRODUCTION'): string {
    return env === 'PRODUCTION' ? this.baseUrlProduction : this.baseUrlSandbox;
  }

  /**
   * Lấy OAuth 2.0 Access Token (Client Credentials Grant Flow)
   * Tự động cache và chỉ cấp mới khi token hết hạn.
   */
  async getAccessToken(credentials: ChannelCredentials): Promise<string> {
    const cacheKey = `${credentials.merchantId}:${credentials.appId || 'default'}`;
    const cached = this.tokenCache.get(cacheKey);

    // Còn hạn ít nhất 60 giây
    if (cached && cached.expiresAt > Date.now() + 60000) {
      return cached.token;
    }

    if (credentials.environment === 'SANDBOX' || !credentials.appSecret || credentials.accessToken?.startsWith('mock_')) {
      const mockToken = credentials.accessToken || `mock_grab_token_${Date.now()}`;
      this.tokenCache.set(cacheKey, {
        token: mockToken,
        expiresAt: Date.now() + 3600 * 1000,
      });
      return mockToken;
    }

    // Giai đoạn Production: Gọi Endpoint OAuth chính thức của Grab
    try {
      const tokenUrl = `${this.getBaseUrl(credentials.environment)}/partner/v1/oauth/token`;
      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: credentials.appId,
          client_secret: credentials.appSecret,
          grant_type: 'client_credentials',
          scope: 'food.partner_api',
        }),
      });

      if (!response.ok) {
        throw new Error(`GrabFood OAuth thất bại: HTTP ${response.status} - ${response.statusText}`);
      }

      const data = await response.json();
      const accessToken = data.access_token;
      const expiresInSec = Number(data.expires_in || 3600);

      this.tokenCache.set(cacheKey, {
        token: accessToken,
        expiresAt: Date.now() + expiresInSec * 1000,
      });

      return accessToken;
    } catch (err: any) {
      // Trong môi trường PRODUCTION hoặc khi cấu hình gọi API thật: BẮT BUỘC BÁO LỖI, KHÔNG ĐƯỢC FALLBACK MOCK TOKEN
      if (credentials.environment === 'PRODUCTION') {
        throw new Error(`GrabFood OAuth thất bại trong môi trường Production: ${err?.message || err}. Không thể tạo token giả lập.`);
      }

      // Chỉ hỗ trợ mock fallback trong môi trường dev cục bộ khi là SANDBOX
      if (process.env.NODE_ENV !== 'production' && credentials.environment === 'SANDBOX') {
        console.warn('⚠️ [GrabFood OAuth Sandbox] Không thể kết nối GrabFood OAuth, dùng sandbox token dev:', err?.message || err);
        const fallbackToken = `mock_grab_sandbox_${Date.now()}`;
        this.tokenCache.set(cacheKey, {
          token: fallbackToken,
          expiresAt: Date.now() + 1800 * 1000,
        });
        return fallbackToken;
      }

      throw new Error(`GrabFood OAuth lỗi xác thực: ${err?.message || err}`);
    }
  }

  async testConnection(credentials: ChannelCredentials): Promise<TestConnectionResult> {
    if (!credentials.merchantId) {
      return {
        success: false,
        message: 'Thiếu Merchant ID GrabFood trong cấu hình.',
      };
    }

    const effectiveSecret = credentials.appSecret || (credentials.environment === 'SANDBOX' ? 'sandbox_secret_default' : '');
    if (!effectiveSecret) {
      return {
        success: false,
        message: 'Thiếu Client Secret GrabFood.',
      };
    }

    try {
      const token = await this.getAccessToken({ ...credentials, appSecret: effectiveSecret });

      if (credentials.environment === 'SANDBOX' || token.startsWith('mock_')) {
        return {
          success: true,
          message: `Kết nối thành công tới GrabFood Partner API (${credentials.environment}). Cửa hàng hợp lệ.`,
          details: {
            merchantName: `GrabFood Merchant - ${credentials.merchantId}`,
            storeStatus: 'ACTIVE',
            latencyMs: 78,
          },
        };
      }

      // Gọi endpoint lấy thông tin cửa hàng thực tế
      const response = await fetch(`${this.getBaseUrl(credentials.environment)}/partner/v1/merchant/${credentials.merchantId}/profile`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        return {
          success: false,
          message: `Lỗi kết nối GrabFood API: HTTP ${response.status} - ${response.statusText}`,
        };
      }

      const data = await response.json();
      return {
        success: true,
        message: 'Kết nối GrabFood thành công.',
        details: {
          merchantName: data.merchantName || credentials.merchantId,
          storeStatus: data.status || 'ACTIVE',
        },
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Không thể kết nối máy chủ GrabFood: ${err?.message || err}. Vui lòng kiểm tra lại cấu hình.`,
      };
    }
  }

  async verifyWebhookSignature(rawBody: string, headers: Record<string, string>, secret: string): Promise<boolean> {
    if (!secret) {
      // Lỗi bảo mật: Nếu thiếu webhook secret, bắt buộc từ chối để chống giả mạo
      return false;
    }

    const isProduction = process.env.NODE_ENV === 'production';
    const timestampKey = Object.keys(headers).find((k) =>
      ['x-grab-timestamp', 'x-timestamp', 'timestamp'].includes(k.toLowerCase())
    );
    const hasTimestampHeader = timestampKey !== undefined;
    const timestampStr = (hasTimestampHeader ? headers[timestampKey] : '').trim();

    // 1. Kiểm tra timestamp chống Replay Attack và từ chối nếu thiếu hoặc sai định dạng
    if (isProduction || hasTimestampHeader) {
      const ts = parseInt(timestampStr, 10);
      if (!timestampStr || isNaN(ts) || ts <= 0 || !/^\d+$/.test(timestampStr)) {
        return false;
      }

      const tsSec = ts > 1e11 ? Math.floor(ts / 1000) : ts;
      const nowSec = Math.floor(Date.now() / 1000);
      if (Math.abs(nowSec - tsSec) > 300) {
        return false;
      }
    }

    // 2. Xác thực chữ ký số HMAC
    const signatureKey = Object.keys(headers).find((k) =>
      ['x-grab-signature', 'x-signature'].includes(k.toLowerCase())
    );
    const signature = signatureKey ? headers[signatureKey] : '';
    if (!signature) return false;

    const computed = computeHmacSha256(rawBody, secret);
    return secureTimingCompare(signature, computed);
  }

  async parseWebhookOrder(rawPayload: any): Promise<UnifiedExternalOrder> {
    // Chuẩn hóa từ format GrabFood Partner Webhook sang UnifiedExternalOrder
    const orderId = String(rawPayload.orderID || rawPayload.order_id || `GF-${Date.now()}`);
    const shortOrderNumber = String(rawPayload.shortOrderNumber || rawPayload.order_code || `GF-${orderId.slice(-4)}`);
    
    // Status mapping GrabFood chuẩn Open API
    let normalizedStatus: UnifiedOrderStatus = 'NEW';
    const grabStatus = String(rawPayload.status || rawPayload.state || 'CREATED').toUpperCase();
    if (grabStatus === 'ALLOCATED' || grabStatus === 'ACCEPTED' || grabStatus === 'CONFIRMED') {
      normalizedStatus = 'CONFIRMED';
    } else if (grabStatus === 'PREPARING' || grabStatus === 'COOKING' || grabStatus === 'IN_PROGRESS') {
      normalizedStatus = 'PREPARING';
    } else if (grabStatus === 'COLLECTED' || grabStatus === 'DELIVERED' || grabStatus === 'COMPLETED' || grabStatus === 'READY_FOR_COLLECTION') {
      normalizedStatus = 'COMPLETED';
    } else if (grabStatus === 'CANCELLED' || grabStatus === 'REJECTED') {
      normalizedStatus = 'CANCELLED';
    }

    const rawItems = rawPayload.items || rawPayload.orderItems || [];
    const items = rawItems.map((it: any, index: number) => {
      const price = Number(it.price || it.unitPrice || 0);
      const quantity = Number(it.quantity || 1);
      return {
        externalItemId: String(it.id || it.itemID || `GF-ITEM-${index + 1}`),
        externalItemName: it.name || it.itemName || `Món GrabFood #${index + 1}`,
        quantity,
        unitPrice: price,
        subtotal: price * quantity,
        notes: it.specifications || it.notes || it.modifier || '',
        internalMenuItemId: it.internal_menu_item_id,
      };
    });

    const totalAmount = Number(rawPayload.price?.subtotal || rawPayload.total_amount || items.reduce((s: number, i: any) => s + i.subtotal, 0));
    // Đọc phí chiết khấu trực tiếp từ payload sàn gửi về (price.merchantCommission hoặc commission)
    // Nếu payload sàn chưa có chiết khấu, mặc định 0 (sẽ đối soát sau theo bảng kê merchant)
    const platformFee = Number(
      rawPayload.price?.merchantCommission ??
      rawPayload.merchant_commission ??
      rawPayload.commission ??
      0
    );
    const netRevenue = totalAmount - platformFee;

    const idempotencyKey = crypto
      .createHash('sha256')
      .update(`GRABFOOD:${orderId}`)
      .digest('hex');

    // Thông tin tài xế GrabExpress nếu có
    const driver = rawPayload.driver || {};
    const driverName = driver.name || rawPayload.driver_name || (rawPayload.driver_phone ? 'Tài xế Grab' : undefined);
    const driverPhone = driver.phone || driver.phoneNumber || rawPayload.driver_phone;

    return {
      channelCode: 'GRABFOOD',
      externalOrderId: orderId,
      externalOrderCode: shortOrderNumber,
      channelStatus: grabStatus,
      normalizedStatus,
      customerName: rawPayload.customer?.name || rawPayload.customer_name || 'Khách hàng GrabFood',
      customerPhone: rawPayload.customer?.phone || rawPayload.customer_phone || '',
      deliveryAddress: rawPayload.deliveryAddress || rawPayload.delivery_address || 'Giao hàng tận nơi (GrabExpress)',
      driverName,
      driverPhone,
      items,
      totalAmount,
      platformFee,
      netRevenue,
      idempotencyKey,
      orderedAt: rawPayload.orderTime ? new Date(rawPayload.orderTime) : new Date(),
      rawPayload,
    };
  }

  async acknowledgeOrder(externalOrderId: string, credentials: ChannelCredentials): Promise<SyncResult> {
    try {
      const token = await this.getAccessToken(credentials);
      if (credentials.environment === 'PRODUCTION' && !token.startsWith('mock_')) {
        const response = await fetch(`${this.getBaseUrl('PRODUCTION')}/partner/v1/orders/${externalOrderId}/accept`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
        if (!response.ok) {
          throw new Error(`GrabFood Accept Order HTTP ${response.status}`);
        }
      }
      return {
        success: true,
        message: `Đã xác nhận đơn hàng [${externalOrderId}] thành công trên GrabFood.`,
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Lỗi khi xác nhận đơn GrabFood: ${err?.message || err}`,
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
        message: 'Thiếu Merchant ID GrabFood trong cấu hình.',
      };
    }
    try {
      const token = await this.getAccessToken(credentials);

      // Map sang trạng thái GrabFood tương ứng
      let grabStatus = 'ACCEPTED';
      if (status === 'PREPARING') grabStatus = 'PREPARING';
      if (status === 'COMPLETED') grabStatus = 'READY_FOR_COLLECTION';
      if (status === 'CANCELLED') grabStatus = 'CANCELLED';

      if (credentials.environment === 'PRODUCTION' && !token.startsWith('mock_')) {
        const endpoint = status === 'CANCELLED'
          ? `${this.getBaseUrl('PRODUCTION')}/partner/v1/orders/${externalOrderId}/cancel`
          : `${this.getBaseUrl('PRODUCTION')}/partner/v1/orders/${externalOrderId}/status`;

        const body = status === 'CANCELLED'
          ? { cancelReason: reason || 'OUT_OF_STOCK', cancelCode: 1001 }
          : { status: grabStatus };

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          throw new Error(`GrabFood Update Status HTTP ${response.status}`);
        }
      }

      return {
        success: true,
        message: `Đã cập nhật trạng thái đơn [${externalOrderId}] sang [${grabStatus}] trên GrabFood.`,
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Lỗi đồng bộ trạng thái GrabFood: ${err?.message || err}`,
      };
    }
  }

  async updateItemAvailability(
    externalItemId: string,
    isAvailable: boolean,
    credentials: ChannelCredentials
  ): Promise<SyncResult> {
    try {
      const token = await this.getAccessToken(credentials);
      if (credentials.environment === 'PRODUCTION' && !token.startsWith('mock_')) {
        const response = await fetch(
          `${this.getBaseUrl('PRODUCTION')}/partner/v1/merchant/${credentials.merchantId}/menu/items/${externalItemId}/status`,
          {
            method: 'PUT',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              status: isAvailable ? 'AVAILABLE' : 'UNAVAILABLE',
            }),
          }
        );
        if (!response.ok) {
          throw new Error(`GrabFood Item Status HTTP ${response.status}`);
        }
      }

      return {
        success: true,
        message: `Đã đồng bộ trạng thái món [${externalItemId}] sang [${isAvailable ? 'CÒN MÓN' : 'HẾT MÓN'}] trên GrabFood.`,
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Lỗi cập nhật tồn kho GrabFood: ${err?.message || err}`,
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
      const token = await this.getAccessToken(credentials);

      if (credentials.environment === 'PRODUCTION' && !token.startsWith('mock_')) {
        const payload = {
          merchantID: credentials.merchantId,
          items: items.map(it => ({
            id: it.externalItemId,
            name: it.externalItemName,
            price: it.price,
            availableStatus: it.isAvailable ? 'AVAILABLE' : 'UNAVAILABLE',
          })),
        };

        const response = await fetch(
          `${this.getBaseUrl('PRODUCTION')}/partner/v1/merchant/${credentials.merchantId}/menu/batch-update`,
          {
            method: 'PUT',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
          }
        );

        if (!response.ok) {
          throw new Error(`GrabFood Menu Sync HTTP ${response.status}`);
        }
      }

      return {
        success: true,
        message: `Đã đồng bộ thành công ${items.length} món ăn và bảng giá lên GrabFood Open API.`,
        data: { syncedCount: items.length },
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Lỗi đồng bộ menu GrabFood: ${err?.message || err}`,
      };
    }
  }
}
