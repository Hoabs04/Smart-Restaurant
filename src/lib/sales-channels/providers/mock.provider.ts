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

export class MockSalesChannelProvider implements ISalesChannelProvider {
  channelCode: ChannelCode = 'MOCK';
  channelName: string = 'Kênh Giả Lập Test';

  constructor(channelCode?: ChannelCode, channelName?: string) {
    if (channelCode) this.channelCode = channelCode;
    if (channelName) this.channelName = channelName;
  }

  async testConnection(credentials: ChannelCredentials): Promise<TestConnectionResult> {
    if (!credentials.merchantId) {
      return {
        success: false,
        message: 'Thiếu Merchant ID trong cấu hình kênh.',
      };
    }

    return {
      success: true,
      message: `Kết nối thành công tới Merchant [${credentials.merchantId}] (Môi trường ${credentials.environment}).`,
      details: {
        merchantName: `Cửa hàng Demo Smart Restaurant (${credentials.merchantId})`,
        storeStatus: 'OPEN',
        latencyMs: 45,
      },
    };
  }

  async verifyWebhookSignature(rawBody: string, headers: Record<string, string>, secret: string): Promise<boolean> {
    if (!secret) return true; // Nếu chưa cài webhook secret thì cho phép trong mock sandbox
    const signature = headers['x-mock-signature'] || headers['x-signature'];
    if (!signature) return false;
    const computed = computeHmacSha256(rawBody, secret);
    return secureTimingCompare(signature, computed);
  }

  async parseWebhookOrder(rawPayload: any): Promise<UnifiedExternalOrder> {
    const externalOrderId = rawPayload.order_id || `MOCK-${Date.now()}`;
    const externalOrderCode = rawPayload.order_code || `DEMO-${String(Date.now()).slice(-4)}`;

    const items = (rawPayload.items || []).map((it: any, idx: number) => {
      const unitPrice = Number(it.price || it.unit_price || 50000);
      const quantity = Number(it.quantity || 1);
      return {
        externalItemId: it.item_id || it.external_item_id || `ITEM-${idx + 1}`,
        externalItemName: it.item_name || it.name || `Món Demo #${idx + 1}`,
        quantity,
        unitPrice,
        subtotal: unitPrice * quantity,
        notes: it.notes || '',
        internalMenuItemId: it.internal_menu_item_id,
      };
    });

    const totalAmount = items.reduce((sum: number, it: any) => sum + it.subtotal, 0) || Number(rawPayload.total_amount || 100000);
    const platformFee = Math.round(totalAmount * 0.2); // 20% commission
    const netRevenue = totalAmount - platformFee;

    const effectiveCode = (rawPayload.channelCode || this.channelCode) as ChannelCode;
    const idempotencyKey = crypto
      .createHash('sha256')
      .update(`${effectiveCode}:${externalOrderId}`)
      .digest('hex');

    return {
      channelCode: effectiveCode,
      externalOrderId,
      externalOrderCode,
      channelStatus: rawPayload.status || 'NEW',
      normalizedStatus: 'NEW',
      customerName: rawPayload.customer_name || 'Nguyễn Văn Khách',
      customerPhone: rawPayload.customer_phone || '0901234567',
      deliveryAddress: rawPayload.delivery_address || 'Tầng 12, Tòa nhà Landmark 81, TP.HCM',
      driverName: rawPayload.driver_name || 'Tài xế Test (Biển số: 59A-12345)',
      driverPhone: rawPayload.driver_phone || '0988889999',
      items,
      totalAmount,
      platformFee,
      netRevenue,
      idempotencyKey,
      orderedAt: new Date(),
      rawPayload,
    };
  }

  async acknowledgeOrder(externalOrderId: string, credentials: ChannelCredentials): Promise<SyncResult> {
    return {
      success: true,
      message: `Đã xác nhận tiếp nhận đơn hàng [${externalOrderId}] trên hệ thống ${this.channelName}.`,
    };
  }

  async updateOrderStatus(
    externalOrderId: string,
    status: UnifiedOrderStatus,
    credentials: ChannelCredentials,
    reason?: string
  ): Promise<SyncResult> {
    return {
      success: true,
      message: `Đã cập nhật trạng thái đơn [${externalOrderId}] sang [${status}] thành công trên sàn (Mock).`,
    };
  }

  async updateItemAvailability(
    externalItemId: string,
    isAvailable: boolean,
    credentials: ChannelCredentials
  ): Promise<SyncResult> {
    return {
      success: true,
      message: `Đã cập nhật món [${externalItemId}] sang trạng thái [${isAvailable ? 'CÒN MÓN' : 'HẾT MÓN'}] (Mock).`,
    };
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
    return {
      success: true,
      message: `Đã đồng bộ thành công ${items.length} món ăn và bảng giá lên Mock Sales Channel.`,
      data: { syncedCount: items.length },
    };
  }
}

