export interface ChannelOrderItem {
  externalItemName: string;
  quantity: number;
  internalMenuItemName?: string;
}

export interface ChannelOrder {
  id: string;
  external_order_code: string;
  customer_name: string;
  customer_phone: string;
  delivery_address: string;
  driver_name?: string | null;
  driver_phone?: string | null;
  total_amount: number;
  net_revenue: number;
  normalized_status: string;
  internal_order_id?: string | null;
  items: ChannelOrderItem[];
}

export interface ChannelMapping {
  id: string;
  internal_name: string;
  category_name: string;
  internal_price: number;
  external_item_id: string;
  external_item_name: string;
  external_price: number;
  stock_quantity: number;
  availability?: boolean;
  sync_stock: boolean;
  last_synced_at?: string | null;
}

export interface SyncLogItem {
  id: string;
  created_at: string;
  sync_type: string;
  direction: string;
  status: string;
  error_message?: string | null;
  request_data?: unknown;
}

export interface MenuDiffItem {
  mappingId: string;
  internalItemName: string;
  externalItemId: string;
  externalPrice: number;
  internalPrice: number;
  priceDiff: number;
  isOutOfStock: boolean;
  internalStock: number;
}

export interface InternalMenuItem {
  id: string;
  name: string;
  current_price: number;
  category_name: string;
}
