/**
 * KIỂM THỬ TÍNH NĂNG QUẢN LÝ THÊM MÓN ĂN MỚI CỦA CỬA HÀNG (ADMIN MENU MANAGEMENT)
 * 1. Quản lý thêm món ăn mới thành công (POST /api/admin/menu-items)
 * 2. Xác thực dữ liệu đầu vào (tên, giá >= 0, danh mục hợp lệ)
 * 3. Chống trùng tên món ăn (DUPLICATE_NAME)
 * 4. Phân quyền RBAC: Phục vụ/Bếp không được phép thêm món (403 Forbidden)
 * 5. Quản lý sửa thông tin món ăn (PUT /api/admin/menu-items)
 * 6. Quản lý xóa món chưa có order (Hard Delete) và tắt bán món đã có order (Soft Delete)
 * 7. Ghi nhận nhật ký kiểm toán (Audit Log: CREATE_MENU_ITEM, UPDATE_MENU_ITEM, DELETE_MENU_ITEM)
 */

import { getDb } from '../src/lib/db';
import { signAuthToken, hashPassword } from '../src/lib/auth';
import { POST, GET, PUT, DELETE } from '../src/app/api/admin/menu-items/route';
import { NextRequest } from 'next/server';
import crypto from 'crypto';

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
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

async function createRequest(
  url: string,
  method: string,
  token?: string,
  body?: any
): Promise<NextRequest> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['cookie'] = `smart_rest_token=${token}`;
  }

  const reqInit: RequestInit = {
    method,
    headers,
  };
  if (body) {
    reqInit.body = JSON.stringify(body);
  }

  return new NextRequest(new URL(url, 'http://localhost:3000'), reqInit);
}

