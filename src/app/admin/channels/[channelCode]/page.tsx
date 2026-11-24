'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import AdminNavTabs from '@/components/admin/AdminNavTabs';
import ChannelOrdersTab from '@/components/admin/channels/ChannelOrdersTab';
import ChannelMappingTab from '@/components/admin/channels/ChannelMappingTab';
import ChannelLogsTab from '@/components/admin/channels/ChannelLogsTab';
import ChannelSyncModals from '@/components/admin/channels/ChannelSyncModals';
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
          <ChannelOrdersTab
            orders={orders}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            onRefresh={fetchOrders}
            onPushToKitchen={handlePushToKitchen}
            onUpdateOrderStatus={handleUpdateOrderStatus}
          />
        )}

        {/* TAB 3: QUY ĐỔI MÓN ĂN (MAPPING) */}
        {activeTab === 'MAPPING' && (
          <ChannelMappingTab
            channelName={channel?.name}
            mappings={mappings}
            isSyncingStock={isSyncingStock}
            onQuickStockSync={handleQuickStockSync}
            onOpenMenuSyncModal={handleOpenMenuSyncModal}
            onOpenAddMappingModal={() => setMappingModalOpen(true)}
            onDeleteMapping={handleDeleteMapping}
          />
        )}

        {/* TAB 4: LỊCH SỬ ĐỒNG BỘ (LOGS) */}
        {activeTab === 'LOGS' && <ChannelLogsTab logs={logs} />}
      </main>

      <ChannelSyncModals
        channelName={channel?.name}
        mappingModalOpen={mappingModalOpen}
        onCloseMappingModal={() => setMappingModalOpen(false)}
        internalItems={internalItems}
        selectedInternalId={selectedInternalId}
        onSelectInternalId={setSelectedInternalId}
        externalItemId={externalItemId}
        onChangeExternalItemId={setExternalItemId}
        externalItemName={externalItemName}
        onChangeExternalItemName={setExternalItemName}
        externalPrice={externalPrice}
        onChangeExternalPrice={setExternalPrice}
        onCreateMapping={handleCreateMapping}
        syncMenuModalOpen={syncMenuModalOpen}
        onCloseSyncMenuModal={() => setSyncMenuModalOpen(false)}
        menuDiffs={menuDiffs}
        confirmMenuSyncCheckbox={confirmMenuSyncCheckbox}
        onChangeConfirmCheckbox={setConfirmMenuSyncCheckbox}
        isSyncingMenu={isSyncingMenu}
        onConfirmMenuSync={handleConfirmMenuSync}
      />
    </div>
  );
}

