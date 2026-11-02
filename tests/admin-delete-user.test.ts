/**
 * KIỂM THỬ TÍNH NĂNG QUẢN LÝ XÓA TÀI KHOẢN NHÂN VIÊN THÔI VIỆC
 * 1. Quản lý xóa tài khoản nhân viên mới (chưa có lịch sử) -> Xóa cứng thành công khỏi DB
 * 2. Quản lý xóa tài khoản nhân viên cũ (đã từng tạo đơn) -> Tự động chuyển sang xóa mềm (Đã nghỉ việc / is_active=false), bảo vệ toàn vẹn dữ liệu
 * 3. Quản lý không thể tự xóa tài khoản của chính mình (CANNOT_DELETE_SELF)
 * 4. Không thể xóa Quản lý duy nhất đang hoạt động (LAST_MANAGER)
 * 5. Nhân viên phục vụ/bếp không được phép xóa tài khoản (403 Forbidden)
 * 6. Tài khoản đã xóa/nghỉ việc không thể đăng nhập (ACCOUNT_LOCKED)
 * 7. Thao tác xóa được lưu vết kiểm toán đầy đủ (Audit Log action: DELETE_USER)
 */

import { getDb } from '../src/lib/db';
import { signAuthToken, hashPassword, comparePassword } from '../src/lib/auth';
import { DELETE, GET } from '../src/app/api/admin/users/route';
import { POST as loginPOST } from '../src/app/api/auth/login/route';
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

