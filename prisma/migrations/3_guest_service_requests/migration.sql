-- ==============================================================================
-- Migration 3: Bảng Yêu Cầu Phục Vụ Từ QR Bàn (Guest Service Requests)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS table_service_requests (
  id TEXT PRIMARY KEY,
  table_id TEXT NOT NULL REFERENCES dining_tables(id) ON DELETE CASCADE,
  order_id TEXT REFERENCES orders(id) ON DELETE SET NULL,
  request_type TEXT NOT NULL CHECK (request_type IN ('CALL_WAITER', 'REQUEST_PAYMENT')),
  note TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACKNOWLEDGED')),
  acknowledged_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  acknowledged_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_table_service_requests_status_table
  ON table_service_requests (status, table_id, created_at DESC);
