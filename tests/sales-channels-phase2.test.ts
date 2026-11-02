/**
 * BỘ KIỂM THỬ GIAI ĐOẠN 2: TÍCH HỢP API CHÍNH THỨC, WEBHOOK ĐA LUỒNG & QUEUE BẾP
 * 1. GrabFood OAuth 2.0 token caching
 * 2. ShopeeFood Partner signature calculation & verification
 * 3. Webhook đa sự kiện (ORDER_CREATED, DRIVER_ALLOCATED, ORDER_CANCELLED)
 * 4. Tự động đẩy đơn vào Kitchen Queue & Trừ tồn kho nguyên tử
 * 5. Kitchen Queue API nhận diện đơn sàn giao hàng (isDelivery: true)
 * 6. Đồng bộ trạng thái hai chiều khi Bếp cập nhật IN_PROGRESS / READY
 * 7. Cơ chế xử lý hủy đơn từ sàn và hoàn lại tồn kho
 */

import { getDb, closeDb } from '../src/lib/db';
import { GrabFoodProvider } from '../src/lib/sales-channels/providers/grabfood.provider';
import { ShopeeFoodProvider } from '../src/lib/sales-channels/providers/shopeefood.provider';
import { salesChannelOrderService } from '../src/lib/sales-channels/order-service';
import { GET as getKitchenQueue } from '../src/app/api/kitchen/queue/route';
import { PATCH as updateOrderItemStatus } from '../src/app/api/order-items/[id]/status/route';
import { POST as handleWebhook } from '../src/app/api/webhooks/channels/[channelCode]/route';
import { signAuthToken } from '../src/lib/auth';
import { computeHmacSha256, encryptSecret } from '../src/lib/crypto';
import { NextRequest } from 'next/server';
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