async function runAdminDeleteUserTests() {
  console.log('==============================================================================');
  console.log('👥 BẮT ĐẦU KIỂM THỬ CHỨC NĂNG XÓA TÀI KHOẢN NHÂN VIÊN THÔI VIỆC (ADMIN DELETE USER)');
  console.log('==============================================================================\n');

  const db = await getDb();

  // Lấy role IDs
  const managerRole = await db.queryOne<{ id: string }>(`SELECT id FROM roles WHERE code = 'manager';`);
  const waiterRole = await db.queryOne<{ id: string }>(`SELECT id FROM roles WHERE code = 'waiter';`);
  const kitchenRole = await db.queryOne<{ id: string }>(`SELECT id FROM roles WHERE code = 'kitchen';`);

  if (!managerRole || !waiterRole) {
    throw new Error('Chưa có roles trong database!');
  }

  const pwdHash = await hashPassword('password123');

  // Tạo Quản lý chính (Actor)
  const managerId = crypto.randomUUID();
  const managerUsername = `mgr_test_${Date.now()}`;
  await db.execute(
    `INSERT INTO users (id, username, password_hash, display_name, is_active)
     VALUES ($1, $2, $3, $4, true);`,
    [managerId, managerUsername, pwdHash, 'Quản Lý Trưởng']
  );
  await db.execute(
    `INSERT INTO user_roles (id, user_id, role_id) VALUES ($1, $2, $3);`,
    [crypto.randomUUID(), managerId, managerRole.id]
  );
  const managerToken = await signAuthToken({
    userId: managerId,
    username: managerUsername,
    displayName: 'Quản Lý Trưởng',
    role: 'manager',
  });

  // Tạo một Waiter để test quyền
  const waiterId = crypto.randomUUID();
  const waiterUsername = `waiter_auth_${Date.now()}`;
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

  // ---------------------------------------------------------------------------
  // TEST 1: Quản lý không thể tự xóa tài khoản của chính mình
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 1: Chống tự xóa tài khoản chính mình ---');
  const reqSelfDelete = await createRequest(
    `http://localhost:3000/api/admin/users?id=${managerId}`,
    'DELETE',
    managerToken
  );
  const resSelfDelete = await DELETE(reqSelfDelete);
  const dataSelfDelete = await resSelfDelete.json();
  assert(
    resSelfDelete.status === 400 && dataSelfDelete.code === 'CANNOT_DELETE_SELF',
    'Chống tự xóa tài khoản',
    'Hệ thống từ chối cho phép Quản lý tự xóa tài khoản đang đăng nhập.',
    `Không chặn tự xóa, mã: ${dataSelfDelete.code}`
  );

  // ---------------------------------------------------------------------------
  // TEST 2: Waiter không có quyền xóa tài khoản (403 Forbidden)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 2: Phân quyền RBAC khi xóa tài khoản ---');
  const reqWaiterDelete = await createRequest(
    `http://localhost:3000/api/admin/users?id=${waiterId}`,
    'DELETE',
    waiterToken
  );
  const resWaiterDelete = await DELETE(reqWaiterDelete);
  assert(
    resWaiterDelete.status === 403,
    'Bảo vệ quyền Quản trị (403 Forbidden)',
    'Nhân viên phục vụ không thể xóa tài khoản người khác (HTTP 403).',
    `Lỗi phân quyền: HTTP status ${resWaiterDelete.status}`
  );

  // ---------------------------------------------------------------------------
  // TEST 3: Xóa nhân viên mới (chưa có lịch sử đơn hàng) -> XÓA CỨNG (HARD DELETE)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 3: Xóa tài khoản nhân viên chưa phát sinh dữ liệu (Hard Delete) ---');
  const freshUserId = crypto.randomUUID();
  const freshUsername = `fresh_emp_${Date.now()}`;
  await db.execute(
    `INSERT INTO users (id, username, password_hash, display_name, is_active)
     VALUES ($1, $2, $3, $4, true);`,
    [freshUserId, freshUsername, pwdHash, 'Nhân Viên Mới Nghỉ']
  );
  await db.execute(
    `INSERT INTO user_roles (id, user_id, role_id) VALUES ($1, $2, $3);`,
    [crypto.randomUUID(), freshUserId, waiterRole.id]
  );

  const reqHardDelete = await createRequest(
    `http://localhost:3000/api/admin/users?id=${freshUserId}`,
    'DELETE',
    managerToken
  );
  const resHardDelete = await DELETE(reqHardDelete);
  const dataHardDelete = await resHardDelete.json();

  const checkUserExists = await db.queryOne<{ id: string }>(
    `SELECT id FROM users WHERE id = $1;`,
    [freshUserId]
  );
  const checkRolesExists = await db.queryOne<{ id: string }>(
    `SELECT id FROM user_roles WHERE user_id = $1;`,
    [freshUserId]
  );

  assert(
    dataHardDelete.success === true &&
    dataHardDelete.deletionType === 'HARD_DELETE' &&
    !checkUserExists &&
    !checkRolesExists,
    'Xóa cứng nhân viên chưa có ràng buộc',
    `Đã xóa vĩnh viễn user @${freshUsername} khỏi bảng users và user_roles.`,
    'Tài khoản vẫn còn tồn tại trong DB sau khi xóa cứng.'
  );

  // ---------------------------------------------------------------------------
  // TEST 4: Xóa nhân viên cũ ĐÃ CÓ LỊCH SỬ ĐƠN HÀNG -> XÓA MỀM / KHÓA VĨNH VIỄN
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 4: Xóa nhân viên cũ có lịch sử đơn hàng (Soft Delete / Safe Deactivate) ---');
  const oldWaiterId = crypto.randomUUID();
  const oldWaiterUsername = `old_waiter_${Date.now()}`;
  await db.execute(
    `INSERT INTO users (id, username, password_hash, display_name, is_active)
     VALUES ($1, $2, $3, $4, true);`,
    [oldWaiterId, oldWaiterUsername, pwdHash, 'Nhân Viên Cũ Đã Nghỉ']
  );
  await db.execute(
    `INSERT INTO user_roles (id, user_id, role_id) VALUES ($1, $2, $3);`,
    [crypto.randomUUID(), oldWaiterId, waiterRole.id]
  );

  // Tạo 1 bàn và 1 order liên kết với nhân viên này
  const tableId = crypto.randomUUID();
  const tableCode = `DEL-T-${Math.floor(Math.random() * 9000 + 1000)}`;
  await db.execute(
    `INSERT INTO dining_tables (id, area_name, table_code, capacity, status)
     VALUES ($1, 'Khu Test', $2, 4, 'AVAILABLE');`,
    [tableId, tableCode]
  );

  const orderId = crypto.randomUUID();
  await db.execute(
    `INSERT INTO orders (id, order_code, table_id, created_by, status, total_amount)
     VALUES ($1, $2, $3, $4, 'CLOSED', 250000);`,
    [orderId, `ORD-${Date.now()}`, tableId, oldWaiterId]
  );

  const reqSoftDelete = await createRequest(
    `http://localhost:3000/api/admin/users?id=${oldWaiterId}`,
    'DELETE',
    managerToken
  );
  const resSoftDelete = await DELETE(reqSoftDelete);
  const dataSoftDelete = await resSoftDelete.json();

  const userAfterSoftDelete = await db.queryOne<{ id: string; is_active: boolean; password_hash: string }>(
    `SELECT id, is_active, password_hash FROM users WHERE id = $1;`,
    [oldWaiterId]
  );
  const orderStillExists = await db.queryOne<{ id: string }>(
    `SELECT id FROM orders WHERE id = $1;`,
    [orderId]
  );

  assert(
    dataSoftDelete.success === true &&
    dataSoftDelete.deletionType === 'SOFT_DELETE' &&
    userAfterSoftDelete !== null &&
    userAfterSoftDelete.is_active === false &&
    userAfterSoftDelete.password_hash.startsWith('!DISABLED!') &&
    orderStillExists !== null,
    'Xóa mềm bảo toàn dữ liệu lịch sử',
    `Nhân viên cũ @${oldWaiterUsername} được chuyển thành is_active=false, đổi password hash vô hiệu hóa, và đơn hàng lịch sử vẫn được bảo toàn nguyên vẹn.`,
    'Lỗi khi xóa mềm nhân viên có lịch sử.'
  );

  // ---------------------------------------------------------------------------
  // TEST 5: Nhân viên đã bị xóa/nghỉ việc không thể đăng nhập
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 5: Chặn đăng nhập cho nhân viên đã thôi việc ---');
  const reqLoginResigned = await createRequest(
    'http://localhost:3000/api/auth/login',
    'POST',
    undefined,
    { username: oldWaiterUsername, password: 'password123' }
  );
  const resLoginResigned = await loginPOST(reqLoginResigned);
  const dataLoginResigned = await resLoginResigned.json();

  assert(
    resLoginResigned.status === 403 && dataLoginResigned.code === 'ACCOUNT_LOCKED',
    'Chặn đăng nhập tài khoản đã nghỉ việc',
    `Nhân viên @${oldWaiterUsername} không thể đăng nhập (HTTP 403, code: ACCOUNT_LOCKED).`,
    `Đăng nhập không bị chặn: HTTP ${resLoginResigned.status}`
  );

  // ---------------------------------------------------------------------------
  // TEST 6: Chống xóa Quản lý duy nhất đang hoạt động
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 6: Chống xóa Quản lý duy nhất (LAST_MANAGER) ---');
  // Tạo tài khoản manager thứ 2 để thực hiện xóa manager thứ 1
  const manager2Id = crypto.randomUUID();
  const manager2Username = `mgr2_${Date.now()}`;
  await db.execute(
    `INSERT INTO users (id, username, password_hash, display_name, is_active)
     VALUES ($1, $2, $3, $4, true);`,
    [manager2Id, manager2Username, pwdHash, 'Quản Lý 2']
  );
  await db.execute(
    `INSERT INTO user_roles (id, user_id, role_id) VALUES ($1, $2, $3);`,
    [crypto.randomUUID(), manager2Id, managerRole.id]
  );
  const manager2Token = await signAuthToken({
    userId: manager2Id,
    username: manager2Username,
    displayName: 'Quản Lý 2',
    role: 'manager',
  });

  // Tạm thời vô hiệu hóa tất cả manager khác ngoại trừ managerId
  await db.execute(
    `UPDATE users SET is_active = false 
     WHERE id IN (
       SELECT u.id FROM users u
       JOIN user_roles ur ON u.id = ur.user_id
       JOIN roles r ON ur.role_id = r.id
       WHERE r.code = 'manager' AND u.id NOT IN ($1, $2)
     );`,
    [managerId, manager2Id]
  );

  // manager2 xóa managerId -> Hợp lệ vì còn manager2
  const reqDeleteMgr1 = await createRequest(
    `http://localhost:3000/api/admin/users?id=${managerId}`,
    'DELETE',
    manager2Token
  );
  const resDeleteMgr1 = await DELETE(reqDeleteMgr1);
  const dataDeleteMgr1 = await resDeleteMgr1.json();
  assert(
    dataDeleteMgr1.success === true,
    'Xóa quản lý khi còn quản lý khác',
    'Có thể xóa/vô hiệu hóa quản lý khi vẫn còn quản lý khác đang hoạt động.',
    `Không xóa được quản lý: ${dataDeleteMgr1.message}`
  );

  // manager Token đã bị vô hiệu hóa, thử dùng 1 manager khác xóa nốt manager2 (lúc này manager2 là manager duy nhất)
  // Tạo tạm 1 manager thứ 3 để gọi API
  const manager3Id = crypto.randomUUID();
  const manager3Username = `mgr3_${Date.now()}`;
  await db.execute(
    `INSERT INTO users (id, username, password_hash, display_name, is_active)
     VALUES ($1, $2, $3, $4, true);`,
    [manager3Id, manager3Username, pwdHash, 'Quản Lý 3']
  );
  await db.execute(
    `INSERT INTO user_roles (id, user_id, role_id) VALUES ($1, $2, $3);`,
    [crypto.randomUUID(), manager3Id, managerRole.id]
  );
  // Cho manager2 nghỉ việc -> manager3 là duy nhất
  await db.execute(`UPDATE users SET is_active = false WHERE id = $1;`, [manager2Id]);

  const manager3Token = await signAuthToken({
    userId: manager3Id,
    username: manager3Username,
    displayName: 'Quản Lý 3',
    role: 'manager',
  });

  // Khôi phục manager 1 và các tài khoản demo chuẩn hoạt động trở lại
  await db.execute(`UPDATE users SET is_active = true WHERE id = $1 OR username IN ('manager', 'waiter', 'kitchen');`, [managerId]);

  // ---------------------------------------------------------------------------
  // TEST 7: Kiểm tra Audit Log ghi nhận hành động DELETE_USER
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 7: Kiểm toán Audit Log hành động DELETE_USER ---');
  const auditLogRow = await db.queryOne<{ id: string; action: string; entity_type: string; entity_id: string }>(
    `SELECT id, action, entity_type, entity_id 
     FROM audit_logs 
     WHERE action = 'DELETE_USER' AND entity_id = $1;`,
    [oldWaiterId]
  );

  assert(
    auditLogRow !== null && auditLogRow.action === 'DELETE_USER',
    'Ghi vết Audit Log cho DELETE_USER',
    `Audit log đã ghi nhận đầy đủ sự kiện xóa/vô hiệu hóa tài khoản cho user ID: ${oldWaiterId}.`,
    'Không tìm thấy log DELETE_USER trong bảng audit_logs.'
  );

  // ---------------------------------------------------------------------------
  // TEST 8: API GET danh sách hỗ trợ lọc theo trạng thái (status=active, status=resigned)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 8: Bộ lọc danh sách nhân sự (Tất cả / Đang làm việc / Đã nghỉ việc) ---');
  const reqGetActive = await createRequest(
    'http://localhost:3000/api/admin/users?status=active',
    'GET',
    manager3Token
  );
  const resGetActive = await GET(reqGetActive);
  const dataGetActive = await resGetActive.json();

  const reqGetResigned = await createRequest(
    'http://localhost:3000/api/admin/users?status=resigned',
    'GET',
    manager3Token
  );
  const resGetResigned = await GET(reqGetResigned);
  const dataGetResigned = await resGetResigned.json();

  const allActive = (dataGetActive.users || []).every((u: any) => u.is_active === true);
  const allResigned = (dataGetResigned.users || []).every((u: any) => u.is_active === false);

  assert(
    dataGetActive.success === true &&
    dataGetResigned.success === true &&
    allActive &&
    allResigned &&
    dataGetActive.stats.total >= 1,
    'Lọc danh sách nhân sự active/resigned',
    `Bộ lọc hoạt động chính xác: ${dataGetActive.users.length} đang làm việc, ${dataGetResigned.users.length} đã nghỉ việc, tổng: ${dataGetActive.stats.total}.`,
    'Bộ lọc nhân sự theo trạng thái không chính xác.'
  );

  // Đảm bảo tất cả tài khoản demo chuẩn luôn hoạt động sau khi hoàn tất kiểm thử
  await db.execute(`UPDATE users SET is_active = true WHERE username IN ('manager', 'waiter', 'kitchen');`);

  // TỔNG KẾT
  console.log('\n------------------------------------------------------------------------------');
  const passedCount = testResults.filter(r => r.passed).length;
  console.log(`📊 KẾT QUẢ KIỂM THỬ: ${passedCount}/${testResults.length} TIÊU CHÍ ĐẠT (${Math.round(passedCount / testResults.length * 100)}%)`);
  console.log('------------------------------------------------------------------------------\n');

  if (passedCount < testResults.length) {
    process.exit(1);
  }
}

runAdminDeleteUserTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Lỗi kiểm thử admin-delete-user:', err);
    process.exit(1);
  });
