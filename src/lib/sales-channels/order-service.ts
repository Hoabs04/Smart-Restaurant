import { getDb, withTransaction } from '@/lib/db';
import { sanitizeForLogging, decryptSecret, maskPhoneNumber } from '@/lib/crypto';
import { getChannelProvider } from './factory';
import {
  ChannelCode,
  UnifiedExternalOrder,
  UnifiedOrderStatus,
  SyncResult,
} from './types';
import crypto from 'crypto';

export class SalesChannelOrderService {
  /**
   * Tiếp nhận đơn hàng từ sàn vào hệ thống (Chuẩn hóa, Chống trùng lặp & Ánh xạ món)
   */
  async ingestOrder(order: UnifiedExternalOrder): Promise<{
    success: boolean;
    orderId: string;
    isExisting: boolean;
    order: UnifiedExternalOrder;
    message: string;
    internalOrderId?: string;
  }> {
    const db = await getDb();
    const channelCode = order.channelCode.toUpperCase();

    // 1. Kiểm tra kênh bán hàng có hợp lệ trong CSDL không
    const channel = await db.queryOne<{
      id: string;
      code: string;
      name: string;
      is_active: boolean;
      auto_confirm_order: boolean;
    }>(
      `SELECT id, code, name, is_active, auto_confirm_order 
       FROM sales_channels 
       WHERE code = $1;`,
      [channelCode]
    );

    if (!channel) {
      throw new Error(`Kênh bán hàng [${channelCode}] chưa được đăng ký trong hệ thống.`);
    }

    if (!channel.is_active) {
      await this.recordSyncLog({
        channelId: channel.id,
        syncType: 'ORDER_INGEST',
        direction: 'INBOUND',
        status: 'FAILED',
        requestData: sanitizeForLogging(order),
        errorMessage: `Kênh [${channel.name}] hiện đang TẮT. Đơn hàng [${order.externalOrderCode}] bị từ chối tiếp nhận.`,
      });

      throw new Error(`Kênh bán hàng [${channel.name}] đang tạm ngừng hoạt động.`);
    }

    // 2. Chống nhận trùng đơn (Idempotency Guard)
    const existingOrder = await db.queryOne<{
      id: string;
      external_order_id: string;
      external_order_code: string;
      normalized_status: string;
      internal_order_id: string | null;
      total_amount: number;
      net_revenue: number;
    }>(
      `SELECT id, external_order_id, external_order_code, normalized_status, internal_order_id, total_amount, net_revenue 
       FROM external_orders 
       WHERE channel_id = $1 AND external_order_id = $2;`,
      [channel.id, order.externalOrderId]
    );

    if (existingOrder) {
      return {
        success: true,
        orderId: existingOrder.id,
        internalOrderId: existingOrder.internal_order_id || undefined,
        isExisting: true,
        order: {
          ...order,
          normalizedStatus: existingOrder.normalized_status as UnifiedOrderStatus,
        },
        message: `Đơn hàng [${existingOrder.external_order_code}] đã được tiếp nhận trước đó (Idempotent).`,
      };
    }

    // 3. Quy đổi món ăn từ sàn sang món nội bộ (Menu Mapping)
    const mappings = await db.query<{
      internal_menu_item_id: string;
      external_item_id: string;
      internal_name: string;
    }>(
      `SELECT m.internal_menu_item_id, m.external_item_id, mi.name as internal_name
       FROM channel_menu_mappings m
       JOIN menu_items mi ON m.internal_menu_item_id = mi.id
       WHERE m.channel_id = $1 AND m.is_active = TRUE;`,
      [channel.id]
    );

    const mappingMap = new Map(mappings.map(m => [m.external_item_id, m]));

    const mappedItems = order.items.map(it => {
      const match = mappingMap.get(it.externalItemId);
      return {
        ...it,
        internalMenuItemId: match?.internal_menu_item_id || it.internalMenuItemId,
        internalMenuItemName: match?.internal_name || it.internalMenuItemName,
      };
    });

    // 4. Lưu đơn hàng vào cơ sở dữ liệu
    const newOrderId = crypto.randomUUID();
    const finalStatus: UnifiedOrderStatus = channel.auto_confirm_order ? 'CONFIRMED' : 'NEW';

    await withTransaction(async (tx) => {
      await tx.execute(
        `INSERT INTO external_orders (
          id, channel_id, external_order_id, external_order_code, channel_code,
          channel_status, normalized_status, customer_name, customer_phone,
          delivery_address, driver_name, driver_phone, total_amount, platform_fee,
          net_revenue, items_json, raw_payload, idempotency_key, ordered_at,
          created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19,
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        );`,
        [
          newOrderId,
          channel.id,
          order.externalOrderId,
          order.externalOrderCode,
          channelCode,
          order.channelStatus,
          finalStatus,
          order.customerName || null,
          order.customerPhone ? maskPhoneNumber(order.customerPhone) : null,
          order.deliveryAddress || null,
          order.driverName || null,
          order.driverPhone || null,
          order.totalAmount,
          order.platformFee,
          order.netRevenue,
          JSON.stringify(mappedItems),
          JSON.stringify(sanitizeForLogging(order.rawPayload || {})),
          order.idempotencyKey,
          order.orderedAt,
        ]
      );

      // Cập nhật thời điểm đồng bộ gần nhất
      await tx.execute(
        `UPDATE sales_channels 
         SET last_sync_at = CURRENT_TIMESTAMP, connection_status = 'CONNECTED', updated_at = CURRENT_TIMESTAMP
         WHERE id = $1;`,
        [channel.id]
      );
    });

    // 5. Ghi nhật ký đồng bộ
    await this.recordSyncLog({
      channelId: channel.id,
      syncType: 'ORDER_INGEST',
      direction: 'INBOUND',
      status: 'SUCCESS',
      requestData: sanitizeForLogging({
        orderCode: order.externalOrderCode,
        itemsCount: mappedItems.length,
        totalAmount: order.totalAmount,
        netRevenue: order.netRevenue,
        autoConfirm: channel.auto_confirm_order,
      }),
      responseData: { orderId: newOrderId, status: finalStatus },
    });

    let internalOrderId: string | undefined;

    // 6. Nếu bật Tự động nhận đơn (Auto-confirm) -> Đẩy thẳng vào Queue Bếp!
    if (channel.auto_confirm_order) {
      try {
        const pushResult = await this.pushOrderToKitchen(newOrderId);
        if (pushResult.success) {
          internalOrderId = pushResult.internalOrderId;
        }
      } catch (pushErr) {
        console.warn('⚠️ Lỗi tự động đẩy đơn vào bếp:', pushErr);
      }
    }

    return {
      success: true,
      orderId: newOrderId,
      internalOrderId,
      isExisting: false,
      order: {
        ...order,
        items: mappedItems,
        normalizedStatus: finalStatus,
      },
      message: `Tiếp nhận đơn hàng [${order.externalOrderCode}] từ ${channel.name} thành công.`,
    };
  }

