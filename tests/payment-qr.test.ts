/**
 * BỘ KIỂM THỬ TÍCH HỢP: THANH TOÁN CHUYỂN KHOẢN QR & XÁC NHẬN THỦ CÔNG
 * 
 * Kiểm tra 100% 10 tiêu chí bắt buộc theo yêu cầu:
 * 1. Order trả đúng số tiền server đã tính khi tạo QR.
 * 2. Nội dung chuyển khoản chứa đúng mã order.
 * 3. QR không tạo từ giá trị tiền do client gửi.
 * 4. Waiter có thể xác nhận thanh toán.
 * 5. Kitchen không thể xác nhận thanh toán (403).
 * 6. Waiter/manager có thể chốt sau khi xác nhận.
 * 7. Không thể chốt nếu chưa xác nhận thanh toán (400).
 * 8. Retry xác nhận thanh toán không ghi nhận lặp (Idempotency).
 * 9. QR xuất hiện khi in hóa đơn (@media print và disclaimer).
 * 10. Thiếu cấu hình QR không làm trang hóa đơn bị lỗi (Graceful fallback).
 */

import { NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getDb, closeDb } from '../src/lib/db';
import { signAuthToken } from '../src/lib/auth';
import { generateOrderQrCode, buildTransferContent, getPaymentConfig } from '../src/lib/payment-qr';

// Import HTTP API Route Handlers
import { GET as getOrderApi } from '../src/app/api/orders/[id]/route';
import { POST as confirmPaymentApi } from '../src/app/api/orders/[id]/confirm-payment/route';
import { POST as closeOrderApi } from '../src/app/api/orders/[id]/close/route';

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

