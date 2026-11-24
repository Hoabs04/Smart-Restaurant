-- ==============================================================================
-- Migration 2: Bổ sung Partial Unique Index, Performance Indexes & Check Constraints
-- ==============================================================================

-- 1. Đảm bảo mỗi bàn chỉ có tối đa 1 đơn hàng đang mở tại một thời điểm
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_one_open_per_table
  ON orders (table_id)
  WHERE table_id IS NOT NULL AND status <> 'CLOSED';

-- 2. Indexes tối ưu báo cáo doanh thu, món bán chạy và đồng bộ kênh bán hàng
CREATE INDEX IF NOT EXISTS idx_orders_status_closed_at ON orders (status, closed_at);
CREATE INDEX IF NOT EXISTS idx_orders_source_status ON orders (order_source, status);
CREATE INDEX IF NOT EXISTS idx_order_items_menu_item_id ON order_items (menu_item_id);
CREATE INDEX IF NOT EXISTS idx_external_orders_internal_order_id ON external_orders (internal_order_id);

-- 3. Ràng buộc dữ liệu an toàn (Idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_dining_tables_capacity_positive') THEN
    ALTER TABLE dining_tables ADD CONSTRAINT chk_dining_tables_capacity_positive CHECK (capacity > 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_menu_items_threshold_non_negative') THEN
    ALTER TABLE menu_items ADD CONSTRAINT chk_menu_items_threshold_non_negative CHECK (low_stock_threshold >= 0);
  END IF;
END $$;
