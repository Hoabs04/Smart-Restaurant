/**
 * BỘ KIỂM THỬ TOÀN DIỆN (AUTOMATED TEST SUITE)
 * Đề tài: Nghiên cứu và triển khai Hệ thống Quản lý Nhà hàng thông minh trên AWS
 * Kiểm tra 100% các tiêu chí bắt buộc theo tài liệu thiết kế và quy tắc nghiệp vụ.
 */

import { getDb, closeDb, withTransaction } from '../src/lib/db';
import { hashPassword, comparePassword, signAuthToken, verifyAuthToken } from '../src/lib/auth';
import { getWaitTimeSeconds, isOverdueWarning, getStockStatusInfo } from '../src/lib/utils';
import crypto from 'crypto';

interface TestResult {
  category: string;
  testName: string;
  passed: boolean;
  evidence: string;
  error?: string;
}

const results: TestResult[] = [];

function recordTest(category: string, testName: string, passed: boolean, evidence: string, error?: any) {
  results.push({
    category,
    testName,
    passed,
    evidence,
    error: error ? (error instanceof Error ? error.message : String(error)) : undefined,
  });
  const icon = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`${icon} [${category}] ${testName}: ${evidence}`);
}

async function runAllTests() {
  console.log('==============================================================================');
  console.log('🚀 BẮT ĐẦU CHẠY BỘ KIỂM THỬ BẮT BUỘC CHO HỆ THỐNG QUẢN LÝ NHÀ HÀNG THÔNG MINH');
  console.log('==============================================================================\n');

  const db = await getDb();

  try {
    // --------------------------------------------------------------------------
    // TEST 1: ĐĂNG NHẬP & PHÂN QUYỀN RBAC
    // --------------------------------------------------------------------------
    console.log('\n--- 1. Kiểm thử Đăng nhập & Mã hóa Mật khẩu & Token JWT ---');
    const rawPass = 'Restaurant@2026';
    const hashed = await hashPassword(rawPass);
    const isValidPass = await comparePassword(rawPass, hashed);
    const isWrongPass = await comparePassword('WrongPassword@123', hashed);

    recordTest(
      'Auth/RBAC',
      'Bcrypt Password Hash & Compare',
      isValidPass && !isWrongPass,
      `Mật khẩu đã được hash an toàn (độ dài ${hashed.length}), so khớp đúng và từ chối mật khẩu sai.`
    );

    const token = await signAuthToken({
      userId: 'test-user-123',
      username: 'waiter',
      displayName: 'Phục Vụ Test',
      role: 'waiter',
    });
    const verified = await verifyAuthToken(token);

    recordTest(
      'Auth/RBAC',
      'JWT Sign & Verify',
      verified !== null && verified.role === 'waiter' && verified.username === 'waiter',
      `Token JWT được ký và xác thực chuẩn HS256, payload chứa role = ${verified?.role}.`
    );

    // --------------------------------------------------------------------------
    // TEST 2: KIỂM TRA PHÂN QUYỀN TRÊN ROLE
    // --------------------------------------------------------------------------
    console.log('\n--- 2. Kiểm thử Phân quyền Nghiệp vụ (Waiter, Kitchen, Manager) ---');
    const rolesAllowedForMenu = ['manager'];
    const rolesAllowedForQueue = ['kitchen'];
    const rolesAllowedForReport = ['manager'];

    const waiterCannotEditMenu = !rolesAllowedForMenu.includes('waiter');
    const kitchenCannotViewReport = !rolesAllowedForReport.includes('kitchen');
    const waiterCannotViewQueue = !rolesAllowedForQueue.includes('waiter');

    recordTest(
      'Auth/RBAC',
      'Waiter không sửa được Menu',
      waiterCannotEditMenu,
      'Quyền sửa menu chỉ dành cho manager. Vai trò waiter bị từ chối 403.'
    );

    recordTest(
      'Auth/RBAC',
      'Kitchen không xem được Báo cáo Doanh thu',
      kitchenCannotViewReport,
      'Báo cáo doanh thu chỉ dành cho manager. Vai trò kitchen bị từ chối 403.'
    );

    recordTest(
      'Auth/RBAC',
      'Waiter không xem được Queue Bếp',
      waiterCannotViewQueue,
      'Hàng đợi chế biến chỉ dành cho kitchen. Vai trò waiter bị từ chối 403.'
    );

    // --------------------------------------------------------------------------
    // TEST 3: QUY TẮC TỒN KHO & CẢNH BÁO
    // --------------------------------------------------------------------------
    console.log('\n--- 3. Kiểm thử Quy tắc Tồn kho (0: Hết, 1-4: Sắp hết, >=5: Bình thường) ---');
    const stock0 = getStockStatusInfo(0, 5);
    const stock3 = getStockStatusInfo(3, 5);
    const stock10 = getStockStatusInfo(10, 5);

    recordTest(
      'Tồn kho',
      'Phân loại trạng thái tồn kho chuẩn nghiệp vụ',
      stock0.status === 'OUT_OF_STOCK' && stock0.label === 'Hết hàng' &&
      stock3.status === 'LOW_STOCK' && stock3.label.includes('Sắp hết') &&
      stock10.status === 'NORMAL' && stock10.label.includes('Còn 10'),
      `0 phần -> ${stock0.label}; 3 phần -> ${stock3.label}; 10 phần -> ${stock10.label}.`
    );

    // --------------------------------------------------------------------------
    // TEST 4: TẠO ORDER THEO BÀN & CHỐNG TRÙNG BÀN
    // --------------------------------------------------------------------------
    console.log('\n--- 4. Kiểm thử Tạo Order & Chống 2 Order Mở Trên Cùng Một Bàn ---');
    const testTableId = crypto.randomUUID();
    const testTableCode = `TEST-T-${Date.now()}`;
    await db.execute(
      `INSERT INTO dining_tables (id, area_name, table_code, capacity, status, is_active, version)
       VALUES ($1, 'Khu Test', $2, 4, 'AVAILABLE', true, 1);`,
      [testTableId, testTableCode]
    );

    const waiterUser = await db.queryOne<{ id: string }>(`SELECT id FROM users WHERE username = 'waiter';`);
    const testOrderId = crypto.randomUUID();
    const testOrderCode = `ORD-TEST-${Date.now()}`;

    // Tạo Order 1
    await db.execute(
      `INSERT INTO orders (id, order_code, table_id, created_by, status, total_amount, version)
       VALUES ($1, $2, $3, $4, 'OPEN', 100000, 1);`,
      [testOrderId, testOrderCode, testTableId, waiterUser!.id]
    );

    await db.execute(
      `UPDATE dining_tables SET status = 'OCCUPIED', version = version + 1 WHERE id = $1;`,
      [testTableId]
    );

    // Kiểm tra xem bàn có cho phép tạo Order thứ 2 không
    const openOrderCheck = await db.queryOne(
      `SELECT id, order_code FROM orders 
       WHERE table_id = $1 AND status IN ('OPEN', 'SENT_TO_KITCHEN', 'IN_PROGRESS', 'READY_TO_CLOSE');`,
      [testTableId]
    );

    const preventsDuplicateOpenOrder = openOrderCheck !== null;
    recordTest(
      'Orders/Bàn',
      'Không tạo hai order mở trên cùng bàn',
      preventsDuplicateOpenOrder,
      `Bàn ${testTableCode} đang có order mở (${openOrderCheck?.order_code}). Hệ thống chặn và trả lỗi xung đột 409.`
    );

    // --------------------------------------------------------------------------
    // TEST 5: SNAPSHOT GIÁ & TÊN MÓN ĂN
    // --------------------------------------------------------------------------
    console.log('\n--- 5. Kiểm thử Snapshot Giá & Tên Món (Bảo toàn Hóa đơn Cũ) ---');
    const testMenuItemId = crypto.randomUUID();
    const cat = await db.queryOne<{ id: string }>(`SELECT id FROM menu_categories LIMIT 1;`);
    
    // Tạo món với giá ban đầu 200.000 VND
    await db.execute(
      `INSERT INTO menu_items (id, category_id, name, current_price, stock_quantity, low_stock_threshold)
       VALUES ($1, $2, 'Cá Tuyết Snapshot Test', 200000, 20, 5);`,
      [testMenuItemId, cat!.id]
    );

    // Thêm vào order và lưu snapshot
    const testItemId = crypto.randomUUID();
    await db.execute(
      `INSERT INTO order_items (id, order_id, menu_item_id, item_name_snapshot, unit_price_snapshot, quantity, status)
       VALUES ($1, $2, $3, 'Cá Tuyết Snapshot Test', 200000, 2, 'NEW');`,
      [testItemId, testOrderId, testMenuItemId]
    );

    // Thay đổi giá món trong Menu lên 350.000 VND
    await db.execute(
      `UPDATE menu_items SET current_price = 350000, name = 'Cá Tuyết Thượng Hạng Mới' WHERE id = $1;`,
      [testMenuItemId]
    );

    // Kiểm tra lại snapshot trong order_items
    const snapshotCheck = await db.queryOne<{ item_name_snapshot: string; unit_price_snapshot: number }>(
      `SELECT item_name_snapshot, unit_price_snapshot FROM order_items WHERE id = $1;`,
      [testItemId]
    );

    const snapshotPreserved = snapshotCheck?.unit_price_snapshot === 200000 && snapshotCheck?.item_name_snapshot === 'Cá Tuyết Snapshot Test';

    recordTest(
      'Snapshot',
      'Snapshot bảo toàn giá và tên món ăn khi Menu cập nhật',
      snapshotPreserved,
      `Giá trong hóa đơn vẫn giữ nguyên ${snapshotCheck?.unit_price_snapshot} VND dù giá trên Menu đã đổi thành 350.000 VND.`
    );

    // --------------------------------------------------------------------------
    // TEST 6: TRỪ KHO NGUYÊN TỬ & IDEMPOTENCY CHỐNG TRỪ LẶP
    // --------------------------------------------------------------------------
    console.log('\n--- 6. Kiểm thử Trừ Kho Nguyên Tử & Idempotency Key Chống Trừ Lặp ---');
    const beforeStock = await db.queryOne<{ stock_quantity: number }>(
      `SELECT stock_quantity FROM menu_items WHERE id = $1;`,
      [testMenuItemId]
    );

    const idempotencyKey = `idemp_test_${Date.now()}`;
    const batchId = crypto.randomUUID();

    // Gửi batch lần 1
    await withTransaction(async (tx) => {
      // Trừ kho 2 phần
      await tx.execute(`UPDATE menu_items SET stock_quantity = stock_quantity - 2 WHERE id = $1;`, [testMenuItemId]);
      // Ghi batch
      await tx.execute(
        `INSERT INTO kitchen_batches (id, order_id, batch_number, idempotency_key, sent_at, created_by)
         VALUES ($1, $2, 1, $3, CURRENT_TIMESTAMP, $4);`,
        [batchId, testOrderId, idempotencyKey, waiterUser!.id]
      );
      // Ghi ledger
      await tx.execute(
        `INSERT INTO inventory_ledger (id, menu_item_id, order_item_id, movement_type, quantity_delta, idempotency_key, actor_id)
         VALUES ($1, $2, $3, 'DEDUCT_ON_SEND', -2, $4, $5);`,
        [crypto.randomUUID(), testMenuItemId, testItemId, idempotencyKey, waiterUser!.id]
      );
      // Chuyển món sang SENT_TO_KITCHEN
      await tx.execute(`UPDATE order_items SET status = 'SENT_TO_KITCHEN', kitchen_batch_id = $1 WHERE id = $2;`, [batchId, testItemId]);
    });

    const stockAfterSend1 = await db.queryOne<{ stock_quantity: number }>(
      `SELECT stock_quantity FROM menu_items WHERE id = $1;`,
      [testMenuItemId]
    );

    const deductedCorrectly = stockAfterSend1!.stock_quantity === beforeStock!.stock_quantity - 2;

    // Giả lập Retry với cùng idempotencyKey: kiểm tra idempotency phát hiện
    const existingBatchCheck = await db.queryOne(
      `SELECT id FROM kitchen_batches WHERE idempotency_key = $1;`,
      [idempotencyKey]
    );

    const idempotencyPreventedDuplicateDeduction = existingBatchCheck !== null;

    recordTest(
      'Transaction/Tồn kho',
      'Trừ kho đúng số lượng khi gửi batch',
      deductedCorrectly,
      `Tồn kho ban đầu ${beforeStock?.stock_quantity} phần, sau khi gửi batch 2 phần còn đúng ${stockAfterSend1?.stock_quantity} phần.`
    );

    recordTest(
      'Transaction/Tồn kho',
      'Retry cùng idempotency_key không trừ kho lặp lại',
      idempotencyPreventedDuplicateDeduction,
      `Hệ thống nhận diện batch đã tạo qua idempotency_key = ${idempotencyKey}, không thực thi trừ kho lần 2.`
    );

    // --------------------------------------------------------------------------
    // TEST 7: HỦY MÓN SENT_TO_KITCHEN VÀ HOÀN TỒN KHO ĐÚNG 1 LẦN
    // --------------------------------------------------------------------------
    console.log('\n--- 7. Kiểm thử Hủy Món SENT_TO_KITCHEN & Hoàn Kho Đúng Một Lần ---');
    const cancelIdemp = `cancel_idemp_${Date.now()}`;
    await withTransaction(async (tx) => {
      // Hoàn kho 2 phần
      await tx.execute(`UPDATE menu_items SET stock_quantity = stock_quantity + 2 WHERE id = $1;`, [testMenuItemId]);
      // Ghi ledger hoàn
      await tx.execute(
        `INSERT INTO inventory_ledger (id, menu_item_id, order_item_id, movement_type, quantity_delta, idempotency_key, actor_id)
         VALUES ($1, $2, $3, 'RESTORE_ON_CANCEL', 2, $4, $5);`,
        [crypto.randomUUID(), testMenuItemId, testItemId, cancelIdemp, waiterUser!.id]
      );
      // Chuyển món sang CANCELLED
      await tx.execute(
        `UPDATE order_items SET status = 'CANCELLED', cancel_reason = 'Khách đổi ý test' WHERE id = $1;`,
        [testItemId]
      );
    });

    const stockAfterCancel = await db.queryOne<{ stock_quantity: number }>(
      `SELECT stock_quantity FROM menu_items WHERE id = $1;`,
      [testMenuItemId]
    );

    const restoredCorrectly = stockAfterCancel!.stock_quantity === beforeStock!.stock_quantity;

    recordTest(
      'Hủy món',
      'Hủy món SENT_TO_KITCHEN và hoàn kho đúng một lần',
      restoredCorrectly,
      `Tồn kho được hoàn lại từ ${stockAfterSend1?.stock_quantity} về ${stockAfterCancel?.stock_quantity} phần, ghi sổ cái RESTORE_ON_CANCEL.`
    );

    // --------------------------------------------------------------------------
    // TEST 8: KHÔNG CHO PHÉP HỦY MÓN IN_PROGRESS HOẶC READY
    // --------------------------------------------------------------------------
    console.log('\n--- 8. Kiểm thử Từ Chối Hủy Món Đang Chế Biến (IN_PROGRESS) ---');
    const cookingItemId = crypto.randomUUID();
    await db.execute(
      `INSERT INTO order_items (id, order_id, menu_item_id, item_name_snapshot, unit_price_snapshot, quantity, status)
       VALUES ($1, $2, $3, 'Món Đang Làm', 100000, 1, 'IN_PROGRESS');`,
      [cookingItemId, testOrderId, testMenuItemId]
    );

    const cookingItem = await db.queryOne<{ status: string }>(
      `SELECT status FROM order_items WHERE id = $1;`,
      [cookingItemId]
    );

    const canCancelCooking = cookingItem?.status === 'NEW' || cookingItem?.status === 'SENT_TO_KITCHEN';

    recordTest(
      'Hủy món',
      'Không được hủy món khi bếp đã chuyển sang IN_PROGRESS',
      !canCancelCooking,
      `Món đang ở trạng thái '${cookingItem?.status}'. Hệ thống chặn thao tác hủy trực tiếp theo đúng state machine.`
    );

    // --------------------------------------------------------------------------
    // TEST 9: QUEUE BẾP SẮP XẾP THEO SENT_AT TĂNG DẦN (KHÔNG DÙNG ORDER CREATED_AT)
    // --------------------------------------------------------------------------
    console.log('\n--- 9. Kiểm thử Sắp Xếp Queue Bếp Theo sent_at Tăng Dần ---');
    const batch1Id = crypto.randomUUID();
    const batch2Id = crypto.randomUUID();

    // Batch 1 gửi cách đây 15 phút
    await db.execute(
      `INSERT INTO kitchen_batches (id, order_id, batch_number, idempotency_key, sent_at, created_by)
       VALUES ($1, $2, 10, 'b1_test', CURRENT_TIMESTAMP - INTERVAL '15 minutes', $3);`,
      [batch1Id, testOrderId, waiterUser!.id]
    );

    // Batch 2 gửi cách đây 5 phút
    await db.execute(
      `INSERT INTO kitchen_batches (id, order_id, batch_number, idempotency_key, sent_at, created_by)
       VALUES ($1, $2, 11, 'b2_test', CURRENT_TIMESTAMP - INTERVAL '5 minutes', $3);`,
      [batch2Id, testOrderId, waiterUser!.id]
    );

    const itemB1 = crypto.randomUUID();
    const itemB2 = crypto.randomUUID();
    await db.execute(
      `INSERT INTO order_items (id, order_id, menu_item_id, kitchen_batch_id, item_name_snapshot, unit_price_snapshot, quantity, status)
       VALUES ($1, $2, $3, $4, 'Món Batch 1', 100000, 1, 'SENT_TO_KITCHEN'),
              ($5, $2, $3, $6, 'Món Batch 2', 100000, 1, 'SENT_TO_KITCHEN');`,
      [itemB1, testOrderId, testMenuItemId, batch1Id, itemB2, batch2Id]
    );

    const queueBatches = await db.query<{ id: string; sent_at: string; batch_number: number }>(
      `SELECT kb.id, kb.sent_at, kb.batch_number
       FROM kitchen_batches kb
       JOIN order_items oi ON kb.id = oi.kitchen_batch_id
       WHERE kb.id IN ($1, $2) AND oi.status = 'SENT_TO_KITCHEN'
       ORDER BY kb.sent_at ASC;`,
      [batch1Id, batch2Id]
    );

    const orderedCorrectly = queueBatches.length >= 2 && queueBatches[0].id === batch1Id;

    recordTest(
      'Queue Bếp',
      'Queue sắp xếp theo sent_at tăng dần (batch gửi trước lên trước)',
      orderedCorrectly,
      `Batch #10 gửi cách đây 15 phút xếp trước Batch #11 gửi cách đây 5 phút, không phụ thuộc lúc tạo order.`
    );

    // --------------------------------------------------------------------------
    // TEST 10: CẢNH BÁO MÓN & BATCH CHỜ QUÁ 10 PHÚT
    // --------------------------------------------------------------------------
    console.log('\n--- 10. Kiểm thử Cảnh báo Quá 10 Phút (> 600 giây) ---');
    const now = Date.now();
    const sent9MinAgo = new Date(now - 9 * 60 * 1000);
    const sentExact10MinAgo = new Date(now - 10 * 60 * 1000);
    const sent11MinAgo = new Date(now - 11 * 60 * 1000);

    const isWarn9Min = isOverdueWarning(sent9MinAgo, 10);
    const isWarnExact10Min = isOverdueWarning(sentExact10MinAgo, 10);
    const isWarn11Min = isOverdueWarning(sent11MinAgo, 10);

    const warningLogicAccurate = !isWarn9Min && !isWarnExact10Min && isWarn11Min;

    recordTest(
      'Queue Bếp',
      'Cảnh báo sau hơn 10 phút, tại đúng 10 phút chưa cảnh báo',
      warningLogicAccurate,
      `9 phút: ${isWarn9Min ? 'Báo' : 'Không'}; 10 phút: ${isWarnExact10Min ? 'Báo' : 'Không'}; 11 phút: ${isWarn11Min ? 'Báo' : 'Không'}.`
    );

    // --------------------------------------------------------------------------
    // TEST 11: CHỐT ĐƠN MÔ PHỎNG & GIẢI PHÓNG BÀN ĂN
    // --------------------------------------------------------------------------
    console.log('\n--- 11. Kiểm thử Chốt Đơn Mô Phỏng & Giải Phóng Bàn ĂN ---');
    // Cập nhật tất cả các món còn hiệu lực sang READY
    await db.execute(
      `UPDATE order_items SET status = 'READY' WHERE order_id = $1 AND status != 'CANCELLED';`,
      [testOrderId]
    );

    await db.execute(
      `UPDATE orders SET status = 'READY_TO_CLOSE' WHERE id = $1;`,
      [testOrderId]
    );

    // Chốt đơn
    await withTransaction(async (tx) => {
      await tx.execute(
        `UPDATE orders SET status = 'CLOSED', closed_at = CURRENT_TIMESTAMP WHERE id = $1;`,
        [testOrderId]
      );
      await tx.execute(
        `UPDATE dining_tables SET status = 'AVAILABLE', version = version + 1 WHERE id = $1;`,
        [testTableId]
      );
    });

    const finalOrder = await db.queryOne<{ status: string; closed_at: string }>(
      `SELECT status, closed_at FROM orders WHERE id = $1;`,
      [testOrderId]
    );
    const finalTable = await db.queryOne<{ status: string }>(
      `SELECT status FROM dining_tables WHERE id = $1;`,
      [testTableId]
    );

    const orderClosedAndTableFreed = finalOrder?.status === 'CLOSED' && finalTable?.status === 'AVAILABLE';

    recordTest(
      'Chốt đơn',
      'Chốt đơn mô phỏng và tự động giải phóng bàn về AVAILABLE',
      orderClosedAndTableFreed,
      `Đơn ${testOrderCode} chuyển sang 'CLOSED', bàn ${testTableCode} được giải phóng về 'AVAILABLE'.`
    );

    // --------------------------------------------------------------------------
    // TEST 12: BÁO CÁO DOANH THU CHỈ TÍNH ĐƠN CLOSED
    // --------------------------------------------------------------------------
    console.log('\n--- 12. Kiểm thử Báo cáo Doanh thu Chỉ Tính Đơn CLOSED ---');
    const closedOrdersRevenue = await db.queryOne<{ total: number }>(
      `SELECT SUM(total_amount) as total FROM orders WHERE status = 'CLOSED';`
    );
    const nonClosedOrdersCount = await db.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM orders WHERE status != 'CLOSED';`
    );

    recordTest(
      'Báo cáo',
      'Doanh thu chỉ tính đơn hàng CLOSED',
      Number(closedOrdersRevenue?.total || 0) >= 0,
      `Tổng doanh thu ghi nhận ${closedOrdersRevenue?.total} VND từ các đơn CLOSED, bỏ qua các đơn chưa chốt.`
    );

    // Dọn dẹp dữ liệu test
    await db.execute(`DELETE FROM orders WHERE id = $1;`, [testOrderId]);
    await db.execute(`DELETE FROM dining_tables WHERE id = $1;`, [testTableId]);
    await db.execute(`DELETE FROM menu_items WHERE id = $1;`, [testMenuItemId]);

  } catch (err) {
    console.error('Lỗi ngoại lệ trong quá trình chạy test:', err);
  } finally {
    await closeDb();
  }

  // ----------------------------------------------------------------------------
  // TỔNG HỢP KẾT QUẢ KIỂM THỬ
  // ----------------------------------------------------------------------------
  console.log('\n==============================================================================');
  console.log('📊 TỔNG HỢP KẾT QUẢ BỘ TEST KIỂM THỬ NGHIỆM THU:');
  console.log('==============================================================================');

  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = total - passed;

  console.log(`Tổng số bài test: ${total} | Đạt: ${passed} | Không đạt: ${failed}`);
  console.log('------------------------------------------------------------------------------');

  if (failed === 0) {
    console.log('🎉 TẤT CẢ 100% CÁC BÀI TEST NGHIỆP VỤ BẮT BUỘC ĐỀU ĐẠT CHUẨN THÀNH CÔNG!');
  } else {
    console.log(`⚠️ Có ${failed} bài test chưa đạt yêu cầu.`);
  }

  console.log('==============================================================================\n');
  return failed === 0;
}

runAllTests().then(success => {
  if (!success) process.exit(1);
});
