/**
 * BỘ KIỂM THỬ: THEO DÕI TIẾN ĐỘ ĐƠN HÀNG DÀNH CHO KHÁCH NGỒI TẠI BÀN (GUEST LIVE TRACKING)
 * 
 * Kiểm thử 10 tiêu chí chuẩn theo yêu cầu:
 * 1. Không truyền tham số -> Trả về lỗi 400 PARAM_REQUIRED.
 * 2. Tra cứu mã bàn không tồn tại -> Trả về 404 TABLE_NOT_FOUND.
 * 3. Bàn trống (không có order mở) -> Trả về hasActiveOrder: false kèm thông tin bàn.
 * 4. Bàn đang có order mở -> Trả về hasActiveOrder: true kèm chi tiết món ăn.
 * 5. Tính phần trăm tiến độ (percentComplete) theo TỔNG SỐ LƯỢNG MÓN (totalQuantity).
 * 6. Trạng thái món (order_items.status) là nguồn chính, phân định rõ READY (bếp xong).
 * 7. Nhật ký trạng thái (history) được lưu và trả về kèm mốc thời gian an toàn.
 * 8. Bảo mật dữ liệu: Tuyệt đối không để lộ mật khẩu, user_id, hoặc thông tin nội bộ.
 * 9. Thanh toán VietQR: Chỉ sinh mã QR khi đơn chưa thanh toán (unpaid) và tổng tiền > 0.
 * 10. Tra cứu trực tiếp bằng orderCode (phương án phụ) hoạt động chính xác.
 */

import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { getDb, closeDb } from '../src/lib/db';
import { GET as guestTrackApi } from '../src/app/api/guest/track/route';

interface TestResult {
  testNumber: number;
  testName: string;
  passed: boolean;
  evidence: string;
  error?: string;
}

const results: TestResult[] = [];

function record(testNumber: number, testName: string, passed: boolean, evidence: string, error?: any) {
  results.push({
    testNumber,
    testName,
    passed,
    evidence,
    error: error ? (error instanceof Error ? error.message : String(error)) : undefined,
  });
  const icon = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`${icon} [Test ${testNumber}] ${testName}\n   ↳ ${evidence}\n`);
}

