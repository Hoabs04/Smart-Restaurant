import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { getDb, closeDb } from '../src/lib/db';

async function seed() {
  console.log('🌱 Bắt đầu nạp dữ liệu mẫu (Seed Data)...');
  const db = await getDb();

  // 1. Tạo Roles
  const roles = [
    { id: crypto.randomUUID(), code: 'manager', name: 'Quản lý', description: 'Toàn quyền cấu hình menu, bàn, tài khoản và xem báo cáo' },
    { id: crypto.randomUUID(), code: 'waiter', name: 'Nhân viên phục vụ', description: 'Xem bàn, tạo order, gửi bếp, xem hóa đơn và chốt đơn' },
    { id: crypto.randomUUID(), code: 'kitchen', name: 'Nhân viên bếp', description: 'Xem queue chế biến và cập nhật trạng thái món' },
  ];

  for (const r of roles) {
    await db.execute(
      `INSERT INTO roles (id, code, name, description)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (code) DO NOTHING;`,
      [r.id, r.code, r.name, r.description]
    );
  }

  const roleRows = await db.query(`SELECT id, code FROM roles;`);
  const roleMap = Object.fromEntries(roleRows.map(r => [r.code, r.id]));

  // 2. Tạo Users
  const defaultPasswordHash = await bcrypt.hash('Restaurant@2026', 10);

  const users = [
    { id: crypto.randomUUID(), username: 'manager', displayName: 'Nguyễn Văn Quản Lý', role: 'manager' },
    { id: crypto.randomUUID(), username: 'waiter', displayName: 'Trần Thị Phục Vụ', role: 'waiter' },
    { id: crypto.randomUUID(), username: 'kitchen', displayName: 'Lê Văn Đầu Bếp', role: 'kitchen' },
  ];

  for (const u of users) {
    const existing = await db.queryOne(`SELECT id FROM users WHERE username = $1;`, [u.username]);
    let userId = existing?.id;

    if (!existing) {
      userId = u.id;
      await db.execute(
        `INSERT INTO users (id, username, password_hash, display_name, is_active)
         VALUES ($1, $2, $3, $4, true);`,
        [userId, u.username, defaultPasswordHash, u.displayName]
      );
    }

    // Gán role
    const roleId = roleMap[u.role];
    if (roleId) {
      await db.execute(
        `INSERT INTO user_roles (id, user_id, role_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, role_id) DO NOTHING;`,
        [crypto.randomUUID(), userId, roleId]
      );
    }
  }

  // 3. Tạo Khu vực & Bàn ăn
  const tables = [
    { code: 'Bàn 01', area: 'Khu Trong Nhà', capacity: 4, status: 'AVAILABLE' },
    { code: 'Bàn 02', area: 'Khu Trong Nhà', capacity: 4, status: 'AVAILABLE' },
    { code: 'Bàn 03', area: 'Khu Trong Nhà', capacity: 2, status: 'AVAILABLE' },
    { code: 'Bàn 04', area: 'Khu Trong Nhà', capacity: 6, status: 'AVAILABLE' },
    { code: 'Bàn SV-01', area: 'Khu Sân Vườn', capacity: 4, status: 'AVAILABLE' },
    { code: 'Bàn SV-02', area: 'Khu Sân Vườn', capacity: 4, status: 'AVAILABLE' },
    { code: 'Bàn SV-03', area: 'Khu Sân Vườn', capacity: 8, status: 'AVAILABLE' },
    { code: 'Bàn VIP-01', area: 'Phòng VIP', capacity: 10, status: 'AVAILABLE' },
    { code: 'Bàn VIP-02', area: 'Phòng VIP', capacity: 12, status: 'AVAILABLE' },
  ];

  for (const t of tables) {
    await db.execute(
      `INSERT INTO dining_tables (id, area_name, table_code, capacity, status, is_active, version)
       VALUES ($1, $2, $3, $4, $5, true, 1)
       ON CONFLICT (table_code) DO NOTHING;`,
      [crypto.randomUUID(), t.area, t.code, t.capacity, t.status]
    );
  }

  // 4. Tạo Danh mục món
  const categories = [
    { id: crypto.randomUUID(), name: 'Khai vị', sort_order: 1 },
    { id: crypto.randomUUID(), name: 'Món chính', sort_order: 2 },
    { id: crypto.randomUUID(), name: 'Hải sản tươi sống', sort_order: 3 },
    { id: crypto.randomUUID(), name: 'Tráng miệng', sort_order: 4 },
    { id: crypto.randomUUID(), name: 'Đồ uống cao cấp', sort_order: 5 },
  ];

  for (const c of categories) {
    await db.execute(
      `INSERT INTO menu_categories (id, name, sort_order, is_active)
       VALUES ($1, $2, $3, true)
       ON CONFLICT (name) DO NOTHING;`,
      [c.id, c.name, c.sort_order]
    );
  }

  const categoryRows = await db.query(`SELECT id, name FROM menu_categories;`);
  const catMap = Object.fromEntries(categoryRows.map(c => [c.name, c.id]));

  // 5. Tạo Món ăn với các mức tồn kho & ảnh minh họa
  const menuItems = [
    // Khai vị
    { name: 'Súp bào ngư vi cá', cat: 'Khai vị', price: 280000, stock: 12, desc: 'Bào ngư cao cấp nấu cùng nước hầm thảo mộc thượng hạng', img: '/images/dishes/sup-bao-ngu.jpg' },
    { name: 'Salad cá ngừ đại dương', cat: 'Khai vị', price: 165000, stock: 18, desc: 'Rau mầm tươi hữu cơ, cá ngừ tataki áp chảo và sốt mè rang', img: '/images/dishes/salad-ca-ngu.jpg' },
    
    // Món chính
    { name: 'Bò Wagyu Úc nướng đá muối', cat: 'Món chính', price: 650000, stock: 15, desc: 'Thịt bò Wagyu MB9 vân mỡ cẩm thạch nướng trực tiếp tại bàn', img: '/images/dishes/bo-wagyu.jpg' },
    { name: 'Sườn cừu đút lò thảo mộc', cat: 'Món chính', price: 420000, stock: 8, desc: 'Sườn cừu New Zealand ướp hương thảo và sốt rượu vang đỏ', img: '/images/dishes/suon-cuu.jpg' },
    { name: 'Cơm chiên hải sản hoàng bào', cat: 'Món chính', price: 195000, stock: 25, desc: 'Cơm đảo trứng muối giòn thơm cùng tôm sú và sò điệp Nhật', img: '/images/dishes/com-chien-hai-san.jpg' },
    
    // Món sắp hết (ngưỡng 1 - 4)
    { name: 'Cá hồi Na-uy áp chảo sốt chanh leo', cat: 'Món chính', price: 320000, stock: 3, desc: 'Phi lê cá hồi tươi thượng hạng (Cảnh báo: Sắp hết hàng)', img: '/images/dishes/ca-hoi-ap-chao.jpg' },
    { name: 'Rượu vang đỏ Chateau Bordeaux', cat: 'Đồ uống cao cấp', price: 1450000, stock: 2, desc: 'Niên vụ 2018 hương vị đậm đà, quý phái (Cảnh báo: Sắp hết)', img: '/images/dishes/ruou-vang-chateau.jpg' },

    // Hải sản
    { name: 'Tôm hùm bông nướng phô mai', cat: 'Hải sản tươi sống', price: 980000, stock: 6, desc: 'Tôm hùm tươi sống phủ lớp phô mai Mozzarella đút lò', img: '/images/dishes/tom-hum-nuong.jpg' },
    
    // Món hết hàng (stock = 0)
    { name: 'Cua tuyết Hokkaido hấp sake', cat: 'Hải sản tươi sống', price: 1250000, stock: 0, desc: 'Cua tuyết tươi nhập khẩu trực tiếp từ Nhật Bản (Hết hàng)', img: '/images/dishes/cua-tuyet.jpg' },

    // Tráng miệng
    { name: 'Bánh Panna Cotta dâu tây rừng', cat: 'Tráng miệng', price: 85000, stock: 20, desc: 'Kem sữa béo ngậy kèm sốt dâu tươi chua ngọt', img: '/images/dishes/panna-cotta.jpg' },
    { name: 'Chè yến sào hạt sen tuyết nhĩ', cat: 'Tráng miệng', price: 180000, stock: 10, desc: 'Tổ yến thiên nhiên chưng đường phèn thanh mát', img: '/images/dishes/che-yen-sao.jpg' },

    // Đồ uống
    { name: 'Nước ép cam sành tươi nguyên chất', cat: 'Đồ uống cao cấp', price: 65000, stock: 30, desc: 'Cam sành tươi ép lạnh giữ trọn vitamin C', img: '/images/dishes/nuoc-cam-ep.svg' },
    { name: 'Trà hoa cúc mật ong rừng', cat: 'Đồ uống cao cấp', price: 75000, stock: 22, desc: 'Hoa cúc sấy lạnh kết hợp mật ong hoa rừng Tây Bắc', img: '/images/dishes/tra-hoa-cuc.svg' },
  ];

  for (const m of menuItems) {
    const catId = catMap[m.cat];
    if (catId) {
      await db.execute(
        `INSERT INTO menu_items (id, category_id, name, description, current_price, availability, stock_quantity, low_stock_threshold, image_key)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 5, $8)
         ON CONFLICT (name) DO UPDATE SET
           current_price = EXCLUDED.current_price,
           stock_quantity = EXCLUDED.stock_quantity,
           image_key = EXCLUDED.image_key;`,
        [crypto.randomUUID(), catId, m.name, m.desc, m.price, m.stock > 0, m.stock, m.img]
      );
    }
  }

  // 6. Tạo đơn hàng đã CLOSED mẫu để có số liệu báo cáo
  const waiter = await db.queryOne(`SELECT id FROM users WHERE username = 'waiter';`);
  const table1 = await db.queryOne(`SELECT id FROM dining_tables WHERE table_code = 'Bàn 01';`);
  const wagyuItem = await db.queryOne(`SELECT id, name, current_price FROM menu_items WHERE name = 'Bò Wagyu Úc nướng đá muối';`);
  const supItem = await db.queryOne(`SELECT id, name, current_price FROM menu_items WHERE name = 'Súp bào ngư vi cá';`);

  if (waiter && table1 && wagyuItem && supItem) {
    const sampleClosedOrder = await db.queryOne(`SELECT id FROM orders WHERE order_code = 'ORD-DEMO-CLOSED-01';`);
    if (!sampleClosedOrder) {
      const orderId = crypto.randomUUID();
      const total = (wagyuItem.current_price * 2) + (supItem.current_price * 2);
      
      await db.execute(
        `INSERT INTO orders (id, order_code, table_id, created_by, status, total_amount, created_at, closed_at)
         VALUES ($1, 'ORD-DEMO-CLOSED-01', $2, $3, 'CLOSED', $4, CURRENT_TIMESTAMP - INTERVAL '2 hours', CURRENT_TIMESTAMP - INTERVAL '1 hours');`,
        [orderId, table1.id, waiter.id, total]
      );

      const item1Id = crypto.randomUUID();
      const item2Id = crypto.randomUUID();
      await db.execute(
        `INSERT INTO order_items (id, order_id, menu_item_id, item_name_snapshot, unit_price_snapshot, quantity, status, created_at)
         VALUES ($1, $2, $3, $4, $5, 2, 'READY', CURRENT_TIMESTAMP - INTERVAL '2 hours'),
                ($6, $2, $7, $8, $9, 2, 'READY', CURRENT_TIMESTAMP - INTERVAL '2 hours');`,
        [item1Id, orderId, wagyuItem.id, wagyuItem.name, wagyuItem.current_price, item2Id, supItem.id, supItem.name, supItem.current_price]
      );
    }
  }

  console.log('✅ Nạp dữ liệu mẫu thành công!');
  console.log('----------------------------------------------------');
  console.log('Tài khoản mẫu:');
  console.log('- Quản lý: username "manager" / mật khẩu "Restaurant@2026"');
  console.log('- Phục vụ: username "waiter"  / mật khẩu "Restaurant@2026"');
  console.log('- Bếp:    username "kitchen" / mật khẩu "Restaurant@2026"');
  console.log('----------------------------------------------------');

  await closeDb();
}

seed().catch(err => {
  console.error('Lỗi khi nạp dữ liệu mẫu:', err);
  process.exit(1);
});
