import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { getDb, closeDb } from '../src/lib/db';
import { signAuthToken, hashPassword } from '../src/lib/auth';
import { POST as closeOrderApi } from '../src/app/api/orders/[id]/close/route';
import { POST as confirmPaymentApi } from '../src/app/api/orders/[id]/confirm-payment/route';
import { POST as addItemsApi } from '../src/app/api/orders/[id]/items/route';
import { POST as cancelOrderApi } from '../src/app/api/orders/[id]/cancel/route';
import { GET as revenueReportApi } from '../src/app/api/reports/revenue/route';
import { GET as guestTrackApi } from '../src/app/api/guest/track/route';
import { PUT as adminUpdateUserApi } from '../src/app/api/admin/users/route';
import { POST as webhookApi } from '../src/app/api/webhooks/channels/[channelCode]/route';
import { POST as guestServiceRequestApi } from '../src/app/api/guest/service-request/route';
import { POST as acknowledgeTableReqApi } from '../src/app/api/tables/[id]/acknowledge-requests/route';
import { GET as listTablesApi } from '../src/app/api/tables/route';
import { POST as transferTableApi } from '../src/app/api/orders/[id]/transfer-table/route';
import { MockSalesChannelProvider } from '../src/lib/sales-channels/providers/mock.provider';

interface TestResult {
  name: string;
  passed: boolean;
  detail: string;
}

const results: TestResult[] = [];
function record(name: string, passed: boolean, detail: string) {
  results.push({ name, passed, detail });
  console.log(`${passed ? '✅ PASS' : '❌ FAIL'} | ${name}: ${detail}`);
}

