import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getDb, withTransaction } from '@/lib/db';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

const VALID_TYPES = ['CALL_WAITER', 'REQUEST_PAYMENT'] as const;
type ServiceRequestType = (typeof VALID_TYPES)[number];

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req.headers);
    const body = await req.json().catch(() => null);
    const tableCodeRaw = body?.tableCode;
    const requestTypeRaw = body?.requestType;
    const noteRaw = body?.note;

    if (typeof tableCodeRaw !== 'string' || !tableCodeRaw.trim()) {
      return NextResponse.json(
        { success: false, code: 'INVALID_TABLE', message: 'Thiếu mã bàn cần hỗ trợ.' },
        { status: 400 }
      );
    }

    if (typeof requestTypeRaw !== 'string' || !VALID_TYPES.includes(requestTypeRaw as ServiceRequestType)) {
      return NextResponse.json(
        { success: false, code: 'INVALID_REQUEST_TYPE', message: 'Loại yêu cầu không hợp lệ.' },
        { status: 400 }
      );
    }

    const tableCode = tableCodeRaw.trim();
    const requestType = requestTypeRaw as ServiceRequestType;
    const note =
      typeof noteRaw === 'string' && noteRaw.trim()
        ? noteRaw.trim().slice(0, 120)
        : requestType === 'REQUEST_PAYMENT'
        ? 'Khách yêu cầu thanh toán tại bàn'
        : 'Khách gọi nhân viên phục vụ';

    // Rate limit: tối đa 8 yêu cầu / phút theo IP + bàn
    const limit = checkRateLimit(`guest_svc:${ip}:${tableCode.toLowerCase()}`, 8, 60 * 1000);
    if (!limit.allowed) {
      return NextResponse.json(
        {
          success: false,
          code: 'RATE_LIMITED',
          message: `Bạn vừa gửi yêu cầu rồi, vui lòng đợi ${limit.retryAfterSeconds} giây trước khi gửi lại.`,
        },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
      );
    }

    const db = await getDb();
    const table = await db.queryOne<{
      id: string;
      table_code: string;
      status: string;
      is_active: boolean;
    }>(
      `SELECT id, table_code, status, is_active
       FROM dining_tables
       WHERE (LOWER(table_code) = LOWER($1) OR table_code = $1) AND is_active = true
       LIMIT 1;`,
      [tableCode]
    );

    if (!table) {
      return NextResponse.json(
        { success: false, code: 'TABLE_NOT_FOUND', message: `Không tìm thấy bàn '${tableCode}'.` },
        { status: 404 }
      );
    }

    // Chống tạo trùng yêu cầu PENDING cùng loại trong vòng 60 giây
    const existingPending = await db.queryOne<{
      id: string;
      request_type: string;
      note: string | null;
      created_at: string;
    }>(
      `SELECT id, request_type, note, created_at
       FROM table_service_requests
       WHERE table_id = $1 AND request_type = $2 AND status = 'PENDING'
         AND created_at >= CURRENT_TIMESTAMP - INTERVAL '60 seconds'
       ORDER BY created_at DESC
       LIMIT 1;`,
      [table.id, requestType]
    );

    if (existingPending) {
      return NextResponse.json({
        success: true,
        alreadyPending: true,
        message:
          requestType === 'REQUEST_PAYMENT'
            ? 'Yêu cầu thanh toán của quý khách đang được nhân viên xử lý.'
            : 'Nhân viên phục vụ đã nhận được tín hiệu từ bàn quý khách và đang tới.',
        request: {
          id: existingPending.id,
          requestType: existingPending.request_type,
          note: existingPending.note,
          createdAt: existingPending.created_at,
        },
      });
    }

    const result = await withTransaction(async (tx) => {
      const activeOrder = await tx.queryOne<{ id: string }>(
        `SELECT id
         FROM orders
         WHERE table_id = $1 AND status IN ('OPEN', 'SENT_TO_KITCHEN', 'IN_PROGRESS', 'READY_TO_CLOSE')
         ORDER BY created_at DESC
         LIMIT 1;`,
        [table.id]
      );

      if (requestType === 'REQUEST_PAYMENT' && !activeOrder) {
        throw {
          code: 'NO_ACTIVE_ORDER',
          message: 'Bàn hiện chưa có đơn gọi món nào đang mở để yêu cầu thanh toán.',
        };
      }

      const requestId = crypto.randomUUID();
      await tx.execute(
        `INSERT INTO table_service_requests (id, table_id, order_id, request_type, note, status, created_at)
         VALUES ($1, $2, $3, $4, $5, 'PENDING', CURRENT_TIMESTAMP);`,
        [requestId, table.id, activeOrder?.id || null, requestType, note]
      );

      // Nếu khách yêu cầu thanh toán và bàn đang OCCUPIED -> chuyển sang AWAITING_PAYMENT
      if (requestType === 'REQUEST_PAYMENT' && table.status === 'OCCUPIED') {
        await tx.execute(
          `UPDATE dining_tables
           SET status = 'AWAITING_PAYMENT', version = version + 1, updated_at = CURRENT_TIMESTAMP
           WHERE id = $1 AND status = 'OCCUPIED';`,
          [table.id]
        );
      }

      return {
        id: requestId,
        requestType,
        note,
        tableCode: table.table_code,
      };
    });

    return NextResponse.json(
      {
        success: true,
        alreadyPending: false,
        message:
          requestType === 'REQUEST_PAYMENT'
            ? 'Đã gửi yêu cầu thanh toán! Nhân viên phục vụ sẽ mang hóa đơn/kiểm tra chuyển khoản ngay.'
            : 'Đã gửi tín hiệu gọi phục vụ! Nhân viên sẽ có mặt tại bàn trong giây lát.',
        request: result,
      },
      { status: 201 }
    );
  } catch (error: any) {
    if (error?.code === 'NO_ACTIVE_ORDER') {
      return NextResponse.json(
        { success: false, code: error.code, message: error.message },
        { status: 400 }
      );
    }
    console.error('Lỗi POST /api/guest/service-request:', error);
    return NextResponse.json(
      { success: false, code: 'SERVER_ERROR', message: 'Không thể gửi yêu cầu lúc này. Vui lòng thử lại.' },
      { status: 500 }
    );
  }
}