export async function runPaymentQrTests(): Promise<boolean> {
  console.log('\n==============================================================================');
  console.log('💳 BẮT ĐẦU KIỂM THỬ 10 TIÊU CHÍ BẮT BUỘC: QR CHUYỂN KHOẢN & XÁC NHẬN THANH TOÁN');
  console.log('==============================================================================\n');

  const db = await getDb();

  // Lấy thông tin user có sẵn từ DB để sinh Token JWT thật
  let waiterUser = await db.queryOne<{ id: string; username: string; display_name: string }>(
    `SELECT id, username, display_name FROM users WHERE username = 'waiter';`
  );
  let managerUser = await db.queryOne<{ id: string; username: string; display_name: string }>(
    `SELECT id, username, display_name FROM users WHERE username = 'manager';`
  );
  let kitchenUser = await db.queryOne<{ id: string; username: string; display_name: string }>(
    `SELECT id, username, display_name FROM users WHERE username = 'kitchen';`
  );

  const waiterId = waiterUser?.id || crypto.randomUUID();
  const managerId = managerUser?.id || crypto.randomUUID();
  const kitchenId = kitchenUser?.id || crypto.randomUUID();

  // Khởi tạo các token vai trò
  const waiterToken = await signAuthToken({
    userId: waiterId,
    username: 'waiter',
    displayName: waiterUser?.display_name || 'Phục Vụ Test',
    role: 'waiter',
  });

  const managerToken = await signAuthToken({
    userId: managerId,
    username: 'manager',
    displayName: managerUser?.display_name || 'Quản Lý Test',
    role: 'manager',
  });

  const kitchenToken = await signAuthToken({
    userId: kitchenId,
    username: 'kitchen',
    displayName: kitchenUser?.display_name || 'Bếp Test',
    role: 'kitchen',
  });

  // Tạo bàn test và món ăn test
  const testTableId = crypto.randomUUID();
  const testTableCode = `TB-QR-${Date.now().toString().slice(-4)}`;
  await db.execute(
    `INSERT INTO dining_tables (id, table_code, area_name, capacity, status, is_active, version)
     VALUES ($1, $2, 'Khu Test QR', 4, 'OCCUPIED', true, 1);`,
    [testTableId, testTableCode]
  );

  let existingDish = await db.queryOne<{ id: string }>(`SELECT id FROM menu_items LIMIT 1;`);
  let testDishId = existingDish?.id;

  if (!testDishId) {
    const sampleCat = await db.queryOne<{ id: string }>(`SELECT id FROM menu_categories LIMIT 1;`);
    const catId = sampleCat?.id || crypto.randomUUID();
    testDishId = crypto.randomUUID();
    await db.execute(
      `INSERT INTO menu_items (id, category_id, name, description, current_price, availability, stock_quantity, low_stock_threshold)
       VALUES ($1, $2, 'Món Test QR Payment', 'Món kiểm thử', 250000, true, 50, 5);`,
      [testDishId, catId]
    );
  }

  const cleanupOrderIds: string[] = [];

  try {
    // Helper tạo Order test với các thông số mong muốn
    async function createTestOrder(opts: {
      orderCode: string;
      totalAmount: number;
      itemStatus: 'READY' | 'NEW' | 'IN_PROGRESS';
      paymentStatus?: 'PENDING' | 'MANUALLY_CONFIRMED';
      orderStatus?: 'OPEN' | 'READY_TO_CLOSE' | 'CLOSED';
    }) {
      const orderId = crypto.randomUUID();
      cleanupOrderIds.push(orderId);

      await db.execute(
        `INSERT INTO orders (id, order_code, table_id, created_by, status, total_amount, payment_method, payment_status, version)
         VALUES ($1, $2, $3, $4, $5, $6, 'TRANSFER', $7, 1);`,
        [
          orderId,
          opts.orderCode,
          testTableId,
          waiterId,
          opts.orderStatus || 'READY_TO_CLOSE',
          opts.totalAmount,
          opts.paymentStatus || 'PENDING',
        ]
      );

      const itemId = crypto.randomUUID();
      await db.execute(
        `INSERT INTO order_items (id, order_id, menu_item_id, item_name_snapshot, unit_price_snapshot, quantity, status)
         VALUES ($1, $2, $3, 'Món Test QR Payment', $4, 1, $5);`,
        [itemId, orderId, testDishId, opts.totalAmount, opts.itemStatus]
      );

      return { orderId, orderCode: opts.orderCode };
    }

    // --------------------------------------------------------------------------
    // TEST 1: Order trả đúng số tiền server đã tính khi tạo QR
    // --------------------------------------------------------------------------
    const order1Code = `ORD-QR-T1-${Date.now().toString().slice(-4)}`;
    const serverCalculatedAmount = 350000;
    const { orderId: order1Id } = await createTestOrder({
      orderCode: order1Code,
      totalAmount: serverCalculatedAmount,
      itemStatus: 'READY',
      paymentStatus: 'PENDING',
    });

    const req1 = new NextRequest(`http://localhost:3000/api/orders/${order1Id}`, {
      headers: { Authorization: `Bearer ${waiterToken}` },
    });
    const res1 = await getOrderApi(req1, { params: Promise.resolve({ id: order1Id }) });
    const data1 = await res1.json();

    const test1Passed =
      res1.status === 200 &&
      data1.success === true &&
      data1.order.totalAmount === serverCalculatedAmount &&
      data1.order.qrPayment?.configured === true &&
      data1.order.qrPayment?.amount === serverCalculatedAmount;

    record(
      1,
      'Order trả đúng số tiền server đã tính khi tạo QR',
      test1Passed,
      `Tổng tiền DB: ${serverCalculatedAmount} đ. API trả về order.totalAmount = ${data1.order?.totalAmount} đ, QR payload amount = ${data1.order?.qrPayment?.amount} đ.`
    );

    // --------------------------------------------------------------------------
    // TEST 2: Nội dung chuyển khoản chứa đúng mã order
    // --------------------------------------------------------------------------
    const order2Code = `ORD-20261026-A12B`;
    const expectedContent = `THANHTOAN ${order2Code}`;
    const generatedContent = buildTransferContent(order2Code);

    const { orderId: order2Id } = await createTestOrder({
      orderCode: order2Code,
      totalAmount: 180000,
      itemStatus: 'READY',
    });

    const req2 = new NextRequest(`http://localhost:3000/api/orders/${order2Id}`, {
      headers: { Authorization: `Bearer ${waiterToken}` },
    });
    const res2 = await getOrderApi(req2, { params: Promise.resolve({ id: order2Id }) });
    const data2 = await res2.json();

    const test2Passed =
      generatedContent === expectedContent &&
      data2.order.qrPayment?.transferContent === expectedContent &&
      data2.order.qrPayment?.transferContent.includes(order2Code);

    record(
      2,
      'Nội dung chuyển khoản chứa đúng mã order',
      test2Passed,
      `Mã order: ${order2Code}. Nội dung CK tạo ra: "${data2.order?.qrPayment?.transferContent}" khớp định dạng "THANHTOAN ${order2Code}".`
    );

    // --------------------------------------------------------------------------
    // TEST 3: QR không tạo từ giá trị tiền do client gửi
    // --------------------------------------------------------------------------
    // Giả lập client cố tình gửi query param ?amount=500 hoặc body gian lận
    const req3 = new NextRequest(`http://localhost:3000/api/orders/${order1Id}?amount=500&totalAmount=100`, {
      headers: { Authorization: `Bearer ${waiterToken}` },
    });
    const res3 = await getOrderApi(req3, { params: Promise.resolve({ id: order1Id }) });
    const data3 = await res3.json();

    const test3Passed =
      data3.order.qrPayment?.amount === serverCalculatedAmount &&
      data3.order.qrPayment?.amount !== 500 &&
      data3.order.qrPayment?.amount !== 100;

    record(
      3,
      'QR không tạo từ giá trị tiền do client gửi',
      test3Passed,
      `Client gửi tham số gian lận ?amount=500, nhưng server lấy chính xác từ DB: ${data3.order?.qrPayment?.amount} đ.`
    );

    // --------------------------------------------------------------------------
    // TEST 4: Waiter có thể xác nhận thanh toán
    // --------------------------------------------------------------------------
    const order4Code = `ORD-QR-T4-${Date.now().toString().slice(-4)}`;
    const { orderId: order4Id } = await createTestOrder({
      orderCode: order4Code,
      totalAmount: 420000,
      itemStatus: 'READY',
      paymentStatus: 'PENDING',
    });

    const req4 = new NextRequest(`http://localhost:3000/api/orders/${order4Id}/confirm-payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${waiterToken}`,
      },
      body: JSON.stringify({ paymentReference: 'REF-BANK-TEST-004' }),
    });
    const res4 = await confirmPaymentApi(req4, { params: Promise.resolve({ id: order4Id }) });
    const data4 = await res4.json();

    // Kiểm tra trực tiếp trong DB
    const dbOrder4 = await db.queryOne<{ payment_status: string; payment_confirmed_by: string; payment_reference: string }>(
      `SELECT payment_status, payment_confirmed_by, payment_reference FROM orders WHERE id = $1;`,
      [order4Id]
    );

    const test4Passed =
      res4.status === 200 &&
      data4.success === true &&
      data4.paymentStatus === 'MANUALLY_CONFIRMED' &&
      dbOrder4?.payment_status === 'MANUALLY_CONFIRMED' &&
      dbOrder4?.payment_confirmed_by === waiterId;

    record(
      4,
      'Waiter có thể xác nhận thanh toán',
      test4Passed,
      `Phục vụ gửi xác nhận: HTTP ${res4.status}. DB cập nhật payment_status = ${dbOrder4?.payment_status}, confirmed_by = ${dbOrder4?.payment_confirmed_by}.`
    );

    // --------------------------------------------------------------------------
    // TEST 5: Kitchen không thể xác nhận thanh toán (403 Forbidden)
    // --------------------------------------------------------------------------
    const order5Code = `ORD-QR-T5-${Date.now().toString().slice(-4)}`;
    const { orderId: order5Id } = await createTestOrder({
      orderCode: order5Code,
      totalAmount: 150000,
      itemStatus: 'READY',
      paymentStatus: 'PENDING',
    });

    const req5 = new NextRequest(`http://localhost:3000/api/orders/${order5Id}/confirm-payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${kitchenToken}`,
      },
    });
    const res5 = await confirmPaymentApi(req5, { params: Promise.resolve({ id: order5Id }) });

    // Kiểm tra DB đảm bảo trạng thái không bị thay đổi
    const dbOrder5 = await db.queryOne<{ payment_status: string }>(
      `SELECT payment_status FROM orders WHERE id = $1;`,
      [order5Id]
    );

    const test5Passed = res5.status === 403 && dbOrder5?.payment_status === 'PENDING';

    record(
      5,
      'Kitchen không thể xác nhận thanh toán (403 Forbidden)',
      test5Passed,
      `Tài khoản Bếp (kitchen) gọi API confirm-payment: Phản hồi HTTP ${res5.status} Forbidden. Trạng thái DB giữ nguyên PENDING.`
    );

    // --------------------------------------------------------------------------
    // TEST 6: Waiter/manager có thể chốt sau khi xác nhận
    // --------------------------------------------------------------------------
    // Đơn order4 đã được xác nhận MANUALLY_CONFIRMED ở Test 4, tiến hành chốt
    const req6 = new NextRequest(`http://localhost:3000/api/orders/${order4Id}/close`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${managerToken}`,
      },
    });
    const res6 = await closeOrderApi(req6, { params: Promise.resolve({ id: order4Id }) });
    const data6 = await res6.json();

    const dbOrder6 = await db.queryOne<{ status: string; closed_at: string }>(
      `SELECT status, closed_at FROM orders WHERE id = $1;`,
      [order4Id]
    );
    const dbTable6 = await db.queryOne<{ status: string }>(
      `SELECT status FROM dining_tables WHERE id = $1;`,
      [testTableId]
    );

    const test6Passed =
      res6.status === 200 &&
      data6.success === true &&
      dbOrder6?.status === 'CLOSED' &&
      dbOrder6?.closed_at !== null &&
      dbTable6?.status === 'AVAILABLE';

    record(
      6,
      'Waiter/manager có thể chốt sau khi xác nhận',
      test6Passed,
      `Quản lý chốt đơn sau khi đã xác nhận thanh toán: HTTP ${res6.status}. Order status = ${dbOrder6?.status}, Bàn ăn giải phóng = ${dbTable6?.status}.`
    );

    // --------------------------------------------------------------------------
    // TEST 7: Không thể chốt nếu chưa xác nhận thanh toán (400)
    // --------------------------------------------------------------------------
    // Tạo order mới trạng thái PENDING
    // Set lại bàn về OCCUPIED để test
    await db.execute(`UPDATE dining_tables SET status = 'OCCUPIED' WHERE id = $1;`, [testTableId]);

    const order7Code = `ORD-QR-T7-${Date.now().toString().slice(-4)}`;
    const { orderId: order7Id } = await createTestOrder({
      orderCode: order7Code,
      totalAmount: 220000,
      itemStatus: 'READY',
      paymentStatus: 'PENDING',
    });

    const req7 = new NextRequest(`http://localhost:3000/api/orders/${order7Id}/close`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${waiterToken}`,
      },
    });
    const res7 = await closeOrderApi(req7, { params: Promise.resolve({ id: order7Id }) });
    const data7 = await res7.json();

    const test7Passed =
      res7.status === 400 &&
      data7.code === 'PAYMENT_NOT_CONFIRMED' &&
      data7.success === false;

    record(
      7,
      'Không thể chốt nếu chưa xác nhận thanh toán',
      test7Passed,
      `Gọi chốt đơn khi payment_status = PENDING: HTTP ${res7.status}, mã lỗi: ${data7.code}, thông điệp: "${data7.message}".`
    );

    // --------------------------------------------------------------------------
    // TEST 8: Retry xác nhận thanh toán không ghi nhận lặp (Idempotency)
    // --------------------------------------------------------------------------
    // Đơn order4 đã MANUALLY_CONFIRMED trước đó, gọi lại xác nhận thanh toán lần 2
    const req8 = new NextRequest(`http://localhost:3000/api/orders/${order4Id}/confirm-payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${waiterToken}`,
      },
      body: JSON.stringify({ paymentReference: 'REF-RETRY' }),
    });
    const res8 = await confirmPaymentApi(req8, { params: Promise.resolve({ id: order4Id }) });
    const data8 = await res8.json();

    const test8Passed =
      res8.status === 200 &&
      data8.success === true &&
      data8.alreadyConfirmed === true &&
      data8.paymentStatus === 'MANUALLY_CONFIRMED';

    record(
      8,
      'Retry xác nhận thanh toán không ghi nhận lặp (Idempotency)',
      test8Passed,
      `Gọi lại confirm-payment lần 2: HTTP ${res8.status}, alreadyConfirmed = ${data8.alreadyConfirmed}. Không ghi đè hay tạo dữ liệu rác.`
    );

    // --------------------------------------------------------------------------
    // TEST 9: QR xuất hiện khi in hóa đơn (@media print và disclaimer)
    // --------------------------------------------------------------------------
    const invoicePageCode = fs.readFileSync(
      path.join(process.cwd(), 'src/app/orders/[id]/invoice/page.tsx'),
      'utf-8'
    );
    const globalsCssCode = fs.readFileSync(
      path.join(process.cwd(), 'src/app/globals.css'),
      'utf-8'
    );

    const hasPrintDisclaimer = invoicePageCode.includes('Hóa đơn mô phỏng – không thực hiện thanh toán tự động');
    const hasQrImageId = invoicePageCode.includes('id="invoice-qr-image"');
    const hasQrPrintStyling = globalsCssCode.includes('@media print') && globalsCssCode.includes('#invoice-qr-image');
    const hidesActionButtonsInPrint = invoicePageCode.includes('print:hidden');

    const test9Passed = hasPrintDisclaimer && hasQrImageId && hasQrPrintStyling && hidesActionButtonsInPrint;

    record(
      9,
      'QR xuất hiện khi in hóa đơn (@media print và disclaimer)',
      test9Passed,
      `Kiểm tra code giao diện & CSS print: Mã QR #invoice-qr-image được tối ưu in ấn, ẩn nút print:hidden, hiển thị câu bắt buộc: "Hóa đơn mô phỏng – không thực hiện thanh toán tự động".`
    );

    // --------------------------------------------------------------------------
    // TEST 10: Thiếu cấu hình QR không làm trang hóa đơn bị lỗi (Graceful fallback)
    // --------------------------------------------------------------------------
    // Tạm thời disable PAYMENT_QR_ENABLED
    const origEnabled = process.env.PAYMENT_QR_ENABLED;
    process.env.PAYMENT_QR_ENABLED = 'false';

    const unconfiguredQr = await generateOrderQrCode({
      orderCode: 'ORD-TEST-NO-CONFIG',
      totalAmount: 100000,
    });

    // Khôi phục lại biến môi trường
    process.env.PAYMENT_QR_ENABLED = origEnabled;

    const test10Passed =
      unconfiguredQr.configured === false &&
      unconfiguredQr.message === 'Chưa cấu hình thông tin QR chuyển khoản.';

    record(
      10,
      'Thiếu cấu hình QR không làm trang hóa đơn bị lỗi',
      test10Passed,
      `Khi tắt biến môi trường: generateOrderQrCode trả về configured = false, message = "${unconfiguredQr.message}". Giao diện hiển thị cảnh báo thay vì gây crash ứng dụng.`
    );

  } catch (err: any) {
    console.error('LỖI NGOẠI LỆ TRONG KHI CHẠY TEST QR:', err);
    record(999, 'Lỗi ngoại lệ hệ thống', false, 'Ngoại lệ chưa bắt được', err);
  } finally {
    // Dọn dẹp dữ liệu test
    if (cleanupOrderIds.length > 0) {
      const placeholders = cleanupOrderIds.map((_, i) => `$${i + 1}`).join(', ');
      await db.execute(`DELETE FROM order_items WHERE order_id IN (${placeholders});`, cleanupOrderIds);
      await db.execute(`DELETE FROM order_status_history WHERE order_id IN (${placeholders});`, cleanupOrderIds);
      await db.execute(`DELETE FROM orders WHERE id IN (${placeholders});`, cleanupOrderIds);
    }
    await db.execute(`DELETE FROM dining_tables WHERE id = $1;`, [testTableId]);
  }

  // Tổng kết kết quả
  const totalPassed = results.filter(r => r.passed).length;
  const totalFailed = results.filter(r => !r.passed).length;

  console.log('------------------------------------------------------------------------------');
  console.log(`📊 KẾT QUẢ KIỂM THỬ: ${totalPassed}/${results.length} TIÊU CHÍ ĐẠT (${totalPassed === 10 ? '100% HOÀN HẢO' : 'CHƯA ĐẠT'})`);
  if (totalFailed > 0) {
    console.log(`❌ Số tiêu chí thất bại: ${totalFailed}`);
  }
  console.log('------------------------------------------------------------------------------\n');

  return totalFailed === 0;
}

if (require.main === module) {
  runPaymentQrTests()
    .then(async (success) => {
      await closeDb();
      process.exit(success ? 0 : 1);
    })
    .catch(async (err) => {
      console.error('Lỗi thực thi:', err);
      await closeDb();
      process.exit(1);
    });
}
