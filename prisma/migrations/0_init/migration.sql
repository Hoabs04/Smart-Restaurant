-- ==============================================================================
-- Migration SQL Khởi tạo cơ sở dữ liệu Hệ thống Quản lý Nhà hàng Thông minh
-- Tương thích PostgreSQL 14, 15, 16 và Amazon RDS for PostgreSQL
-- ==============================================================================

-- 1. BẢNG USERS & ROLES
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS roles (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_roles (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_user_roles UNIQUE (user_id, role_id)
);

-- 2. BẢNG DINING_TABLES
CREATE TABLE IF NOT EXISTS dining_tables (
    id TEXT PRIMARY KEY,
    area_name TEXT NOT NULL,
    table_code TEXT NOT NULL UNIQUE,
    capacity INTEGER NOT NULL DEFAULT 4,
    status TEXT NOT NULL DEFAULT 'AVAILABLE',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tables_area_status ON dining_tables (area_name, status);

-- 3. BẢNG MENU_CATEGORIES & MENU_ITEMS
CREATE TABLE IF NOT EXISTS menu_categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS menu_items (
    id TEXT PRIMARY KEY,
    category_id TEXT NOT NULL REFERENCES menu_categories(id) ON DELETE RESTRICT,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    current_price INTEGER NOT NULL CHECK (current_price >= 0),
    availability BOOLEAN NOT NULL DEFAULT TRUE,
    stock_quantity INTEGER NOT NULL DEFAULT 10 CHECK (stock_quantity >= 0),
    low_stock_threshold INTEGER NOT NULL DEFAULT 5,
    image_key TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_menu_cat_avail ON menu_items (category_id, availability);

-- 4. BẢNG ORDERS, KITCHEN_BATCHES & ORDER_ITEMS
CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    order_code TEXT NOT NULL UNIQUE,
    table_id TEXT NOT NULL REFERENCES dining_tables(id) ON DELETE RESTRICT,
    created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    status TEXT NOT NULL DEFAULT 'OPEN',
    idempotency_key TEXT UNIQUE,
    total_amount INTEGER NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
    payment_method TEXT NOT NULL DEFAULT 'TRANSFER',
    payment_status TEXT NOT NULL DEFAULT 'PENDING',
    payment_confirmed_at TIMESTAMP WITH TIME ZONE,
    payment_confirmed_by TEXT REFERENCES users(id),
    payment_reference TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    closed_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'TRANSFER';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'PENDING';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_confirmed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_confirmed_by TEXT REFERENCES users(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_reference TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_table_status ON orders (table_id, status);

CREATE TABLE IF NOT EXISTS kitchen_batches (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    batch_number INTEGER NOT NULL DEFAULT 1,
    idempotency_key TEXT NOT NULL UNIQUE,
    sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_batches_sent_at ON kitchen_batches (sent_at);

CREATE TABLE IF NOT EXISTS order_items (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    menu_item_id TEXT NOT NULL REFERENCES menu_items(id) ON DELETE RESTRICT,
    kitchen_batch_id TEXT REFERENCES kitchen_batches(id) ON DELETE SET NULL,
    item_name_snapshot TEXT NOT NULL,
    unit_price_snapshot INTEGER NOT NULL CHECK (unit_price_snapshot >= 0),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    status TEXT NOT NULL DEFAULT 'NEW',
    cancel_reason TEXT,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_status ON order_items (order_id, status);
CREATE INDEX IF NOT EXISTS idx_order_items_batch ON order_items (kitchen_batch_id);

-- 5. BẢNG INVENTORY_LEDGER
CREATE TABLE IF NOT EXISTS inventory_ledger (
    id TEXT PRIMARY KEY,
    menu_item_id TEXT NOT NULL REFERENCES menu_items(id) ON DELETE RESTRICT,
    order_item_id TEXT NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
    movement_type TEXT NOT NULL, -- DEDUCT_ON_SEND, RESTORE_ON_CANCEL
    quantity_delta INTEGER NOT NULL,
    idempotency_key TEXT NOT NULL,
    actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_ledger_item_movement UNIQUE (order_item_id, movement_type)
);

ALTER TABLE inventory_ledger ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_ledger_idemp ON inventory_ledger (idempotency_key);

-- 6. BẢNG ORDER_STATUS_HISTORY & AUDIT_LOGS
CREATE TABLE IF NOT EXISTS order_status_history (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    order_item_id TEXT REFERENCES order_items(id) ON DELETE CASCADE,
    from_status TEXT NOT NULL,
    to_status TEXT NOT NULL,
    changed_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    changed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    note TEXT
);

CREATE INDEX IF NOT EXISTS idx_history_order_time ON order_status_history (order_id, changed_at);

CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    details TEXT,
    ip_address TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_action_time ON audit_logs (action, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_actor_time ON audit_logs (actor_id, created_at);
