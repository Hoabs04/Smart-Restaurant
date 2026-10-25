import { getDb, closeDb } from '../src/lib/db';

async function main() {
  const db = await getDb();
  await db.execute(`DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE table_id IN (SELECT id FROM dining_tables WHERE area_name LIKE 'Khu Test%'));`);
  await db.execute(`DELETE FROM orders WHERE table_id IN (SELECT id FROM dining_tables WHERE area_name LIKE 'Khu Test%');`);
  await db.execute(`DELETE FROM dining_tables WHERE area_name LIKE 'Khu Test%';`);
  await db.execute(`DELETE FROM menu_items WHERE name LIKE '%Test%';`);
  await closeDb();
  console.log('✅ Đã dọn dẹp sạch sẽ toàn bộ dữ liệu test tồn đọng.');
}

main().catch(console.error);
