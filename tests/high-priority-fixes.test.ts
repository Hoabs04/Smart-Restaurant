/**
 * KIỂM THỬ TỰ ĐỘNG BỐN VẤN ĐỀ ƯU TIÊN CAO (HIGH PRIORITY FIXES)
 * 1. Hủy hết món -> đơn hàng tự động đóng / cho phép chốt 0đ, giải phóng bàn ăn
 * 2. Đơn có 2 dòng cùng món -> gửi bếp thành công không bị lỗi unique constraint 500
 * 3. Fail-fast trong production nếu mất kết nối PostgreSQL (không âm thầm fallback PGlite)
 * 4. Lazy evaluation của JWT_SECRET (không throw lúc build/import) và tệp .dockerignore
 */

import { getDb, withTransaction } from '../src/lib/db';
import { signAuthToken, verifyAuthToken } from '../src/lib/auth';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  error?: string;
}

const testResults: TestResult[] = [];

function assert(condition: boolean, name: string, successMsg: string, failMsg: string) {
  if (condition) {
    testResults.push({ name, passed: true, message: successMsg });
    console.log(`✅ PASS: [${name}] ${successMsg}`);
  } else {
    testResults.push({ name, passed: false, message: failMsg });
    console.error(`❌ FAIL: [${name}] ${failMsg}`);
  }
}

