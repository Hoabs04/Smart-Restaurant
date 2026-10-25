/**
 * BỘ KIỂM THỬ TÍCH HỢP CONCURRENCY & RACE CONDITIONS QUA HTTP API ROUTE HANDLERS
 * 
 * Kiểm tra 4 kịch bản đồng thời bắt buộc:
 * 1. Hai waiter cùng gửi order trên một bàn (POST /api/orders) -> 1 Thành công (201), 1 Xung đột (409)
 * 2. Hai batch cùng tranh chấp trừ tồn kho (POST /api/orders/[id]/send-to-kitchen) -> 1 Thành công, 1 Báo hết hàng (400), Tồn kho không âm
 * 3. Retry request thật qua API với Idempotency Key -> Replay an toàn (200), Không trừ kho 2 lần
 * 4. Hủy món đồng thời với bếp chuyển sang IN_PROGRESS -> Loại trừ lẫn nhau, không bao giờ hủy món đang nấu
 */

import { NextRequest } from 'next/server';
import { getDb, closeDb } from '../src/lib/db';
import { signAuthToken } from '../src/lib/auth';
import crypto from 'crypto';

// Import trực tiếp các HTTP Route Handlers của Next.js App Router
import { POST as createOrderApi } from '../src/app/api/orders/route';
import { POST as sendToKitchenApi } from '../src/app/api/orders/[id]/send-to-kitchen/route';
import { POST as cancelOrderItemApi } from '../src/app/api/order-items/[id]/cancel/route';
import { PATCH as updateItemStatusApi } from '../src/app/api/order-items/[id]/status/route';

interface TestResult {
  scenario: string;
  testName: string;
  passed: boolean;
  evidence: string;
  error?: string;
}

const results: TestResult[] = [];

function record(scenario: string, testName: string, passed: boolean, evidence: string, error?: any) {
  results.push({
    scenario,
    testName,
    passed,
    evidence,
    error: error ? (error instanceof Error ? error.message : String(error)) : undefined,
  });
  const icon = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`${icon} [${scenario}] ${testName}\n   ↳ ${evidence}\n`);
}