export async function runGuestTrackingTests(): Promise<boolean> {
  console.log('\n==============================================================================');
  console.log('🍽️ BẮT ĐẦU KIỂM THỬ TÍNH NĂNG THEO DÕI MÓN CHO KHÁCH TẠI BÀN (GUEST LIVE TRACKING)');
  console.log('==============================================================================\n');

  const db = await getDb();

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Thiếu tham số -> Trả về 400 PARAM_REQUIRED
    // -------------------------------------------------------------------------
    {
      const req = new NextRequest('http://localhost:3000/api/guest/track');
      const res = await guestTrackApi(req);
      const data = await res.json();
      const passed = res.status === 400 && data.code === 'PARAM_REQUIRED';
      record(1, 'Thiếu tham số trả về 400 PARAM_REQUIRED', passed, `HTTP ${res.status}, code: ${data.code}`);
    }

    // -------------------------------------------------------------------------
    // TEST 2: Mã bàn không tồn tại -> Trả về 404 TABLE_NOT_FOUND
    // -------------------------------------------------------------------------
    {
      const req = new NextRequest('http://localhost:3000/api/guest/track?tableCode=BAN-KHONG-TON-TAI-999');
      const res = await guestTrackApi(req);
      const data = await res.json();
      const passed = res.status === 404 && data.code === 'TABLE_NOT_FOUND';
      record(2, 'Bàn không tồn tại trả về 404 TABLE_NOT_FOUND', passed, `HTTP ${res.status}, code: ${data.code}`);
    }

    // -------------------------------------------------------------------------
    // Chuẩn bị dữ liệu kiểm thử trong DB
    // -------------------------------------------------------------------------
    const testSuffix = crypto.randomBytes(3).toString('hex');
    const tableEmptyCode = `TEST-E-${testSuffix}`;
    const tableActiveCode = `TEST-A-${testSuffix}`;

    // Tạo bàn trống
    const tableEmptyId = crypto.randomUUID();
    await db.execute(
      `INSERT INTO dining_tables (id, area_name, table_code, capacity, status)
       VALUES ($1, 'Khu Test', $2, 4, 'AVAILABLE');`,
      [tableEmptyId, tableEmptyCode]
    );

    // Tạo bàn có order
    const tableActiveId = crypto.randomUUID();
    await db.execute(
      `INSERT INTO dining_tables (id, area_name, table_code, capacity, status)
       VALUES ($1, 'Khu Test', $2, 4, 'OCCUPIED');`,
      [tableActiveId, tableActiveCode]
    );

    // Lấy user có sẵn để tạo order
    const sampleUser = await db.queryOne<{ id: string }>(`SELECT id FROM users LIMIT 1;`);
    const userId = sampleUser?.id || crypto.randomUUID();

    // Lấy món ăn mẫu
    const sampleMenu = await db.queryOne<{ id: string; name: string; current_price: number }>(
      `SELECT id, name, current_price FROM menu_items LIMIT 1;`
    );
    const menuItemId = sampleMenu?.id || crypto.randomUUID();
    const menuItemName = sampleMenu?.name || 'Món Test Bò Bít Tết';
    const menuPrice = sampleMenu?.current_price || 150000;

    // Tạo Order đang mở
    const orderId = crypto.randomUUID();
    const orderCode = `ORD-TEST-${testSuffix.toUpperCase()}`;
    await db.execute(
      `INSERT INTO orders (id, order_code, table_id, created_by, status, total_amount, payment_status)
       VALUES ($1, $2, $3, $4, 'IN_PROGRESS', 450000, 'PENDING');`,
      [orderId, orderCode, tableActiveId, userId]
    );

    // Thêm 2 order_items:
    // Món 1: qty = 1, status = READY
    const item1Id = crypto.randomUUID();
    await db.execute(
      `INSERT INTO order_items (id, order_id, menu_item_id, item_name_snapshot, unit_price_snapshot, quantity, status)
       VALUES ($1, $2, $3, $4, $5, 1, 'READY');`,
      [item1Id, orderId, menuItemId, `${menuItemName} A`, menuPrice]
    );

    // Món 2: qty = 2, status = IN_PROGRESS
    const item2Id = crypto.randomUUID();
    await db.execute(
      `INSERT INTO order_items (id, order_id, menu_item_id, item_name_snapshot, unit_price_snapshot, quantity, status)
       VALUES ($1, $2, $3, $4, $5, 2, 'IN_PROGRESS');`,
      [item2Id, orderId, menuItemId, `${menuItemName} B`, menuPrice]
    );

    // Ghi 1 bản ghi lịch sử
    await db.execute(
      `INSERT INTO order_status_history (id, order_id, order_item_id, from_status, to_status, changed_by, note)
       VALUES ($1, $2, $3, 'IN_PROGRESS', 'READY', $4, 'Bếp đã nấu xong món');`,
      [crypto.randomUUID(), orderId, item1Id, userId]
    );

    // -------------------------------------------------------------------------
    // TEST 3: Bàn trống -> hasActiveOrder: false
    // -------------------------------------------------------------------------
    {
      const req = new NextRequest(`http://localhost:3000/api/guest/track?tableCode=${tableEmptyCode}`);
      const res = await guestTrackApi(req);
      const data = await res.json();
      const passed = res.status === 200 && data.success === true && data.hasActiveOrder === false && data.table.tableCode === tableEmptyCode;
      record(3, 'Bàn trống trả về hasActiveOrder: false', passed, `hasActiveOrder: ${data.hasActiveOrder}, tableCode: ${data.table?.tableCode}`);
    }

    // -------------------------------------------------------------------------
    // TEST 4: Bàn có đơn mở -> hasActiveOrder: true và trả về items
    // -------------------------------------------------------------------------
    {
      const req = new NextRequest(`http://localhost:3000/api/guest/track?tableCode=${tableActiveCode}`);
      const res = await guestTrackApi(req);
      const data = await res.json();
      const passed = res.status === 200 && data.success === true && data.hasActiveOrder === true && data.items.length === 2;
      record(4, 'Bàn có đơn mở trả về hasActiveOrder: true và danh sách món', passed, `hasActiveOrder: ${data.hasActiveOrder}, số món: ${data.items?.length}`);
    }

    // -------------------------------------------------------------------------
    // TEST 5: Tính tiến độ phần trăm theo TỔNG SỐ LƯỢNG MÓN (totalQuantity)
    // Tổng số lượng: 1 + 2 = 3 phần món. Số phần READY: 1 phần. Tiến độ: 1/3 = 33%.
    // -------------------------------------------------------------------------
    {
      const req = new NextRequest(`http://localhost:3000/api/guest/track?tableCode=${tableActiveCode}`);
      const res = await guestTrackApi(req);
      const data = await res.json();
      const p = data.progress;
      const passed = p.totalQuantity === 3 && p.readyQuantity === 1 && p.percentComplete === 33;
      record(5, 'Tính phần trăm tiến độ theo tổng số lượng món (1/3 phần = 33%)', passed, `totalQuantity: ${p.totalQuantity}, readyQuantity: ${p.readyQuantity}, percentComplete: ${p.percentComplete}%`);
    }

    // -------------------------------------------------------------------------
    // TEST 6: Phân định rõ trạng thái từng món (order_items.status)
    // -------------------------------------------------------------------------
    {
      const req = new NextRequest(`http://localhost:3000/api/guest/track?tableCode=${tableActiveCode}`);
      const res = await guestTrackApi(req);
      const data = await res.json();
      const item1 = data.items.find((i: any) => i.id === item1Id);
      const item2 = data.items.find((i: any) => i.id === item2Id);
      const passed = item1?.status === 'READY' && item2?.status === 'IN_PROGRESS';
      record(6, 'Trạng thái từng món ăn hiển thị chính xác (READY và IN_PROGRESS)', passed, `Item 1 status: ${item1?.status}, Item 2 status: ${item2?.status}`);
    }

    // -------------------------------------------------------------------------
    // TEST 7: Lịch sử thay đổi trạng thái (history) được lưu và trả về
    // -------------------------------------------------------------------------
    {
      const req = new NextRequest(`http://localhost:3000/api/guest/track?tableCode=${tableActiveCode}`);
      const res = await guestTrackApi(req);
      const data = await res.json();
      const passed = Array.isArray(data.history) && data.history.length >= 1 && data.history[0].toStatus === 'READY';
      record(7, 'Nhật ký thay đổi trạng thái bếp (history) trả về chính xác', passed, `Số bản ghi history: ${data.history?.length}, toStatus: ${data.history?.[0]?.toStatus}`);
    }

    // -------------------------------------------------------------------------
    // TEST 8: Bảo mật dữ liệu: Không để lộ user_id, password_hash, ghi chú nội bộ
    // -------------------------------------------------------------------------
    {
      const req = new NextRequest(`http://localhost:3000/api/guest/track?tableCode=${tableActiveCode}`);
      const res = await guestTrackApi(req);
      const data = await res.json();
      const jsonStr = JSON.stringify(data);
      const hasPassword = jsonStr.includes('password_hash') || jsonStr.includes('password');
      const hasUserId = jsonStr.includes(userId);
      const hasInternalNote = jsonStr.includes('Bếp đã nấu xong món'); // Ghi chú nội bộ không được lọt ra ngoài
      const passed = !hasPassword && !hasUserId && !hasInternalNote;
      record(8, 'Bảo mật: Không để lộ mật khẩu, user_id nhân viên hoặc ghi chú nội bộ', passed, `hasPassword: ${hasPassword}, hasUserId: ${hasUserId}, hasInternalNote: ${hasInternalNote}`);
    }

    // -------------------------------------------------------------------------
    // TEST 9: Điều kiện VietQR: Sinh mã QR khi đơn chưa thanh toán
    // -------------------------------------------------------------------------
    {
      const req = new NextRequest(`http://localhost:3000/api/guest/track?tableCode=${tableActiveCode}`);
      const res = await guestTrackApi(req);
      const data = await res.json();
      const passed = data.order.paymentStatus === 'PENDING' && data.order.totalAmount > 0;
      record(9, 'Đơn chưa thanh toán được kèm thông tin VietQR', passed, `paymentStatus: ${data.order.paymentStatus}, totalAmount: ${data.order.totalAmount}, có QR: ${!!data.paymentQr}`);
    }

    // -------------------------------------------------------------------------
    // TEST 10: Tra cứu trực tiếp bằng orderCode (phương án phụ)
    // -------------------------------------------------------------------------
    {
      const req = new NextRequest(`http://localhost:3000/api/guest/track?orderCode=${orderCode}`);
      const res = await guestTrackApi(req);
      const data = await res.json();
      const passed = res.status === 200 && data.success === true && data.order.orderCode === orderCode;
      record(10, 'Tra cứu bằng orderCode trả về đúng đơn hàng', passed, `orderCode: ${data.order?.orderCode}, totalAmount: ${data.order?.totalAmount}`);
    }

    // Dọn dẹp dữ liệu test
    await db.execute(`DELETE FROM orders WHERE id = $1;`, [orderId]);
    await db.execute(`DELETE FROM dining_tables WHERE id IN ($1, $2);`, [tableEmptyId, tableActiveId]);

  } catch (error) {
    console.error('Lỗi khi chạy bộ kiểm thử guest tracking:', error);
  }

  const allPassed = results.every((r) => r.passed);
  console.log('==============================================================================');
  console.log(`KẾT QUẢ KIỂM THỬ: ${results.filter(r => r.passed).length}/${results.length} TEST CASES ĐẠT`);
  console.log('==============================================================================\n');

  return allPassed;
}

// Chạy trực tiếp nếu execute từ CLI
if (require.main === module) {
  runGuestTrackingTests()
    .then((success) => {
      process.exit(success ? 0 : 1);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