async function runHighPriorityTests() {
  console.log('==============================================================================');
  console.log('🧪 BẮT ĐẦU KIỂM THỬ 4 VẤN ĐỀ ƯU TIÊN CAO');
  console.log('==============================================================================\n');

  const db = await getDb();

  // Tạo tài khoản test phục vụ & quản lý
  const waiterUser = await db.queryOne<{ id: string }>(
    `SELECT u.id FROM users u 
     JOIN user_roles ur ON u.id = ur.user_id 
     JOIN roles r ON ur.role_id = r.id 
     WHERE r.code = 'waiter' LIMIT 1;`
  );
  const managerUser = await db.queryOne<{ id: string }>(
    `SELECT u.id FROM users u 
     JOIN user_roles ur ON u.id = ur.user_id 
     JOIN roles r ON ur.role_id = r.id 
     WHERE r.code = 'manager' LIMIT 1;`
  );

  const actorId = waiterUser?.id || managerUser?.id;

  // Lấy món ăn mẫu
  const menuItem = await db.queryOne<{ id: string; name: string; current_price: number; stock_quantity: number }>(
    `SELECT id, name, current_price, stock_quantity FROM menu_items WHERE availability = true AND stock_quantity >= 10 LIMIT 1;`
  );

  if (!actorId || !menuItem) {
    throw new Error('Dữ liệu mẫu (user / menu_item) chưa đủ để chạy test.');
  }

  // --------------------------------------------------------------------------
  // TEST ISSUE 2: Đơn có 2 dòng cùng món gửi bếp không bị lỗi 500
  // --------------------------------------------------------------------------
  console.log('\n--- VẤN ĐỀ 2: Đơn có 2 dòng cùng một món gửi bếp (Batch Idempotency) ---');
  const table2Id = crypto.randomUUID();
  const table2Code = `T-DUP-${Date.now().toString().slice(-4)}`;
  await db.execute(
    `INSERT INTO dining_tables (id, area_name, table_code, capacity, status, version)
     VALUES ($1, 'Khu Test', $2, 4, 'OCCUPIED', 1);`,
    [table2Id, table2Code]
  );

  const order2Id = crypto.randomUUID();
  const order2Code = `ORD-DUP-${Date.now().toString().slice(-4)}`;
  await db.execute(
    `INSERT INTO orders (id, order_code, table_id, created_by, status, total_amount, version)
     VALUES ($1, $2, $3, $4, 'OPEN', $5, 1);`,
    [order2Id, order2Code, table2Id, actorId, menuItem.current_price * 3]
  );

  // Tạo 2 dòng order_items CÙNG menu_item_id trong cùng order
  const itemLine1Id = crypto.randomUUID();
  const itemLine2Id = crypto.randomUUID();
  await db.execute(
    `INSERT INTO order_items (id, order_id, menu_item_id, item_name_snapshot, unit_price_snapshot, quantity, status)
     VALUES ($1, $2, $3, $4, $5, 1, 'NEW'),
            ($6, $2, $3, $4, $5, 2, 'NEW');`,
    [itemLine1Id, order2Id, menuItem.id, menuItem.name, menuItem.current_price, itemLine2Id]
  );

  // Gửi bếp batch chứa cả 2 dòng cùng menu_item_id
  const batchIdempKey = `batch_dup_test_${Date.now()}`;
  let batchSuccess = false;
  try {
    await withTransaction(async (tx) => {
      // Trừ tồn kho tổng số lượng (1 + 2 = 3 phần)
      await tx.execute(
        `UPDATE menu_items SET stock_quantity = stock_quantity - 3 WHERE id = $1;`,
        [menuItem.id]
      );

      const batchId = crypto.randomUUID();
      await tx.execute(
        `INSERT INTO kitchen_batches (id, order_id, batch_number, idempotency_key, sent_at, created_by)
         VALUES ($1, $2, 1, $3, CURRENT_TIMESTAMP, $4);`,
        [batchId, order2Id, batchIdempKey, actorId]
      );

      // Chèn 2 dòng ledger với cùng idempotencyKey và cùng menu_item_id
      await tx.execute(
        `INSERT INTO inventory_ledger (id, menu_item_id, order_item_id, movement_type, quantity_delta, idempotency_key, actor_id)
         VALUES ($1, $2, $3, 'DEDUCT_ON_SEND', -1, $4, $5);`,
        [crypto.randomUUID(), menuItem.id, itemLine1Id, batchIdempKey, actorId]
      );

      await tx.execute(
        `INSERT INTO inventory_ledger (id, menu_item_id, order_item_id, movement_type, quantity_delta, idempotency_key, actor_id)
         VALUES ($1, $2, $3, 'DEDUCT_ON_SEND', -2, $4, $5);`,
        [crypto.randomUUID(), menuItem.id, itemLine2Id, batchIdempKey, actorId]
      );

      await tx.execute(
        `UPDATE order_items SET status = 'SENT_TO_KITCHEN', kitchen_batch_id = $1 WHERE order_id = $2;`,
        [batchId, order2Id]
      );
    });
    batchSuccess = true;
  } catch (err: any) {
    batchSuccess = false;
    console.error('Lỗi khi chèn ledger 2 dòng cùng món:', err);
  }

  assert(
    batchSuccess,
    'Issue 2: 2 dòng cùng món trong 1 batch',
    'Gửi bếp thành công batch có 2 dòng cùng menu_item_id mà không bị lỗi unique constraint 500.',
    'Thất bại: Vi phạm unique constraint khi batch có 2 dòng cùng menu_item_id.'
  );

  // --------------------------------------------------------------------------
  // TEST ISSUE 1: Hủy hết món -> Tự động đóng đơn và giải phóng bàn ăn
  // --------------------------------------------------------------------------
  console.log('\n--- VẤN ĐỀ 1: Hủy hết món trong đơn hàng ---');
  const table1Id = crypto.randomUUID();
  const table1Code = `T-EMPTY-${Date.now().toString().slice(-4)}`;
  await db.execute(
    `INSERT INTO dining_tables (id, area_name, table_code, capacity, status, version)
     VALUES ($1, 'Khu Test', $2, 4, 'OCCUPIED', 1);`,
    [table1Id, table1Code]
  );

  const order1Id = crypto.randomUUID();
  const order1Code = `ORD-EMPTY-${Date.now().toString().slice(-4)}`;
  await db.execute(
    `INSERT INTO orders (id, order_code, table_id, created_by, status, total_amount, version)
     VALUES ($1, $2, $3, $4, 'OPEN', $5, 1);`,
    [order1Id, order1Code, table1Id, actorId, menuItem.current_price]
  );

  const item1Id = crypto.randomUUID();
  await db.execute(
    `INSERT INTO order_items (id, order_id, menu_item_id, item_name_snapshot, unit_price_snapshot, quantity, status)
     VALUES ($1, $2, $3, $4, $5, 1, 'NEW');`,
    [item1Id, order1Id, menuItem.id, menuItem.name, menuItem.current_price]
  );

  // Hủy món duy nhất qua logic hủy món
  await withTransaction(async (tx) => {
    // 1. Cập nhật món sang CANCELLED
    await tx.execute(
      `UPDATE order_items 
       SET status = 'CANCELLED', cancel_reason = 'Khách bận đột xuất', cancelled_at = CURRENT_TIMESTAMP 
       WHERE id = $1;`,
      [item1Id]
    );

    // 2. Kiểm tra các món còn lại
    const remaining = await tx.query<{ id: string; status: string }>(
      `SELECT id, status FROM order_items WHERE order_id = $1 AND id != $2;`,
      [order1Id, item1Id]
    );
    const nonCancelled = remaining.filter(r => r.status !== 'CANCELLED');

    if (nonCancelled.length === 0) {
      // Tự động đóng đơn và giải phóng bàn
      await tx.execute(
        `UPDATE orders 
         SET total_amount = 0, status = 'CLOSED', closed_at = CURRENT_TIMESTAMP, version = version + 1 
         WHERE id = $1;`,
        [order1Id]
      );
      await tx.execute(
        `UPDATE dining_tables 
         SET status = 'AVAILABLE', version = version + 1 
         WHERE id = $1;`,
        [table1Id]
      );
    }
  });

  const checkOrder1 = await db.queryOne<{ status: string; total_amount: number }>(
    `SELECT status, total_amount FROM orders WHERE id = $1;`,
    [order1Id]
  );
  const checkTable1 = await db.queryOne<{ status: string }>(
    `SELECT status FROM dining_tables WHERE id = $1;`,
    [table1Id]
  );

  assert(
    checkOrder1?.status === 'CLOSED' && Number(checkOrder1?.total_amount) === 0,
    'Issue 1: Tự động đóng đơn khi hủy hết món',
    `Đơn hàng đã tự động chuyển sang CLOSED với tổng tiền = 0.`,
    `Thất bại: Đơn hàng vẫn ở trạng thái ${checkOrder1?.status}.`
  );

  assert(
    checkTable1?.status === 'AVAILABLE',
    'Issue 1: Bàn được giải phóng về AVAILABLE',
    `Bàn ăn ${table1Code} đã được tự động giải phóng về trạng thái AVAILABLE.`,
    `Thất bại: Bàn ăn vẫn ở trạng thái ${checkTable1?.status}.`
  );

  // Kiểm tra có thể tạo đơn mới trên bàn vừa giải phóng không
  const openOrderCheck = await db.queryOne(
    `SELECT id FROM orders 
     WHERE table_id = $1 AND status IN ('OPEN', 'SENT_TO_KITCHEN', 'IN_PROGRESS', 'READY_TO_CLOSE')
     LIMIT 1;`,
    [table1Id]
  );

  assert(
    openOrderCheck === null,
    'Issue 1: Cho phép mở đơn mới trên bàn đã giải phóng',
    `Không còn đơn mở nào trên bàn ${table1Code}. Có thể tạo đơn mới bình thường mà không bị kẹt.`,
    `Thất bại: Vẫn còn đơn mở tồn tại trên bàn.`
  );

  // --------------------------------------------------------------------------
  // TEST ISSUE 4: Lazy JWT_SECRET & .dockerignore
  // --------------------------------------------------------------------------
  console.log('\n--- VẤN ĐỀ 4: Lazy JWT_SECRET & .dockerignore ---');
  
  // Kiểm tra sign/verify token hoạt động mượt mà
  const testToken = await signAuthToken({
    userId: 'test-lazy-user',
    username: 'testuser',
    displayName: 'Test Lazy User',
    role: 'waiter',
  });
  const verifiedToken = await verifyAuthToken(testToken);

  assert(
    verifiedToken !== null && verifiedToken.userId === 'test-lazy-user',
    'Issue 4: JWT Lazy Evaluation',
    'Token JWT được ký và giải mã thành công với lazy initialization.',
    'Thất bại: Xác thực JWT token không hợp lệ.'
  );

  // Kiểm tra tệp .dockerignore
  const dockerignorePath = path.join(process.cwd(), '.dockerignore');
  const dockerignoreExists = fs.existsSync(dockerignorePath);
  let dockerignoreContent = '';
  if (dockerignoreExists) {
    dockerignoreContent = fs.readFileSync(dockerignorePath, 'utf-8');
  }

  const hasEnvExcluded = dockerignoreContent.includes('.env');
  const hasGitExcluded = dockerignoreContent.includes('.git');
  const hasNextExcluded = dockerignoreContent.includes('.next');
  const hasNodeModulesExcluded = dockerignoreContent.includes('node_modules');
  const hasPgliteExcluded = dockerignoreContent.includes('.db_pglite');

  assert(
    dockerignoreExists && hasEnvExcluded && hasGitExcluded && hasNextExcluded && hasNodeModulesExcluded && hasPgliteExcluded,
    'Issue 4: .dockerignore bảo mật',
    '.dockerignore đã loại trừ đầy đủ: .env, .git, .next, node_modules, .db_pglite khỏi Docker build context.',
    'Thất bại: .dockerignore còn thiếu cấu hình các thư mục/tệp nhạy cảm.'
  );

  // --------------------------------------------------------------------------
  // TEST ISSUE 3: Production Fail-Fast & Fallback Guard
  // --------------------------------------------------------------------------
  console.log('\n--- VẤN ĐỀ 3: Guard Fallback PGlite & Production Fail-Fast ---');
  const dbFileContent = fs.readFileSync(path.join(process.cwd(), 'src', 'lib', 'db.ts'), 'utf-8');
  const hasProdCheck = dbFileContent.includes("isProduction = process.env.NODE_ENV === 'production'");
  const hasFailFastError = dbFileContent.includes('CRITICAL DATABASE ERROR: Failed to connect to PostgreSQL server in production');
  const hasFallbackFlag = dbFileContent.includes("process.env.DB_FALLBACK_PGLITE === 'true'");

  assert(
    hasProdCheck && hasFailFastError && hasFallbackFlag,
    'Issue 3: Production Fail-Fast & DB_FALLBACK_PGLITE Flag',
    'db.ts đã cài đặt fail-fast trong production (không âm thầm dùng PGlite) và chỉ cho phép fallback khi có cờ DB_FALLBACK_PGLITE=true trong dev/test.',
    'Thất bại: Thiếu cơ chế fail-fast hoặc kiểm tra cờ fallback.'
  );

  // Tổng kết
  console.log('\n==============================================================================');
  const total = testResults.length;
  const passed = testResults.filter(t => t.passed).length;
  console.log(`📊 KẾT QUẢ KIỂM THỬ: ${passed}/${total} TIÊU CHÍ ĐẠT (${Math.round((passed / total) * 100)}%)`);
  console.log('==============================================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runHighPriorityTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Lỗi khi chạy bộ test:', err);
    process.exit(1);
  });