  /**
   * Đẩy đơn hàng sàn vào Hàng đợi Bếp (Kitchen Queue)
   * Tự động tạo bản ghi orders, kitchen_batches và order_items; trừ kho nguyên tử
   */
  async pushOrderToKitchen(externalOrderId: string, actorId?: string): Promise<{
    success: boolean;
    internalOrderId: string;
    batchId: string;
    message: string;
  }> {
    const db = await getDb();

    // 1. Tìm bản ghi external_orders
    const extOrder = await db.queryOne<{
      id: string;
      channel_id: string;
      external_order_id: string;
      external_order_code: string;
      channel_code: string;
      internal_order_id: string | null;
      normalized_status: string;
      items_json: string;
      total_amount: number;
    }>(
      `SELECT id, channel_id, external_order_id, external_order_code, channel_code,
              internal_order_id, normalized_status, items_json, total_amount
       FROM external_orders
       WHERE id = $1 OR external_order_id = $1;`,
      [externalOrderId]
    );

    if (!extOrder) {
      throw new Error(`Không tìm thấy đơn hàng [${externalOrderId}] trên hệ thống.`);
    }

    // Nếu đã đẩy vào bếp trước đó
    if (extOrder.internal_order_id) {
      return {
        success: true,
        internalOrderId: extOrder.internal_order_id,
        batchId: '',
        message: 'Đơn hàng này đã được đẩy vào Bếp trước đó.',
      };
    }

    // Kiểm tra chống trùng lặp: nếu đã tồn tại order nội bộ cho đơn sàn này trong orders
    const existingInternalOrder = await db.queryOne<{ id: string }>(
      `SELECT id FROM orders WHERE channel_order_id = $1 OR idempotency_key = $2;`,
      [extOrder.id, `idemp_order_${extOrder.id}`]
    );
    if (existingInternalOrder) {
      await db.execute(
        `UPDATE external_orders SET internal_order_id = $1, normalized_status = 'PREPARING', updated_at = CURRENT_TIMESTAMP WHERE id = $2;`,
        [existingInternalOrder.id, extOrder.id]
      );
      return {
        success: true,
        internalOrderId: existingInternalOrder.id,
        batchId: '',
        message: 'Đơn hàng này đã được đẩy vào Bếp trước đó.',
      };
    }

    const items: any[] = JSON.parse(extOrder.items_json || '[]');
    const mappedItems = items.filter(it => it.internalMenuItemId);

    if (mappedItems.length === 0) {
      throw new Error('Đơn hàng chưa có món nào được gán với thực đơn nội bộ. Vui lòng thiết lập quy đổi món trước.');
    }

    // Lấy user đại diện (Manager hoặc Waiter)
    let effectiveActorId = actorId;
    if (!effectiveActorId) {
      const defaultUser = await db.queryOne<{ id: string }>(
        `SELECT u.id FROM users u
         JOIN user_roles ur ON u.id = ur.user_id
         JOIN roles r ON ur.role_id = r.id
         WHERE r.code IN ('manager', 'waiter') AND u.is_active = TRUE
         LIMIT 1;`
      );
      effectiveActorId = defaultUser?.id || crypto.randomUUID();
    }

    const internalOrderId = crypto.randomUUID();
    const batchId = crypto.randomUUID();
    const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const cleanExtCode = (extOrder.external_order_code || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20);
    const timeStr = Date.now().toString(36).toUpperCase();
    const uniqueSuffix = crypto.randomBytes(3).toString('hex').toUpperCase();
    const internalOrderCode = cleanExtCode 
      ? `ORD-${todayStr}-${cleanExtCode}-${timeStr}-${uniqueSuffix}`
      : `ORD-${todayStr}-${timeStr}-${uniqueSuffix}`;

    // Thực hiện trong Transaction nguyên tử
    await withTransaction(async (tx) => {
      // 1. Tạo đơn hàng nội bộ trong bảng orders (table_id = NULL)
      await tx.execute(
        `INSERT INTO orders (
          id, order_code, table_id, created_by, status, idempotency_key,
          total_amount, version, payment_method, payment_status,
          order_source, channel_order_id, created_at, updated_at
        ) VALUES (
          $1, $2, NULL, $3, 'SENT_TO_KITCHEN', $4, $5, 1, 'TRANSFER', 'MANUALLY_CONFIRMED',
          $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        );`,
        [
          internalOrderId,
          internalOrderCode,
          effectiveActorId,
          `idemp_order_${extOrder.id}`,
          extOrder.total_amount,
          extOrder.channel_code,
          extOrder.id,
        ]
      );

      // 2. Tạo Kitchen Batch
      await tx.execute(
        `INSERT INTO kitchen_batches (
          id, order_id, batch_number, idempotency_key, sent_at, created_by, created_at
        ) VALUES ($1, $2, 1, $3, CURRENT_TIMESTAMP, $4, CURRENT_TIMESTAMP);`,
        [batchId, internalOrderId, `idemp_batch_${internalOrderId}`, effectiveActorId]
      );

      // 3. Tạo order_items và trừ kho trong InventoryLedger
      for (const it of mappedItems) {
        const orderItemId = crypto.randomUUID();
        const quantity = Number(it.quantity || 1);
        const unitPrice = Number(it.unitPrice || 0);

        await tx.execute(
          `INSERT INTO order_items (
            id, order_id, menu_item_id, kitchen_batch_id, item_name_snapshot,
            unit_price_snapshot, quantity, status, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'SENT_TO_KITCHEN', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);`,
          [
            orderItemId,
            internalOrderId,
            it.internalMenuItemId,
            batchId,
            it.internalMenuItemName || it.externalItemName,
            unitPrice,
            quantity,
          ]
        );

        // Trừ tồn kho nguyên tử trong sổ cái
        await tx.execute(
          `INSERT INTO inventory_ledger (
            id, menu_item_id, order_item_id, movement_type, quantity_delta, idempotency_key, actor_id, created_at
          ) VALUES ($1, $2, $3, 'DEDUCT_ON_SEND', $4, $5, $6, CURRENT_TIMESTAMP)
          ON CONFLICT (order_item_id, movement_type) DO NOTHING;`,
          [
            crypto.randomUUID(),
            it.internalMenuItemId,
            orderItemId,
            -quantity,
            `idemp_deduct_${orderItemId}`,
            effectiveActorId,
          ]
        );

        // Cập nhật tồn kho hiện tại trên menu_items
        await tx.execute(
          `UPDATE menu_items 
           SET stock_quantity = GREATEST(0, stock_quantity - $1), updated_at = CURRENT_TIMESTAMP
           WHERE id = $2;`,
          [quantity, it.internalMenuItemId]
        );
      }

      // 4. Cập nhật liên kết ngược vào external_orders
      await tx.execute(
        `UPDATE external_orders
         SET internal_order_id = $1, normalized_status = 'PREPARING', updated_at = CURRENT_TIMESTAMP
         WHERE id = $2;`,
        [internalOrderId, extOrder.id]
      );

      // 5. Ghi lịch sử trạng thái
      await tx.execute(
        `INSERT INTO order_status_history (id, order_id, from_status, to_status, changed_by, changed_at, note)
         VALUES ($1, $2, 'NONE', 'SENT_TO_KITCHEN', $3, CURRENT_TIMESTAMP, $4);`,
        [
          crypto.randomUUID(),
          internalOrderId,
          effectiveActorId,
          `Tiếp nhận đơn từ sàn ${extOrder.channel_code} (#${extOrder.external_order_code}) và gửi Bếp`,
        ]
      );
    });

    // 6. Ghi nhật ký đồng bộ
    await this.recordSyncLog({
      channelId: extOrder.channel_id,
      syncType: 'STATUS_SYNC',
      direction: 'OUTBOUND',
      status: 'SUCCESS',
      requestData: {
        orderCode: extOrder.external_order_code,
        internalOrderCode,
        itemsCount: mappedItems.length,
      },
      responseData: { internalOrderId, batchId, status: 'PREPARING' },
    });

    return {
      success: true,
      internalOrderId,
      batchId,
      message: `Đã đẩy đơn [${extOrder.external_order_code}] vào Queue Bếp thành công!`,
    };
  }

