import {
  ChannelCode,
  ChannelCredentials,
  SyncResult,
  TestConnectionResult,
  UnifiedExternalOrder,
  UnifiedOrderStatus,
} from './types';

/**
 * Interface chuẩn cho mọi Adapter kênh bán hàng (GrabFood, ShopeeFood, BeFood, Mock)
 */
export interface ISalesChannelProvider {
  readonly channelCode: ChannelCode;
  readonly channelName: string;

  /**
   * Kiểm tra thông tin kết nối và tính hợp lệ của Merchant Credentials
   */
  testConnection(credentials: ChannelCredentials): Promise<TestConnectionResult>;

  /**
   * Xác thực chữ ký số HMAC từ webhook của sàn
   */
  verifyWebhookSignature(rawBody: string, headers: Record<string, string>, secret: string): Promise<boolean>;

  /**
   * Chuyển đổi payload riêng của sàn thành đối tượng UnifiedExternalOrder chuẩn hóa nội bộ
   */
  parseWebhookOrder(rawPayload: any, headers?: Record<string, string>): Promise<UnifiedExternalOrder>;

  /**
   * Xác nhận đã tiếp nhận đơn hàng thành công (Acknowledge / Accept order)
   */
  acknowledgeOrder(externalOrderId: string, credentials: ChannelCredentials): Promise<SyncResult>;

  /**
   * Đồng bộ trạng thái đơn hàng ngược lên sàn (Đang nấu, Đã hoàn tất, Đã hủy)
   */
  updateOrderStatus(
    externalOrderId: string,
    status: UnifiedOrderStatus,
    credentials: ChannelCredentials,
    reason?: string
  ): Promise<SyncResult>;

  /**
   * Đồng bộ trạng thái còn món / hết món lên sàn
   */
  updateItemAvailability(
    externalItemId: string,
    isAvailable: boolean,
    credentials: ChannelCredentials
  ): Promise<SyncResult>;

  /**
   * Đồng bộ danh mục món ăn và đơn giá lên sàn (chỉ thực hiện khi có xác nhận từ người dùng)
   */
  syncMenu(
    items: Array<{
      externalItemId: string;
      externalItemName: string;
      price: number;
      isAvailable: boolean;
    }>,
    credentials: ChannelCredentials
  ): Promise<SyncResult>;
}

