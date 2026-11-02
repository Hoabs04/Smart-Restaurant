/**
 * BỘ KIỂM THỬ ĐỘ TIN CẬY & BẢO MẬT CHUYÊN SÂU CHO KÊNH BÁN HÀNG
 * (SALES CHANNELS RELIABILITY, SECURITY & IDEMPOTENCY TEST SUITE)
 * 
 * Phạm vi kiểm thử:
 * 1. ShopeeFood Signature Fail-Closed (chặn mọi bypass rawBody trong production)
 * 2. Webhook Cancellation HTTP Status (200, 400, 404, 500, isAlreadyCancelled)
 * 3. Hủy Webhook Đồng Thời & Chống Race Condition hoàn kho
 * 4. Đồng Bộ Trạng Thái Sàn Thất Bại (Fail-Closed Outbound Sync)
 * 5. Production OAuth Token Fail-Closed (không fallback sang mock)
 * 6. Standalone Build Isolation (không trace/copy .db_pglite vào production)
 * 7. Test Idempotency (Reset dữ liệu sạch, có thể chạy lặp lại nhiều lần liên tiếp)
 */

import { getDb, closeDb } from '../src/lib/db';
import { ShopeeFoodProvider } from '../src/lib/sales-channels/providers/shopeefood.provider';
import { GrabFoodProvider } from '../src/lib/sales-channels/providers/grabfood.provider';
import { salesChannelOrderService } from '../src/lib/sales-channels/order-service';
import { POST as handleWebhook } from '../src/app/api/webhooks/channels/[channelCode]/route';
import { PUT as updateOrderStatusApi } from '../src/app/api/admin/channels/[channelCode]/orders/[orderId]/status/route';
import { computeHmacSha256, encryptSecret } from '../src/lib/crypto';
import { signAuthToken } from '../src/lib/auth';
import { NextRequest } from 'next/server';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

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

