-- ==============================================================================
-- Migration 4: Bổ sung cột ghi chú món ăn (notes) cho order_items
-- ==============================================================================

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS notes TEXT;