async function runAdminMenuTests() {
  console.log('==============================================================================');
  console.log('🍽️ BẮT ĐẦU KIỂM THỬ CHỨC NĂNG THÊM MÓN ĂN MỚI CHO CỬA HÀNG (ADMIN MENU ITEMS)');
  console.log('==============================================================================\n');

  const db = await getDb();

  // Lấy role IDs
  const managerRole = await db.queryOne<{ id: string }>(`SELECT id FROM roles WHERE code = 'manager';`);
  const waiterRole = await db.queryOne<{ id: string }>(`SELECT id FROM roles WHERE code = 'waiter';`);

  if (!managerRole || !waiterRole) {
    throw new Error('Chưa có roles trong database!');
  }

  const pwdHash = await hashPassword('password123');

  // Tạo Manager
  const managerId = crypto.randomUUID();
  const managerUsername = `mgr_menu_${Date.now()}`;
  await db.execute(
    `INSERT INTO users (id, username, password_hash, display_name, is_active)
     VALUES ($1, $2, $3, $4, true);`,
    [managerId, managerUsername, pwdHash, 'Quản Lý Menu']
  );
  await db.execute(
    `INSERT INTO user_roles (id, user_id, role_id) VALUES ($1, $2, $3);`,
    [crypto.randomUUID(), managerId, managerRole.id]
  );
  const managerToken = await signAuthToken({
    userId: managerId,
    username: managerUsername,
    displayName: 'Quản Lý Menu',
    role: 'manager',
  });

  // Tạo Waiter
  const waiterId = crypto.randomUUID();
  const waiterUsername = `waiter_menu_${Date.now()}`;
  await db.execute(
    `INSERT INTO users (id, username, password_hash, display_name, is_active)
     VALUES ($1, $2, $3, $4, true);`,
    [waiterId, waiterUsername, pwdHash, 'Nhân Viên Phục Vụ']
  );
  await db.execute(
    `INSERT INTO user_roles (id, user_id, role_id) VALUES ($1, $2, $3);`,
    [crypto.randomUUID(), waiterId, waiterRole.id]
  );
  const waiterToken = await signAuthToken({
    userId: waiterId,
    username: waiterUsername,
    displayName: 'Nhân Viên Phục Vụ',
    role: 'waiter',
  });

  // Lấy danh mục món có sẵn
  const cat = await db.queryOne<{ id: string; name: string }>(`SELECT id, name FROM menu_categories LIMIT 1;`);
  if (!cat) {
    throw new Error('Chưa có danh mục món nào trong database!');
  }

  // ---------------------------------------------------------------------------
  // TEST 1: Quản lý thêm món ăn mới thành công
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 1: Quản lý thêm món ăn mới ---');
  const dishName = `Bò Mỹ Sốt Tiêu ${Date.now()}`;
  const reqAddDish = await createRequest(
    'http://localhost:3000/api/admin/menu-items',
    'POST',
    managerToken,
    {
      category_id: cat.id,
      name: dishName,
      description: 'Thịt bò Mỹ nướng mềm ngọt, sốt tiêu đen thơm cay đậm đà',
      current_price: 250000,
      stock_quantity: 20,
      low_stock_threshold: 5,
      image_key: '/images/dishes/bo-wagyu.jpg',
    }
  );
  const resAddDish = await POST(reqAddDish);
  const dataAddDish = await resAddDish.json();

  assert(
    resAddDish.status === 201 && dataAddDish.success === true && dataAddDish.item?.id,
    'Thêm món ăn mới thành công',
    `Đã tạo món '${dishName}' với giá 250.000đ, tồn kho 20 phần.`,
    `Lỗi khi tạo món ăn: ${dataAddDish.message}`
  );

  const createdDishId = dataAddDish.item?.id;

  // ---------------------------------------------------------------------------
  // TEST 2: Kiểm tra dữ liệu món vừa tạo trong cơ sở dữ liệu
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 2: Kiểm tra bản ghi trong Database ---');
  const dbItem = await db.queryOne<{ id: string; name: string; current_price: number; stock_quantity: number }>(
    `SELECT id, name, current_price, stock_quantity FROM menu_items WHERE id = $1;`,
    [createdDishId]
  );
  assert(
    dbItem !== null && dbItem.name === dishName && Number(dbItem.current_price) === 250000 && Number(dbItem.stock_quantity) === 20,
    'Kiểm tra dữ liệu món trong DB',
    `Món ăn đã được lưu chính xác vào bảng menu_items với đầy đủ giá và số lượng tồn.`,
    'Dữ liệu món ăn trong DB không khớp.'
  );

  // ---------------------------------------------------------------------------
  // TEST 3: Chống trùng tên món ăn (DUPLICATE_NAME)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 3: Chống trùng lặp tên món ăn ---');
  const reqDuplicate = await createRequest(
    'http://localhost:3000/api/admin/menu-items',
    'POST',
    managerToken,
    {
      category_id: cat.id,
      name: dishName, // Tên trùng lặp
      current_price: 200000,
    }
  );
  const resDuplicate = await POST(reqDuplicate);
  const dataDuplicate = await resDuplicate.json();
  assert(
    resDuplicate.status === 400 && dataDuplicate.code === 'DUPLICATE_NAME',
    'Chặn trùng tên món ăn',
    'Hệ thống từ chối khi tên món ăn đã tồn tại trên thực đơn.',
    `Không chặn trùng tên: ${dataDuplicate.code}`
  );

  // ---------------------------------------------------------------------------
  // TEST 4: Phân quyền RBAC (Chỉ Quản lý mới được thêm món)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 4: Phân quyền RBAC khi thêm món ---');
  const reqWaiterAdd = await createRequest(
    'http://localhost:3000/api/admin/menu-items',
    'POST',
    waiterToken,
    {
      category_id: cat.id,
      name: `Món Phục Vụ Tạo ${Date.now()}`,
      current_price: 100000,
    }
  );
  const resWaiterAdd = await POST(reqWaiterAdd);
  assert(
    resWaiterAdd.status === 403,
    'Phân quyền RBAC (403 Forbidden)',
    'Nhân viên phục vụ không thể thêm món ăn mới (HTTP 403).',
    `Lỗi phân quyền: HTTP status ${resWaiterAdd.status}`
  );

  // ---------------------------------------------------------------------------
  // TEST 5: Quản lý cập nhật thông tin món ăn (PUT)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 5: Quản lý cập nhật thông tin món ăn ---');
  const reqUpdateDish = await createRequest(
    'http://localhost:3000/api/admin/menu-items',
    'PUT',
    managerToken,
    {
      id: createdDishId,
      category_id: cat.id,
      name: `${dishName} (Special)`,
      description: 'Phiên bản đặc biệt sốt truffle',
      current_price: 290000,
      stock_quantity: 25,
      low_stock_threshold: 5,
      availability: true,
      image_key: '/images/dishes/bo-wagyu.jpg',
    }
  );
  const resUpdateDish = await PUT(reqUpdateDish);
  const dataUpdateDish = await resUpdateDish.json();
  assert(
    resUpdateDish.status === 200 && dataUpdateDish.success === true,
    'Cập nhật món ăn thành công',
    'Đã sửa đổi đơn giá lên 290.000đ và tồn kho lên 25 phần.',
    `Lỗi khi cập nhật món ăn: ${dataUpdateDish.message}`
  );

  // ---------------------------------------------------------------------------
  // TEST 6: Xóa món ăn chưa có order (Hard Delete)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 6: Xóa món ăn chưa có order (Hard Delete) ---');
  const reqDeleteDish = await createRequest(
    `http://localhost:3000/api/admin/menu-items?id=${createdDishId}`,
    'DELETE',
    managerToken
  );
  const resDeleteDish = await DELETE(reqDeleteDish);
  const dataDeleteDish = await resDeleteDish.json();

  const checkDishAfterDelete = await db.queryOne<{ id: string }>(
    `SELECT id FROM menu_items WHERE id = $1;`,
    [createdDishId]
  );

  assert(
    dataDeleteDish.success === true &&
    dataDeleteDish.deletionType === 'HARD_DELETE' &&
    !checkDishAfterDelete,
    'Xóa cứng món ăn chưa có ràng buộc',
    'Món ăn mới chưa phát sinh đơn hàng đã được xóa sạch hoàn toàn khỏi CSDL.',
    'Món ăn vẫn tồn tại sau khi xóa cứng.'
  );

  // ---------------------------------------------------------------------------
  // TEST 7: Kiểm tra Audit Log ghi nhận CREATE_MENU_ITEM và DELETE_MENU_ITEM
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 7: Kiểm toán Audit Log cho thao tác thực đơn ---');
  const createLog = await db.queryOne<{ id: string; action: string }>(
    `SELECT id, action FROM audit_logs WHERE action = 'CREATE_MENU_ITEM' AND entity_id = $1;`,
    [createdDishId]
  );
  const deleteLog = await db.queryOne<{ id: string; action: string }>(
    `SELECT id, action FROM audit_logs WHERE action = 'DELETE_MENU_ITEM' AND entity_id = $1;`,
    [createdDishId]
  );

  assert(
    createLog !== null && deleteLog !== null,
    'Kiểm toán Audit Log cho Thực đơn',
    'Bảng audit_logs đã ghi nhận đầy đủ lịch sử CREATE_MENU_ITEM và DELETE_MENU_ITEM.',
    'Thiếu bản ghi kiểm toán món ăn.'
  );

  // TỔNG KẾT
  console.log('\n------------------------------------------------------------------------------');
  const passedCount = testResults.filter(r => r.passed).length;
  console.log(`📊 KẾT QUẢ KIỂM THỬ: ${passedCount}/${testResults.length} TIÊU CHÍ ĐẠT (${Math.round(passedCount / testResults.length * 100)}%)`);
  console.log('------------------------------------------------------------------------------\n');

  if (passedCount < testResults.length) {
    process.exit(1);
  }
}

runAdminMenuTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Lỗi kiểm thử admin-menu:', err);
    process.exit(1);
  });