export async function runReliabilityTests(): Promise<boolean> {
  console.log('==============================================================================');
  console.log('🛡️ BẮT ĐẦU KIỂM THỬ ĐỘ TIN CẬY & BẢO MẬT CHUYÊN SÂU KÊNH BÁN HÀNG');
  console.log('==============================================================================\n');

  const db = await getDb();
  const originalNodeEnv = process.env.NODE_ENV;

  try {
    // --------------------------------------------------------------------------
    // 0. RESET & CHUẨN BỊ MÔI TRƯỜNG DỮ LIỆU SẠCH (DATA ISOLATION)
    // --------------------------------------------------------------------------
    console.log('--- 0. Khởi tạo và thiết lập dữ liệu sạch cho test suite ---');
    const grabChannel = await db.queryOne<{ id: string }>(`SELECT id FROM sales_channels WHERE code = 'GRABFOOD';`);
    const shopeeChannel = await db.queryOne<{ id: string }>(`SELECT id FROM sales_channels WHERE code = 'SHOPEEFOOD';`);
    if (!grabChannel || !shopeeChannel) throw new Error('Chưa tìm thấy kênh GRABFOOD hoặc SHOPEEFOOD trong CSDL');

    const testSecret = 'shopee_grab_super_secure_webhook_secret_key_2026';

    // Đảm bảo kênh GRABFOOD và SHOPEEFOOD có credentials sạch
    await db.execute(`DELETE FROM channel_credentials WHERE channel_id IN ($1, $2);`, [grabChannel.id, shopeeChannel.id]);
    await db.execute(
      `INSERT INTO channel_credentials (
        id, channel_id, merchant_id, app_secret_encrypted, webhook_secret_encrypted, environment, created_at, updated_at
      ) VALUES 
      ($1, $2, 'TEST-MER-GF-REL', $3, $4, 'SANDBOX', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
      ($5, $6, 'TEST-MER-SPF-REL', $3, $4, 'SANDBOX', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);`,
      [
        crypto.randomUUID(), grabChannel.id, encryptSecret('mock_app_secret'), encryptSecret(testSecret),
        crypto.randomUUID(), shopeeChannel.id,
      ]
    );

    // Lấy 1 món ăn và 1 quản lý hợp lệ
    const testDish = await db.queryOne<{ id: string; name: string; current_price: number; stock_quantity: number }>(
      `SELECT id, name, current_price, stock_quantity FROM menu_items WHERE stock_quantity >= 10 LIMIT 1;`
    );
    if (!testDish) throw new Error('Không có món ăn đủ tồn kho trong menu_items');

    const managerUser = (await db.queryOne<{ id: string; username: string; display_name: string }>(
      `SELECT u.id, u.username, u.display_name FROM users u
       JOIN user_roles ur ON u.id = ur.user_id
       JOIN roles r ON ur.role_id = r.id
       WHERE r.code = 'manager' AND u.is_active = TRUE LIMIT 1;`
    )) || (await db.queryOne<{ id: string; username: string; display_name: string }>(
      `SELECT u.id, u.username, u.display_name FROM users u WHERE u.is_active = TRUE LIMIT 1;`
    ));

    const managerToken = await signAuthToken({
      userId: managerUser!.id,
      username: managerUser!.username,
      displayName: managerUser!.display_name,
      role: 'manager',
    });

    const extItemId = 'REL-DISH-01';
    await db.execute(
      `DELETE FROM channel_menu_mappings WHERE external_item_id = $1 OR internal_menu_item_id = $2;`,
      [extItemId, testDish.id]
    );
    await db.execute(
      `INSERT INTO channel_menu_mappings (
        id, channel_id, internal_menu_item_id, external_item_id, external_item_name,
        external_price, sync_stock, is_active, created_at, updated_at
      ) VALUES 
      ($1, $2, $3, $4, $5, $6, TRUE, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
      ($7, $8, $3, $4, $5, $6, TRUE, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);`,
      [
        crypto.randomUUID(), grabChannel.id, testDish.id, extItemId, `Món Test: ${testDish.name}`, testDish.current_price,
        crypto.randomUUID(), shopeeChannel.id,
      ]
    );

    // --------------------------------------------------------------------------
    // 1. SHOPEEFOOD SIGNATURE FAIL-CLOSED (CHỐNG MỌI BYPASS RAW-BODY TRONG PRODUCTION)
    // --------------------------------------------------------------------------
    console.log('\n--- TEST 1: ShopeeFood Signature Fail-Closed trong Production ---');
    const shopeeProvider = new ShopeeFoodProvider();
    const sampleBody = JSON.stringify({ event: 'ORDER_CREATED', order_id: 'SPF-REL-01' });
    const nowSec = Math.floor(Date.now() / 1000);
    const validTs = nowSec.toString();
    const expiredTs = (nowSec - 350).toString(); // Quá hạn 350s (> 300s)

    // 1a. Chữ ký timestamp|body chuẩn -> HỢP LỆ
    const validComputedSig = computeHmacSha256(`${validTs}|${sampleBody}`, testSecret);
    process.env.NODE_ENV = 'production';
    const is1aValid = await shopeeProvider.verifyWebhookSignature(sampleBody, {
      'x-shopeefood-signature': validComputedSig,
      'x-timestamp': validTs,
    }, testSecret);

    recordTest(
      'ShopeeFood/Security',
      'Chữ ký timestamp|body hợp lệ được chấp nhận trong production',
      is1aValid === true,
      `Xác thực thành công với timestamp hiện tại: ${validTs}`
    );

    // 1b. Chữ ký chỉ tính trên rawBody không có timestamp trong production -> PHẢI TỪ CHỐI
    const rawBodyOnlySig = computeHmacSha256(sampleBody, testSecret);
    const is1bValid = await shopeeProvider.verifyWebhookSignature(sampleBody, {
      'x-shopeefood-signature': rawBodyOnlySig,
      // Không truyền timestamp
    }, testSecret);

    recordTest(
      'ShopeeFood/Security',
      'Chữ ký rawBody không có timestamp bị từ chối tuyệt đối trong production',
      is1bValid === false,
      `Kết quả: false (Không cho phép bypass thiếu timestamp trong production)`
    );

    // 1c. Kẻ tấn công gửi timestamp hợp lệ nhưng tính chữ ký trên rawBody để bypass -> PHẢI TỪ CHỐI
    const is1cValid = await shopeeProvider.verifyWebhookSignature(sampleBody, {
      'x-shopeefood-signature': rawBodyOnlySig,
      'x-timestamp': validTs,
    }, testSecret);

    recordTest(
      'ShopeeFood/Security',
      'Chữ ký rawBody kèm timestamp hợp lệ bị từ chối (không được fallback)',
      is1cValid === false,
      `Kết quả: false (Tuyệt đối không fallback sang rawBody khi chữ ký timestamp|body không khớp)`
    );

    // 1d. Timestamp quá hạn (> 300s) -> PHẢI TỪ CHỐI
    const expiredSig = computeHmacSha256(`${expiredTs}|${sampleBody}`, testSecret);
    const is1dValid = await shopeeProvider.verifyWebhookSignature(sampleBody, {
      'x-shopeefood-signature': expiredSig,
      'x-timestamp': expiredTs,
    }, testSecret);

    recordTest(
      'ShopeeFood/Security',
      'Timestamp quá hạn 350 giây bị từ chối (Replay Attack)',
      is1dValid === false,
      `Kết quả: false (Chặn request quá hạn 5 phút)`
    );

    // 1e. Timestamp sai định dạng (chứa chữ cái hoặc âm) -> PHẢI TỪ CHỐI
    const is1eValid = await shopeeProvider.verifyWebhookSignature(sampleBody, {
      'x-shopeefood-signature': validComputedSig,
      'x-timestamp': 'invalid-not-a-number',
    }, testSecret);

    recordTest(
      'ShopeeFood/Security',
      'Timestamp sai định dạng bị từ chối an toàn',
      is1eValid === false,
      `Kết quả: false`
    );

    // 1f. Chữ ký sai hoặc sai secret -> PHẢI TỪ CHỐI
    const is1fValid = await shopeeProvider.verifyWebhookSignature(sampleBody, {
      'x-shopeefood-signature': '0000000000000000000000000000000000000000000000000000000000000000',
      'x-timestamp': validTs,
    }, testSecret);

    recordTest(
      'ShopeeFood/Security',
      'Chữ ký HMAC sai bị từ chối',
      is1fValid === false,
      `Kết quả: false`
    );

    // Khôi phục NODE_ENV
    process.env.NODE_ENV = originalNodeEnv;

    // --------------------------------------------------------------------------
    // 1B. GRABFOOD SIGNATURE & TIMESTAMP VALIDATION (CHỐNG REPLAY & ĐỊNH DẠNG SAI)
    // --------------------------------------------------------------------------
    console.log('\n--- TEST 1B: GrabFood Signature & Timestamp Validation ---');
    const grabProviderInstance = new GrabFoodProvider();
    const grabSampleBody = JSON.stringify({ event_type: 'ORDER_CREATED', orderID: 'GF-REL-VAL-01' });
    const grabValidSig = computeHmacSha256(grabSampleBody, testSecret);

    // 1b-1. GrabFood timestamp "invalid" -> từ chối
    const isGrabInvalidTs = await grabProviderInstance.verifyWebhookSignature(grabSampleBody, {
      'x-grab-signature': grabValidSig,
      'x-grab-timestamp': 'invalid',
    }, testSecret);

    recordTest(
      'GrabFood/Security',
      'GrabFood timestamp "invalid" bị từ chối an toàn',
      isGrabInvalidTs === false,
      `Kết quả: false (Đã chặn timestamp không phải số: "invalid")`
    );

    // 1b-2. GrabFood timestamp rỗng -> từ chối
    const isGrabEmptyTs = await grabProviderInstance.verifyWebhookSignature(grabSampleBody, {
      'x-grab-signature': grabValidSig,
      'x-grab-timestamp': '',
    }, testSecret);

    recordTest(
      'GrabFood/Security',
      'GrabFood timestamp rỗng bị từ chối',
      isGrabEmptyTs === false,
      `Kết quả: false (Đã chặn timestamp rỗng)`
    );

    // 1b-3. GrabFood timestamp quá hạn -> từ chối
    const isGrabExpiredTs = await grabProviderInstance.verifyWebhookSignature(grabSampleBody, {
      'x-grab-signature': grabValidSig,
      'x-grab-timestamp': expiredTs,
    }, testSecret);

    recordTest(
      'GrabFood/Security',
      'GrabFood timestamp quá hạn bị từ chối (Replay Attack)',
      isGrabExpiredTs === false,
      `Kết quả: false (Đã chặn timestamp quá hạn 350s)`
    );

    // 1b-4. GrabFood timestamp hợp lệ + chữ ký sai -> từ chối
    const isGrabWrongSig = await grabProviderInstance.verifyWebhookSignature(grabSampleBody, {
      'x-grab-signature': 'wrong_hmac_signature_00000000000000000000000000000000',
      'x-grab-timestamp': validTs,
    }, testSecret);

    recordTest(
      'GrabFood/Security',
      'GrabFood timestamp hợp lệ + chữ ký sai bị từ chối',
      isGrabWrongSig === false,
      `Kết quả: false (Chữ ký HMAC sai bị từ chối)`
    );

    // 1b-5. GrabFood timestamp hợp lệ + chữ ký đúng -> chấp nhận
    const isGrabValid = await grabProviderInstance.verifyWebhookSignature(grabSampleBody, {
      'x-grab-signature': grabValidSig,
      'x-grab-timestamp': validTs,
    }, testSecret);

    recordTest(
      'GrabFood/Security',
      'GrabFood timestamp hợp lệ + chữ ký đúng được chấp nhận',
      isGrabValid === true,
      `Kết quả: true (Xác thực chữ ký và timestamp thành công)`
    );

    // --------------------------------------------------------------------------
    // 2. WEBHOOK CANCELLATION HTTP STATUS (200, 400, 404, 500 & isAlreadyCancelled)
    // --------------------------------------------------------------------------
    console.log('\n--- TEST 2: Webhook Hủy Đơn: Kiểm tra chính xác các mã HTTP status ---');
    const relCancelOrderId = `GF-REL-CANCEL-${Date.now()}`;
    const createPayload = {
      event_type: 'ORDER_CREATED',
      orderID: relCancelOrderId,
      shortOrderNumber: `REL-${relCancelOrderId.slice(-4)}`,
      customer: { name: 'Khách Test Status', phone: '0988001122' },
      items: [{ id: extItemId, name: testDish.name, price: testDish.current_price, quantity: 1 }],
    };

    const createBody = JSON.stringify(createPayload);
    const createReq = new NextRequest('http://localhost:3000/api/webhooks/channels/grabfood', {
      method: 'POST',
      body: createBody,
      headers: {
        'content-type': 'application/json',
        'x-grab-signature': computeHmacSha256(createBody, testSecret),
        'x-grab-timestamp': Math.floor(Date.now() / 1000).toString(),
      },
    });
    const createRes = await handleWebhook(createReq, { params: Promise.resolve({ channelCode: 'grabfood' }) });
    const createData = await createRes.json();
    if (createRes.status !== 200) throw new Error(`Không tạo được đơn test: ${createData.message}`);

    // Đẩy vào bếp
    await salesChannelOrderService.pushOrderToKitchen(relCancelOrderId);

    // 2a. Hủy đơn thành công lần đầu -> Phải trả HTTP 200, isAlreadyCancelled: false
    const cancelPayload = {
      event_type: 'ORDER_CANCELLED',
      orderID: relCancelOrderId,
      reason: 'Khách bận đột xuất',
    };
    const cancelBody = JSON.stringify(cancelPayload);
    const cancelReq1 = new NextRequest('http://localhost:3000/api/webhooks/channels/grabfood', {
      method: 'POST',
      body: cancelBody,
      headers: {
        'content-type': 'application/json',
        'x-grab-signature': computeHmacSha256(cancelBody, testSecret),
        'x-grab-timestamp': Math.floor(Date.now() / 1000).toString(),
      },
    });
    const cancelRes1 = await handleWebhook(cancelReq1, { params: Promise.resolve({ channelCode: 'grabfood' }) });
    const cancelData1 = await cancelRes1.json();

    recordTest(
      'Webhook/HttpStatus',
      'Hủy đơn lần đầu thành công trả về HTTP 200 và isAlreadyCancelled: false',
      cancelRes1.status === 200 && cancelData1.success === true && cancelData1.isAlreadyCancelled === false,
      `HTTP Status: ${cancelRes1.status} | isAlreadyCancelled: ${cancelData1.isAlreadyCancelled}`
    );

    // 2b. Gửi lại request hủy đơn (đã hủy trước đó) -> Phải trả HTTP 200 và isAlreadyCancelled: true (Idempotent)
    const cancelReq2 = new NextRequest('http://localhost:3000/api/webhooks/channels/grabfood', {
      method: 'POST',
      body: cancelBody,
      headers: {
        'content-type': 'application/json',
        'x-grab-signature': computeHmacSha256(cancelBody, testSecret),
        'x-grab-timestamp': Math.floor(Date.now() / 1000).toString(),
      },
    });
    const cancelRes2 = await handleWebhook(cancelReq2, { params: Promise.resolve({ channelCode: 'grabfood' }) });
    const cancelData2 = await cancelRes2.json();

    recordTest(
      'Webhook/HttpStatus',
      'Request hủy đơn lặp lại trả về HTTP 200 và isAlreadyCancelled: true',
      cancelRes2.status === 200 && cancelData2.success === true && cancelData2.isAlreadyCancelled === true,
      `HTTP Status: ${cancelRes2.status} | isAlreadyCancelled: ${cancelData2.isAlreadyCancelled}`
    );

    // 2c. Hủy đơn không tồn tại trong hệ thống -> Phải trả HTTP 404 ORDER_NOT_FOUND
    const notFoundPayload = {
      event_type: 'ORDER_CANCELLED',
      orderID: 'NON_EXISTENT_ORDER_99999999',
      reason: 'Hủy đơn ma',
    };
    const notFoundBody = JSON.stringify(notFoundPayload);
    const notFoundReq = new NextRequest('http://localhost:3000/api/webhooks/channels/grabfood', {
      method: 'POST',
      body: notFoundBody,
      headers: {
        'content-type': 'application/json',
        'x-grab-signature': computeHmacSha256(notFoundBody, testSecret),
        'x-grab-timestamp': Math.floor(Date.now() / 1000).toString(),
      },
    });
    const notFoundRes = await handleWebhook(notFoundReq, { params: Promise.resolve({ channelCode: 'grabfood' }) });
    const notFoundData = await notFoundRes.json();

    recordTest(
      'Webhook/HttpStatus',
      'Hủy đơn không tồn tại trả về HTTP 404 (ORDER_NOT_FOUND)',
      notFoundRes.status === 404 && notFoundData.success === false && notFoundData.code === 'ORDER_NOT_FOUND',
      `HTTP Status: ${notFoundRes.status} | Code: ${notFoundData.code} | Message: ${notFoundData.message}`
    );

    // 2d. Thiếu orderID trong yêu cầu hủy đơn -> Phải trả HTTP 400 INVALID_REQUEST
    const missingIdPayload = {
      event_type: 'ORDER_CANCELLED',
      orderID: '', // Thiếu ID
    };
    const missingIdBody = JSON.stringify(missingIdPayload);
    const missingIdReq = new NextRequest('http://localhost:3000/api/webhooks/channels/grabfood', {
      method: 'POST',
      body: missingIdBody,
      headers: {
        'content-type': 'application/json',
        'x-grab-signature': computeHmacSha256(missingIdBody, testSecret),
        'x-grab-timestamp': Math.floor(Date.now() / 1000).toString(),
      },
    });
    const missingIdRes = await handleWebhook(missingIdReq, { params: Promise.resolve({ channelCode: 'grabfood' }) });
    const missingIdData = await missingIdRes.json();

    recordTest(
      'Webhook/HttpStatus',
      'Thiếu mã đơn trong webhook hủy trả về HTTP 400 (INVALID_REQUEST)',
      missingIdRes.status === 400 && missingIdData.success === false && missingIdData.code === 'INVALID_REQUEST',
      `HTTP Status: ${missingIdRes.status} | Code: ${missingIdData.code}`
    );

    // --------------------------------------------------------------------------
    // 3. HỦY WEBHOOK ĐỒNG THỜI & CHỐNG RACE CONDITION HOÀN KHO
    // --------------------------------------------------------------------------
    console.log('\n--- TEST 3: Gửi 3 Webhook Hủy Đơn Đồng Thời qua HTTP Endpoint ---');
    const concurrentOrderId = `GF-REL-CONCUR-${Date.now()}`;
    const conCreatePayload = {
      event_type: 'ORDER_CREATED',
      orderID: concurrentOrderId,
      shortOrderNumber: `CON-${concurrentOrderId.slice(-4)}`,
      customer: { name: 'Khách Đua Lệnh Đồng Thời', phone: '0977665544' },
      items: [{ id: extItemId, name: testDish.name, price: testDish.current_price, quantity: 1 }],
    };
    const conCreateBody = JSON.stringify(conCreatePayload);
    const conCreateReq = new NextRequest('http://localhost:3000/api/webhooks/channels/grabfood', {
      method: 'POST',
      body: conCreateBody,
      headers: {
        'content-type': 'application/json',
        'x-grab-signature': computeHmacSha256(conCreateBody, testSecret),
        'x-grab-timestamp': Math.floor(Date.now() / 1000).toString(),
      },
    });
    await handleWebhook(conCreateReq, { params: Promise.resolve({ channelCode: 'grabfood' }) });

    // Đẩy vào bếp -> trừ 1 tồn kho
    const conPushRes = await salesChannelOrderService.pushOrderToKitchen(concurrentOrderId);
    const stockBeforeConCancel = (await db.queryOne<{ stock_quantity: number }>(
      `SELECT stock_quantity FROM menu_items WHERE id = $1;`,
      [testDish.id]
    ))!.stock_quantity;

    // Chuẩn bị 3 request hủy đồng thời
    const buildConCancelReq = (tag: string) => {
      const p = JSON.stringify({ event_type: 'ORDER_CANCELLED', orderID: concurrentOrderId, reason: `Đồng thời ${tag}` });
      return new NextRequest('http://localhost:3000/api/webhooks/channels/grabfood', {
        method: 'POST',
        body: p,
        headers: {
          'content-type': 'application/json',
          'x-grab-signature': computeHmacSha256(p, testSecret),
          'x-grab-timestamp': Math.floor(Date.now() / 1000).toString(),
        },
      });
    };

    const [cRes1, cRes2, cRes3] = await Promise.all([
      handleWebhook(buildConCancelReq('1'), { params: Promise.resolve({ channelCode: 'grabfood' }) }),
      handleWebhook(buildConCancelReq('2'), { params: Promise.resolve({ channelCode: 'grabfood' }) }),
      handleWebhook(buildConCancelReq('3'), { params: Promise.resolve({ channelCode: 'grabfood' }) }),
    ]);

    const [cData1, cData2, cData3] = await Promise.all([cRes1.json(), cRes2.json(), cRes3.json()]);

    const stockAfterConCancel = (await db.queryOne<{ stock_quantity: number }>(
      `SELECT stock_quantity FROM menu_items WHERE id = $1;`,
      [testDish.id]
    ))!.stock_quantity;

    const conLedgerCount = (await db.query<{ id: string }>(
      `SELECT id FROM inventory_ledger WHERE movement_type = 'RESTORE_ON_CANCEL' AND order_item_id IN (
        SELECT id FROM order_items WHERE order_id = $1
      );`,
      [conPushRes.internalOrderId]
    )).length;

    // Phải có đúng 1 request hủy mới (isAlreadyCancelled = false) và 2 request nhận diện đã hủy (isAlreadyCancelled = true)
    const alreadyCancelledFlags = [cData1.isAlreadyCancelled, cData2.isAlreadyCancelled, cData3.isAlreadyCancelled];
    const newCancelCount = alreadyCancelledFlags.filter(f => f === false).length;
    const idempotentCount = alreadyCancelledFlags.filter(f => f === true).length;

    recordTest(
      'Concurrency/WebhookCancel',
      '3 request hủy đồng thời chỉ hoàn kho đúng 1 lần duy nhất',
      cRes1.status === 200 && cRes2.status === 200 && cRes3.status === 200 &&
      stockAfterConCancel === stockBeforeConCancel + 1 &&
      conLedgerCount === 1 &&
      newCancelCount === 1 && idempotentCount === 2,
      `Tồn kho: ${stockBeforeConCancel} -> ${stockAfterConCancel} (+1 món). Số dòng ledger: ${conLedgerCount}. Phản hồi: 1 hủy mới + 2 idempotent`
    );

    // --------------------------------------------------------------------------
    // 3B. CHỐNG TRÙNG KHÓA orders_order_code_key KHI ĐẨY CÁC ĐƠN CÙNG MÃ SÀN VÀO BẾP
    // --------------------------------------------------------------------------
    console.log('\n--- TEST 3B: Đẩy 2 đơn có cùng external_order_code vào bếp không bị duplicate key ---');
    const sameCode1 = await salesChannelOrderService.ingestOrder({
      channelCode: 'GRABFOOD',
      externalOrderId: `GF-DUP-1-${Date.now()}`,
      externalOrderCode: 'SAME-CODE-99',
      channelStatus: 'ACCEPTED',
      normalizedStatus: 'CONFIRMED',
      items: [{ externalItemId: extItemId, externalItemName: testDish.name, quantity: 1, unitPrice: 20000, subtotal: 20000 }],
      totalAmount: 20000,
      platformFee: 0,
      netRevenue: 20000,
      idempotencyKey: `idemp_dup_1_${Date.now()}`,
      orderedAt: new Date(),
    });

    const sameCode2 = await salesChannelOrderService.ingestOrder({
      channelCode: 'GRABFOOD',
      externalOrderId: `GF-DUP-2-${Date.now()}`,
      externalOrderCode: 'SAME-CODE-99', // Cùng mã đơn sàn
      channelStatus: 'ACCEPTED',
      normalizedStatus: 'CONFIRMED',
      items: [{ externalItemId: extItemId, externalItemName: testDish.name, quantity: 1, unitPrice: 20000, subtotal: 20000 }],
      totalAmount: 20000,
      platformFee: 0,
      netRevenue: 20000,
      idempotencyKey: `idemp_dup_2_${Date.now()}`,
      orderedAt: new Date(),
    });

    const pushRes1 = await salesChannelOrderService.pushOrderToKitchen(sameCode1.orderId);
    const pushRes2 = await salesChannelOrderService.pushOrderToKitchen(sameCode2.orderId);

    const orderRow1 = await db.queryOne<{ order_code: string }>(`SELECT order_code FROM orders WHERE id = $1;`, [pushRes1.internalOrderId]);
    const orderRow2 = await db.queryOne<{ order_code: string }>(`SELECT order_code FROM orders WHERE id = $1;`, [pushRes2.internalOrderId]);

    recordTest(
      'PushKitchen/OrderCodeUnique',
      'Đẩy 2 đơn cùng mã sàn vào bếp sinh 2 order_code duy nhất, không bị lỗi duplicate key',
      pushRes1.success === true && pushRes2.success === true &&
      !!orderRow1?.order_code && !!orderRow2?.order_code &&
      orderRow1.order_code !== orderRow2.order_code,
      `Đơn 1: ${orderRow1?.order_code} | Đơn 2: ${orderRow2?.order_code} (Không bị lỗi Unique Constraint)`
    );

    // --------------------------------------------------------------------------
    // 4. ĐỒNG BỘ TRẠNG THÁI SÀN THẤT BẠI (FAIL-CLOSED STATUS SYNC VIA API)
    // --------------------------------------------------------------------------
    console.log('\n--- TEST 4: API Cập nhật trạng thái đơn trả về HTTP 400 khi sàn từ chối ---');
    const mockOrderFail = await salesChannelOrderService.ingestOrder({
      channelCode: 'GRABFOOD',
      externalOrderId: `GF-FAIL-${Date.now()}`,
      externalOrderCode: 'GF-FAIL-SYNC',
      channelStatus: 'ACCEPTED',
      normalizedStatus: 'NEW',
      items: [{ externalItemId: extItemId, externalItemName: testDish.name, quantity: 1, unitPrice: 20000, subtotal: 20000 }],
      totalAmount: 20000,
      platformFee: 0,
      netRevenue: 20000,
      idempotencyKey: `idemp_fail_${Date.now()}`,
      orderedAt: new Date(),
    });

    // Tạm xóa credentials để ép sàn lỗi
    await db.execute(`DELETE FROM channel_credentials WHERE channel_id = $1;`, [grabChannel.id]);

    const apiStatusReq = new NextRequest(`http://localhost:3000/api/admin/channels/grabfood/orders/${mockOrderFail.orderId}/status`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${managerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'CONFIRMED' }),
    });

    const apiStatusRes = await updateOrderStatusApi(apiStatusReq, {
      params: Promise.resolve({ channelCode: 'grabfood', orderId: mockOrderFail.orderId }),
    });
    const apiStatusData = await apiStatusRes.json();

    // Khôi phục ngay credentials
    await db.execute(
      `INSERT INTO channel_credentials (
        id, channel_id, merchant_id, app_secret_encrypted, webhook_secret_encrypted, environment, created_at, updated_at
      ) VALUES ($1, $2, 'TEST-MER-GF-REL', $3, $4, 'SANDBOX', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);`,
      [crypto.randomUUID(), grabChannel.id, encryptSecret('mock_app_secret'), encryptSecret(testSecret)]
    );

    const dbOrderStatus = (await db.queryOne<{ normalized_status: string }>(
      `SELECT normalized_status FROM external_orders WHERE id = $1;`,
      [mockOrderFail.orderId]
    ))?.normalized_status;

    recordTest(
      'StatusSync/ApiFailClosed',
      'Đồng bộ sàn thất bại: API trả về HTTP 400 UPDATE_FAILED và giữ nguyên status DB',
      apiStatusRes.status === 400 && apiStatusData.code === 'UPDATE_FAILED' && dbOrderStatus === 'NEW',
      `HTTP Status: ${apiStatusRes.status} | Code: ${apiStatusData.code} | DB Status: ${dbOrderStatus} (Không bị lệch với sàn)`
    );

    // --------------------------------------------------------------------------
    // 5. PRODUCTION OAUTH TOKEN FAIL-CLOSED (KHÔNG FALLBACK MOCK)
    // --------------------------------------------------------------------------
    console.log('\n--- TEST 5: GrabFood OAuth trong Production không tự sinh Mock Token ---');
    const grabProvider = new GrabFoodProvider();
    process.env.NODE_ENV = 'production';
    let oauthFailedAsExpected = false;
    let thrownErrorMsg = '';

    try {
      // Gọi getAccessToken với appSecret thật nhưng server Grab không phản hồi / URL giả lập production
      await grabProvider.getAccessToken({
        merchantId: 'TEST-PROD-FAIL',
        appId: 'real_client_id_prod',
        appSecret: 'real_secret_key_prod_not_mock',
        environment: 'PRODUCTION',
      });
    } catch (e: any) {
      oauthFailedAsExpected = true;
      thrownErrorMsg = e?.message || String(e);
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
    }

    recordTest(
      'OAuth/ProductionFailClosed',
      'OAuth 2.0 GrabFood trong production ném ngoại lệ khi thất bại, không tạo mock token',
      oauthFailedAsExpected === true && thrownErrorMsg.includes('GrabFood OAuth thất bại'),
      `Đã chặn fallback thành công: "${thrownErrorMsg.slice(0, 80)}..."`
    );

    // --------------------------------------------------------------------------
    // 6. BUILD STANDALONE KHÔNG TRACE DATABASE LOCAL (.db_pglite)
    // --------------------------------------------------------------------------
    console.log('\n--- TEST 6: Kiểm tra cấu hình loại trừ .db_pglite khỏi Standalone Trace ---');
    const nextConfigContent = fs.readFileSync(path.join(process.cwd(), 'next.config.mjs'), 'utf-8');
    const dockerignoreContent = fs.readFileSync(path.join(process.cwd(), '.dockerignore'), 'utf-8');

    const nextConfigHasExcludes = nextConfigContent.includes('outputFileTracingExcludes') && nextConfigContent.includes('.db_pglite');
    const dockerignoreHasPglite = dockerignoreContent.includes('.db_pglite');

    // Kiểm tra xem trong .next/standalone có bị dính thư mục .db_pglite không
    const standalonePglitePath = path.join(process.cwd(), '.next', 'standalone', '.db_pglite');
    const standaloneHasLocalDb = fs.existsSync(standalonePglitePath);

    recordTest(
      'Build/StandaloneIsolation',
      'next.config.mjs và .dockerignore loại trừ hoàn toàn .db_pglite khỏi production image',
      nextConfigHasExcludes && dockerignoreHasPglite && !standaloneHasLocalDb,
      `outputFileTracingExcludes: Đã cấu hình | .dockerignore: Đã loại trừ | .next/standalone/.db_pglite: ${standaloneHasLocalDb ? 'CÓ (LỖI)' : 'KHÔNG CÓ (ĐẠT)'}`
    );

  } catch (error: any) {
    console.error('Lỗi ngoại lệ trong bộ kiểm thử độ tin cậy:', error);
    recordTest('Critical', 'Reliability Test Failure', false, 'Gặp ngoại lệ không mong muốn', error);
  } finally {
    process.env.NODE_ENV = originalNodeEnv;
    console.log('\n==============================================================================');
    console.log('📊 TỔNG HỢP KẾT QUẢ BỘ KIỂM THỬ ĐỘ TIN CẬY & BẢO MẬT:');
    console.log('==============================================================================');
    const total = results.length;
    const passed = results.filter(r => r.passed).length;
    const failed = total - passed;
    console.log(`Tổng số bài test: ${total} | Đạt: ${passed} | Không đạt: ${failed}`);
    console.log('------------------------------------------------------------------------------');
    if (failed === 0) {
      console.log('🎉 100% CÁC BÀI KIỂM THỬ ĐỘ TIN CẬY & BẢO MẬT ĐÃ ĐẠT CHUẨN THÀNH CÔNG!');
    } else {
      console.log(`⚠️ Có ${failed} bài test chưa đạt. Vui lòng kiểm tra lại log.`);
    }
    console.log('==============================================================================\n');

    await closeDb();
    return results.every(r => r.passed);
  }
}

// Nếu chạy trực tiếp file bằng tsx
if (require.main === module || process.argv[1]?.includes('sales-channels-reliability.test.ts')) {
  runReliabilityTests().then((allPassed) => {
    process.exit(allPassed ? 0 : 1);
  }).catch(async (e) => {
    console.error(e);
    await closeDb();
    process.exit(1);
  });
}
