/**
 * BỘ KIỂM THỬ GIAI ĐOẠN 3: ĐỒNG BỘ MENU, TỒN KHO & BÁO CÁO TÀI CHÍNH KÊNH BÁN HÀNG
 * 1. Tự động đồng bộ trạng thái hết món (stock = 0) sang sàn đối tác
 * 2. So khớp chênh lệch giá (Menu Diffs Engine)
 * 3. Kiểm soát đồng bộ Menu & Bảng giá có xác nhận người dùng (Safety Confirmation)
 * 4. Ép làm mới trạng thái tồn kho toàn kênh (Bulk Stock Sync)
 * 5. Báo cáo phân tích doanh thu, chiết khấu sàn & doanh thu thực nhận
 * 6. Xuất file đối soát doanh thu định dạng CSV chuẩn UTF-8
 * 7. Tích hợp báo cáo doanh thu chung nhà hàng (/api/reports/revenue)
 */

import { getDb, closeDb } from '../src/lib/db';
import { salesChannelOrderService } from '../src/lib/sales-channels/order-service';
import { GET as getMenuSyncDiffs, POST as syncMenu } from '../src/app/api/admin/channels/[channelCode]/menu/sync/route';
import { POST as syncStockBulk } from '../src/app/api/admin/channels/[channelCode]/menu/stock-sync/route';
import { GET as getReports } from '../src/app/api/admin/channels/reports/route';
import { GET as getRevenueReport } from '../src/app/api/reports/revenue/route';
import { signAuthToken } from '../src/lib/auth';
import { encryptSecret } from '../src/lib/crypto';
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

