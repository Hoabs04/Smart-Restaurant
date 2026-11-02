'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import AdminNavTabs from '@/components/admin/AdminNavTabs';
import { 
  Store, 
  ArrowLeft, 
  Settings, 
  ShoppingBag, 
  Layers, 
  FileText, 
  CheckCircle2, 
  AlertTriangle, 
  RefreshCw, 
  Save, 
  Zap, 
  Plus, 
  Trash2, 
  Copy, 
  Check, 
  X,
  Play,
  Clock,
  DollarSign
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

interface ChannelDetail {
  id: string;
  code: string;
  name: string;
  logo_url: string | null;
  is_active: boolean;
  connection_status: string;
  last_sync_at: string | null;
  last_error_message: string | null;
  auto_confirm_order: boolean;
  mappingCount: number;
  todayOrderCount: number;
  todayRevenue: number;
  credentials: {
    merchantId: string;
    storeId: string;
    appId: string;
    hasAppSecret: boolean;
    hasWebhookSecret: boolean;
    environment: 'SANDBOX' | 'PRODUCTION';
  } | null;
}

interface OrderItem {
  externalItemId: string;
  externalItemName: string;
  quantity: number;
  unitPrice: number;
  internalMenuItemName?: string;
}

interface ExternalOrder {
  id: string;
  internal_order_id?: string | null;
  external_order_id: string;
  external_order_code: string;
  normalized_status: string;
  customer_name: string;
  customer_phone: string;
  delivery_address: string;
  driver_name?: string | null;
  driver_phone?: string | null;
  total_amount: number;
  platform_fee: number;
  net_revenue: number;
  items: OrderItem[];
  ordered_at: string;
}

interface MappingItem {
  id: string;
  internal_menu_item_id: string;
  external_item_id: string;
  external_item_name: string;
  external_price: number;
  sync_stock: boolean;
  internal_name: string;
  internal_price: number;
  stock_quantity: number;
  availability?: boolean;
  last_synced_at?: string | null;
  category_name: string;
}

interface InternalItem {
  id: string;
  name: string;
  current_price: number;
  stock_quantity: number;
  category_name: string;
}

interface SyncLogItem {
  id: string;
  sync_type: string;
  direction: string;
  status: string;
  retry_count: number;
  request_data: string;
  response_data: string;
  error_message: string | null;
  created_at: string;
}

export default function ChannelDetailPage() {
  const params = useParams();
  const channelCode = String(params.channelCode || 'GRABFOOD').toUpperCase();
  const router = useRouter();

  const [channel, setChannel] = useState<ChannelDetail | null>(null);
  const [activeTab, setActiveTab] = useState<'CONFIG' | 'ORDERS' | 'MAPPING' | 'LOGS'>('CONFIG');
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Form Cấu hình Credentials
  const [merchantId, setMerchantId] = useState('');
  const [storeId, setStoreId] = useState('');
  const [appId, setAppId] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [environment, setEnvironment] = useState<'SANDBOX' | 'PRODUCTION'>('SANDBOX');
  const [autoConfirm, setAutoConfirm] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Tab Đơn hàng
  const [orders, setOrders] = useState<ExternalOrder[]>([]);
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Tab Mapping
  const [mappings, setMappings] = useState<MappingItem[]>([]);
  const [internalItems, setInternalItems] = useState<InternalItem[]>([]);
  const [mappingModalOpen, setMappingModalOpen] = useState(false);
  const [selectedInternalId, setSelectedInternalId] = useState('');
  const [externalItemId, setExternalItemId] = useState('');
  const [externalItemName, setExternalItemName] = useState('');
  const [externalPrice, setExternalPrice] = useState(0);

  // Tab Mapping & Menu Sync Preview
  const [syncMenuModalOpen, setSyncMenuModalOpen] = useState(false);
  const [menuDiffs, setMenuDiffs] = useState<any[]>([]);
  const [isSyncingMenu, setIsSyncingMenu] = useState(false);
  const [confirmMenuSyncCheckbox, setConfirmMenuSyncCheckbox] = useState(false);
  const [isSyncingStock, setIsSyncingStock] = useState(false);

  // Tab Logs
  const [logs, setLogs] = useState<SyncLogItem[]>([]);

  // Sao chép webhook URL
  const [copiedWebhook, setCopiedWebhook] = useState(false);

  const handleOpenMenuSyncModal = async () => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const res = await fetch(`/api/admin/channels/${channelCode}/menu/sync`);
      const data = await res.json();
      if (data.success) {
        setMenuDiffs(data.diffs || []);
        setConfirmMenuSyncCheckbox(false);
        setSyncMenuModalOpen(true);
      } else {
        setErrorMessage(data.message || 'Lỗi khi so khớp bảng giá.');
      }
    } catch {
      setErrorMessage('Lỗi kết nối khi tải chênh lệch bảng giá.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmMenuSync = async () => {
    if (!confirmMenuSyncCheckbox) {
      setErrorMessage('Vui lòng tích xác nhận đồng ý cập nhật giá lên sàn.');
      return;
    }
    setIsSyncingMenu(true);
    setErrorMessage('');
    try {
      const res = await fetch(`/api/admin/channels/${channelCode}/menu/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmed: true }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMessage(data.message || 'Đã đồng bộ Menu & Bảng giá lên sàn thành công!');
        setSyncMenuModalOpen(false);
        fetchMappings();
        setTimeout(() => setSuccessMessage(''), 5000);
      } else {
        setErrorMessage(data.message || 'Lỗi khi đồng bộ menu.');
      }
    } catch {
      setErrorMessage('Lỗi kết nối khi gửi lệnh đồng bộ menu.');
    } finally {
      setIsSyncingMenu(false);
    }
  };

  const handleQuickStockSync = async () => {
    setIsSyncingStock(true);
    setErrorMessage('');
    try {
      const res = await fetch(`/api/admin/channels/${channelCode}/menu/stock-sync`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMessage(data.message || 'Đã cập nhật trạng thái còn/hết món lên sàn.');
        fetchMappings();
        setTimeout(() => setSuccessMessage(''), 5000);
      } else {
        setErrorMessage(data.message || 'Lỗi cập nhật tồn kho.');
      }
    } catch {
      setErrorMessage('Lỗi kết nối khi đồng bộ tồn kho.');
    } finally {
      setIsSyncingStock(false);
    }
  };

  const fetchChannelDetail = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const res = await fetch(`/api/admin/channels/${channelCode}`);
      const data = await res.json();
      if (data.success && data.channel) {
        setChannel(data.channel);
        setIsActive(data.channel.is_active);
        setAutoConfirm(data.channel.auto_confirm_order);
        if (data.channel.credentials) {
          setMerchantId(data.channel.credentials.merchantId || '');
          setStoreId(data.channel.credentials.storeId || '');
          setAppId(data.channel.credentials.appId || '');
          setEnvironment(data.channel.credentials.environment || 'SANDBOX');
        }
      } else {
        setErrorMessage(data.message || 'Không tìm thấy kênh.');
      }
    } catch {
      setErrorMessage('Lỗi kết nối khi tải chi tiết kênh.');
    } finally {
      setIsLoading(false);
    }
  }, [channelCode]);

  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/channels/${channelCode}/orders?status=${statusFilter}`);
      const data = await res.json();
      if (data.success) {
        setOrders(data.orders || []);
      }
    } catch {}
  }, [channelCode, statusFilter]);

  const fetchMappings = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/channels/${channelCode}/mappings`);
      const data = await res.json();
      if (data.success) {
        setMappings(data.mappings || []);
        setInternalItems(data.internalItems || []);
      }
    } catch {}
  }, [channelCode]);

  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/channels/${channelCode}/logs`);
      const data = await res.json();
      if (data.success) {
        setLogs(data.logs || []);
      }
    } catch {}
  }, [channelCode]);

  useEffect(() => {
    fetchChannelDetail();
  }, [fetchChannelDetail]);

  useEffect(() => {
    if (activeTab === 'ORDERS') fetchOrders();
    if (activeTab === 'MAPPING') fetchMappings();
    if (activeTab === 'LOGS') fetchLogs();
  }, [activeTab, fetchOrders, fetchMappings, fetchLogs]);

  // Lưu cấu hình
  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setErrorMessage('');
    try {
      const res = await fetch(`/api/admin/channels/${channelCode}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchant_id: merchantId,
          store_id: storeId,
          app_id: appId,
          app_secret: appSecret || undefined,
          webhook_secret: webhookSecret || undefined,
          environment,
          auto_confirm_order: autoConfirm,
          is_active: isActive,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setSuccessMessage('Đã lưu cấu hình kênh bán hàng thành công!');
        setAppSecret('');
        setWebhookSecret('');
        fetchChannelDetail();
        setTimeout(() => setSuccessMessage(''), 4000);
      } else {
        setErrorMessage(data.message || 'Lỗi khi lưu cấu hình.');
      }
    } catch {
      setErrorMessage('Lỗi mạng khi lưu cấu hình.');
    } finally {
      setIsSaving(false);
    }
  };

  // Kiểm tra kết nối API
  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`/api/admin/channels/${channelCode}/test`, {
        method: 'POST',
      });
      const data = await res.json();
      setTestResult({
        success: data.success,
        message: data.message || 'Kết quả kiểm tra kết nối.',
      });
      fetchChannelDetail();
    } catch {
      setTestResult({
        success: false,
        message: 'Lỗi mạng khi kiểm tra kết nối.',
      });
    } finally {
      setIsTesting(false);
    }
  };

  // Cập nhật trạng thái đơn hàng
  const handleUpdateOrderStatus = async (orderId: string, nextStatus: string) => {
    try {
      const res = await fetch(`/api/admin/channels/${channelCode}/orders/${orderId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMessage(`Đã cập nhật trạng thái đơn sang ${nextStatus}.`);
        fetchOrders();
        setTimeout(() => setSuccessMessage(''), 3000);
      } else {
        setErrorMessage(data.message || 'Lỗi khi cập nhật trạng thái đơn.');
      }
    } catch {
      setErrorMessage('Lỗi mạng khi đổi trạng thái đơn.');
    }
  };

  // Đẩy đơn hàng vào Bếp thủ công
  const handlePushToKitchen = async (orderId: string) => {
    try {
      const res = await fetch(`/api/admin/channels/${channelCode}/orders/${orderId}/push-kitchen`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMessage(data.message || 'Đã đẩy đơn vào Bếp thành công!');
        fetchOrders();
        setTimeout(() => setSuccessMessage(''), 3000);
      } else {
        setErrorMessage(data.message || 'Lỗi khi đẩy đơn vào Bếp.');
      }
    } catch {
      setErrorMessage('Lỗi mạng khi đẩy đơn vào Bếp.');
    }
  };

  // Thêm liên kết món ăn
  const handleCreateMapping = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`/api/admin/channels/${channelCode}/mappings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          internal_menu_item_id: selectedInternalId,
          external_item_id: externalItemId,
          external_item_name: externalItemName,
          external_price: externalPrice,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMessage('Đã thêm liên kết món ăn thành công.');
        setMappingModalOpen(false);
        fetchMappings();
        setTimeout(() => setSuccessMessage(''), 3000);
      } else {
        setErrorMessage(data.message || 'Lỗi khi gán món.');
      }
    } catch {
      setErrorMessage('Lỗi mạng khi lưu liên kết món.');
    }
  };

  // Xóa mapping
  const handleDeleteMapping = async (id: string) => {
    if (!confirm('Bạn có chắc chắn muốn xóa liên kết món này?')) return;
    try {
      const res = await fetch(`/api/admin/channels/${channelCode}/mappings?id=${id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        fetchMappings();
      }
    } catch {}
  };

  const webhookUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/api/webhooks/channels/${channelCode.toLowerCase()}`
    : `/api/webhooks/channels/${channelCode.toLowerCase()}`;

  const copyWebhookUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopiedWebhook(true);
    setTimeout(() => setCopiedWebhook(false), 2500);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <AdminNavTabs showCreateDishButton={false} />

        {/* Nút quay lại */}
        <div className="mb-4">
          <Link
            href="/admin/channels"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Quay lại danh sách Kênh Bán Hàng</span>
          </Link>
        </div>

        {/* Thông báo */}
        {successMessage && (
          <div className="mb-4 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-semibold flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <span>{successMessage}</span>
            </div>
            <button onClick={() => setSuccessMessage('')}>
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {errorMessage && (
          <div className="mb-4 p-4 rounded-2xl bg-red-50 border border-red-200 text-red-800 text-sm font-semibold flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button onClick={() => setErrorMessage('')}>
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Header Kênh */}
        {channel && (
          <div className="glass-card rounded-2xl border border-slate-200 p-6 mb-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-600 text-white font-black text-xl flex items-center justify-center shadow-md">
                {channel.name.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div className="flex items-center gap-2.5">
                  <h1 className="text-2xl font-black text-slate-900">{channel.name}</h1>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                    channel.is_active ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {channel.is_active ? 'Đang bật' : 'Đã tắt'}
                  </span>
                </div>
                <div className="text-xs text-slate-500 mt-1 flex items-center gap-4">
                  <span>Mã: <strong className="text-slate-700">{channel.code}</strong></span>
                  <span>Đồng bộ gần nhất: <strong className="text-slate-700">{channel.last_sync_at ? new Date(channel.last_sync_at).toLocaleTimeString('vi-VN') : 'Chưa'}</strong></span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleTestConnection}
                disabled={isTesting}
                className="touch-target px-4 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs shadow-xs flex items-center gap-2"
              >
                <Zap className={`w-4 h-4 ${isTesting ? 'animate-bounce text-amber-500' : 'text-amber-500'}`} />
                <span>{isTesting ? 'Đang kiểm tra...' : 'Kiểm tra kết nối'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Kết quả Test kết nối */}
        {testResult && (
          <div className={`mb-6 p-4 rounded-2xl border text-sm font-semibold flex items-center gap-3 shadow-xs ${
            testResult.success
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-red-50 text-red-800 border-red-200'
          }`}>
            {testResult.success ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
            )}
            <div>
              <div className="font-bold">{testResult.success ? 'Kết nối thành công!' : 'Kết nối thất bại!'}</div>
              <div className="text-xs opacity-90">{testResult.message}</div>
            </div>
          </div>
        )}

        {/* Các Tab chức năng */}
        <div className="flex items-center gap-2 border-b border-slate-200 mb-6 pb-2 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setActiveTab('CONFIG')}
            className={`touch-target px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 shrink-0 ${
              activeTab === 'CONFIG'
                ? 'bg-orange-600 text-white shadow-md shadow-orange-600/20'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Settings className="w-4 h-4" />
            <span>Cấu hình & Kết nối</span>
          </button>

          <button
            onClick={() => setActiveTab('ORDERS')}
            className={`touch-target px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 shrink-0 ${
              activeTab === 'ORDERS'
                ? 'bg-orange-600 text-white shadow-md shadow-orange-600/20'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <ShoppingBag className="w-4 h-4" />
            <span>Đơn hàng từ Kênh</span>
          </button>

          <button
            onClick={() => setActiveTab('MAPPING')}
            className={`touch-target px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 shrink-0 ${
              activeTab === 'MAPPING'
                ? 'bg-orange-600 text-white shadow-md shadow-orange-600/20'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Quy đổi Món ăn</span>
          </button>

          <button
            onClick={() => setActiveTab('LOGS')}
            className={`touch-target px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 shrink-0 ${
              activeTab === 'LOGS'
                ? 'bg-orange-600 text-white shadow-md shadow-orange-600/20'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Lịch sử Đồng bộ</span>
          </button>
        </div>

        {/* TAB 1: CẤU HÌNH & KẾT NỐI */}
        {activeTab === 'CONFIG' && (
          <div className="glass-card rounded-2xl border border-slate-200 p-6 shadow-xs max-w-3xl">
            <h2 className="text-base font-extrabold text-slate-900 mb-4 pb-2 border-b border-slate-100 flex items-center gap-2">
              <Settings className="w-5 h-5 text-orange-600" />
              Thông tin Tài khoản Merchant & Webhook
            </h2>

            <form onSubmit={handleSaveConfig} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Merchant ID (ID Cửa hàng trên Sàn) *
                  </label>
                  <input
                    type="text"
                    required
                    value={merchantId}
                    onChange={(e) => setMerchantId(e.target.value)}
                    placeholder="VD: MER-12345 hoặc REST-987"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Store ID / Chi Nhánh (Tùy chọn)
                  </label>
                  <input
                    type="text"
                    value={storeId}
                    onChange={(e) => setStoreId(e.target.value)}
                    placeholder="VD: STORE-01"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Client ID / App ID
                  </label>
                  <input
                    type="text"
                    value={appId}
                    onChange={(e) => setAppId(e.target.value)}
                    placeholder="App ID đối tác"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Môi trường Hoạt động
                  </label>
                  <select
                    value={environment}
                    onChange={(e) => setEnvironment(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                  >
                    <option value="SANDBOX">Sandbox (Thử nghiệm & Giả lập)</option>
                    <option value="PRODUCTION">Production (Thực tế chính thức)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Client Secret / App Secret (Được mã hóa an toàn AES-256-GCM)
                </label>
                <input
                  type="password"
                  value={appSecret}
                  onChange={(e) => setAppSecret(e.target.value)}
                  placeholder={channel?.credentials?.hasAppSecret ? '•••••••••••••••••••• (Để trống nếu không đổi)' : 'Nhập Secret do sàn cấp'}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                />
              </div>

              {/* Webhook Endpoint */}
              <div className="pt-2">
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Webhook URL (Điền vào cổng thông tin Merchant của sàn)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={webhookUrl}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-100 text-xs font-mono font-bold text-slate-700 select-all"
                  />
                  <button
                    type="button"
                    onClick={copyWebhookUrl}
                    className="touch-target px-3 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-1.5 shrink-0"
                  >
                    {copiedWebhook ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                    <span>{copiedWebhook ? 'Đã sao chép' : 'Sao chép'}</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Webhook Secret (Khóa xác thực chữ ký số HMAC-SHA256)
                </label>
                <input
                  type="password"
                  value={webhookSecret}
                  onChange={(e) => setWebhookSecret(e.target.value)}
                  placeholder={channel?.credentials?.hasWebhookSecret ? '•••••••••••••••••••• (Để trống nếu không đổi)' : 'Nhập Webhook Secret'}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                />
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-slate-800">Tự động nhận đơn (Auto-confirm)</div>
                    <div className="text-xs text-slate-500">Tự động xác nhận đơn mới gửi sang Queue Bếp mà không cần duyệt thủ công</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={autoConfirm}
                    onChange={(e) => setAutoConfirm(e.target.checked)}
                    className="w-5 h-5 rounded text-orange-600 focus:ring-orange-500"
                  />
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                  <div>
                    <div className="text-xs font-bold text-slate-800">Bật kết nối kênh này</div>
                    <div className="text-xs text-slate-500">Khi tắt, mọi đơn hàng gửi về sẽ tự động bị từ chối an toàn</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="w-5 h-5 rounded text-orange-600 focus:ring-orange-500"
                  />
                </div>
              </div>

              <div className="pt-4 flex items-center justify-end gap-3">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="touch-target px-6 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-sm shadow-md shadow-orange-600/20 flex items-center gap-2"
                >
                  {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  <span>Lưu Cấu Hình</span>
                </button>
              </div>
            </form>
          </div>
        )}

        {/* TAB 2: ĐƠN HÀNG TỪ KÊNH */}
        {activeTab === 'ORDERS' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {['ALL', 'NEW', 'CONFIRMED', 'PREPARING', 'COMPLETED', 'CANCELLED'].map((st) => (
                  <button
                    key={st}
                    onClick={() => setStatusFilter(st)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      statusFilter === st
                        ? 'bg-orange-600 text-white shadow-xs'
                        : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {st === 'ALL' ? 'Tất cả' : st}
                  </button>
                ))}
              </div>

              <button
                onClick={fetchOrders}
                className="touch-target px-3.5 py-1.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs shadow-xs flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Làm mới</span>
              </button>
            </div>

            <div className="glass-card rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
              {orders.length === 0 ? (
                <div className="p-12 text-center text-slate-500 text-sm">
                  Chưa có đơn hàng nào ở trạng thái này.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 text-xs uppercase font-extrabold">
                        <th className="py-3 px-4">Mã Đơn</th>
                        <th className="py-3 px-4">Khách Hàng</th>
                        <th className="py-3 px-4">Địa Chỉ</th>
                        <th className="py-3 px-4">Món Ăn</th>
                        <th className="py-3 px-4 text-right">Tổng Tiền</th>
                        <th className="py-3 px-4 text-right">Thực Nhận</th>
                        <th className="py-3 px-4 text-center">Trạng Thái</th>
                        <th className="py-3 px-4 text-center">Thao Tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {orders.map((o) => (
                        <tr key={o.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                            {o.external_order_code}
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="font-semibold text-slate-800">{o.customer_name}</div>
                            <div className="text-xs text-slate-400">{o.customer_phone}</div>
                            {o.driver_name && (
                              <div className="text-[11px] font-bold text-emerald-600 mt-0.5 flex items-center gap-1">
                                <span>🛵 {o.driver_name}</span>
                                {o.driver_phone && <span className="text-slate-400">({o.driver_phone})</span>}
                              </div>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-xs text-slate-600 max-w-xs truncate">
                            {o.delivery_address}
                          </td>
                          <td className="py-3.5 px-4 text-xs text-slate-700">
                            {o.items.map((it, idx) => (
                              <div key={idx} className="flex items-center gap-1">
                                <span>{it.quantity}x {it.externalItemName}</span>
                                {it.internalMenuItemName && (
                                  <span className="text-orange-600 text-[11px]">({it.internalMenuItemName})</span>
                                )}
                              </div>
                            ))}
                          </td>
                          <td className="py-3.5 px-4 text-right font-bold text-slate-900">
                            {formatCurrency(o.total_amount)}
                          </td>
                          <td className="py-3.5 px-4 text-right font-bold text-emerald-700">
                            {formatCurrency(o.net_revenue)}
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <div className="flex flex-col items-center gap-1">
                              <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                {o.normalized_status}
                              </span>
                              {o.internal_order_id ? (
                                <span className="text-[10px] font-extrabold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                                  ✓ Đã gửi Bếp
                                </span>
                              ) : o.normalized_status !== 'CANCELLED' ? (
                                <span className="text-[10px] text-slate-400">
                                  Chưa vào Bếp
                                </span>
                              ) : null}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <div className="flex items-center justify-center gap-1.5 flex-wrap">
                              {/* Nút Đẩy vào Bếp nếu chưa có trong Bếp */}
                              {!o.internal_order_id && o.normalized_status !== 'CANCELLED' && o.normalized_status !== 'COMPLETED' && (
                                <button
                                  type="button"
                                  onClick={() => handlePushToKitchen(o.id)}
                                  className="px-2 py-1 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-slate-950 text-xs font-extrabold shadow-xs"
                                  title="Đẩy đơn vào Queue Bếp ngay lập tức"
                                >
                                  Gửi Bếp
                                </button>
                              )}

                              {o.normalized_status === 'NEW' && (
                                <button
                                  onClick={() => handleUpdateOrderStatus(o.id, 'CONFIRMED')}
                                  className="px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
                                >
                                  Xác nhận
                                </button>
                              )}
                              {o.normalized_status === 'CONFIRMED' && (
                                <button
                                  onClick={() => handleUpdateOrderStatus(o.id, 'PREPARING')}
                                  className="px-2 py-1 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold"
                                >
                                  Đang nấu
                                </button>
                              )}
                              {o.normalized_status === 'PREPARING' && (
                                <button
                                  onClick={() => handleUpdateOrderStatus(o.id, 'COMPLETED')}
                                  className="px-2 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold"
                                >
                                  Hoàn tất
                                </button>
                              )}
                              {o.normalized_status !== 'COMPLETED' && o.normalized_status !== 'CANCELLED' && (
                                <button
                                  onClick={() => handleUpdateOrderStatus(o.id, 'CANCELLED')}
                                  className="px-2 py-1 rounded-lg bg-red-50 text-red-700 hover:bg-red-100 text-xs font-bold"
                                >
                                  Hủy
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: QUY ĐỔI MÓN ĂN (MAPPING) */}
        {activeTab === 'MAPPING' && (
          <div className="space-y-4">
            {/* Cảnh báo chênh lệch giá nếu có */}
            {mappings.filter(m => m.internal_price !== m.external_price).length > 0 && (
              <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-semibold flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs animate-in fade-in">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                  <span>
                    Phát hiện <strong>{mappings.filter(m => m.internal_price !== m.external_price).length}</strong> món ăn có giá nội bộ thay đổi so với giá đang bán trên {channel?.name}.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleOpenMenuSyncModal}
                  className="px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shrink-0 shadow-xs transition-all flex items-center gap-1.5"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>Xem trước & Đồng bộ giá</span>
                </button>
              </div>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <p className="text-xs text-slate-500 font-medium">
                Liên kết mã món trên GrabFood/ShopeeFood với món ăn trong thực đơn nội bộ
              </p>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleQuickStockSync}
                  disabled={isSyncingStock}
                  className="touch-target px-3.5 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs shadow-xs flex items-center gap-1.5 transition-all"
                  title="Cập nhật trạng thái Còn món / Hết món cho các món đã liên kết"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-blue-600 ${isSyncingStock ? 'animate-spin' : ''}`} />
                  <span>{isSyncingStock ? 'Đang cập nhật...' : 'Đồng bộ tồn kho'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleOpenMenuSyncModal}
                  className="touch-target px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-xs shadow-md shadow-emerald-600/20 flex items-center gap-1.5 transition-all"
                  title="Xem trước và đồng bộ menu lên sàn (yêu cầu xác nhận)"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>Đồng bộ Menu lên sàn</span>
                </button>

                <button
                  type="button"
                  onClick={() => setMappingModalOpen(true)}
                  className="touch-target px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs shadow-md shadow-orange-600/20 flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>Thêm liên kết</span>
                </button>
              </div>
            </div>

            <div className="glass-card rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
              {mappings.length === 0 ? (
                <div className="p-12 text-center text-slate-500 text-sm">
                  Chưa có món nào được liên kết cho kênh này. Hãy nhấn &quot;Thêm liên kết&quot;.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 text-xs uppercase font-extrabold">
                        <th className="py-3 px-4">Món Nội Bộ</th>
                        <th className="py-3 px-4">Danh Mục</th>
                        <th className="py-3 px-4">Giá Nội Bộ</th>
                        <th className="py-3 px-4">Mã Món Sàn</th>
                        <th className="py-3 px-4">Tên Món Trên Sàn</th>
                        <th className="py-3 px-4 text-right">Giá Trên Sàn</th>
                        <th className="py-3 px-4 text-center">Trạng Thái Kho</th>
                        <th className="py-3 px-4 text-center">Tự Động Kho</th>
                        <th className="py-3 px-4 text-center">Lần Sync Cuối</th>
                        <th className="py-3 px-4 text-center">Xóa</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {mappings.map((m) => {
                        const isPriceChanged = m.internal_price !== m.external_price;
                        const isOutOfStock = m.stock_quantity <= 0 || m.availability === false;
                        return (
                          <tr key={m.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-3.5 px-4 font-bold text-slate-900">
                              {m.internal_name}
                            </td>
                            <td className="py-3.5 px-4 text-xs text-slate-500">
                              {m.category_name}
                            </td>
                            <td className="py-3.5 px-4 text-slate-700 font-semibold">
                              {formatCurrency(m.internal_price)}
                            </td>
                            <td className="py-3.5 px-4 font-mono text-xs font-bold text-orange-600">
                              {m.external_item_id}
                            </td>
                            <td className="py-3.5 px-4 text-slate-800 font-semibold">
                              {m.external_item_name}
                            </td>
                            <td className="py-3.5 px-4 text-right font-bold text-slate-900">
                              <span className={isPriceChanged ? 'text-amber-600 font-black' : ''}>
                                {formatCurrency(m.external_price)}
                              </span>
                              {isPriceChanged && (
                                <span className="block text-2xs text-amber-700 font-normal">
                                  Lệch {formatCurrency(m.internal_price - m.external_price)}
                                </span>
                              )}
                            </td>
                            <td className="py-3.5 px-4 text-center">
                              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                                isOutOfStock
                                  ? 'bg-red-50 text-red-700 border border-red-200'
                                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              }`}>
                                {isOutOfStock ? 'HẾT MÓN' : `Còn (${m.stock_quantity})`}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                                m.sync_stock ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                              }`}>
                                {m.sync_stock ? 'BẬT' : 'TẮT'}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-center text-xs text-slate-500 font-mono">
                              {m.last_synced_at ? new Date(m.last_synced_at).toLocaleTimeString('vi-VN') : 'Chưa sync'}
                            </td>
                            <td className="py-3.5 px-4 text-center">
                              <button
                                onClick={() => handleDeleteMapping(m.id)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 4: LỊCH SỬ ĐỒNG BỘ (LOGS) */}
        {activeTab === 'LOGS' && (
          <div className="glass-card rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
            {logs.length === 0 ? (
              <div className="p-12 text-center text-slate-500 text-sm">
                Chưa có nhật ký đồng bộ nào.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 text-xs uppercase font-extrabold">
                      <th className="py-3 px-4">Thời Gian</th>
                      <th className="py-3 px-4">Loại Đồng Bộ</th>
                      <th className="py-3 px-4">Chiều</th>
                      <th className="py-3 px-4">Trạng Thái</th>
                      <th className="py-3 px-4">Chi Tiết / Lỗi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {logs.map((l) => (
                      <tr key={l.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3.5 px-4 text-xs font-mono text-slate-500">
                          {new Date(l.created_at).toLocaleString('vi-VN')}
                        </td>
                        <td className="py-3.5 px-4 font-bold text-xs text-slate-800">
                          {l.sync_type}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                            l.direction === 'INBOUND' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'
                          }`}>
                            {l.direction}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                            l.status === 'SUCCESS'
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-red-50 text-red-700'
                          }`}>
                            {l.status}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-xs font-mono text-slate-600 max-w-md truncate">
                          {l.error_message || (l.request_data ? JSON.stringify(l.request_data) : 'Thành công')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Modal Thêm Mapping Món */}
      {mappingModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
              <h3 className="text-lg font-black text-slate-900">Liên Kết Món Ăn</h3>
              <button onClick={() => setMappingModalOpen(false)}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <form onSubmit={handleCreateMapping} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Chọn Món Nội Bộ *
                </label>
                <select
                  required
                  value={selectedInternalId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setSelectedInternalId(id);
                    const item = internalItems.find((i) => i.id === id);
                    if (item) {
                      setExternalItemName(item.name);
                      setExternalPrice(item.current_price);
                    }
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                >
                  <option value="">-- Chọn món trong thực đơn --</option>
                  {internalItems.map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.name} ({formatCurrency(it.current_price)}) - {it.category_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Mã Món Trên Sàn (External Item ID) *
                </label>
                <input
                  type="text"
                  required
                  value={externalItemId}
                  onChange={(e) => setExternalItemId(e.target.value)}
                  placeholder="VD: GF-ITEM-101"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Tên Món Hiển Thị Trên Sàn *
                </label>
                <input
                  type="text"
                  required
                  value={externalItemName}
                  onChange={(e) => setExternalItemName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Giá Bán Trên Sàn (VND) *
                </label>
                <input
                  type="number"
                  required
                  step="1000"
                  value={externalPrice}
                  onChange={(e) => setExternalPrice(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                />
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setMappingModalOpen(false)}
                  className="touch-target px-4 py-2 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="touch-target px-5 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-sm font-bold shadow-md shadow-orange-600/20"
                >
                  Lưu Liên Kết
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Đồng Bộ Menu Lên Sàn (Confirmation Required) */}
      {syncMenuModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                  <Zap className="w-5 h-5 text-emerald-600" />
                  Đồng Bộ Menu & Bảng Giá Lên {channel?.name}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Kiểm tra chênh lệch giá trước khi cập nhật chính thức lên sàn đối tác
                </p>
              </div>
              <button onClick={() => setSyncMenuModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Cảnh báo an toàn */}
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-medium mb-4 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong>Cảnh báo an toàn:</strong> Giá bán trên sàn sẽ được cập nhật trực tiếp theo giá thực đơn nội bộ. Vui lòng rà soát danh sách món ăn dưới đây trước khi bấm xác nhận.
              </div>
            </div>

            {/* Bảng so sánh chênh lệch giá */}
            <div className="flex-1 overflow-y-auto mb-4 border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-extrabold uppercase sticky top-0 border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3">Món Ăn</th>
                    <th className="py-2.5 px-3 text-right">Giá Cũ Trên Sàn</th>
                    <th className="py-2.5 px-3 text-right">Giá Mới Nội Bộ</th>
                    <th className="py-2.5 px-3 text-right">Chênh Lệch</th>
                    <th className="py-2.5 px-3 text-center">Tồn Kho</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {menuDiffs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400">
                        Chưa có món nào được cấu hình quy đổi.
                      </td>
                    </tr>
                  ) : (
                    menuDiffs.map((d) => (
                      <tr key={d.mappingId} className="hover:bg-slate-50/50">
                        <td className="py-2.5 px-3 font-bold text-slate-900">
                          {d.internalItemName}
                          <span className="block text-2xs font-mono font-normal text-slate-400">{d.externalItemId}</span>
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-600 font-medium">
                          {formatCurrency(d.externalPrice)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                          {formatCurrency(d.internalPrice)}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          {d.priceDiff !== 0 ? (
                            <span className={`font-bold ${d.priceDiff > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                              {d.priceDiff > 0 ? `+${formatCurrency(d.priceDiff)}` : formatCurrency(d.priceDiff)}
                            </span>
                          ) : (
                            <span className="text-slate-400">Không đổi</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-2xs font-bold ${
                            d.isOutOfStock ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'
                          }`}>
                            {d.isOutOfStock ? 'Hết món' : `Còn (${d.internalStock})`}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Checkbox bắt buộc xác nhận */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 mb-4">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={confirmMenuSyncCheckbox}
                  onChange={(e) => setConfirmMenuSyncCheckbox(e.target.checked)}
                  className="w-4 h-4 mt-0.5 rounded text-orange-600 focus:ring-orange-500 shrink-0"
                />
                <span className="text-xs font-bold text-slate-800">
                  Tôi đã kiểm tra kỹ bảng giá và xác nhận cập nhật bảng giá cùng danh mục trên sang sàn {channel?.name}.
                </span>
              </label>
            </div>

            {/* Nút hành động */}
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setSyncMenuModalOpen(false)}
                className="touch-target px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleConfirmMenuSync}
                disabled={!confirmMenuSyncCheckbox || isSyncingMenu}
                className={`touch-target px-5 py-2 rounded-xl font-bold text-xs shadow-md flex items-center gap-1.5 transition-all ${
                  confirmMenuSyncCheckbox && !isSyncingMenu
                    ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-emerald-600/20 active:scale-95'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}
              >
                {isSyncingMenu ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Đang đồng bộ...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Xác nhận & Đồng bộ</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

