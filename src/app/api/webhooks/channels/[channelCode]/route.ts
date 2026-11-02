import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { decryptSecret } from '@/lib/crypto';
import { getChannelProvider } from '@/lib/sales-channels/factory';
import { salesChannelOrderService } from '@/lib/sales-channels/order-service';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ channelCode: string }> }
) {
  try {
    const { channelCode } = await context.params;
    const db = await getDb();

    // 1. Kiểm tra kênh bán hàng có tồn tại và đang bật không
    const channel = await db.queryOne<{
      id: string;
      code: string;
      name: string;
      is_active: boolean;
      auto_confirm_order: boolean;
    }>(
      `SELECT id, code, name, is_active, auto_confirm_order 
       FROM sales_channels 
       WHERE UPPER(code) = UPPER($1);`,
      [channelCode]
    );

    if (!channel) {
      return NextResponse.json(
        { success: false, code: 'CHANNEL_NOT_FOUND', message: `Kênh bán hàng [${channelCode}] không tồn tại.` },
        { status: 404 }
      );
    }

    if (!channel.is_active) {
      return NextResponse.json(
        { success: false, code: 'CHANNEL_DISABLED', message: `Kênh [${channel.name}] đang tắt kết nối.` },
        { status: 403 }
      );
    }

    // 2. Đọc raw body và headers
    const rawBody = await req.text();
    let payload: any = {};
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        { success: false, code: 'INVALID_JSON', message: 'Payload không đúng định dạng JSON.' },
        { status: 400 }
      );
    }

    const headers: Record<string, string> = {};
    req.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });

    // 3. Lấy webhook secret đã mã hóa để xác thực chữ ký số HMAC
    const credRow = await db.queryOne<{ webhook_secret_encrypted: string | null }>(
      `SELECT webhook_secret_encrypted FROM channel_credentials WHERE channel_id = $1;`,
      [channel.id]
    );

    const webhookSecret = credRow?.webhook_secret_encrypted ? decryptSecret(credRow.webhook_secret_encrypted) : '';
    const provider = getChannelProvider(channelCode);

    // Fail-Closed: Bắt buộc phải có secret khi không phải mock
    if (!webhookSecret && channelCode.toUpperCase() !== 'MOCK') {
      await salesChannelOrderService.recordSyncLog({
        channelId: channel.id,
        syncType: 'WEBHOOK',
        direction: 'INBOUND',
        status: 'FAILED',
        requestData: { headers, sampleBody: rawBody.slice(0, 300) },
        errorMessage: 'Kênh bán hàng chưa cấu hình webhook secret. Từ chối tiếp nhận webhook.',
      });

      return NextResponse.json(
        { success: false, code: 'UNAUTHORIZED_WEBHOOK', message: 'Kênh bán hàng chưa được cấu hình webhook secret an toàn.' },
        { status: 401 }
      );
    }

    // Chống Replay Attack: Kiểm tra timestamp header không vượt quá 5 phút (300 giây)
    const timestampHeader = headers['x-timestamp'] || headers['x-grab-timestamp'] || headers['timestamp'] || headers['x-shopeefood-timestamp'];
    if (timestampHeader) {
      const parsedTs = parseInt(timestampHeader, 10);
      if (!isNaN(parsedTs)) {
        const timestampSec = parsedTs > 1e11 ? Math.floor(parsedTs / 1000) : parsedTs;
        const currentSec = Math.floor(Date.now() / 1000);
        const MAX_DRIFT_SECONDS = 300; // 5 phút
        if (Math.abs(currentSec - timestampSec) > MAX_DRIFT_SECONDS) {
          await salesChannelOrderService.recordSyncLog({
            channelId: channel.id,
            syncType: 'WEBHOOK',
            direction: 'INBOUND',
            status: 'FAILED',
            requestData: { headers, sampleBody: rawBody.slice(0, 300) },
            errorMessage: `Phát hiện request hết hạn hoặc bị tấn công lặp lại (Replay attack). Độ lệch thời gian: ${Math.abs(currentSec - timestampSec)} giây (giới hạn 300s).`,
          });

          return NextResponse.json(
            { success: false, code: 'REPLAY_ATTACK_DETECTED', message: 'Webhook request đã hết hạn hoặc lệch thời gian quá 5 phút.' },
            { status: 400 }
          );
        }
      }
    } else if (process.env.NODE_ENV === 'production' && channelCode.toUpperCase() !== 'MOCK') {
      return NextResponse.json(
        { success: false, code: 'MISSING_TIMESTAMP_HEADER', message: 'Thiếu header timestamp xác thực chống replay attack.' },
        { status: 400 }
      );
    }

    // Xác thực chữ ký
    const isSignatureValid = await provider.verifyWebhookSignature(rawBody, headers, webhookSecret);
    if (!isSignatureValid) {
      await salesChannelOrderService.recordSyncLog({
        channelId: channel.id,
        syncType: 'WEBHOOK',
        direction: 'INBOUND',
        status: 'FAILED',
        requestData: { headers, sampleBody: rawBody.slice(0, 300) },
        errorMessage: 'Chữ ký Webhook HMAC không hợp lệ hoặc bị giả mạo.',
      });

      return NextResponse.json(
        { success: false, code: 'UNAUTHORIZED_WEBHOOK', message: 'Chữ ký Webhook không hợp lệ.' },
        { status: 401 }
      );
    }

    // 4. Phân loại sự kiện Webhook (Tạo mới, Hủy đơn, Cập nhật tài xế)
    const eventType = String(
      payload.event_type || payload.eventType || payload.event || headers['x-event-type'] || 'ORDER_CREATED'
    ).toUpperCase();

    const orderId = String(payload.orderID || payload.order_id || payload.orderId || '');

    // Trường hợp 1: Sự kiện Hủy đơn từ sàn (CANCEL_ORDER / ORDER_CANCELLED)
    if (eventType.includes('CANCEL') || payload.status === 'CANCELLED' || payload.state === 'CANCELLED') {
      const cleanOrderId = orderId.trim();
      const cancelReason = String(payload.cancel_reason || payload.cancelReason || payload.reason || 'Khách/Sàn hủy đơn');

      // Thiếu orderId -> HTTP 400
      if (!cleanOrderId) {
        await salesChannelOrderService.recordSyncLog({
          channelId: channel.id,
          syncType: 'STATUS_SYNC',
          direction: 'INBOUND',
          status: 'FAILED',
          requestData: { eventType, cancelReason },
          errorMessage: 'Thiếu mã đơn hàng (orderID) trong payload webhook hủy đơn.',
        });

        return NextResponse.json({
          success: false,
          code: 'INVALID_REQUEST',
          message: 'Thiếu mã đơn hàng (orderID) trong yêu cầu hủy đơn.',
        }, { status: 400 });
      }

      try {
        const cancelResult = await salesChannelOrderService.handleExternalCancellation(channelCode, cleanOrderId, cancelReason);

        if (!cancelResult.success) {
          // Đơn không tồn tại trên hệ thống -> HTTP 404
          if (cancelResult.notFound) {
            await salesChannelOrderService.recordSyncLog({
              channelId: channel.id,
              syncType: 'STATUS_SYNC',
              direction: 'INBOUND',
              status: 'FAILED',
              requestData: { orderId: cleanOrderId, cancelReason },
              errorMessage: cancelResult.message,
            });

            return NextResponse.json({
              success: false,
              code: 'ORDER_NOT_FOUND',
              message: cancelResult.message,
            }, { status: 404 });
          }

          // Lỗi thất bại nghiệp vụ khác -> HTTP 400
          await salesChannelOrderService.recordSyncLog({
            channelId: channel.id,
            syncType: 'STATUS_SYNC',
            direction: 'INBOUND',
            status: 'FAILED',
            requestData: { orderId: cleanOrderId, cancelReason },
            errorMessage: cancelResult.message,
          });

          return NextResponse.json({
            success: false,
            code: 'CANCEL_FAILED',
            message: cancelResult.message,
          }, { status: 400 });
        }

        // Thành công: HTTP 200, phản ánh rõ cờ isAlreadyCancelled
        return NextResponse.json({
          success: true,
          code: 'ORDER_CANCELLED',
          message: cancelResult.message,
          isAlreadyCancelled: Boolean(cancelResult.isAlreadyCancelled),
        }, { status: 200 });

      } catch (err: any) {
        console.error('Lỗi ngoại lệ khi xử lý webhook hủy đơn:', err);
        await salesChannelOrderService.recordSyncLog({
          channelId: channel.id,
          syncType: 'STATUS_SYNC',
          direction: 'INBOUND',
          status: 'FAILED',
          requestData: { orderId: cleanOrderId, cancelReason },
          errorMessage: err?.message || 'Lỗi transaction xử lý hủy đơn nội bộ.',
        });

        return NextResponse.json({
          success: false,
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Lỗi máy chủ khi xử lý giao dịch hủy đơn.',
        }, { status: 500 });
      }
    }

    // Trường hợp 2: Sự kiện Cập nhật tài xế (DRIVER_ALLOCATED / DRIVER_UPDATE)
    if (eventType.includes('DRIVER') && orderId) {
      const driver = payload.driver || payload.shipper || {};
      const driverName = driver.name || payload.driver_name || payload.shipper_name || 'Tài xế giao hàng';
      const driverPhone = driver.phone || driver.phoneNumber || payload.driver_phone || payload.shipper_phone || '';

      await db.execute(
        `UPDATE external_orders 
         SET driver_name = $1, driver_phone = $2, updated_at = CURRENT_TIMESTAMP
         WHERE external_order_id = $3 AND channel_id = $4;`,
        [driverName, driverPhone, orderId, channel.id]
      );

      await salesChannelOrderService.recordSyncLog({
        channelId: channel.id,
        syncType: 'WEBHOOK',
        direction: 'INBOUND',
        status: 'SUCCESS',
        requestData: { eventType, orderId, driverName, driverPhone },
        responseData: { updated: true },
      });

      return NextResponse.json({
        success: true,
        code: 'DRIVER_UPDATED',
        message: `Đã cập nhật thông tin tài xế [${driverName}] cho đơn [${orderId}].`,
      }, { status: 200 });
    }

    // Trường hợp 3: Sự kiện Tạo mới hoặc Cập nhật đơn hàng (ORDER_CREATED / ORDER_NEW)
    const unifiedOrder = await provider.parseWebhookOrder(payload, headers);
    const ingestResult = await salesChannelOrderService.ingestOrder(unifiedOrder);

    return NextResponse.json({
      success: true,
      code: 'ORDER_ACCEPTED',
      orderId: ingestResult.orderId,
      internalOrderId: ingestResult.internalOrderId,
      message: ingestResult.message,
      isExisting: ingestResult.isExisting,
    }, { status: 200 });

  } catch (error: any) {
    console.error('Lỗi POST webhook channel:', error);
    return NextResponse.json(
      { success: false, code: 'WEBHOOK_PROCESSING_ERROR', message: error?.message || 'Lỗi xử lý webhook.' },
      { status: 500 }
    );
  }
}