  /**
   * Cập nhật trạng thái đơn hàng (Xác nhận, Đang chuẩn bị, Hoàn tất, Hủy)
   */
  async updateOrderStatus(
    orderId: string,
    targetStatus: UnifiedOrderStatus,
    reason?: string
  ): Promise<SyncResult> {
    const db = await getDb();

    const order = await db.queryOne<{
      id: string;
      channel_id: string;
      channel_code: string;
      external_order_id: string;
      external_order_code: string;
      normalized_status: string;
      internal_order_id: string | null;
    }>(
      `SELECT id, channel_id, channel_code, external_order_id, external_order_code, normalized_status, internal_order_id
       FROM external_orders
       WHERE id = $1;`,
      [orderId]
    );

    if (!order) {
      return { success: false, message: 'Không tìm thấy đơn hàng cần cập nhật.' };
    }

    const current = order.normalized_status as UnifiedOrderStatus;
    if (current === 'COMPLETED' && targetStatus !== 'COMPLETED') {
      return { success: false, message: 'Đơn hàng đã hoàn tất không thể đổi trạng thái khác.' };
    }
    if (current === 'CANCELLED') {
      return { success: false, message: 'Đơn hàng đã bị hủy không thể chuyển trạng thái.' };
    }

    // 1. Lấy thông tin credentials để gọi API sàn
    const credRow = await db.queryOne<{
      merchant_id: string;
      store_id: string | null;
      app_id: string | null;
      app_secret_encrypted: string;
      environment: 'SANDBOX' | 'PRODUCTION';
    }>(
      `SELECT merchant_id, store_id, app_id, app_secret_encrypted, environment
       FROM channel_credentials
       WHERE channel_id = $1;`,
      [order.channel_id]
    );

    if (!credRow && order.channel_code.toUpperCase() !== 'MOCK') {
      return {
        success: false,
        message: `Kênh [${order.channel_code}] chưa được cấu hình credentials. Không thể đồng bộ trạng thái.`,
      };
    }

    const appSecret = credRow?.app_secret_encrypted ? decryptSecret(credRow.app_secret_encrypted) : '';
    const provider = getChannelProvider(order.channel_code);
    let syncError: string | undefined;

    // 2. Thực hiện đồng bộ lên sàn với cơ chế retry (tối đa 3 lần)
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await provider.updateOrderStatus(order.external_order_id, targetStatus, {
          merchantId: credRow?.merchant_id || '',
          storeId: credRow?.store_id || undefined,
          appId: credRow?.app_id || undefined,
          appSecret,
          environment: credRow?.environment || 'SANDBOX',
        }, reason);

        if (res.success) {
          syncError = undefined;
          break;
        } else {
          syncError = res.message;
        }
      } catch (err: any) {
        syncError = err?.message || String(err);
      }
    }

    // 3. Ghi nhật ký đồng bộ
    await this.recordSyncLog({
      channelId: order.channel_id,
      syncType: 'STATUS_SYNC',
      direction: 'OUTBOUND',
      status: syncError ? 'FAILED' : 'SUCCESS',
      requestData: { orderCode: order.external_order_code, fromStatus: current, toStatus: targetStatus, reason },
      errorMessage: syncError,
    });

    // 4. Nếu sàn từ chối / lỗi đồng bộ: KHÔNG đổi trạng thái DB và trả lỗi rõ ràng
    if (syncError) {
      return {
        success: false,
        message: `Đồng bộ trạng thái lên sàn [${order.channel_code}] thất bại: ${syncError}`,
      };
    }

    // 5. Đồng bộ thành công -> Cập nhật CSDL nội bộ
    await db.execute(
      `UPDATE external_orders
       SET normalized_status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2;`,
      [targetStatus, orderId]
    );

    // 6. Nếu xác nhận đơn (CONFIRMED) và chưa có trong bếp -> Tự động đẩy vào Bếp
    if (targetStatus === 'CONFIRMED' && !order.internal_order_id) {
      try {
        await this.pushOrderToKitchen(order.id);
      } catch (e) {
        console.warn('Lỗi tự động đẩy vào bếp sau xác nhận:', e);
      }
    }

    return {
      success: true,
      message: `Đã cập nhật trạng thái đơn [${order.external_order_code}] sang [${targetStatus}].`,
    };
  }

  /**
   * Đồng bộ hai chiều khi Bếp cập nhật trạng thái món ăn
   */
  async handleKitchenStatusUpdate(orderId: string, itemStatus: 'IN_PROGRESS' | 'READY'): Promise<void> {
    const db = await getDb();

    // Kiểm tra xem order này có liên kết với external_orders không
    const order = await db.queryOne<{
      id: string;
      order_source: string;
      channel_order_id: string | null;
    }>(
      `SELECT id, order_source, channel_order_id FROM orders WHERE id = $1;`,
      [orderId]
    );

    if (!order || !order.channel_order_id) {
      return; // Không phải đơn từ sàn, bỏ qua
    }

    const extOrder = await db.queryOne<{
      id: string;
      channel_id: string;
      channel_code: string;
      external_order_id: string;
      external_order_code: string;
      normalized_status: string;
    }>(
      `SELECT id, channel_id, channel_code, external_order_id, external_order_code, normalized_status
       FROM external_orders
       WHERE id = $1;`,
      [order.channel_order_id]
    );

    if (!extOrder || extOrder.normalized_status === 'COMPLETED' || extOrder.normalized_status === 'CANCELLED') {
      return;
    }

    if (itemStatus === 'IN_PROGRESS' && extOrder.normalized_status !== 'PREPARING') {
      await this.updateOrderStatus(extOrder.id, 'PREPARING');
    } else if (itemStatus === 'READY') {
      // Kiểm tra xem tất cả các món trong order đã READY chưa
      const items = await db.query<{ status: string }>(
        `SELECT status FROM order_items WHERE order_id = $1 AND status != 'CANCELLED';`,
        [orderId]
      );
      const allReady = items.length > 0 && items.every(it => it.status === 'READY');
      if (allReady) {
        await this.updateOrderStatus(extOrder.id, 'COMPLETED');
      }
    }
  }

  /**
   * Xử lý khi Sàn gửi Webhook Hủy Đơn (ORDER_CANCELLED)
   */
  async handleExternalCancellation(
    channelCode: string,
    externalOrderId: string,
    reason?: string
  ): Promise<{
    success: boolean;
    message: string;
    notFound?: boolean;
    isAlreadyCancelled?: boolean;
    channelId?: string;
    orderCode?: string;
  }> {
    const db = await getDb();

    const defaultUser = await db.queryOne<{ id: string }>(
      `SELECT id FROM users WHERE is_active = TRUE LIMIT 1;`
    );
    const effectiveActorId = defaultUser?.id;

    const result = await withTransaction(async (tx) => {
      // 1. Khóa và đọc thông tin đơn hàng bên trong transaction để chống race condition
      const extOrder = await tx.queryOne<{
        id: string;
        channel_id: string;
        external_order_code: string;
        internal_order_id: string | null;
        normalized_status: string;
      }>(
        `SELECT id, channel_id, external_order_code, internal_order_id, normalized_status
         FROM external_orders
         WHERE UPPER(channel_code) = UPPER($1) AND external_order_id = $2
         FOR UPDATE;`,
        [channelCode, externalOrderId]
      );

      if (!extOrder) {
        return { success: false, notFound: true, message: 'Không tìm thấy đơn hàng cần hủy.' };
      }

      // Idempotency: nếu đơn đã được hủy trước đó, không thực hiện lại side effects
      if (extOrder.normalized_status === 'CANCELLED') {
        return {
          success: true,
          channelId: extOrder.channel_id,
          orderCode: extOrder.external_order_code,
          isAlreadyCancelled: true,
          message: `Đơn hàng [${extOrder.external_order_code}] đã được xử lý hủy trước đó.`,
        };
      }

      // Cập nhật external_orders sang CANCELLED
      await tx.execute(
        `UPDATE external_orders
         SET normalized_status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP
         WHERE id = $1;`,
        [extOrder.id]
      );

      // 2. Nếu đơn đã có trong hệ thống nội bộ
      if (extOrder.internal_order_id) {
        const orderItems = await tx.query<{
          id: string;
          menu_item_id: string;
          quantity: number;
          status: string;
        }>(
          `SELECT id, menu_item_id, quantity, status
           FROM order_items
           WHERE order_id = $1
           FOR UPDATE;`,
          [extOrder.internal_order_id]
        );

        // Với các món chưa nấu (SENT_TO_KITCHEN), hủy có điều kiện nguyên tử và chỉ hoàn kho nếu rowCount = 1
        for (const it of orderItems) {
          const updatedItems = await tx.query<{ id: string }>(
            `UPDATE order_items
             SET status = 'CANCELLED', cancel_reason = $1, cancelled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
             WHERE id = $2 AND status = 'SENT_TO_KITCHEN'
             RETURNING id;`,
            [`Khách hàng/Sàn hủy đơn: ${reason || 'Không rõ lý do'}`, it.id]
          );

          // Chỉ khi update thành công (đang là SENT_TO_KITCHEN và chưa bị request nào khác hủy)
          if (updatedItems.length > 0) {
            // Hoàn lại kho trong sổ cái
            if (effectiveActorId) {
              await tx.execute(
                `INSERT INTO inventory_ledger (
                  id, menu_item_id, order_item_id, movement_type, quantity_delta, idempotency_key, actor_id, created_at
                ) VALUES ($1, $2, $3, 'RESTORE_ON_CANCEL', $4, $5, $6, CURRENT_TIMESTAMP)
                ON CONFLICT (order_item_id, movement_type) DO NOTHING;`,
                [
                  crypto.randomUUID(),
                  it.menu_item_id,
                  it.id,
                  it.quantity,
                  `idemp_restore_${it.id}`,
                  effectiveActorId,
                ]
              );
            }

            // Tăng lại số lượng trong menu_items
            await tx.execute(
              `UPDATE menu_items
               SET stock_quantity = stock_quantity + $1, updated_at = CURRENT_TIMESTAMP
               WHERE id = $2;`,
              [it.quantity, it.menu_item_id]
            );
          }
        }

        // Đóng order nội bộ
        await tx.execute(
          `UPDATE orders
           SET status = 'CLOSED', closed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
           WHERE id = $1;`,
          [extOrder.internal_order_id]
        );

        if (effectiveActorId) {
          await tx.execute(
            `INSERT INTO order_status_history (id, order_id, from_status, to_status, changed_by, changed_at, note)
             VALUES ($1, $2, 'SENT_TO_KITCHEN', 'CLOSED', $3, CURRENT_TIMESTAMP, $4);`,
            [
              crypto.randomUUID(),
              extOrder.internal_order_id,
              effectiveActorId,
              `Sàn ${channelCode} gửi yêu cầu hủy đơn: ${reason || 'Không rõ lý do'}`,
            ]
          );
        }
      }

      return {
        success: true,
        channelId: extOrder.channel_id,
        orderCode: extOrder.external_order_code,
        isAlreadyCancelled: false,
        message: `Đã hủy đơn hàng [${extOrder.external_order_code}] và hoàn trả tồn kho an toàn.`,
      };
    });

    if (result.success && !result.isAlreadyCancelled && result.channelId) {
      await this.recordSyncLog({
        channelId: result.channelId,
        syncType: 'STATUS_SYNC',
        direction: 'INBOUND',
        status: 'SUCCESS',
        requestData: { externalOrderId, reason },
        responseData: { cancelled: true },
      });
    }

    return {
      success: result.success,
      message: result.message,
      notFound: result.notFound,
      isAlreadyCancelled: result.isAlreadyCancelled,
      channelId: result.channelId,
      orderCode: result.orderCode,
    };
  }

  /**
   * Ghi log đồng bộ có lọc bỏ thông tin nhạy cảm
   */
  async recordSyncLog(params: {
    channelId: string;
    syncType: string;
    direction: 'INBOUND' | 'OUTBOUND';
    status: 'SUCCESS' | 'FAILED' | 'RETRYING';
    retryCount?: number;
    requestData?: any;
    responseData?: any;
    errorMessage?: string;
  }): Promise<void> {
    try {
      const db = await getDb();
      const logId = crypto.randomUUID();

      const reqStr = params.requestData ? JSON.stringify(sanitizeForLogging(params.requestData)) : null;
      const resStr = params.responseData ? JSON.stringify(sanitizeForLogging(params.responseData)) : null;

      await db.execute(
        `INSERT INTO sync_logs (
          id, channel_id, sync_type, direction, status, retry_count,
          request_data, response_data, error_message, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP);`,
        [
          logId,
          params.channelId,
          params.syncType,
          params.direction,
          params.status,
          params.retryCount || 0,
          reqStr,
          resStr,
          params.errorMessage || null,
        ]
      );
    } catch (e) {
      console.error('Lỗi khi lưu sync log:', e);
    }
  }

  /**
   * Đồng bộ tồn kho tự động (Còn món / Hết món) khi tồn kho thay đổi
   */
  async syncMenuItemStock(
    menuItemId: string,
    newStock: number,
    isAvailable?: boolean
  ): Promise<{ success: boolean; syncedChannels: number }> {
    try {
      const db = await getDb();
      const targetAvailable = isAvailable !== undefined ? isAvailable : newStock > 0;

      // Tìm tất cả các mapping cho món này thuộc các kênh đang active và có bật sync_stock
      const mappings = await db.query<{
        id: string;
        channel_id: string;
        channel_code: string;
        external_item_id: string;
        external_item_name: string;
        merchant_id: string;
        store_id: string | null;
        app_id: string | null;
        app_secret_encrypted: string;
        environment: 'SANDBOX' | 'PRODUCTION';
      }>(
        `SELECT 
          m.id, m.channel_id, c.code as channel_code, m.external_item_id, m.external_item_name,
          cr.merchant_id, cr.store_id, cr.app_id, cr.app_secret_encrypted, cr.environment
         FROM channel_menu_mappings m
         JOIN sales_channels c ON m.channel_id = c.id
         JOIN channel_credentials cr ON c.id = cr.channel_id
         WHERE m.internal_menu_item_id = $1
           AND m.sync_stock = TRUE
           AND m.is_active = TRUE
           AND c.is_active = TRUE;`,
        [menuItemId]
      );

      if (mappings.length === 0) {
        return { success: true, syncedChannels: 0 };
      }

      let syncedChannels = 0;

      for (const map of mappings) {
        try {
          const provider = getChannelProvider(map.channel_code as ChannelCode);
          const appSecret = decryptSecret(map.app_secret_encrypted);

          const result = await provider.updateItemAvailability(
            map.external_item_id,
            targetAvailable,
            {
              merchantId: map.merchant_id,
              storeId: map.store_id || undefined,
              appId: map.app_id || undefined,
              appSecret,
              environment: map.environment,
            }
          );

          if (result.success) {
            syncedChannels++;
            await db.execute(
              `UPDATE channel_menu_mappings
               SET last_synced_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
               WHERE id = $1;`,
              [map.id]
            );

            await this.recordSyncLog({
              channelId: map.channel_id,
              syncType: 'STOCK_SYNC',
              direction: 'OUTBOUND',
              status: 'SUCCESS',
              requestData: {
                externalItemId: map.external_item_id,
                isAvailable: targetAvailable,
                newStock,
              },
              responseData: result,
            });
          }
        } catch (err: any) {
          console.error(`Lỗi đồng bộ tồn kho món [${map.external_item_id}] lên kênh [${map.channel_code}]:`, err);
        }
      }

      return { success: true, syncedChannels };
    } catch (error) {
      console.error('Lỗi syncMenuItemStock:', error);
      return { success: false, syncedChannels: 0 };
    }
  }

  /**
   * Lấy danh sách chênh lệch giá và trạng thái menu giữa hệ thống nội bộ và sàn
   */
  async getMenuSyncDiffs(channelCode: string): Promise<Array<{
    mappingId: string;
    internalMenuItemId: string;
    internalItemName: string;
    internalPrice: number;
    internalStock: number;
    internalAvailability: boolean;
    externalItemId: string;
    externalItemName: string;
    externalPrice: number;
    syncStock: boolean;
    isActive: boolean;
    lastSyncedAt: string | null;
    isPriceChanged: boolean;
    priceDiff: number;
    isOutOfStock: boolean;
  }>> {
    const db = await getDb();
    const rows = await db.query<{
      mapping_id: string;
      internal_menu_item_id: string;
      internal_item_name: string;
      internal_price: number;
      internal_stock: number;
      internal_availability: boolean;
      external_item_id: string;
      external_item_name: string;
      external_price: number;
      sync_stock: boolean;
      is_active: boolean;
      last_synced_at: string | null;
    }>(
      `SELECT 
        cm.id as mapping_id,
        m.id as internal_menu_item_id,
        m.name as internal_item_name,
        m.current_price as internal_price,
        m.stock_quantity as internal_stock,
        m.availability as internal_availability,
        cm.external_item_id,
        cm.external_item_name,
        cm.external_price,
        cm.sync_stock,
        cm.is_active,
        cm.last_synced_at
       FROM channel_menu_mappings cm
       JOIN sales_channels c ON cm.channel_id = c.id
       JOIN menu_items m ON cm.internal_menu_item_id = m.id
       WHERE UPPER(c.code) = UPPER($1)
       ORDER BY m.name ASC;`,
      [channelCode]
    );

    return rows.map(r => {
      const intPrice = Number(r.internal_price);
      const extPrice = Number(r.external_price);
      const intStock = Number(r.internal_stock);
      const priceDiff = intPrice - extPrice;
      const isPriceChanged = intPrice !== extPrice;
      const isOutOfStock = intStock <= 0 || !r.internal_availability;

      return {
        mappingId: r.mapping_id,
        internalMenuItemId: r.internal_menu_item_id,
        internalItemName: r.internal_item_name,
        internalPrice: intPrice,
        internalStock: intStock,
        internalAvailability: r.internal_availability,
        externalItemId: r.external_item_id,
        externalItemName: r.external_item_name,
        externalPrice: extPrice,
        syncStock: r.sync_stock,
        isActive: r.is_active,
        lastSyncedAt: r.last_synced_at,
        isPriceChanged,
        priceDiff,
        isOutOfStock,
      };
    });
  }

  /**
   * Đồng bộ Menu & Giá lên sàn sau khi người dùng đã xác nhận
   */
  async syncChannelMenu(
    channelCode: string,
    mappingIds?: string[],
    confirmedByUserId?: string
  ): Promise<SyncResult> {
    const db = await getDb();

    const channel = await db.queryOne<{
      id: string;
      code: string;
      name: string;
      is_active: boolean;
    }>(
      `SELECT id, code, name, is_active FROM sales_channels WHERE UPPER(code) = UPPER($1);`,
      [channelCode]
    );

    if (!channel) {
      return { success: false, message: `Không tìm thấy kênh bán hàng [${channelCode}].` };
    }

    const credRow = await db.queryOne<{
      merchant_id: string;
      store_id: string | null;
      app_id: string | null;
      app_secret_encrypted: string;
      environment: 'SANDBOX' | 'PRODUCTION';
    }>(
      `SELECT merchant_id, store_id, app_id, app_secret_encrypted, environment
       FROM channel_credentials
       WHERE channel_id = $1;`,
      [channel.id]
    );

    if (!credRow) {
      return { success: false, message: `Kênh [${channel.name}] chưa được cấu hình credentials.` };
    }

    let sql = `
      SELECT 
        cm.id as mapping_id,
        m.name as internal_name,
        m.current_price,
        m.stock_quantity,
        m.availability,
        cm.external_item_id,
        cm.external_item_name,
        cm.external_price
      FROM channel_menu_mappings cm
      JOIN menu_items m ON cm.internal_menu_item_id = m.id
      WHERE cm.channel_id = $1 AND cm.is_active = TRUE
    `;
    const params: any[] = [channel.id];

    if (mappingIds && mappingIds.length > 0) {
      params.push(mappingIds);
      sql += ` AND cm.id = ANY($${params.length})`;
    }

    const itemsToSync = await db.query<{
      mapping_id: string;
      internal_name: string;
      current_price: number;
      stock_quantity: number;
      availability: boolean;
      external_item_id: string;
      external_item_name: string;
      external_price: number;
    }>(sql, params);

    if (itemsToSync.length === 0) {
      return { success: false, message: 'Không có món ăn nào cần đồng bộ.' };
    }

    const provider = getChannelProvider(channel.code as ChannelCode);
    const appSecret = decryptSecret(credRow.app_secret_encrypted);

    const syncPayload = itemsToSync.map(it => ({
      externalItemId: it.external_item_id,
      externalItemName: it.internal_name,
      price: Number(it.current_price),
      isAvailable: Number(it.stock_quantity) > 0 && it.availability,
    }));

    const syncRes = await provider.syncMenu(syncPayload, {
      merchantId: credRow.merchant_id,
      storeId: credRow.store_id || undefined,
      appId: credRow.app_id || undefined,
      appSecret,
      environment: credRow.environment,
    });

    if (!syncRes.success) {
      await this.recordSyncLog({
        channelId: channel.id,
        syncType: 'MENU_SYNC',
        direction: 'OUTBOUND',
        status: 'FAILED',
        requestData: { itemsCount: itemsToSync.length, mappingIds },
        errorMessage: syncRes.message,
      });
      return syncRes;
    }

    await withTransaction(async (tx) => {
      for (const it of itemsToSync) {
        await tx.execute(
          `UPDATE channel_menu_mappings
           SET external_price = $1, external_item_name = $2, last_synced_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
           WHERE id = $3;`,
          [Number(it.current_price), it.internal_name, it.mapping_id]
        );
      }

      await tx.execute(
        `UPDATE sales_channels
         SET last_sync_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1;`,
        [channel.id]
      );
    });

    await this.recordSyncLog({
      channelId: channel.id,
      syncType: 'MENU_SYNC',
      direction: 'OUTBOUND',
      status: 'SUCCESS',
      requestData: {
        syncedBy: confirmedByUserId || 'manager',
        itemsCount: itemsToSync.length,
        items: syncPayload,
      },
      responseData: syncRes,
    });

    return {
      success: true,
      message: `Đã đồng bộ thành công ${itemsToSync.length} món ăn và bảng giá mới lên ${channel.name}.`,
      data: { syncedCount: itemsToSync.length },
    };
  }

  /**
   * Ép đồng bộ tồn kho toàn bộ món của kênh (Còn món / Hết món)
   */
  async syncChannelStock(channelCode: string): Promise<SyncResult> {
    const db = await getDb();

    const channel = await db.queryOne<{
      id: string;
      code: string;
      name: string;
    }>(
      `SELECT id, code, name FROM sales_channels WHERE UPPER(code) = UPPER($1);`,
      [channelCode]
    );

    if (!channel) {
      return { success: false, message: `Không tìm thấy kênh [${channelCode}].` };
    }

    const credRow = await db.queryOne<{
      merchant_id: string;
      store_id: string | null;
      app_id: string | null;
      app_secret_encrypted: string;
      environment: 'SANDBOX' | 'PRODUCTION';
    }>(
      `SELECT merchant_id, store_id, app_id, app_secret_encrypted, environment
       FROM channel_credentials
       WHERE channel_id = $1;`,
      [channel.id]
    );

    if (!credRow) {
      return { success: false, message: `Kênh [${channel.name}] chưa được cấu hình credentials.` };
    }

    const mappings = await db.query<{
      mapping_id: string;
      external_item_id: string;
      stock_quantity: number;
      availability: boolean;
    }>(
      `SELECT 
        cm.id as mapping_id,
        cm.external_item_id,
        m.stock_quantity,
        m.availability
       FROM channel_menu_mappings cm
       JOIN menu_items m ON cm.internal_menu_item_id = m.id
       WHERE cm.channel_id = $1 AND cm.is_active = TRUE AND cm.sync_stock = TRUE;`,
      [channel.id]
    );

    const provider = getChannelProvider(channel.code as ChannelCode);
    const appSecret = decryptSecret(credRow.app_secret_encrypted);
    const creds = {
      merchantId: credRow.merchant_id,
      storeId: credRow.store_id || undefined,
      appId: credRow.app_id || undefined,
      appSecret,
      environment: credRow.environment,
    };

    let successCount = 0;
    for (const m of mappings) {
      const isAvail = Number(m.stock_quantity) > 0 && m.availability;
      const res = await provider.updateItemAvailability(m.external_item_id, isAvail, creds);
      if (res.success) {
        successCount++;
        await db.execute(
          `UPDATE channel_menu_mappings SET last_synced_at = CURRENT_TIMESTAMP WHERE id = $1;`,
          [m.mapping_id]
        );
      }
    }

    await this.recordSyncLog({
      channelId: channel.id,
      syncType: 'STOCK_SYNC',
      direction: 'OUTBOUND',
      status: 'SUCCESS',
      requestData: { totalItems: mappings.length, successCount },
    });

    return {
      success: true,
      message: `Đã làm mới trạng thái tồn kho cho ${successCount}/${mappings.length} món ăn trên ${channel.name}.`,
      data: { successCount, total: mappings.length },
    };
  }

  /**
   * Lấy số liệu thống kê Dashboard & Báo cáo Tài chính cho Kênh bán hàng
   */
  async getDashboardMetrics(options?: {
    fromDate?: string;
    toDate?: string;
    channelCode?: string;
  }): Promise<{
    totalOrders: number;
    totalRevenue: number;
    totalPlatformFee: number;
    totalNetRevenue: number;
    averageOrderValue: number;
    averageCommissionRate: number;
    completedOrders: number;
    cancelledOrders: number;
    errorCount: number;
    channelSummaries: Array<{
      channelCode: string;
      channelName: string;
      orderCount: number;
      revenue: number;
      platformFee: number;
      netRevenue: number;
      commissionRate: number;
      averageOrderValue: number;
      completedCount: number;
      cancelledCount: number;
      isActive: boolean;
      status: string;
      lastSyncAt: string | null;
    }>;
  }> {
    const db = await getDb();

    let channelFilterSql = '';
    const channelParams: any[] = [];
    if (options?.channelCode) {
      channelParams.push(options.channelCode.toUpperCase());
      channelFilterSql = ` WHERE UPPER(code) = $1`;
    }

    const channelRows = await db.query<{
      id: string;
      code: string;
      name: string;
      is_active: boolean;
      connection_status: string;
      last_sync_at: string | null;
    }>(
      `SELECT id, code, name, is_active, connection_status, last_sync_at
       FROM sales_channels
       ${channelFilterSql}
       ORDER BY name ASC;`,
      channelParams
    );

    let orderFilterSql = '';
    const orderParams: any[] = [];
    if (options?.fromDate) {
      orderParams.push(`${options.fromDate} 00:00:00`);
      orderFilterSql += ` AND ordered_at >= $${orderParams.length}`;
    }
    if (options?.toDate) {
      orderParams.push(`${options.toDate} 23:59:59`);
      orderFilterSql += ` AND ordered_at <= $${orderParams.length}`;
    }

    const statsRows = await db.query<{
      channel_id: string;
      order_count: number;
      total_amount: number;
      platform_fee: number;
      net_revenue: number;
      completed_count: number;
      cancelled_count: number;
    }>(
      `SELECT 
        channel_id,
        COUNT(*)::int as order_count,
        COALESCE(SUM(total_amount), 0)::int as total_amount,
        COALESCE(SUM(platform_fee), 0)::int as platform_fee,
        COALESCE(SUM(net_revenue), 0)::int as net_revenue,
        COUNT(*) FILTER (WHERE normalized_status = 'COMPLETED')::int as completed_count,
        COUNT(*) FILTER (WHERE normalized_status = 'CANCELLED')::int as cancelled_count
       FROM external_orders
       WHERE 1=1 ${orderFilterSql}
       GROUP BY channel_id;`,
      orderParams
    );

    const errorCountRow = await db.queryOne<{ count: number }>(
      `SELECT COUNT(*)::int as count FROM sync_logs WHERE status = 'FAILED';`
    );

    const statsMap = new Map(statsRows.map(s => [s.channel_id, s]));

    let totalOrders = 0;
    let totalRevenue = 0;
    let totalPlatformFee = 0;
    let totalNetRevenue = 0;
    let completedOrders = 0;
    let cancelledOrders = 0;

    const channelSummaries = channelRows.map(c => {
      const stats = statsMap.get(c.id);
      const orders = stats ? Number(stats.order_count) : 0;
      const rev = stats ? Number(stats.total_amount) : 0;
      const fee = stats ? Number(stats.platform_fee) : 0;
      const net = stats ? Number(stats.net_revenue) : 0;
      const completed = stats ? Number(stats.completed_count) : 0;
      const cancelled = stats ? Number(stats.cancelled_count) : 0;

      const aov = orders > 0 ? Math.round(rev / orders) : 0;
      const commRate = rev > 0 ? Number(((fee / rev) * 100).toFixed(1)) : (c.code === 'SHOPEEFOOD' ? 22 : 20);

      totalOrders += orders;
      totalRevenue += rev;
      totalPlatformFee += fee;
      totalNetRevenue += net;
      completedOrders += completed;
      cancelledOrders += cancelled;

      return {
        channelCode: c.code,
        channelName: c.name,
        orderCount: orders,
        revenue: rev,
        platformFee: fee,
        netRevenue: net,
        commissionRate: commRate,
        averageOrderValue: aov,
        completedCount: completed,
        cancelledCount: cancelled,
        isActive: c.is_active,
        status: c.connection_status,
        lastSyncAt: c.last_sync_at,
      };
    });

    const averageOrderValue = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;
    const averageCommissionRate = totalRevenue > 0 ? Number(((totalPlatformFee / totalRevenue) * 100).toFixed(1)) : 20;

    return {
      totalOrders,
      totalRevenue,
      totalPlatformFee,
      totalNetRevenue,
      averageOrderValue,
      averageCommissionRate,
      completedOrders,
      cancelledOrders,
      errorCount: errorCountRow ? Number(errorCountRow.count) : 0,
      channelSummaries,
    };
  }
}

export const salesChannelOrderService = new SalesChannelOrderService();