async function runPhase3Tests() {
  console.log('==============================================================================');
  console.log('🚀 BẮT ĐẦU KIỂM THỬ GIAI ĐOẠN 3: ĐỒNG BỘ MENU, TỒN KHO & BÁO CÁO TÀI CHÍNH');
  console.log('==============================================================================\n');

  const db = await getDb();

  try {
    // Lấy tài khoản Manager hợp lệ để ký token
    const managerUser = (await db.queryOne<{ id: string; username: string; display_name: string }>(
      `SELECT u.id, u.username, u.display_name FROM users u
       JOIN user_roles ur ON u.id = ur.user_id
       JOIN roles r ON ur.role_id = r.id
       WHERE r.code = 'manager' AND u.is_active = TRUE
       LIMIT 1;`
    )) || (await db.queryOne<{ id: string; username: string; display_name: string }>(
      `SELECT u.id, u.username, u.display_name FROM users u WHERE u.is_active = TRUE LIMIT 1;`
    ));

    const managerToken = await signAuthToken({
      userId: managerUser!.id,
      username: managerUser!.username,
      displayName: managerUser!.display_name,
      role: 'manager',
    });

    const grabChannel = await db.queryOne<{ id: string }>(`SELECT id FROM sales_channels WHERE code = 'GRABFOOD';`);
    if (!grabChannel) throw new Error('Không tìm thấy kênh GRABFOOD');

    // Kích hoạt kênh GRABFOOD và đảm bảo credentials tồn tại
    await db.execute(`UPDATE sales_channels SET is_active = TRUE, connection_status = 'CONNECTED' WHERE code = 'GRABFOOD';`);
    const encryptedSecret = encryptSecret('test_grab_secret_123');
    await db.execute(
      `INSERT INTO channel_credentials (
        id, channel_id, merchant_id, store_id, app_id, app_secret_encrypted, environment, created_at, updated_at
      ) VALUES ($1, $2, 'TEST-MER-GRAB', 'TEST-STORE-01', 'grab-app-id', $3, 'SANDBOX', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (channel_id) DO UPDATE SET app_secret_encrypted = EXCLUDED.app_secret_encrypted;`,
      [crypto.randomUUID(), grabChannel.id, encryptedSecret]
    );

    // Chuẩn bị món ăn thử nghiệm
    const testDish = await db.queryOne<{ id: string; name: string; current_price: number; stock_quantity: number }>(
      `SELECT id, name, current_price, stock_quantity FROM menu_items LIMIT 1;`
    );
    if (!testDish) throw new Error('Không tìm thấy món ăn trong menu');

    const extItemId = 'GF-P3-DISH-01';
    await db.execute(
      `DELETE FROM channel_menu_mappings WHERE channel_id = $1 AND (external_item_id = $2 OR internal_menu_item_id = $3);`,
      [grabChannel.id, extItemId, testDish.id]
    );

    const mappingId = crypto.randomUUID();
    await db.execute(
      `INSERT INTO channel_menu_mappings (
        id, channel_id, internal_menu_item_id, external_item_id, external_item_name,
        external_price, sync_stock, is_active, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, TRUE, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);`,
      [mappingId, grabChannel.id, testDish.id, extItemId, `Món Test P3: ${testDish.name}`, testDish.current_price]
    );

    // --------------------------------------------------------------------------
    // TEST 1: TỰ ĐỘNG ĐỒNG BỘ TRẠNG THÁI HẾT MÓN (STOCK = 0)
    // --------------------------------------------------------------------------
    console.log('--- TEST 1: Tự Động Đồng Bộ Trạng Thái Hết Món (stock = 0) ---');
    const syncStockRes = await salesChannelOrderService.syncMenuItemStock(testDish.id, 0, false);

    const latestStockLog = await db.queryOne<{ status: string; sync_type: string; request_data: string }>(
      `SELECT status, sync_type, request_data FROM sync_logs 
       WHERE channel_id = $1 AND sync_type = 'STOCK_SYNC' 
       ORDER BY created_at DESC LIMIT 1;`,
      [grabChannel.id]
    );

    recordTest(
      'StockSync/Auto',
      'Tự động đồng bộ tắt món khi tồn kho = 0',
      syncStockRes.success && syncStockRes.syncedChannels >= 1 && latestStockLog?.status === 'SUCCESS',
      `Đã đồng bộ sang ${syncStockRes.syncedChannels} kênh. Ghi log STOCK_SYNC thành công.`
    );

    // --------------------------------------------------------------------------
    // TEST 2: SO SÁNH CHÊNH LỆCH GIÁ (MENU DIFFS ENGINE)
    // --------------------------------------------------------------------------
    console.log('\n--- TEST 2: So Sánh Chênh Lệch Giá (Menu Diffs Engine) ---');
    // Thay đổi giá nội bộ trên menu_items để tạo chênh lệch
    const newPrice = testDish.current_price + 25000;
    await db.execute(`UPDATE menu_items SET current_price = $1 WHERE id = $2;`, [newPrice, testDish.id]);

    const reqDiff = new NextRequest(`http://localhost:3000/api/admin/channels/grabfood/menu/sync`, {
      headers: { 'Authorization': `Bearer ${managerToken}` },
    });
    const resDiff = await getMenuSyncDiffs(reqDiff, { params: Promise.resolve({ channelCode: 'grabfood' }) });
    const dataDiff = await resDiff.json();

    const targetDiff = (dataDiff.diffs || []).find((d: any) => d.mappingId === mappingId);

    recordTest(
      'MenuSync/DiffEngine',
      'Phát hiện chênh lệch giá giữa thực đơn nội bộ và sàn',
      Boolean(targetDiff && targetDiff.isPriceChanged === true && targetDiff.priceDiff === 25000),
      `Món [${testDish.name}]: Giá sàn cũ = ${targetDiff?.externalPrice} VND | Giá nội bộ mới = ${targetDiff?.internalPrice} VND | Chênh lệch = +${targetDiff?.priceDiff} VND.`
    );

    // --------------------------------------------------------------------------
    // TEST 3: KIỂM SOÁT ĐỒNG BỘ GIÁ & MENU CÓ XÁC NHẬN NGƯỜI DÙNG
    // --------------------------------------------------------------------------
    console.log('\n--- TEST 3: Kiểm Soát Đồng Bộ Menu Có Xác Nhận Người Dùng ---');
    // Trường hợp 1: Không có xác nhận (confirmed: false) -> BỊ TỪ CHỐI
    const reqUnconfirmed = new NextRequest(`http://localhost:3000/api/admin/channels/grabfood/menu/sync`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${managerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ confirmed: false }),
    });
    const resUnconfirmed = await syncMenu(reqUnconfirmed, { params: Promise.resolve({ channelCode: 'grabfood' }) });
    const dataUnconfirmed = await resUnconfirmed.json();

    // Trường hợp 2: Có xác nhận (confirmed: true) -> ĐỒNG BỘ THÀNH CÔNG
    const reqConfirmed = new NextRequest(`http://localhost:3000/api/admin/channels/grabfood/menu/sync`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${managerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ confirmed: true, mappingIds: [mappingId] }),
    });
    const resConfirmed = await syncMenu(reqConfirmed, { params: Promise.resolve({ channelCode: 'grabfood' }) });
    const dataConfirmed = await resConfirmed.json();

    // Kiểm tra DB xem giá sàn đã được cập nhật chưa
    const updatedMapping = await db.queryOne<{ external_price: number }>(
      `SELECT external_price FROM channel_menu_mappings WHERE id = $1;`,
      [mappingId]
    );

    recordTest(
      'MenuSync/ConfirmationRequired',
      'Chặn tự ý đổi giá và chỉ đồng bộ khi có xác nhận',
      resUnconfirmed.status === 400 && dataUnconfirmed.code === 'CONFIRMATION_REQUIRED' && dataConfirmed.success === true && updatedMapping?.external_price === newPrice,
      `Chưa xác nhận: HTTP 400 (${dataUnconfirmed.code}) | Sau khi xác nhận: Cập nhật giá sàn lên ${updatedMapping?.external_price} VND.`
    );

    // --------------------------------------------------------------------------
    // TEST 4: ÉP LÀM MỚI TỒN KHO TOÀN KÊNH (BULK STOCK SYNC)
    // --------------------------------------------------------------------------
    console.log('\n--- TEST 4: Ép Làm Mới Tồn Kho Toàn Kênh (Bulk Stock Sync) ---');
    const reqStockBulk = new NextRequest(`http://localhost:3000/api/admin/channels/grabfood/menu/stock-sync`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${managerToken}` },
    });
    const resStockBulk = await syncStockBulk(reqStockBulk, { params: Promise.resolve({ channelCode: 'grabfood' }) });
    const dataStockBulk = await resStockBulk.json();

    recordTest(
      'StockSync/Bulk',
      'Đồng bộ tồn kho toàn bộ món của kênh thành công',
      resStockBulk.status === 200 && dataStockBulk.success === true && dataStockBulk.data?.total >= 1,
      `Đã làm mới tồn kho cho ${dataStockBulk.data?.successCount}/${dataStockBulk.data?.total} món trên GrabFood.`
    );

    // --------------------------------------------------------------------------
    // TEST 5: BÁO CÁO PHÂN TÍCH DOANH THU & CHIẾT KHẤU SÀN (FINANCIAL ANALYTICS)
    // --------------------------------------------------------------------------
    console.log('\n--- TEST 5: Báo Cáo Phân Tích Doanh Thu & Chiết Khấu SÀN ---');
    const metrics = await salesChannelOrderService.getDashboardMetrics();

    const isFinancialConsistent = metrics.totalRevenue >= 0 &&
      metrics.totalPlatformFee >= 0 &&
      metrics.totalNetRevenue === (metrics.totalRevenue - metrics.totalPlatformFee);

    recordTest(
      'Analytics/Reconciliation',
      'Tổng hợp số liệu GMV, Chiết khấu sàn và Thực nhận ròng chính xác',
      isFinancialConsistent && metrics.averageCommissionRate >= 0,
      `GMV: ${metrics.totalRevenue} VND | Chiết khấu: ${metrics.totalPlatformFee} VND (${metrics.averageCommissionRate}%) | Thực nhận: ${metrics.totalNetRevenue} VND | AOV: ${metrics.averageOrderValue} VND.`
    );

    // --------------------------------------------------------------------------
    // TEST 6: XUẤT ĐỐI SOÁT DOANH THU ĐỊNH DẠNG CSV (UTF-8 BOM)
    // --------------------------------------------------------------------------
    console.log('\n--- TEST 6: Xuất Đối Soát Doanh Thu Định Dạng CSV ---');
    const reqCsv = new NextRequest('http://localhost:3000/api/admin/channels/reports?format=csv', {
      headers: { 'Authorization': `Bearer ${managerToken}` },
    });
    const resCsv = await getReports(reqCsv);
    const csvText = await resCsv.text();
    const contentType = resCsv.headers.get('Content-Type') || '';
    const isCsvValid = resCsv.status === 200 &&
      contentType.includes('text/csv') &&
      csvText.includes('BÁO CÁO ĐỐI SOÁT DOANH THU & CHIẾT KHẤU KÊNH BÁN HÀNG') &&
      csvText.includes('Chiết Khấu (VND)');

    recordTest(
      'Reports/CSV',
      'Xuất file đối soát CSV chuẩn UTF-8 cho kế toán',
      isCsvValid,
      `Độ dài file: ${csvText.length} bytes | Header text/csv: Hợp lệ.`
    );

    // --------------------------------------------------------------------------
    // TEST 7: TÍCH HỢP BÁO CÁO DOANH THU NHÀ HÀNG CHUNG (/api/reports/revenue)
    // --------------------------------------------------------------------------
    console.log('\n--- TEST 7: Tích Hợp Báo Cáo Doanh Thu Chung Nhà Hàng ---');
    const reqRevAll = new NextRequest('http://localhost:3000/api/reports/revenue', {
      headers: { 'Authorization': `Bearer ${managerToken}` },
    });
    const resRevAll = await getRevenueReport(reqRevAll);
    const dataRevAll = await resRevAll.json();

    const hasSummaryBreakdown = dataRevAll.summary &&
      typeof dataRevAll.summary.dineInRevenue === 'number' &&
      typeof dataRevAll.summary.onlineRevenue === 'number';

    recordTest(
      'UnifiedRevenue/Report',
      'Báo cáo doanh thu chung chứa đầy đủ đơn tại bàn và đơn sàn online',
      dataRevAll.success === true && hasSummaryBreakdown,
      `Tổng doanh thu: ${dataRevAll.summary?.totalRevenue} VND (Tại bàn: ${dataRevAll.summary?.dineInRevenue} VND, Online: ${dataRevAll.summary?.onlineRevenue} VND).`
    );

  } catch (error: any) {
    console.error('Lỗi kiểm thử Giai đoạn 3:', error);
    recordTest('Critical', 'Phase 3 Test Failure', false, 'Gặp lỗi ngoại lệ trong kiểm thử Giai đoạn 3', error);
  } finally {
    console.log('\n==============================================================================');
    console.log('📊 TỔNG HỢP KẾT QUẢ BỘ TEST GIAI ĐOẠN 3:');
    console.log('==============================================================================');
    const total = results.length;
    const passed = results.filter(r => r.passed).length;
    const failed = total - passed;
    console.log(`Tổng số bài test: ${total} | Đạt: ${passed} | Không đạt: ${failed}`);
    console.log('------------------------------------------------------------------------------');
    if (failed === 0) {
      console.log('🎉 100% CÁC BÀI TEST GIAI ĐOẠN 3 ĐÃ ĐẠT CHUẨN THÀNH CÔNG!');
    } else {
      console.log(`⚠️ Có ${failed} bài test chưa đạt. Vui lòng kiểm tra lại log.`);
    }
    console.log('==============================================================================\n');

    await closeDb();
    process.exit(results.some(r => !r.passed) ? 1 : 0);
  }
}

runPhase3Tests().catch(async (e) => {
  console.error(e);
  await closeDb();
  process.exit(1);
});