async function runPhase2Tests() {
  console.log('==============================================================================');
  console.log('🚀 BẮT ĐẦU KIỂM THỬ GIAI ĐOẠN 2: API CHÍNH THỨC, WEBHOOK & KITCHEN QUEUE');
  console.log('==============================================================================\n');

  const db = await getDb();

  try {
    // --------------------------------------------------------------------------
    // TEST 1: GRABFOOD OAUTH 2.0 TOKEN CACHING
    // --------------------------------------------------------------------------
    console.log('--- TEST 1: GrabFood OAuth Token Caching & Auto-Refresh ---');
    const grabProvider = new GrabFoodProvider();
    const creds = {
      merchantId: 'TEST-MER-GF-PHASE2',
      appId: 'test_client_id_123',
      appSecret: 'test_client_secret_xyz',
      environment: 'SANDBOX' as const,
    };

    const token1 = await grabProvider.getAccessToken(creds);
    const token2 = await grabProvider.getAccessToken(creds);

    recordTest(
      'GrabFood/OAuth',
      'Cấp phát token và tái sử dụng Token Cache',
      Boolean(token1 && token1 === token2),
      `Token lần 1: ${token1} | Token lần 2 (từ cache): ${token2} (Trùng khớp 100%)`
    );

    // --------------------------------------------------------------------------
    // TEST 2: SHOPEEFOOD PARTNER SIGNATURE
    // --------------------------------------------------------------------------
    console.log('\n--- TEST 2: ShopeeFood Partner Signature (HMAC-SHA256) ---');
    const shopeeProvider = new ShopeeFoodProvider();
    const currentTimestamp = Math.floor(Date.now() / 1000).toString();
    const body = '{"test":1}';
    const secret = 'shopee_partner_secret_key_8899';

    const sig = shopeeProvider.computeShopeeWebhookSignature(currentTimestamp, body, secret);
    const isValidSig = await shopeeProvider.verifyWebhookSignature(body, {
      'x-shopeefood-signature': sig,
      'x-timestamp': currentTimestamp,
    }, secret);

    recordTest(
      'ShopeeFood/Security',
      'Tính toán và xác thực chữ ký số ShopeeFood Gateway',
      sig.length === 64 && isValidSig === true,
      `Chữ ký HMAC: ${sig.slice(0, 25)}... | Xác thực Webhook: Hợp lệ`
    );

    // --------------------------------------------------------------------------
    // TEST 3: WEBHOOK ĐA SỰ KIỆN: TẠO ĐƠN & TÀI XẾ NHẬN ĐƠN
    // --------------------------------------------------------------------------
    console.log('\n--- TEST 3: Webhook Đa Sự Kiện: ORDER_CREATED & DRIVER_ALLOCATED ---');
    // Chuẩn bị món ăn và mapping cho GrabFood
    const internalDish = await db.queryOne<{ id: string; name: string; current_price: number; stock_quantity: number }>(
      `SELECT id, name, current_price, stock_quantity FROM menu_items WHERE stock_quantity >= 5 LIMIT 1;`
    );
    if (!internalDish) throw new Error('Không có món ăn trong menu');

    const grabChannel = await db.queryOne<{ id: string }>(`SELECT id FROM sales_channels WHERE code = 'GRABFOOD';`);
    if (!grabChannel) throw new Error('Không tìm thấy kênh GRABFOOD');

    // Cấu hình credentials với webhook secret an toàn cho GrabFood
    const testSecret = 'gf_webhook_secret_phase2_test_super_key';
    await db.execute(`DELETE FROM channel_credentials WHERE channel_id = $1;`, [grabChannel.id]);
    await db.execute(
      `INSERT INTO channel_credentials (
        id, channel_id, merchant_id, app_secret_encrypted, webhook_secret_encrypted, environment, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, 'SANDBOX', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);`,
      [crypto.randomUUID(), grabChannel.id, 'TEST-MER-GF-PHASE2', encryptSecret('mock_app_secret'), encryptSecret(testSecret)]
    );

    const extItemId = 'GF-DISH-PHASE2-01';
    await db.execute(
      `DELETE FROM channel_menu_mappings WHERE channel_id = $1 AND (external_item_id = $2 OR internal_menu_item_id = $3);`,
      [grabChannel.id, extItemId, internalDish.id]
    );
    await db.execute(
      `INSERT INTO channel_menu_mappings (
        id, channel_id, internal_menu_item_id, external_item_id, external_item_name,
        external_price, sync_stock, is_active, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, TRUE, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);`,
      [crypto.randomUUID(), grabChannel.id, internalDish.id, extItemId, `Món Grab: ${internalDish.name}`, internalDish.current_price + 15000]
    );

    const testExtOrderId = `GF-HOOK-${Date.now()}`;
    const newOrderPayload = {
      event_type: 'ORDER_CREATED',
      orderID: testExtOrderId,
      shortOrderNumber: `GF-${testExtOrderId.slice(-4)}`,
      customer: { name: 'Đoàn Văn Hậu', phone: '0977112233' },
      items: [
        { id: extItemId, name: `Món Grab: ${internalDish.name}`, price: internalDish.current_price + 15000, quantity: 2 },
      ],
    };

    const body1 = JSON.stringify(newOrderPayload);
    const ts1 = Math.floor(Date.now() / 1000).toString();
    const sig1 = computeHmacSha256(body1, testSecret);
    const webhookReq1 = new NextRequest(`http://localhost:3000/api/webhooks/channels/grabfood`, {
      method: 'POST',
      body: body1,
      headers: {
        'content-type': 'application/json',
        'x-grab-signature': sig1,
        'x-grab-timestamp': ts1,
      },
    });

    const res1 = await handleWebhook(webhookReq1, { params: Promise.resolve({ channelCode: 'grabfood' }) });
    const data1 = await res1.json();

    // Tiếp tục gửi sự kiện DRIVER_ALLOCATED
    const driverPayload = {
      event_type: 'DRIVER_ALLOCATED',
      orderID: testExtOrderId,
      driver: { name: 'Nguyễn Văn Tài Xế (GrabBike)', phone: '0933445566' },
    };

    const body2 = JSON.stringify(driverPayload);
    const ts2 = Math.floor(Date.now() / 1000).toString();
    const sig2 = computeHmacSha256(body2, testSecret);
    const webhookReq2 = new NextRequest(`http://localhost:3000/api/webhooks/channels/grabfood`, {
      method: 'POST',
      body: body2,
      headers: {
        'content-type': 'application/json',
        'x-grab-signature': sig2,
        'x-grab-timestamp': ts2,
      },
    });

    const res2 = await handleWebhook(webhookReq2, { params: Promise.resolve({ channelCode: 'grabfood' }) });
    const data2 = await res2.json();

    // Kiểm tra DB xem driver đã được cập nhật chưa
    const updatedExtOrder = await db.queryOne<{ driver_name: string; driver_phone: string }>(
      `SELECT driver_name, driver_phone FROM external_orders WHERE external_order_id = $1;`,
      [testExtOrderId]
    );

    recordTest(
      'Webhook/MultiEvents',
      'Xử lý ORDER_CREATED và DRIVER_ALLOCATED thành công',
      data1.code === 'ORDER_ACCEPTED' && data2.code === 'DRIVER_UPDATED' && updatedExtOrder?.driver_name === 'Nguyễn Văn Tài Xế (GrabBike)',
      `Đơn ${testExtOrderId} tạo thành công -> Tài xế cập nhật: ${updatedExtOrder?.driver_name} (${updatedExtOrder?.driver_phone})`
    );

    // --------------------------------------------------------------------------
    // TEST 4: ĐẨY ĐƠN VÀO QUEUE BẾP & TRỪ TỒN KHO NGUYÊN TỬ
    // --------------------------------------------------------------------------
    console.log('\n--- TEST 4: Đẩy Đơn Online vào Queue Bếp & Trừ Kho Nguyên Tử ---');
    const initialStock = internalDish.stock_quantity;

    const pushResult = await salesChannelOrderService.pushOrderToKitchen(testExtOrderId);

    // Kiểm tra CSDL
    const internalOrder = await db.queryOne<{
      id: string;
      order_source: string;
      table_id: string | null;
      status: string;
    }>(
      `SELECT id, order_source, table_id, status FROM orders WHERE id = $1;`,
      [pushResult.internalOrderId]
    );

    const updatedDish = await db.queryOne<{ stock_quantity: number }>(
      `SELECT stock_quantity FROM menu_items WHERE id = $1;`,
      [internalDish.id]
    );

    const ledgerEntry = await db.queryOne<{ movement_type: string; quantity_delta: number }>(
      `SELECT movement_type, quantity_delta FROM inventory_ledger WHERE order_item_id IN (
        SELECT id FROM order_items WHERE order_id = $1
      );`,
      [pushResult.internalOrderId]
    );

    const isStockCorrect = updatedDish && updatedDish.stock_quantity === initialStock - 2;

    recordTest(
      'KitchenQueue/Push',
      'Đẩy đơn vào Bếp và trừ tồn kho trong InventoryLedger',
      pushResult.success && internalOrder?.order_source === 'GRABFOOD' && internalOrder.table_id === null && isStockCorrect && ledgerEntry?.quantity_delta === -2,
      `Đơn nội bộ ${internalOrder?.id} được tạo (table_id: null, order_source: GRABFOOD). Tồn kho: ${initialStock} -> ${updatedDish?.stock_quantity} (Đã trừ 2 phần).`
    );

    // --------------------------------------------------------------------------
    // TEST 5: KITCHEN QUEUE API NHẬN DIỆN ĐƠN SÀN
    // --------------------------------------------------------------------------
    console.log('\n--- TEST 5: Kitchen Queue API trả về nhãn giao hàng (isDelivery: true) ---');
    const kitchenUser = (await db.queryOne<{ id: string; username: string; display_name: string }>(
      `SELECT u.id, u.username, u.display_name FROM users u
       JOIN user_roles ur ON u.id = ur.user_id
       JOIN roles r ON ur.role_id = r.id
       WHERE r.code = 'kitchen' AND u.is_active = TRUE
       LIMIT 1;`
    )) || (await db.queryOne<{ id: string; username: string; display_name: string }>(
      `SELECT u.id, u.username, u.display_name FROM users u WHERE u.is_active = TRUE LIMIT 1;`
    ));

    const kitchenToken = await signAuthToken({
      userId: kitchenUser!.id,
      username: kitchenUser!.username,
      displayName: kitchenUser!.display_name,
      role: 'kitchen',
    });

    const queueReq = new NextRequest('http://localhost:3000/api/kitchen/queue', {
      headers: { 'Authorization': `Bearer ${kitchenToken}` },
    });

    const queueRes = await getKitchenQueue(queueReq);
    const queueData = await queueRes.json();

    const deliveryBatch = (queueData.batches || []).find((b: any) => b.orderId === pushResult.internalOrderId);

    recordTest(
      'KitchenQueue/API',
      'Queue Bếp hiển thị Batch giao hàng với nhãn Kênh rõ ràng',
      Boolean(deliveryBatch && deliveryBatch.isDelivery === true && deliveryBatch.orderSource === 'GRABFOOD'),
      `Batch tìm thấy trong Queue: tableCode = ${deliveryBatch?.tableCode}, orderSource = ${deliveryBatch?.orderSource}, isDelivery = ${deliveryBatch?.isDelivery}`
    );

    // --------------------------------------------------------------------------
    // TEST 6: ĐỒNG BỘ HAI CHIỀU KHI BẾP CHUYỂN TRẠNG THÁI IN_PROGRESS & READY
    // --------------------------------------------------------------------------
    console.log('\n--- TEST 6: Bếp cập nhật trạng thái -> Đồng bộ ngược lên sàn ---');
    const orderItems = await db.query<{ id: string; status: string }>(
      `SELECT id, status FROM order_items WHERE order_id = $1;`,
      [pushResult.internalOrderId]
    );

    const targetItem = orderItems[0];

    // Bếp bấm Bắt đầu nấu (IN_PROGRESS)
    const patchReq1 = new NextRequest(`http://localhost:3000/api/order-items/${targetItem.id}/status`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${kitchenToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'IN_PROGRESS' }),
    });

    await updateOrderItemStatus(patchReq1, { params: Promise.resolve({ id: targetItem.id }) });

    // Kiểm tra external_orders xem đã sang PREPARING chưa
    const extOrderStep1 = await db.queryOne<{ normalized_status: string }>(
      `SELECT normalized_status FROM external_orders WHERE external_order_id = $1;`,
      [testExtOrderId]
    );

    // Bếp bấm Hoàn tất món (READY)
    const patchReq2 = new NextRequest(`http://localhost:3000/api/order-items/${targetItem.id}/status`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${kitchenToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'READY' }),
    });

    await updateOrderItemStatus(patchReq2, { params: Promise.resolve({ id: targetItem.id }) });

    const extOrderStep2 = await db.queryOne<{ normalized_status: string }>(
      `SELECT normalized_status FROM external_orders WHERE external_order_id = $1;`,
      [testExtOrderId]
    );

    recordTest(
      'BiDirectionalSync',
      'Đồng bộ hai chiều Bếp -> GrabFood (IN_PROGRESS -> PREPARING, READY -> COMPLETED)',
      extOrderStep1?.normalized_status === 'PREPARING' && extOrderStep2?.normalized_status === 'COMPLETED',
      `Khi bếp chuyển IN_PROGRESS: Sàn chuyển PREPARING | Khi bếp chuyển READY: Sàn chuyển COMPLETED.`
    );

    // --------------------------------------------------------------------------
    // TEST 7: WEBHOOK HỦY ĐƠN & HOÀN KHO AN TOÀN
    // --------------------------------------------------------------------------
    console.log('\n--- TEST 7: Webhook Hủy Đơn (ORDER_CANCELLED) & Hoàn Kho ---');
    // Tạo 1 đơn mới khác và đẩy vào bếp
    const cancelExtId = `GF-CANCEL-${Date.now()}`;
    const cancelOrderPayload = {
      event_type: 'ORDER_CREATED',
      orderID: cancelExtId,
      shortOrderNumber: `GF-${cancelExtId.slice(-4)}`,
      customer: { name: 'Lê Văn Hủy', phone: '0911223344' },
      items: [
        { id: extItemId, name: `Món Grab: ${internalDish.name}`, price: internalDish.current_price, quantity: 1 },
      ],
    };

    const cancelCreateBody = JSON.stringify(cancelOrderPayload);
    const cancelCreateTs = Math.floor(Date.now() / 1000).toString();
    const cancelCreateSig = computeHmacSha256(cancelCreateBody, testSecret);
    const webhookCreateReq = new NextRequest(`http://localhost:3000/api/webhooks/channels/grabfood`, {
      method: 'POST',
      body: cancelCreateBody,
      headers: {
        'content-type': 'application/json',
        'x-grab-signature': cancelCreateSig,
        'x-grab-timestamp': cancelCreateTs,
      },
    });
    await handleWebhook(webhookCreateReq, { params: Promise.resolve({ channelCode: 'grabfood' }) });

    // Đẩy vào bếp
    const cancelPushRes = await salesChannelOrderService.pushOrderToKitchen(cancelExtId);
    const stockBeforeCancel = (await db.queryOne<{ stock_quantity: number }>(
      `SELECT stock_quantity FROM menu_items WHERE id = $1;`,
      [internalDish.id]
    ))!.stock_quantity;

    // Giả lập sàn gửi Webhook CANCEL_ORDER
    const cancelWebhookPayload = {
      event_type: 'ORDER_CANCELLED',
      orderID: cancelExtId,
      cancel_reason: 'Khách hàng đổi ý muốn ăn món khác',
    };

    const cancelWebhookBody = JSON.stringify(cancelWebhookPayload);
    const cancelWebhookTs = Math.floor(Date.now() / 1000).toString();
    const cancelWebhookSig = computeHmacSha256(cancelWebhookBody, testSecret);
    const webhookCancelReq = new NextRequest(`http://localhost:3000/api/webhooks/channels/grabfood`, {
      method: 'POST',
      body: cancelWebhookBody,
      headers: {
        'content-type': 'application/json',
        'x-grab-signature': cancelWebhookSig,
        'x-grab-timestamp': cancelWebhookTs,
      },
    });

    const cancelWebhookRes = await handleWebhook(webhookCancelReq, { params: Promise.resolve({ channelCode: 'grabfood' }) });
    const cancelWebhookData = await cancelWebhookRes.json();

    const stockAfterCancel = (await db.queryOne<{ stock_quantity: number }>(
      `SELECT stock_quantity FROM menu_items WHERE id = $1;`,
      [internalDish.id]
    ))!.stock_quantity;

    const restoreLedger = await db.queryOne<{ movement_type: string; quantity_delta: number }>(
      `SELECT movement_type, quantity_delta FROM inventory_ledger WHERE movement_type = 'RESTORE_ON_CANCEL' AND order_item_id IN (
        SELECT id FROM order_items WHERE order_id = $1
      );`,
      [cancelPushRes.internalOrderId]
    );

    recordTest(
      'Webhook/CancelOrder',
      'Tiếp nhận ORDER_CANCELLED và hoàn kho đúng 1 lần (RESTORE_ON_CANCEL)',
      cancelWebhookData.code === 'ORDER_CANCELLED' && stockAfterCancel === stockBeforeCancel + 1 && restoreLedger?.quantity_delta === 1,
      `Đơn đã bị hủy trên sàn. Tồn kho được hoàn lại (+1). Ghi sổ cái: RESTORE_ON_CANCEL.`
    );

    // --------------------------------------------------------------------------
    // TEST 8: CHỐNG TẤN CÔNG LẶP LẠI (REPLAY ATTACK PROTECTION)
    // --------------------------------------------------------------------------
    console.log('\n--- TEST 8: Kiểm tra cơ chế chống Replay Attack (Timestamp Quá Hạn) ---');
    const expiredTimestamp = (Math.floor(Date.now() / 1000) - 600).toString(); // 10 phút trước (> 300s)
    const replayPayload = {
      event_type: 'ORDER_CREATED',
      orderID: `GF-REPLAY-${Date.now()}`,
      items: [],
    };
    const replayBody = JSON.stringify(replayPayload);
    const replaySig = computeHmacSha256(replayBody, testSecret);

    const replayReq = new NextRequest(`http://localhost:3000/api/webhooks/channels/grabfood`, {
      method: 'POST',
      body: replayBody,
      headers: {
        'content-type': 'application/json',
        'x-grab-signature': replaySig,
        'x-grab-timestamp': expiredTimestamp,
      },
    });

    const replayRes = await handleWebhook(replayReq, { params: Promise.resolve({ channelCode: 'grabfood' }) });
    const replayData = await replayRes.json();

    recordTest(
      'Security/ReplayAttack',
      'Từ chối request Webhook có timestamp lệch quá 5 phút',
      replayRes.status === 400 && replayData.code === 'REPLAY_ATTACK_DETECTED',
      `HTTP Status: ${replayRes.status} | Code: ${replayData.code} | Message: ${replayData.message}`
    );

    // --------------------------------------------------------------------------
    // TEST 9: CHỐNG HOÀN KHO 2 LẦN KHI HỦY ĐƠN ĐỒNG THỜI (CONCURRENT CANCELLATION)
    // --------------------------------------------------------------------------
    console.log('\n--- TEST 9: Chống race condition hoàn kho 2 lần khi webhook hủy chạy đồng thời ---');
    const raceExtId = `GF-RACE-${Date.now()}`;
    const raceOrderPayload = {
      event_type: 'ORDER_CREATED',
      orderID: raceExtId,
      shortOrderNumber: `GFR-${raceExtId.slice(-4)}`,
      customer: { name: 'Khách Đua Lệnh', phone: '0988776655' },
      items: [
        { id: extItemId, name: `Món Grab: ${internalDish.name}`, price: internalDish.current_price, quantity: 1 },
      ],
    };

    const raceCreateBody = JSON.stringify(raceOrderPayload);
    const raceCreateTs = Math.floor(Date.now() / 1000).toString();
    const raceCreateSig = computeHmacSha256(raceCreateBody, testSecret);
    const raceCreateReq = new NextRequest(`http://localhost:3000/api/webhooks/channels/grabfood`, {
      method: 'POST',
      body: raceCreateBody,
      headers: {
        'content-type': 'application/json',
        'x-grab-signature': raceCreateSig,
        'x-grab-timestamp': raceCreateTs,
      },
    });
    await handleWebhook(raceCreateReq, { params: Promise.resolve({ channelCode: 'grabfood' }) });

    // Đẩy vào bếp
    const racePushRes = await salesChannelOrderService.pushOrderToKitchen(raceExtId);
    const stockBeforeRaceCancel = (await db.queryOne<{ stock_quantity: number }>(
      `SELECT stock_quantity FROM menu_items WHERE id = $1;`,
      [internalDish.id]
    ))!.stock_quantity;

    // Chạy đồng thời 2 lệnh hủy cùng lúc
    const [raceRes1, raceRes2] = await Promise.all([
      salesChannelOrderService.handleExternalCancellation('GRABFOOD', raceExtId, 'Đồng thời 1'),
      salesChannelOrderService.handleExternalCancellation('GRABFOOD', raceExtId, 'Đồng thời 2'),
    ]);

    const stockAfterRaceCancel = (await db.queryOne<{ stock_quantity: number }>(
      `SELECT stock_quantity FROM menu_items WHERE id = $1;`,
      [internalDish.id]
    ))!.stock_quantity;

    const raceLedgerCount = (await db.query<{ id: string }>(
      `SELECT id FROM inventory_ledger WHERE movement_type = 'RESTORE_ON_CANCEL' AND order_item_id IN (
        SELECT id FROM order_items WHERE order_id = $1
      );`,
      [racePushRes.internalOrderId]
    )).length;

    recordTest(
      'Concurrency/InventoryLock',
      'Xử lý hủy đồng thời chỉ hoàn kho đúng 1 lần duy nhất (Row Lock & Atomic Condition)',
      raceRes1.success && raceRes2.success && (stockAfterRaceCancel === stockBeforeRaceCancel + 1) && raceLedgerCount === 1,
      `Tồn kho ban đầu: ${stockBeforeRaceCancel} -> Sau hủy đồng thời: ${stockAfterRaceCancel} (+1 món). Số dòng ledger hoàn: ${raceLedgerCount}`
    );

    // --------------------------------------------------------------------------
    // TEST 10: XỬ LÝ LỖI ĐỒNG BỘ TRẠNG THÁI RA SÀN (FAIL-CLOSED STATUS SYNC)
    // --------------------------------------------------------------------------
    console.log('\n--- TEST 10: Đảm bảo khi đồng bộ sàn thất bại không cập nhật trạng thái sai trong DB ---');
    // Tạo 1 đơn giả định với channel chưa cấu hình credentials
    const noCredExtId = `GF-NOCRED-${Date.now()}`;
    const fakeOrder = await salesChannelOrderService.ingestOrder({
      channelCode: 'GRABFOOD',
      externalOrderId: noCredExtId,
      externalOrderCode: 'GF-NO-CRED',
      channelStatus: 'ACCEPTED',
      normalizedStatus: 'NEW',
      items: [
        { externalItemId: extItemId, externalItemName: 'Món Test', quantity: 1, unitPrice: 20000, subtotal: 20000 },
      ],
      totalAmount: 20000,
      platformFee: 0,
      netRevenue: 20000,
      idempotencyKey: `idemp_${noCredExtId}`,
      orderedAt: new Date(),
    });

    // Tạm xóa credentials để mô phỏng lỗi kết nối sàn
    await db.execute(`DELETE FROM channel_credentials WHERE channel_id = $1;`, [grabChannel.id]);

    const failedSyncResult = await salesChannelOrderService.updateOrderStatus(fakeOrder.orderId, 'CONFIRMED');

    // Kiểm tra trạng thái đơn trong DB: phải vẫn là 'NEW', không được đổi thành 'CONFIRMED'
    const unchangedOrder = await db.queryOne<{ normalized_status: string }>(
      `SELECT normalized_status FROM external_orders WHERE id = $1;`,
      [fakeOrder.orderId]
    );

    recordTest(
      'StatusSync/FailClosed',
      'Đồng bộ sàn lỗi thì trả về success: false và giữ nguyên trạng thái DB nội bộ',
      failedSyncResult.success === false && unchangedOrder?.normalized_status === 'NEW',
      `Kết quả API: success=${failedSyncResult.success} | Trạng thái DB: ${unchangedOrder?.normalized_status} (Không bị lệch với sàn)`
    );

    // Khôi phục lại credentials sau test để đảm bảo database sạch cho các test khác chạy lặp lại
    await db.execute(
      `INSERT INTO channel_credentials (
        id, channel_id, merchant_id, app_secret_encrypted, webhook_secret_encrypted, environment, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, 'SANDBOX', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);`,
      [crypto.randomUUID(), grabChannel.id, 'TEST-MER-GF-PHASE2', encryptSecret('mock_app_secret'), encryptSecret(testSecret)]
    );

  } catch (error: any) {
    console.error('Lỗi kiểm thử Giai đoạn 2:', error);
    recordTest('Critical', 'Phase 2 Test Failure', false, 'Gặp lỗi ngoại lệ trong kiểm thử', error);
  } finally {
    console.log('\n==============================================================================');
    console.log('📊 TỔNG HỢP KẾT QUẢ BỘ TEST GIAI ĐOẠN 2:');
    console.log('==============================================================================');
    const total = results.length;
    const passed = results.filter(r => r.passed).length;
    const failed = total - passed;
    console.log(`Tổng số bài test: ${total} | Đạt: ${passed} | Không đạt: ${failed}`);
    console.log('------------------------------------------------------------------------------');
    if (failed === 0) {
      console.log('🎉 100% CÁC BÀI TEST GIAI ĐOẠN 2 ĐÃ ĐẠT CHUẨN THÀNH CÔNG!');
    } else {
      console.log(`⚠️ Có ${failed} bài test chưa đạt. Vui lòng kiểm tra lại log.`);
    }
    console.log('==============================================================================\n');

    await closeDb();
    process.exit(results.some(r => !r.passed) ? 1 : 0);
  }
}

runPhase2Tests().catch(async (e) => {
  console.error(e);
  await closeDb();
  process.exit(1);
});