export async function runConcurrencyApiTests(): Promise<boolean> {
  console.log('\n==============================================================================');
  console.log('⚡ BẮT ĐẦU KIỂM THỬ TÍCH HỢP CONCURRENCY & IDEMPOTENCY QUA HTTP API HANDLERS');
  console.log('==============================================================================\n');

  const db = await getDb();

  // Dọn dẹp sơ bộ các bản ghi test cũ nếu có
  await db.execute(`DELETE FROM menu_items WHERE name LIKE '%Test Concurrency%';`);

  // Lưu danh sách id để dọn dẹp trong finally
  const cleanupOrderIds: string[] = [];
  const cleanupTableIds: string[] = [];
  const cleanupDishIds: string[] = [];

  try {
    // --------------------------------------------------------------------------
    // 1. Lấy thông tin user có sẵn từ DB để sinh Token JWT thật
    // --------------------------------------------------------------------------
    const waiterUser = await db.queryOne<{ id: string; username: string; display_name: string }>(
      `SELECT id, username, display_name FROM users WHERE username = 'waiter';`
    );
    const kitchenUser = await db.queryOne<{ id: string; username: string; display_name: string }>(
      `SELECT id, username, display_name FROM users WHERE username = 'kitchen';`
    );

    const waiterId = waiterUser?.id || crypto.randomUUID();
    const kitchenId = kitchenUser?.id || crypto.randomUUID();

    const waiterToken1 = await signAuthToken({
      userId: waiterId,
      username: 'waiter_01',
      displayName: 'Nhân Viên Phục Vụ 1',
      role: 'waiter',
    });

    const waiterToken2 = await signAuthToken({
      userId: waiterId,
      username: 'waiter_02',
      displayName: 'Nhân Viên Phục Vụ 2',
      role: 'waiter',
    });

    const kitchenToken = await signAuthToken({
      userId: kitchenId,
      username: 'kitchen_chef',
      displayName: 'Bếp Trưởng Điều Hành',
      role: 'kitchen',
    });

    // Lấy một danh mục món ăn hợp lệ trong DB
    const sampleCategory = await db.queryOne<{ id: string }>(`SELECT id FROM menu_categories LIMIT 1;`);
    const categoryId = sampleCategory!.id;

    // ==========================================================================
    // KỊCH BẢN 1: HAI WAITER CÙNG GỬI ORDER TRÊN MỘT BÀN ĐỒNG THỜI (POST /api/orders)
    // ==========================================================================
    console.log('--- Kịch bản 1: Hai waiter cùng tạo order trên một bàn qua POST /api/orders ---');
    const table1Id = crypto.randomUUID();
    const table1Code = `T-CONC-${Date.now().toString().slice(-4)}`;
    cleanupTableIds.push(table1Id);
    
    // Tạo bàn ăn AVAILABLE
    await db.execute(
      `INSERT INTO dining_tables (id, area_name, table_code, capacity, status, version, is_active)
       VALUES ($1, 'Khu Test Concurrency', $2, 4, 'AVAILABLE', 1, true);`,
      [table1Id, table1Code]
    );

    // Tạo món ăn phục vụ test
    const dish1Id = crypto.randomUUID();
    const dish1Name = `Cua Huỳnh Đế Test Concurrency ${Date.now()}`;
    cleanupDishIds.push(dish1Id);
    await db.execute(
      `INSERT INTO menu_items (id, category_id, name, current_price, stock_quantity, low_stock_threshold, availability)
       VALUES ($1, $2, $3, 500000, 50, 5, true);`,
      [dish1Id, categoryId, dish1Name]
    );

    // Chuẩn bị 2 request đồng thời từ 2 Waiter khác nhau cùng chọn bàn table1Id
    const req1 = new NextRequest('http://localhost:3000/api/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${waiterToken1}`,
      },
      body: JSON.stringify({
        table_id: table1Id,
        items: [{ menu_item_id: dish1Id, quantity: 1 }],
      }),
    });

    const req2 = new NextRequest('http://localhost:3000/api/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${waiterToken2}`,
      },
      body: JSON.stringify({
        table_id: table1Id,
        items: [{ menu_item_id: dish1Id, quantity: 2 }],
      }),
    });

    // Thực thi 2 request đồng thời với Promise.all
    const [res1, res2] = await Promise.all([
      createOrderApi(req1),
      createOrderApi(req2),
    ]);

    const data1 = await res1.json();
    const data2 = await res2.json();

    const statuses = [res1.status, res2.status];
    const has201 = statuses.includes(201);
    const has409 = statuses.includes(409);

    // Kiểm tra DB chỉ có đúng 1 order được tạo cho bàn này
    const createdOrders = await db.query<{ id: string; order_code: string; status: string }>(
      `SELECT id, order_code, status FROM orders WHERE table_id = $1;`,
      [table1Id]
    );
    for (const o of createdOrders) {
      cleanupOrderIds.push(o.id);
    }

    const updatedTable = await db.queryOne<{ status: string }>(
      `SELECT status FROM dining_tables WHERE id = $1;`,
      [table1Id]
    );

    record(
      'Concurrency API',
      'Hai Waiter đồng thời mở Order trên cùng bàn',
      has201 && has409 && createdOrders.length === 1 && updatedTable?.status === 'OCCUPIED',
      `Kết quả HTTP: [${res1.status}, ${res2.status}]. Đúng 1 request thành công (201), 1 request bị chặn xung đột 409 (${data1.code || data2.code}). Bàn ăn chuyển thành OCCUPIED với duy nhất 1 Order.`
    );

    // ==========================================================================
    // KỊCH BẢN 2: HAI BATCH CÙNG TRANH CHẤP TRỪ TỒN KHO (POST /api/orders/[id]/send-to-kitchen)
    // ==========================================================================
    console.log('--- Kịch bản 2: Hai batch cùng tranh chấp trừ tồn kho hạn chế qua API ---');
    // Tạo món ăn có số lượng tồn kho giới hạn: 5 phần
    const limitedDishId = crypto.randomUUID();
    const limitedDishName = `Bò Wagyu A5 Test Concurrency ${Date.now()}`;
    cleanupDishIds.push(limitedDishId);
    await db.execute(
      `INSERT INTO menu_items (id, category_id, name, current_price, stock_quantity, low_stock_threshold, availability)
       VALUES ($1, $2, $3, 1200000, 5, 5, true);`,
      [limitedDishId, categoryId, limitedDishName]
    );

    // Tạo Order A (cần 4 phần) và Order B (cần 4 phần). Tổng cần 8 phần > 5 phần tồn kho!
    const tableAId = crypto.randomUUID();
    const tableBId = crypto.randomUUID();
    cleanupTableIds.push(tableAId, tableBId);
    await db.execute(
      `INSERT INTO dining_tables (id, area_name, table_code, capacity, status, version, is_active)
       VALUES ($1, 'Khu Test A', 'T-A-${Date.now()}', 4, 'OCCUPIED', 1, true),
              ($2, 'Khu Test B', 'T-B-${Date.now()}', 4, 'OCCUPIED', 1, true);`,
      [tableAId, tableBId]
    );

    const orderAId = crypto.randomUUID();
    const orderBId = crypto.randomUUID();
    cleanupOrderIds.push(orderAId, orderBId);
    await db.execute(
      `INSERT INTO orders (id, order_code, table_id, created_by, status, total_amount, version)
       VALUES ($1, 'ORD-A-${Date.now()}', $2, $3, 'OPEN', 4800000, 1),
              ($4, 'ORD-B-${Date.now()}', $5, $3, 'OPEN', 4800000, 1);`,
      [orderAId, tableAId, waiterId, orderBId, tableBId]
    );

    const itemAId = crypto.randomUUID();
    const itemBId = crypto.randomUUID();
    await db.execute(
      `INSERT INTO order_items (id, order_id, menu_item_id, item_name_snapshot, unit_price_snapshot, quantity, status)
       VALUES ($1, $2, $3, $4, 1200000, 4, 'NEW'),
              ($5, $6, $3, $4, 1200000, 4, 'NEW');`,
      [itemAId, orderAId, limitedDishId, limitedDishName, itemBId, orderBId]
    );

    // Chuẩn bị 2 request gửi bếp đồng thời với 2 idempotency key riêng biệt
    const sendReqA = new NextRequest(`http://localhost:3000/api/orders/${orderAId}/send-to-kitchen`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${waiterToken1}`,
      },
      body: JSON.stringify({ idempotency_key: `IDEMP_CONC_BATCH_A_${Date.now()}` }),
    });

    const sendReqB = new NextRequest(`http://localhost:3000/api/orders/${orderBId}/send-to-kitchen`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${waiterToken2}`,
      },
      body: JSON.stringify({ idempotency_key: `IDEMP_CONC_BATCH_B_${Date.now()}` }),
    });

    // Thực thi đồng thời 2 batch gửi bếp
    const [sendResA, sendResB] = await Promise.all([
      sendToKitchenApi(sendReqA, { params: Promise.resolve({ id: orderAId }) }),
      sendToKitchenApi(sendReqB, { params: Promise.resolve({ id: orderBId }) }),
    ]);

    const sendDataA = await sendResA.json();
    const sendDataB = await sendResB.json();

    const sendStatuses = [sendResA.status, sendResB.status];
    const hasBatchSuccess = sendStatuses.includes(200);
    const hasBatchOutOfStock = sendStatuses.includes(400);

    // Kiểm tra tồn kho sau khi xử lý: Ban đầu 5, trừ 4 -> phải còn lại đúng 1 (KHÔNG BAO GIỜ ÂM)
    const stockAfter = await db.queryOne<{ stock_quantity: number }>(
      `SELECT stock_quantity FROM menu_items WHERE id = $1;`,
      [limitedDishId]
    );

    // Kiểm tra sổ cái chỉ ghi nhận 1 lần trừ 4 món
    const ledgerRows = await db.query(
      `SELECT * FROM inventory_ledger WHERE menu_item_id = $1;`,
      [limitedDishId]
    );

    record(
      'Concurrency API',
      'Hai Batch cùng tranh chấp trừ tồn kho hạn chế qua API',
      hasBatchSuccess && hasBatchOutOfStock && stockAfter?.stock_quantity === 1 && ledgerRows.length === 1,
      `Kết quả HTTP: [${sendResA.status}, ${sendResB.status}]. 1 Batch được duyệt thành công (200), 1 Batch bị từ chối 400 (${sendDataA.code || sendDataB.code}). Tồn kho còn lại đúng 1, không bao giờ âm.`
    );

    // ==========================================================================
    // KỊCH BẢN 3: RETRY REQUEST THẬT QUA API VỚI IDEMPOTENCY KEY
    // ==========================================================================
    console.log('--- Kịch bản 3: Retry request thật qua API với Idempotency Key ---');
    const idempDishId = crypto.randomUUID();
    const idempDishName = `Tôm Hùm Alaska Test Concurrency ${Date.now()}`;
    cleanupDishIds.push(idempDishId);
    await db.execute(
      `INSERT INTO menu_items (id, category_id, name, current_price, stock_quantity, low_stock_threshold, availability)
       VALUES ($1, $2, $3, 900000, 20, 5, true);`,
      [idempDishId, categoryId, idempDishName]
    );

    const idempTableId = crypto.randomUUID();
    cleanupTableIds.push(idempTableId);
    await db.execute(
      `INSERT INTO dining_tables (id, area_name, table_code, capacity, status, version, is_active)
       VALUES ($1, 'Khu Test Idemp', 'T-IDEMP-${Date.now()}', 4, 'OCCUPIED', 1, true);`,
      [idempTableId]
    );

    const idempOrderId = crypto.randomUUID();
    cleanupOrderIds.push(idempOrderId);
    await db.execute(
      `INSERT INTO orders (id, order_code, table_id, created_by, status, total_amount, version)
       VALUES ($1, 'ORD-IDEMP-${Date.now()}', $2, $3, 'OPEN', 1800000, 1);`,
      [idempOrderId, idempTableId, waiterId]
    );

    const idempItemId = crypto.randomUUID();
    await db.execute(
      `INSERT INTO order_items (id, order_id, menu_item_id, item_name_snapshot, unit_price_snapshot, quantity, status)
       VALUES ($1, $2, $3, $4, 900000, 2, 'NEW');`,
      [idempItemId, idempOrderId, idempDishId, idempDishName]
    );

    const fixedIdempotencyKey = `IDEMP_KEY_RETRY_STRICT_${Date.now()}`;

    // Lần gọi 1: Request ban đầu
    const firstReq = new NextRequest(`http://localhost:3000/api/orders/${idempOrderId}/send-to-kitchen`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${waiterToken1}`,
      },
      body: JSON.stringify({ idempotency_key: fixedIdempotencyKey }),
    });

    const firstRes = await sendToKitchenApi(firstReq, { params: Promise.resolve({ id: idempOrderId }) });

    // Lần gọi 2: Client mạng lag hoặc retry gửi lại nguyên văn với idempotency_key cũ
    const retryReq = new NextRequest(`http://localhost:3000/api/orders/${idempOrderId}/send-to-kitchen`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${waiterToken1}`,
      },
      body: JSON.stringify({ idempotency_key: fixedIdempotencyKey }),
    });

    const retryRes = await sendToKitchenApi(retryReq, { params: Promise.resolve({ id: idempOrderId }) });
    const retryData = await retryRes.json();

    // Kiểm tra tồn kho chỉ bị trừ 2 (từ 20 xuống 18, không thành 16)
    const stockAfterRetry = await db.queryOne<{ stock_quantity: number }>(
      `SELECT stock_quantity FROM menu_items WHERE id = $1;`,
      [idempDishId]
    );

    // Kiểm tra số lượng batch trong DB
    const batchesCount = await db.query<{ id: string }>(
      `SELECT id FROM kitchen_batches WHERE idempotency_key = $1;`,
      [fixedIdempotencyKey]
    );

    record(
      'Concurrency API',
      'Thử lại (Retry) Request qua API với Idempotency Key',
      firstRes.status === 200 && 
      retryRes.status === 200 && 
      retryData.isIdempotentReplay === true && 
      stockAfterRetry?.stock_quantity === 18 && 
      batchesCount.length === 1,
      `Lần 1 HTTP 200, Lần 2 (Retry) HTTP 200 với 'isIdempotentReplay: true'. Tồn kho giảm từ 20 xuống 18 (không bị trừ kép thành 16). Chỉ 1 Batch duy nhất trong DB.`
    );

    // ==========================================================================
    // KỊCH BẢN 4: HỦY MÓN ĐỒNG THỜI VỚI BẾP CHUYỂN SANG IN_PROGRESS
    // ==========================================================================
    console.log('--- Kịch bản 4: Hủy món đồng thời với bếp chuyển sang IN_PROGRESS ---');
    const raceDishId = crypto.randomUUID();
    const raceDishName = `Súp Bào Ngư Test Concurrency ${Date.now()}`;
    cleanupDishIds.push(raceDishId);
    await db.execute(
      `INSERT INTO menu_items (id, category_id, name, current_price, stock_quantity, low_stock_threshold, availability)
       VALUES ($1, $2, $3, 850000, 10, 5, true);`,
      [raceDishId, categoryId, raceDishName]
    );

    const raceTableId = crypto.randomUUID();
    cleanupTableIds.push(raceTableId);
    await db.execute(
      `INSERT INTO dining_tables (id, area_name, table_code, capacity, status, version, is_active)
       VALUES ($1, 'Khu Test Race', 'T-RACE-${Date.now()}', 4, 'OCCUPIED', 1, true);`,
      [raceTableId]
    );

    const raceOrderId = crypto.randomUUID();
    cleanupOrderIds.push(raceOrderId);
    await db.execute(
      `INSERT INTO orders (id, order_code, table_id, created_by, status, total_amount, version)
       VALUES ($1, 'ORD-RACE-${Date.now()}', $2, $3, 'SENT_TO_KITCHEN', 850000, 1);`,
      [raceOrderId, raceTableId, waiterId]
    );

    // Món đã được gửi bếp: trạng thái SENT_TO_KITCHEN, số lượng = 1, kho còn 9 (đã trừ 1)
    const raceItemId = crypto.randomUUID();
    await db.execute(
      `INSERT INTO order_items (id, order_id, menu_item_id, item_name_snapshot, unit_price_snapshot, quantity, status)
       VALUES ($1, $2, $3, $4, 850000, 1, 'SENT_TO_KITCHEN');`,
      [raceItemId, raceOrderId, raceDishId, raceDishName]
    );

    // Cập nhật tồn kho phản ánh món đã gửi bếp
    await db.execute(`UPDATE menu_items SET stock_quantity = 9 WHERE id = $1;`, [raceDishId]);

    // Request 1: Waiter gọi POST /api/order-items/[id]/cancel để hủy món
    const cancelReq = new NextRequest(`http://localhost:3000/api/order-items/${raceItemId}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${waiterToken1}`,
      },
      body: JSON.stringify({ cancel_reason: 'Khách đổi ý muốn chuyển sang món khác' }),
    });

    // Request 2: Bếp đồng thời gọi PATCH /api/order-items/[id]/status chuyển sang IN_PROGRESS
    const statusReq = new NextRequest(`http://localhost:3000/api/order-items/${raceItemId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${kitchenToken}`,
      },
      body: JSON.stringify({ status: 'IN_PROGRESS' }),
    });

    // Thực thi 2 request đồng thời
    const [cancelRes, statusRes] = await Promise.all([
      cancelOrderItemApi(cancelReq, { params: Promise.resolve({ id: raceItemId }) }),
      updateItemStatusApi(statusReq, { params: Promise.resolve({ id: raceItemId }) }),
    ]);

    const cancelData = await cancelRes.json();
    const statusData = await statusRes.json();

    const finalItem = await db.queryOne<{ status: string }>(
      `SELECT status FROM order_items WHERE id = $1;`,
      [raceItemId]
    );

    const finalDishStock = await db.queryOne<{ stock_quantity: number }>(
      `SELECT stock_quantity FROM menu_items WHERE id = $1;`,
      [raceDishId]
    );

    // Luôn luôn: đúng 1 trong 2 thao tác thành công (200), thao tác còn lại bị chặn bởi State Machine (400)
    // - Nếu Bếp thắng: status = IN_PROGRESS, Cancel bị chặn (CANNOT_CANCEL_COOKING_ITEM), tồn kho giữ 9.
    // - Nếu Waiter thắng: status = CANCELLED, Status bị chặn (INVALID_TRANSITION), tồn kho hoàn lại 10.
    const oneSucceeded = (cancelRes.status === 200 && statusRes.status === 400) ||
                         (cancelRes.status === 400 && statusRes.status === 200);

    const consistentState = (finalItem?.status === 'IN_PROGRESS' && finalDishStock?.stock_quantity === 9) ||
                            (finalItem?.status === 'CANCELLED' && finalDishStock?.stock_quantity === 10);

    record(
      'Concurrency API',
      'Hủy món đồng thời với Bếp chuyển sang IN_PROGRESS',
      oneSucceeded && consistentState,
      `HTTP Cancel: ${cancelRes.status} (${cancelData.code || 'OK'}), HTTP Status Bếp: ${statusRes.status} (${statusData.code || 'OK'}). Trạng thái cuối: '${finalItem?.status}', Tồn kho: ${finalDishStock?.stock_quantity}. Hệ thống đảm bảo loại trừ lẫn nhau (Mutual Exclusion), không bao giờ có trạng thái tranh chấp không nhất quán.`
    );

  } catch (err) {
    console.error('Lỗi ngoại lệ trong quá trình chạy test concurrency API:', err);
    record('Concurrency API', 'Kiểm thử Concurrency API', false, 'Ngoại lệ không mong muốn', err);
  } finally {
    // Dọn dẹp an toàn tuyệt đối các bản ghi test
    for (const ordId of cleanupOrderIds) {
      await db.execute(`DELETE FROM orders WHERE id = $1;`, [ordId]).catch(() => {});
    }
    for (const tId of cleanupTableIds) {
      await db.execute(`DELETE FROM dining_tables WHERE id = $1;`, [tId]).catch(() => {});
    }
    for (const dId of cleanupDishIds) {
      await db.execute(`DELETE FROM menu_items WHERE id = $1;`, [dId]).catch(() => {});
    }
  }

  // ----------------------------------------------------------------------------
  // TỔNG HỢP KẾT QUẢ KIỂM THỬ CONCURRENCY API
  // ----------------------------------------------------------------------------
  console.log('==============================================================================');
  console.log('📊 TỔNG HỢP KẾT QUẢ KIỂM THỬ CONCURRENCY API:');
  console.log('==============================================================================');

  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = total - passed;

  console.log(`Tổng số bài test: ${total} | Đạt: ${passed} | Không đạt: ${failed}`);
  console.log('------------------------------------------------------------------------------');

  if (failed === 0) {
    console.log('🎉 TẤT CẢ 4/4 KỊCH BẢN CONCURRENCY & RACE CONDITIONS QUA HTTP API ĐỀU ĐẠT CHUẨN!');
  } else {
    console.log(`⚠️ Có ${failed} kịch bản chưa đạt yêu cầu.`);
  }

  console.log('==============================================================================\n');
  return failed === 0;
}

// Chạy trực tiếp nếu file được thực thi độc lập
if (require.main === module || process.argv[1]?.includes('concurrency-api.test.ts')) {
  runConcurrencyApiTests()
    .then(success => {
      closeDb();
      if (!success) process.exit(1);
    })
    .catch(() => {
      closeDb();
      process.exit(1);
    });
}
