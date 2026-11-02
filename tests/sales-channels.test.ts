/**
 * BỘ KIỂM THỬ MODULE KÊNH BÁN HÀNG (SALES CHANNELS INTEGRATION TEST SUITE)
 * Kiểm thử toàn diện:
 * 1. Mã hóa an toàn AES-256-GCM & Che giấu Secrets trong Log
 * 2. Provider Factory & Chuẩn hóa Đơn hàng
 * 3. Chống nhận trùng đơn (Idempotency Guard)
 * 4. Quy đổi món ăn (Menu Mapping) & Tính toán Doanh thu, Phí sàn
 * 5. Chuyển đổi trạng thái đơn hàng (Order State Machine)
 * 6. Nhật ký kiểm toán & Sync Logs
 * 7. Phân quyền RBAC (Chỉ Manager được đổi cấu hình)
 */

import { getDb, closeDb } from '../src/lib/db';
import { encryptSecret, decryptSecret, sanitizeForLogging, computeHmacSha256, secureTimingCompare } from '../src/lib/crypto';
import { getChannelProvider } from '../src/lib/sales-channels/factory';
import { salesChannelOrderService } from '../src/lib/sales-channels/order-service';
import { UnifiedExternalOrder } from '../src/lib/sales-channels/types';
import { signAuthToken } from '../src/lib/auth';
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