function makeAuthReq(url: string, method: string, token: string, body?: unknown) {
  return new NextRequest(url, {
    method,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

async function runSecurityAndLogicTests() {
  const db = await getDb();
  const suffix = Date.now();
  const waiterId = crypto.randomUUID();
  const managerId = crypto.randomUUID();
  const tableId = crypto.randomUUID();
  const orderId = crypto.randomUUID();
  const closedOrderId = crypto.randomUUID();

  try {
    const waiterRole = await db.queryOne<{ id: string }>(`SELECT id FROM roles WHERE code = 'waiter';`);
    const managerRole = await db.queryOne<{ id: string }>(`SELECT id FROM roles WHERE code = 'manager';`);
    const menuItem = await db.queryOne<{ id: string; name: string; current_price: number }>(
      `SELECT id, name, current_price FROM menu_items WHERE availability = true AND stock_quantity >= 5 LIMIT 1;`
    );

    if (!waiterRole || !managerRole || !menuItem) {
      throw new Error('Thiếu dữ liệu seed cơ bản (roles hoặc menu_items).');
    }

    const pwdHash = await hashPassword('TestPass@2026');
    await db.execute(
      `INSERT INTO users (id, username, password_hash, display_name, is_active) VALUES ($1, $2, $3, 'Test Waiter', true);`,
      [waiterId, `sec_waiter_${suffix}`, pwdHash]
    );
    await db.execute(
      `INSERT INTO user_roles (id, user_id, role_id) VALUES ($1, $2, $3);`,
      [crypto.randomUUID(), waiterId, waiterRole.id]
    );

    await db.execute(
      `INSERT INTO users (id, username, password_hash, display_name, is_active) VALUES ($1, $2, $3, 'Test Manager', true);`,
      [managerId, `sec_mgr_${suffix}`, pwdHash]
    );
    await db.execute(
      `INSERT INTO user_roles (id, user_id, role_id) VALUES ($1, $2, $3);`,
      [crypto.randomUUID(), managerId, managerRole.id]
    );

    const waiterToken = await signAuthToken({
      userId: waiterId,
      username: `sec_waiter_${suffix}`,
      displayName: 'Test Waiter',
      role: 'waiter',
    });
    const managerToken = await signAuthToken({
      userId: managerId,
      username: `sec_mgr_${suffix}`,
      displayName: 'Test Manager',
      role: 'manager',
    });

    await db.execute(
      `INSERT INTO dining_tables (id, area_name, table_code, capacity, status, is_active) VALUES ($1, 'Test Area', $2, 4, 'OCCUPIED', true);`,
      [tableId, `SEC-T-${suffix}`]
    );

    await db.execute(
      `INSERT INTO orders (id, order_code, table_id, created_by, status, total_amount, payment_status, order_source)
       VALUES ($1, $2, $3, $4, 'READY_TO_CLOSE', $5, 'PENDING', 'DINE_IN');`,
      [orderId, `SEC-ORD-${suffix}`, tableId, waiterId, menuItem.current_price]
    );

    await db.execute(
      `INSERT INTO order_items (id, order_id, menu_item_id, item_name_snapshot, unit_price_snapshot, quantity, status)
       VALUES ($1, $2, $3, $4, $5, 1, 'READY');`,
      [crypto.randomUUID(), orderId, menuItem.id, menuItem.name, menuItem.current_price]
    );

    // 1. bypassPaymentCheck bị từ chối
    {
      const req = makeAuthReq(`http://localhost:3000/api/orders/${orderId}/close`, 'POST', waiterToken, {
        bypassPaymentCheck: true,
      });
      const res = await closeOrderApi(req, { params: Promise.resolve({ id: orderId }) });
      const data = await res.json();
      record(
        'CloseOrder/NoBypass',
        res.status === 400 && data.code === 'PAYMENT_NOT_CONFIRMED',
        `Status=${res.status}, Code=${data.code}`
      );
    }

    // 2. Xác nhận thanh toán -> thêm món -> tự động reset payment_status về PENDING
    {
      const confReq = makeAuthReq(`http://localhost:3000/api/orders/${orderId}/confirm-payment`, 'POST', waiterToken, {});
      const confRes = await confirmPaymentApi(confReq, { params: Promise.resolve({ id: orderId }) });
      const addReq = makeAuthReq(`http://localhost:3000/api/orders/${orderId}/items`, 'POST', waiterToken, {
        items: [{ menu_item_id: menuItem.id, quantity: 1 }],
      });
      const addRes = await addItemsApi(addReq, { params: Promise.resolve({ id: orderId }) });
      const row = await db.queryOne<{ payment_status: string }>(`SELECT payment_status FROM orders WHERE id = $1;`, [orderId]);
      record(
        'AddItems/ResetPayment',
        confRes.status === 200 && addRes.status === 201 && row?.payment_status === 'PENDING',
        `payment_status=${row?.payment_status}`
      );
    }

    // 3. Waiter không thể hủy cả đơn khi có món READY
    {
      const req = makeAuthReq(`http://localhost:3000/api/orders/${orderId}/cancel`, 'POST', waiterToken, {
        cancel_reason: 'Test cancel',
      });
      const res = await cancelOrderApi(req, { params: Promise.resolve({ id: orderId }) });
      const data = await res.json();
      record(
        'CancelOrder/GuardReady',
        res.status === 403 && data.code === 'CANCEL_RESTRICTED',
        `Status=${res.status}, Code=${data.code}`
      );
    }

    // 4. Báo cáo source=ONLINE không lẫn đơn DINE_IN & confirm-payment từ chối đơn CLOSED
    {
      await db.execute(
        `INSERT INTO orders (id, order_code, table_id, created_by, status, total_amount, payment_status, order_source, closed_at)
         VALUES ($1, $2, $3, $4, 'CLOSED', 120000, 'PENDING', 'DINE_IN', CURRENT_TIMESTAMP);`,
        [closedOrderId, `SEC-CLOSED-${suffix}`, tableId, waiterId]
      );
      const revReq = makeAuthReq('http://localhost:3000/api/reports/revenue?source=ONLINE', 'GET', managerToken);
      const revRes = await revenueReportApi(revReq);
      const revData = await revRes.json();
      const leakedDineIn = (revData.orders || []).some((o: { id: string }) => o.id === closedOrderId);
      record('RevenueReport/OnlineFilter', revRes.status === 200 && !leakedDineIn, `leakedDineIn=${leakedDineIn}`);

      const confClosedReq = makeAuthReq(
        `http://localhost:3000/api/orders/${closedOrderId}/confirm-payment`,
        'POST',
        waiterToken,
        {}
      );
      const confClosedRes = await confirmPaymentApi(confClosedReq, { params: Promise.resolve({ id: closedOrderId }) });
      record(
        'ConfirmPayment/RejectClosed',
        confClosedRes.status === 400,
        `Status=${confClosedRes.status}`
      );
    }

    // 5. Guest tracking không lộ đơn CLOSED qua orderCode
    {
      const req = new NextRequest(`http://localhost:3000/api/guest/track?orderCode=SEC-CLOSED-${suffix}`);
      const res = await guestTrackApi(req);
      record('GuestTrack/HideClosedOrder', res.status === 404, `Status=${res.status}`);
    }

    // 6. Stale JWT role check against DB
    {
      const forgedWaiterAsMgr = await signAuthToken({
        userId: waiterId,
        username: `sec_waiter_${suffix}`,
        displayName: 'Test Waiter',
        role: 'manager',
      });
      const req = makeAuthReq('http://localhost:3000/api/reports/revenue', 'GET', forgedWaiterAsMgr);
      const res = await revenueReportApi(req);
      record('Auth/DbRoleCheck', res.status === 403, `Status=${res.status}`);
    }

    // 7. Admin PUT chặn tự khóa chính mình
    {
      const req = makeAuthReq('http://localhost:3000/api/admin/users', 'PUT', managerToken, {
        id: managerId,
        display_name: 'Self Lockout',
        role_code: 'waiter',
        is_active: false,
      });
      const res = await adminUpdateUserApi(req);
      const data = await res.json();
      record('AdminUsers/SelfLockoutGuard', res.status === 400 && data.code === 'SELF_LOCKOUT', `Status=${res.status}`);
    }

    // 8. Mock provider & MOCK webhook chặn trên production
    {
      const prevEnv = process.env.NODE_ENV;
      (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
      try {
        const mockProvider = new MockSalesChannelProvider();
        const sigOk = await mockProvider.verifyWebhookSignature('{}', {}, '');
        const whReq = new NextRequest('http://localhost:3000/api/webhooks/channels/MOCK', {
          method: 'POST',
          body: '{}',
        });
        const whRes = await webhookApi(whReq, { params: Promise.resolve({ channelCode: 'MOCK' }) });
        record(
          'Webhook/BlockMockInProd',
          sigOk === false && whRes.status === 403,
          `sigOk=${sigOk}, whStatus=${whRes.status}`
        );
      } finally {
        (process.env as Record<string, string | undefined>).NODE_ENV = prevEnv;
      }
    }

    // 9. Trợ lý gọi phục vụ từ QR bàn (gửi yêu cầu -> hiện ở /api/tables -> nhân viên xác nhận)
    {
      const svcReq = new NextRequest('http://localhost:3000/api/guest/service-request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tableCode: `SEC-T-${suffix}`,
          requestType: 'REQUEST_PAYMENT',
          note: 'Xin thanh toán chuyển khoản',
        }),
      });
      const svcRes = await guestServiceRequestApi(svcReq);

      const tblRes = await listTablesApi(makeAuthReq('http://localhost:3000/api/tables', 'GET', waiterToken));
      const tblData = await tblRes.json();
      const targetTbl = (tblData.data || []).find((t: { id: string }) => t.id === tableId);
      const hasPending = targetTbl?.pendingRequests?.length === 1 && targetTbl?.status === 'AWAITING_PAYMENT';

      const ackRes = await acknowledgeTableReqApi(
        makeAuthReq(`http://localhost:3000/api/tables/${tableId}/acknowledge-requests`, 'POST', waiterToken),
        { params: Promise.resolve({ id: tableId }) }
      );
      const ackData = await ackRes.json();

      record(
        'GuestServiceAssistant/Flow',
        svcRes.status === 201 && hasPending && ackRes.status === 200 && ackData.acknowledgedCount === 1,
        `svc=${svcRes.status}, hasPending=${hasPending}, ack=${ackRes.status}`
      );
    }

    // 10. Ghi chú món ăn & Chuyển bàn
    {
      const targetTableId = crypto.randomUUID();
      await db.execute(
        `INSERT INTO dining_tables (id, area_name, table_code, capacity, status, is_active) VALUES ($1, 'Test Area', $2, 4, 'AVAILABLE', true);`,
        [targetTableId, `SEC-T2-${suffix}`]
      );

      try {
        const noteRes = await addItemsApi(
          makeAuthReq(`http://localhost:3000/api/orders/${orderId}/items`, 'POST', waiterToken, {
            items: [{ menu_item_id: menuItem.id, quantity: 1, notes: 'Ít cay, không hành' }],
          }),
          { params: Promise.resolve({ id: orderId }) }
        );
        const noteRow = await db.queryOne<{ notes: string | null }>(
          `SELECT notes FROM order_items WHERE order_id = $1 AND notes IS NOT NULL LIMIT 1;`,
          [orderId]
        );

        const trRes = await transferTableApi(
          makeAuthReq(`http://localhost:3000/api/orders/${orderId}/transfer-table`, 'POST', waiterToken, {
            target_table_id: targetTableId,
          }),
          { params: Promise.resolve({ id: orderId }) }
        );
        const ordAfter = await db.queryOne<{ table_id: string }>(`SELECT table_id FROM orders WHERE id = $1;`, [orderId]);
        const oldTbl = await db.queryOne<{ status: string }>(`SELECT status FROM dining_tables WHERE id = $1;`, [tableId]);
        const newTbl = await db.queryOne<{ status: string }>(`SELECT status FROM dining_tables WHERE id = $1;`, [targetTableId]);

        record(
          'ItemNotesAndTransferTable/Flow',
          noteRes.status === 201 &&
            noteRow?.notes === 'Ít cay, không hành' &&
            trRes.status === 200 &&
            ordAfter?.table_id === targetTableId &&
            oldTbl?.status === 'AVAILABLE' &&
            newTbl?.status !== 'AVAILABLE',
          `notes=${noteRow?.notes}, trStatus=${trRes.status}, old=${oldTbl?.status}, new=${newTbl?.status}`
        );
      } finally {
        await db.execute(`UPDATE orders SET table_id = $1 WHERE id = $2;`, [tableId, orderId]);
        await db.execute(`DELETE FROM dining_tables WHERE id = $1;`, [targetTableId]);
      }
    }
  } finally {
    await db.execute(`DELETE FROM orders WHERE id IN ($1, $2);`, [orderId, closedOrderId]);
    await db.execute(`DELETE FROM dining_tables WHERE id = $1;`, [tableId]);
    await db.execute(`DELETE FROM users WHERE id IN ($1, $2);`, [waiterId, managerId]);
    await closeDb();
  }

  const failed = results.filter((r) => !r.passed).length;
  console.log(`\n📊 Security & Logic Regression: ${results.length - failed}/${results.length} PASSED`);
  return failed === 0;
}

runSecurityAndLogicTests()
  .then((ok) => process.exit(ok ? 0 : 1))
  .catch(async (err) => {
    console.error(err);
    await closeDb();
    process.exit(1);
  });
