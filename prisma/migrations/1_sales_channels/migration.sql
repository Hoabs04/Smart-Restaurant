-- ==============================================================================
-- Migration SQL: Bổ sung module Kênh Bán Hàng (Sales Channels)
-- GrabFood, ShopeeFood, BeFood
-- ==============================================================================

-- 1. BẢNG SALES_CHANNELS
CREATE TABLE IF NOT EXISTS sales_channels (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,                -- 'GRABFOOD', 'SHOPEEFOOD', 'BEFOOD', 'MOCK'
    name TEXT NOT NULL,                       -- 'GrabFood', 'ShopeeFood', 'BeFood'
    logo_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT FALSE, -- Bật / Tắt kênh
    connection_status TEXT NOT NULL DEFAULT 'UNCONFIGURED', 
        -- 'UNCONFIGURED' (Chưa kết nối), 'CONNECTED' (Đang kết nối), 'ERROR' (Kết nối lỗi), 'DISABLED' (Đã tắt)
    last_sync_at TIMESTAMP WITH TIME ZONE,
    last_error_message TEXT,
    auto_confirm_order BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sales_channels_status ON sales_channels (is_active, connection_status);

-- 2. BẢNG CHANNEL_CREDENTIALS (Mã hóa an toàn các secrets bằng AES-256-GCM)
CREATE TABLE IF NOT EXISTS channel_credentials (
    id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL REFERENCES sales_channels(id) ON DELETE CASCADE,
    merchant_id TEXT NOT NULL,
    store_id TEXT,
    app_id TEXT,
    app_secret_encrypted TEXT NOT NULL,
    access_token_encrypted TEXT,
    refresh_token_encrypted TEXT,
    token_expires_at TIMESTAMP WITH TIME ZONE,
    webhook_secret_encrypted TEXT,
    environment TEXT NOT NULL DEFAULT 'SANDBOX', -- 'SANDBOX' hoặc 'PRODUCTION'
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_channel_credentials_channel UNIQUE (channel_id)
);

-- 3. BẢNG CHANNEL_MENU_MAPPINGS
CREATE TABLE IF NOT EXISTS channel_menu_mappings (
    id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL REFERENCES sales_channels(id) ON DELETE CASCADE,
    internal_menu_item_id TEXT NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
    external_item_id TEXT NOT NULL,
    external_item_name TEXT NOT NULL,
    external_price INTEGER NOT NULL DEFAULT 0 CHECK (external_price >= 0),
    sync_stock BOOLEAN NOT NULL DEFAULT TRUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_synced_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_channel_menu_mapping UNIQUE (channel_id, internal_menu_item_id),
    CONSTRAINT uq_channel_external_item UNIQUE (channel_id, external_item_id)
);

CREATE INDEX IF NOT EXISTS idx_menu_mappings_channel ON channel_menu_mappings (channel_id, is_active);

-- 4. BẢNG EXTERNAL_ORDERS
CREATE TABLE IF NOT EXISTS external_orders (
    id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL REFERENCES sales_channels(id) ON DELETE RESTRICT,
    internal_order_id TEXT REFERENCES orders(id) ON DELETE SET NULL,
    external_order_id TEXT NOT NULL,
    external_order_code TEXT NOT NULL,
    channel_code TEXT NOT NULL,
    channel_status TEXT NOT NULL,
    normalized_status TEXT NOT NULL, -- 'NEW', 'CONFIRMED', 'PREPARING', 'COMPLETED', 'CANCELLED'
    customer_name TEXT,
    customer_phone TEXT,
    delivery_address TEXT,
    driver_name TEXT,
    driver_phone TEXT,
    total_amount INTEGER NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
    platform_fee INTEGER NOT NULL DEFAULT 0 CHECK (platform_fee >= 0),
    net_revenue INTEGER NOT NULL DEFAULT 0,
    items_json TEXT NOT NULL,
    raw_payload TEXT,
    idempotency_key TEXT NOT NULL UNIQUE,
    ordered_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_external_order UNIQUE (channel_id, external_order_id)
);

CREATE INDEX IF NOT EXISTS idx_external_orders_status ON external_orders (channel_code, normalized_status);
CREATE INDEX IF NOT EXISTS idx_external_orders_ordered_at ON external_orders (ordered_at DESC);

-- 5. BẢNG SYNC_LOGS
CREATE TABLE IF NOT EXISTS sync_logs (
    id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL REFERENCES sales_channels(id) ON DELETE CASCADE,
    sync_type TEXT NOT NULL, -- 'ORDER_INGEST', 'STATUS_SYNC', 'MENU_SYNC', 'OUT_OF_STOCK_SYNC', 'WEBHOOK'
    direction TEXT NOT NULL DEFAULT 'INBOUND', -- 'INBOUND', 'OUTBOUND'
    status TEXT NOT NULL, -- 'SUCCESS', 'FAILED', 'RETRYING'
    retry_count INTEGER NOT NULL DEFAULT 0,
    request_data TEXT,
    response_data TEXT,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sync_logs_channel_time ON sync_logs (channel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_logs_status ON sync_logs (status);

-- 6. BỔ SUNG CỘT VÀO BẢNG ORDERS HIỆN HỮU (NẾU CHƯA CÓ)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_source TEXT NOT NULL DEFAULT 'DINE_IN';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS channel_order_id TEXT REFERENCES external_orders(id) ON DELETE SET NULL;
ALTER TABLE orders ALTER COLUMN table_id DROP NOT NULL;

-- 7. SEED DỮ LIỆU BAN ĐẦU CHO CÁC KÊNH BÁN HÀNG
INSERT INTO sales_channels (id, code, name, logo_url, is_active, connection_status)
VALUES 
    ('channel-grabfood', 'GRABFOOD', 'GrabFood', '/images/channels/grabfood.png', false, 'UNCONFIGURED'),
    ('channel-shopeefood', 'SHOPEEFOOD', 'ShopeeFood', '/images/channels/shopeefood.png', false, 'UNCONFIGURED'),
    ('channel-befood', 'BEFOOD', 'BeFood', '/images/channels/befood.png', false, 'UNCONFIGURED'),
    ('channel-mock', 'MOCK', 'Kênh Giả Lập Mock', '/images/channels/mock.png', true, 'CONNECTED')
ON CONFLICT (code) DO NOTHING;