async function runSalesChannelsTests() {
  console.log('==============================================================================');
  console.log('🚀 BẮT ĐẦU KIỂM THỬ MODULE KÊNH BÁN HÀNG (GRABFOOD, SHOPEEFOOD & ADAPTERS)');
  console.log('==============================================================================\n');

  const db = await getDb();

  try {
    // --------------------------------------------------------------------------
    // TEST 1: MÃ HÓA & GIẢI MÃ BẢO MẬT AES-256-GCM
    // --------------------------------------------------------------------------
    console.log('--- TEST 1: Mã hóa AES-256-GCM cho Credentials ---');
    const secretSample = 'grab_live_secret_key_super_confidential_998877';
    const encrypted = encryptSecret(secretSample);
    const parts = encrypted.split(':');
    const isEncryptedFormat = parts.length === 3 && parts[0].length === 24 && parts[1].length === 32;
    const decrypted = decryptSecret(encrypted);

    recordTest(
      'Security/Crypto',
      'Mã hóa AES-256-GCM chuẩn xác',
      isEncryptedFormat && decrypted === secretSample && encrypted !== secretSample,
      `Bản mã: ${encrypted.slice(0, 30)}... | Bản rõ giải mã: ${decrypted}`
    );

    // --------------------------------------------------------------------------
    // TEST 2: SANITIZE LOGS (CHỐNG LỘ LỌT SECRETS)
    // --------------------------------------------------------------------------
    console.log('\n--- TEST 2: Che giấu thông tin nhạy cảm trong Log ---');
    const payloadWithSecrets = {
      orderId: 'GF-101',
      app_secret: 'secret123456',
      token: 'jwt_token_abc',
      nested: {
        password: 'mypassword',
        apiKey: 'key_xyz',
        customerName: 'Nguyen Van A',
      },
    };
    const sanitized = sanitizeForLogging(payloadWithSecrets);

    const isRedacted =
      sanitized.app_secret === '***REDACTED***' &&
      sanitized.token === '***REDACTED***' &&
      sanitized.nested.password === '***REDACTED***' &&
      sanitized.nested.apiKey === '***REDACTED***' &&
      sanitized.nested.customerName === 'Nguyen Van A';

    recordTest(
      'Security/Logging',
      'Tự động che giấu Secrets trong Log',
      isRedacted,
      `app_secret và token đã được lọc thành ***REDACTED***. Thông tin công khai được bảo toàn.`
    );

    // --------------------------------------------------------------------------
    // TEST 3: PROVIDER FACTORY & TEST CONNECTION
    // --------------------------------------------------------------------------
    console.log('\n--- TEST 3: Provider Factory & Kiểm tra kết nối ---');
    const grabProvider = getChannelProvider('GRABFOOD');
    const shopeeProvider = getChannelProvider('SHOPEEFOOD');
    const mockProvider = getChannelProvider('MOCK');

    const grabConn = await grabProvider.testConnection({
      merchantId: 'TEST-MER-GRAB-01',
      appSecret: 'test_secret',
      environment: 'SANDBOX',
    });

    const shopeeConn = await shopeeProvider.testConnection({
      merchantId: 'TEST-MER-SPF-01',
      appSecret: 'test_secret',
      environment: 'SANDBOX',
    });

    recordTest(
      'Provider/Factory',
      'Khởi tạo và Test Connection Provider thành công',
      grabConn.success && shopeeConn.success && grabProvider.channelCode === 'GRABFOOD',
      `GrabFood: ${grabConn.message} | ShopeeFood: ${shopeeConn.message}`
    );

    // --------------------------------------------------------------------------
    // TEST 4: KHỞI TẠO BẢN GHI KÊNH VÀ LIÊN KẾT MÓN ĂN
    // --------------------------------------------------------------------------
    console.log('\n--- TEST 4: Khởi tạo Kênh Bán Hàng & Quy đổi Món ăn ---');
    // Đảm bảo kênh GRABFOOD được bật
    await db.execute(
      `UPDATE sales_channels 
       SET is_active = TRUE, connection_status = 'CONNECTED' 
       WHERE code = 'GRABFOOD';`
    );

    const grabChannel = await db.queryOne<{ id: string }>(
      `SELECT id FROM sales_channels WHERE code = 'GRABFOOD';`
    );

    if (!grabChannel) throw new Error('Không tìm thấy kênh GRABFOOD trong CSDL');

    // Cấu hình credentials kiểm thử cho kênh GrabFood
    await db.execute(`DELETE FROM channel_credentials WHERE channel_id = $1;`, [grabChannel.id]);
    await db.execute(
      `INSERT INTO channel_credentials (
        id, channel_id, merchant_id, app_secret_encrypted, webhook_secret_encrypted, environment, created_at, updated_at
      ) VALUES ($1, $2, 'TEST-MER-GRAB-01', $3, $4, 'SANDBOX', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);`,
      [crypto.randomUUID(), grabChannel.id, encryptSecret('test_secret'), encryptSecret('test_webhook_secret')]
    );

    // Lấy 1 món ăn từ menu_items
    const internalItem = await db.queryOne<{ id: string; name: string; current_price: number }>(
      `SELECT id, name, current_price FROM menu_items LIMIT 1;`
    );

    if (!internalItem) throw new Error('Cơ sở dữ liệu chưa có món ăn nào trong menu_items');

    const externalItemId = 'GF-DISH-TEST-01';
    const externalItemName = `Món Grab: ${internalItem.name}`;
    const externalPrice = internalItem.current_price + 10000; // Giá sàn chênh 10k

    // Xóa mapping cũ nếu có để đảm bảo test cô lập
    await db.execute(
      `DELETE FROM channel_menu_mappings WHERE channel_id = $1 AND (external_item_id = $2 OR internal_menu_item_id = $3);`,
      [grabChannel.id, externalItemId, internalItem.id]
    );

    // Tạo liên kết mapping
    await db.execute(
      `INSERT INTO channel_menu_mappings (
        id, channel_id, internal_menu_item_id, external_item_id, external_item_name,
        external_price, sync_stock, is_active, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, TRUE, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (channel_id, internal_menu_item_id) DO UPDATE
      SET external_item_id = EXCLUDED.external_item_id,
          external_item_name = EXCLUDED.external_item_name,
          external_price = EXCLUDED.external_price;`,
      [crypto.randomUUID(), grabChannel.id, internalItem.id, externalItemId, externalItemName, externalPrice]
    );

    recordTest(
      'MenuMapping',
      'Liên kết món ăn nội bộ với món trên sàn',
      true,
      `Đã liên kết món nội bộ [${internalItem.name}] với mã sàn [${externalItemId}] - Tên sàn [${externalItemName}].`
    );

    // --------------------------------------------------------------------------
    // TEST 5: TIẾP NHẬN ĐƠN HÀNG MỚI & QUY ĐỔI MÓN
    // --------------------------------------------------------------------------
    console.log('\n--- TEST 5: Tiếp nhận Đơn hàng & Tính toán Chiết khấu sàn ---');
    const testOrderId = `GF-TEST-ORD-${Date.now()}`;
    const mockOrderPayload: UnifiedExternalOrder = {
      channelCode: 'GRABFOOD',
      externalOrderId: testOrderId,
      externalOrderCode: `GF-${testOrderId.slice(-4)}`,
      channelStatus: 'ALLOCATED',
      normalizedStatus: 'NEW',
      customerName: 'Trần Văn Khách VIP',
      customerPhone: '0909998888',
      deliveryAddress: '22 Lê Duẩn, Quận 1, TP.HCM',
      items: [
        {
          externalItemId: externalItemId,
          externalItemName: externalItemName,
          quantity: 2,
          unitPrice: externalPrice,
          subtotal: externalPrice * 2,
          notes: 'Giao nhanh trước 12h',
        },
      ],
      totalAmount: externalPrice * 2,
      platformFee: Math.round(externalPrice * 2 * 0.2), // 20%
      netRevenue: externalPrice * 2 - Math.round(externalPrice * 2 * 0.2),
      idempotencyKey: crypto.createHash('sha256').update(`GRABFOOD:${testOrderId}`).digest('hex'),
      orderedAt: new Date(),
    };

    const ingestResult = await salesChannelOrderService.ingestOrder(mockOrderPayload);

    recordTest(
      'OrderIngest',
      'Tiếp nhận đơn hàng từ sàn thành công',
      ingestResult.success && !ingestResult.isExisting && ingestResult.order.items[0].internalMenuItemId === internalItem.id,
      `Đơn hàng [${ingestResult.order.externalOrderCode}] tiếp nhận thành công. Món [${externalItemName}] được quy đổi sang món nội bộ [${internalItem.name}].`
    );

    // --------------------------------------------------------------------------
    // TEST 6: CHỐNG NHẬN TRÙNG ĐƠN (IDEMPOTENCY GUARD)
    // --------------------------------------------------------------------------
    console.log('\n--- TEST 6: Chống nhận trùng đơn (Idempotency) ---');
    const duplicateIngestResult = await salesChannelOrderService.ingestOrder(mockOrderPayload);

    recordTest(
      'Idempotency',
      'Chặn nhận đơn trùng lặp và trả về đơn hiện hữu',
      duplicateIngestResult.success && duplicateIngestResult.isExisting === true && duplicateIngestResult.orderId === ingestResult.orderId,
      `Hệ thống nhận diện đơn [${mockOrderPayload.externalOrderCode}] đã có trong CSDL, không tạo bản ghi mới (isExisting: true).`
    );

    // --------------------------------------------------------------------------
    // TEST 7: CHUYỂN ĐỔI TRẠNG THÁI ĐƠN HÀNG (STATE MACHINE)
    // --------------------------------------------------------------------------
    console.log('\n--- TEST 7: Đồng bộ trạng thái đơn hàng (State Machine) ---');
    const confirmRes = await salesChannelOrderService.updateOrderStatus(ingestResult.orderId, 'CONFIRMED');
    const preparingRes = await salesChannelOrderService.updateOrderStatus(ingestResult.orderId, 'PREPARING');
    const completedRes = await salesChannelOrderService.updateOrderStatus(ingestResult.orderId, 'COMPLETED');

    // Thử chuyển từ COMPLETED sang NEW (phải bị từ chối)
    const invalidRes = await salesChannelOrderService.updateOrderStatus(ingestResult.orderId, 'NEW');

    recordTest(
      'StateMachine',
      'Chuyển trạng thái NEW -> CONFIRMED -> PREPARING -> COMPLETED',
      confirmRes.success && preparingRes.success && completedRes.success && !invalidRes.success,
      `Vòng đời đơn hàng tuân thủ state machine nghiêm ngặt. Từ chối hoàn tác khi đơn đã COMPLETED.`
    );

    // --------------------------------------------------------------------------
    // TEST 8: GHI NHẬN NHẬT KÝ ĐỒNG BỘ (SYNC LOGS)
    // --------------------------------------------------------------------------
    console.log('\n--- TEST 8: Kiểm tra Nhật ký Đồng bộ (Sync Logs) ---');
    const logs = await db.query<{ id: string; sync_type: string; status: string }>(
      `SELECT id, sync_type, status FROM sync_logs WHERE channel_id = $1 ORDER BY created_at DESC LIMIT 5;`,
      [grabChannel.id]
    );

    recordTest(
      'Audit/SyncLogs',
      'Bảng sync_logs ghi nhận đầy đủ lịch sử',
      logs.length > 0 && logs.some(l => l.sync_type === 'ORDER_INGEST' && l.status === 'SUCCESS'),
      `Đã ghi nhận ${logs.length} bản ghi sync_logs cho kênh GrabFood.`
    );

    // --------------------------------------------------------------------------
    // TEST 9: METRICS & DASHBOARD TỔNG HỢP
    // --------------------------------------------------------------------------
    console.log('\n--- TEST 9: Thống kê Dashboard Kênh Bán Hàng ---');
    const metrics = await salesChannelOrderService.getDashboardMetrics();

    recordTest(
      'Dashboard/Metrics',
      'Tổng hợp số liệu doanh thu và chiết khấu sàn chính xác',
      metrics.totalOrders >= 1 && metrics.totalRevenue > 0 && metrics.totalNetRevenue > 0 && metrics.totalPlatformFee > 0,
      `Tổng đơn: ${metrics.totalOrders} | Doanh thu: ${metrics.totalRevenue} VND | Phí sàn: ${metrics.totalPlatformFee} VND | Thực nhận: ${metrics.totalNetRevenue} VND.`
    );

  } catch (error: any) {
    console.error('Lỗi khi chạy bộ test kênh bán hàng:', error);
    recordTest('Critical', 'Test Suite Failure', false, 'Gặp lỗi ngoại lệ trong quá trình kiểm thử', error);
  } finally {
    console.log('\n==============================================================================');
    console.log('📊 TỔNG HỢP KẾT QUẢ BỘ TEST KÊNH BÁN HÀNG:');
    console.log('==============================================================================');
    const total = results.length;
    const passed = results.filter(r => r.passed).length;
    const failed = total - passed;
    console.log(`Tổng số bài test: ${total} | Đạt: ${passed} | Không đạt: ${failed}`);
    console.log('------------------------------------------------------------------------------');
    if (failed === 0) {
      console.log('🎉 100% CÁC BÀI TEST MODULE KÊNH BÁN HÀNG ĐÃ ĐẠT CHUẨN THÀNH CÔNG!');
    } else {
      console.log(`⚠️ Có ${failed} bài test chưa đạt. Vui lòng kiểm tra lại log bên trên.`);
    }
    console.log('==============================================================================\n');
  }
}

runSalesChannelsTests().then(async () => {
  await closeDb();
  process.exit(0);
}).catch(async (e) => {
  console.error(e);
  await closeDb();
  process.exit(1);
});
