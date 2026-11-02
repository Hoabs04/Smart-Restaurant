'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import { 
  Users, 
  Clock, 
  Utensils, 
  RefreshCw, 
  PlusCircle, 
  AlertTriangle,
  Layers,
  ArrowRight,
  QrCode,
  Store,
  CheckCircle2,
  ShoppingBag,
  ChefHat,
  Check,
  X,
  Truck
} from 'lucide-react';
import { formatDateTime, formatCurrency } from '@/lib/utils';
import TableQrModal from '@/components/TableQrModal';

interface DiningTable {
  id: string;
  areaName: string;
  tableCode: string;
  capacity: number;
  status: 'AVAILABLE' | 'OCCUPIED' | 'AWAITING_PAYMENT';
  version: number;
  currentOrder: {
    id: string;
    orderCode: string;
    status: string;
    totalAmount: number;
    createdAt: string;
    activeItemsCount: number;
  } | null;
}

interface OnlineOrderItem {
  externalItemName: string;
  quantity: number;
  unitPrice: number;
  internalMenuItemName?: string;
  internalMenuItemId?: string;
}

interface OnlineOrder {
  id: string;
  channel_id: string;
  internal_order_id: string | null;
  external_order_id: string;
  external_order_code: string;
  channel_code: string;
  channel_name: string;
  channel_status: string;
  normalized_status: string;
  customer_name: string;
  customer_phone?: string;
  delivery_address?: string;
  driver_name?: string;
  driver_phone?: string;
  total_amount: number;
  platform_fee: number;
  net_revenue: number;
  items: OnlineOrderItem[];
  ordered_at: string;
  created_at: string;
}

export default function TablesPage() {
  // Chuyển đổi giữa chế độ xem: Bàn ăn tại quán hoặc Đơn Online từ sàn
  const [activeView, setActiveView] = useState<'DINE_IN' | 'ONLINE_ORDERS'>('DINE_IN');

  // State bàn ăn
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [areas, setAreas] = useState<string[]>([]);
  const [selectedArea, setSelectedArea] = useState<string>('ALL');
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [conflictNotice, setConflictNotice] = useState<string | null>(null);
  const [selectedQrTable, setSelectedQrTable] = useState<{ tableCode: string; areaName: string } | null>(null);

  // State đơn online từ sàn (GrabFood / ShopeeFood / BeFood)
  const [onlineOrders, setOnlineOrders] = useState<OnlineOrder[]>([]);
  const [isOnlineLoading, setIsOnlineLoading] = useState(false);
  const [onlineStatusFilter, setOnlineStatusFilter] = useState<string>('ALL');
  const [onlineChannelFilter, setOnlineChannelFilter] = useState<string>('ALL');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 1. Tải danh sách bàn ăn
  const fetchTables = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const res = await fetch('/api/tables');
      const data = await res.json();
      if (data.success) {
        setTables(data.data || []);
        setAreas(data.areas || []);
      } else {
        setErrorMessage(data.message || 'Lỗi khi tải dữ liệu bàn.');
      }
    } catch {
      setErrorMessage('Không thể kết nối đến máy chủ.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 2. Tải danh sách đơn online từ tất cả các sàn
  const fetchOnlineOrders = useCallback(async () => {
    setIsOnlineLoading(true);
    try {
      const res = await fetch('/api/admin/channels/all/orders?limit=100');
      const data = await res.json();
      if (data.success) {
        setOnlineOrders(data.orders || []);
      }
    } catch {
      // Bỏ qua lỗi ngầm khi polling
    } finally {
      setIsOnlineLoading(false);
    }
  }, []);

  // Polling tự động làm mới mỗi 10 giây
  useEffect(() => {
    fetchTables();
    fetchOnlineOrders();

    const interval = setInterval(() => {
      fetchTables();
      fetchOnlineOrders();
    }, 10000);

    return () => clearInterval(interval);
  }, [fetchTables, fetchOnlineOrders]);

  // Đếm số đơn sàn đang chờ duyệt (NEW hoặc CONFIRMED mà chưa đẩy vào bếp)
  const pendingOnlineOrders = onlineOrders.filter(
    (o) => o.normalized_status === 'NEW' || (o.normalized_status === 'CONFIRMED' && !o.internal_order_id)
  );
  const pendingOnlineCount = pendingOnlineOrders.length;

  // Lọc bàn ăn theo khu vực
  const filteredTables = selectedArea === 'ALL'
    ? tables
    : tables.filter(t => t.areaName === selectedArea);

  // Lọc đơn sàn theo trạng thái & kênh
  const filteredOnlineOrders = onlineOrders.filter((o) => {
    const matchStatus = onlineStatusFilter === 'ALL' ? true : o.normalized_status === onlineStatusFilter;
    const matchChannel = onlineChannelFilter === 'ALL' ? true : o.channel_code.toUpperCase() === onlineChannelFilter.toUpperCase();
    return matchStatus && matchChannel;
  });

  // Badge trạng thái bàn ăn
  const getTableStatusBadge = (status: DiningTable['status']) => {
    switch (status) {
      case 'AVAILABLE':
        return {
          label: 'Trống',
          classes: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
          dot: 'bg-emerald-500',
        };
      case 'OCCUPIED':
        return {
          label: 'Đang phục vụ',
          classes: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
          dot: 'bg-amber-500',
        };
      case 'AWAITING_PAYMENT':
        return {
          label: 'Chờ thanh toán',
          classes: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
          dot: 'bg-purple-500',
        };
      default:
        return {
          label: status,
          classes: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
          dot: 'bg-slate-500',
        };
    }
  };

  // Badge nhận diện sàn
  const getChannelBadge = (code: string) => {
    switch (code.toUpperCase()) {
      case 'GRABFOOD':
        return {
          name: 'GrabFood',
          badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
        };
      case 'SHOPEEFOOD':
        return {
          name: 'ShopeeFood',
          badge: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
        };
      case 'BEFOOD':
        return {
          name: 'BeFood',
          badge: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
        };
      default:
        return {
          name: code,
          badge: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
        };
    }
  };

  // Badge trạng thái đơn sàn
  const getOnlineStatusBadge = (status: string) => {
    switch (status) {
      case 'NEW':
        return { label: 'Đơn mới', classes: 'bg-blue-500/15 text-blue-400 border-blue-500/30' };
      case 'CONFIRMED':
        return { label: 'Đã xác nhận', classes: 'bg-amber-500/15 text-amber-400 border-amber-500/30' };
      case 'PREPARING':
        return { label: 'Đang nấu', classes: 'bg-purple-500/15 text-purple-400 border-purple-500/30' };
      case 'COMPLETED':
        return { label: 'Hoàn tất', classes: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' };
      case 'CANCELLED':
        return { label: 'Đã hủy', classes: 'bg-red-500/15 text-red-400 border-red-500/30' };
      default:
        return { label: status, classes: 'bg-slate-500/15 text-slate-400 border-slate-500/30' };
    }
  };

  // Hành động Phục vụ: Đẩy đơn vào Bếp
  const handlePushToKitchen = async (order: OnlineOrder) => {
    setActionLoadingId(order.id);
    setActionNotice(null);
    try {
      const res = await fetch(
        `/api/admin/channels/${order.channel_code.toLowerCase()}/orders/${order.id}/push-kitchen`,
        { method: 'POST' }
      );
      const data = await res.json();
      if (data.success) {
        setActionNotice({ type: 'success', text: `Đã chuyển đơn [${order.external_order_code}] vào Queue Bếp thành công!` });
        await fetchOnlineOrders();
      } else {
        setActionNotice({ type: 'error', text: data.message || 'Không thể đẩy đơn vào bếp.' });
      }
    } catch {
      setActionNotice({ type: 'error', text: 'Lỗi kết nối khi gửi đơn vào bếp.' });
    } finally {
      setActionLoadingId(null);
    }
  };

  // Hành động Phục vụ: Cập nhật trạng thái đơn (Xác nhận, Hoàn tất, Hủy)
  const handleUpdateOnlineStatus = async (order: OnlineOrder, targetStatus: string, reason?: string) => {
    setActionLoadingId(order.id);
    setActionNotice(null);
    try {
      const res = await fetch(
        `/api/admin/channels/${order.channel_code.toLowerCase()}/orders/${order.id}/status`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: targetStatus, reason }),
        }
      );
      const data = await res.json();
      if (data.success) {
        setActionNotice({ type: 'success', text: `Đã chuyển trạng thái đơn [${order.external_order_code}] thành công!` });
        await fetchOnlineOrders();
      } else {
        setActionNotice({ type: 'error', text: data.message || 'Không thể cập nhật trạng thái đơn.' });
      }
    } catch {
      setActionNotice({ type: 'error', text: 'Lỗi kết nối khi cập nhật đơn.' });
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 pb-16">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        
        {/* Banner thông báo: Có đơn sàn mới chờ duyệt (khi đang ở màn hình Bàn ăn) */}
        {pendingOnlineCount > 0 && activeView === 'DINE_IN' && (
          <div className="mb-6 p-4 rounded-2xl bg-gradient-to-r from-orange-500/20 via-amber-500/15 to-orange-500/20 border border-orange-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg shadow-orange-500/10 animate-pulse">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-orange-500/30 text-orange-400 flex items-center justify-center shrink-0">
                <Store className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  <span>Có {pendingOnlineCount} đơn hàng mới từ sàn Online (GrabFood / ShopeeFood) đang chờ duyệt!</span>
                  <span className="w-2.5 h-2.5 rounded-full bg-orange-400 animate-ping" />
                </div>
                <div className="text-xs text-slate-300 mt-0.5">
                  Nhân viên phục vụ có thể kiểm tra món và bấm duyệt chuyển thẳng vào Bếp ngay tại đây.
                </div>
              </div>
            </div>
            <button
              onClick={() => setActiveView('ONLINE_ORDERS')}
              className="touch-target px-4 py-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition-transform active:scale-95 shadow-md shadow-orange-500/20 whitespace-nowrap"
            >
              <span>Xem & Duyệt đơn ngay</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Thông báo thao tác hành động nếu có */}
        {actionNotice && (
          <div className={`mb-6 p-4 rounded-xl border text-sm flex items-center justify-between transition-all ${
            actionNotice.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-red-500/10 border-red-500/30 text-red-300'
          }`}>
            <div className="flex items-center gap-2">
              {actionNotice.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400" />
              ) : (
                <AlertTriangle className="w-5 h-5 shrink-0 text-red-400" />
              )}
              <span>{actionNotice.text}</span>
            </div>
            <button
              onClick={() => setActionNotice(null)}
              className="text-xs opacity-70 hover:opacity-100 p-1"
            >
              ✕
            </button>
          </div>
        )}

        {/* Tiêu đề & Nút chuyển đổi View Chế độ làm việc */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-100 tracking-tight flex items-center gap-2.5">
              {activeView === 'DINE_IN' ? (
                <>
                  <Layers className="w-6 h-6 text-amber-500" />
                  <span>Sơ đồ bàn ăn</span>
                </>
              ) : (
                <>
                  <Store className="w-6 h-6 text-orange-500" />
                  <span>Đơn hàng từ sàn Online</span>
                </>
              )}
            </h1>
            <p className="text-slate-400 text-sm mt-0.5">
              {activeView === 'DINE_IN'
                ? 'Theo dõi trực quan trạng thái bàn ăn, đơn hàng đang mở và sức chứa'
                : 'Tiếp nhận, kiểm tra món và hỗ trợ duyệt đơn từ GrabFood, ShopeeFood, BeFood vào Bếp'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (activeView === 'DINE_IN') fetchTables();
                else fetchOnlineOrders();
              }}
              disabled={isLoading || isOnlineLoading}
              className="touch-target px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium transition-colors border border-slate-700 flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading || isOnlineLoading ? 'animate-spin' : ''}`} />
              <span>Làm mới</span>
            </button>
          </div>
        </div>

        {/* Thanh chuyển Tabs Chế độ làm việc chính */}
        <div className="flex items-center gap-3 mb-6 border-b border-slate-800 pb-4 overflow-x-auto">
          <button
            onClick={() => setActiveView('DINE_IN')}
            className={`touch-target px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
              activeView === 'DINE_IN'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-800'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Bàn ăn tại quán ({tables.length})</span>
          </button>

          <button
            onClick={() => setActiveView('ONLINE_ORDERS')}
            className={`touch-target px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 relative whitespace-nowrap ${
              activeView === 'ONLINE_ORDERS'
                ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-slate-950 shadow-md shadow-orange-500/20'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-800'
            }`}
          >
            <Store className="w-4 h-4" />
            <span>Đơn Online từ Sàn ({onlineOrders.length})</span>
            {pendingOnlineCount > 0 && (
              <span className="ml-1 px-2 py-0.5 rounded-full text-xs font-extrabold bg-red-600 text-white animate-pulse shadow-xs">
                {pendingOnlineCount} chờ duyệt
              </span>
            )}
          </button>
        </div>

        {/* ==================================================================== */}
        {/* VIEW 1: SƠ ĐỒ BÀN ĂN TẠI QUÁN (DINE_IN)                              */}
        {/* ==================================================================== */}
        {activeView === 'DINE_IN' && (
          <div>
            {/* Cảnh báo xung đột phiên bản bàn */}
            {conflictNotice && (
              <div className="mb-6 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-sm flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 shrink-0" />
                  <span>{conflictNotice}</span>
                </div>
                <button
                  onClick={() => { setConflictNotice(null); fetchTables(); }}
                  className="px-3 py-1 rounded-lg bg-amber-500 text-slate-950 font-semibold text-xs"
                >
                  Tải lại
                </button>
              </div>
            )}

            {/* Bộ lọc Khu vực (Tabs) */}
            <div className="flex items-center gap-2 overflow-x-auto pb-3 mb-6">
              <button
                onClick={() => setSelectedArea('ALL')}
                className={`touch-target px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
                  selectedArea === 'ALL'
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
                    : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
                }`}
              >
                Tất cả khu vực ({tables.length})
              </button>

              {areas.map((area) => {
                const count = tables.filter(t => t.areaName === area).length;
                const isSelected = selectedArea === area;
                return (
                  <button
                    key={area}
                    onClick={() => setSelectedArea(area)}
                    className={`touch-target px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
                      isSelected
                        ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
                        : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
                    }`}
                  >
                    {area} ({count})
                  </button>
                );
              })}
            </div>

            {/* Loading Skeleton */}
            {isLoading && tables.length === 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                  <div key={i} className="h-44 rounded-2xl bg-slate-900/60 animate-pulse border border-slate-800" />
                ))}
              </div>
            )}

            {/* Error State */}
            {errorMessage && (
              <div className="p-8 text-center glass-panel rounded-2xl border border-red-500/20 max-w-lg mx-auto">
                <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-3" />
                <h3 className="text-lg font-bold text-slate-100">Không thể tải dữ liệu bàn</h3>
                <p className="text-slate-400 text-sm mt-1 mb-4">{errorMessage}</p>
                <button
                  onClick={fetchTables}
                  className="touch-target px-5 py-2.5 rounded-xl bg-amber-500 text-slate-950 font-bold text-sm"
                >
                  Thử lại ngay
                </button>
              </div>
            )}

            {/* Empty State */}
            {!isLoading && filteredTables.length === 0 && !errorMessage && (
              <div className="p-12 text-center glass-panel rounded-2xl border border-slate-800 max-w-md mx-auto">
                <Utensils className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                <h3 className="text-base font-bold text-slate-200">Không có bàn ăn nào</h3>
                <p className="text-slate-400 text-sm mt-1">Chưa có bàn nào được cấu hình trong khu vực này.</p>
              </div>
            )}

            {/* Grid danh sách bàn ăn */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredTables.map((table) => {
                const badge = getTableStatusBadge(table.status);
                const hasOrder = !!table.currentOrder;

                return (
                  <div
                    key={table.id}
                    className="glass-panel rounded-2xl p-5 border border-slate-800 hover:border-slate-700 transition-all flex flex-col justify-between shadow-lg relative group"
                  >
                    <div>
                      {/* Header Card: Mã bàn & Trạng thái */}
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div>
                          <div className="text-lg font-bold text-slate-100 tracking-tight flex items-center gap-2">
                            <span>{table.tableCode}</span>
                            <button
                              type="button"
                              onClick={() => setSelectedQrTable({ tableCode: table.tableCode, areaName: table.areaName })}
                              title="Xem & in mã QR bàn cho khách theo dõi món"
                              className="p-1 rounded-lg bg-slate-800/80 hover:bg-amber-500 hover:text-slate-950 text-slate-400 border border-slate-700 transition-all active:scale-95"
                            >
                              <QrCode className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <div className="text-xs text-slate-400 font-medium">
                            {table.areaName}
                          </div>
                        </div>

                        {/* Badge trạng thái CẢ MÀU VÀ CHỮ */}
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border flex items-center gap-1.5 ${badge.classes}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                          {badge.label}
                        </span>
                      </div>

                      {/* Sức chứa */}
                      <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-4">
                        <Users className="w-4 h-4 text-slate-500" />
                        <span>Sức chứa: <strong className="text-slate-200">{table.capacity} khách</strong></span>
                      </div>

                      {/* Thông tin Order đang mở nếu có */}
                      {hasOrder && table.currentOrder && (
                        <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800/80 mb-4 space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-400">Mã đơn:</span>
                            <span className="font-semibold text-amber-400">{table.currentOrder.orderCode}</span>
                          </div>

                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-400">Món đang mở:</span>
                            <span className="font-semibold text-slate-200">{table.currentOrder.activeItemsCount} món</span>
                          </div>

                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-400">Tạm tính:</span>
                            <span className="font-bold text-slate-100">{formatCurrency(table.currentOrder.totalAmount)}</span>
                          </div>

                          <div className="flex items-center gap-1 text-[11px] text-slate-500 pt-1 border-t border-slate-800">
                            <Clock className="w-3.5 h-3.5" />
                            <span>Mở lúc: {formatDateTime(table.currentOrder.createdAt)}</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Nút hành động chính */}
                    <div className="pt-2">
                      {hasOrder && table.currentOrder ? (
                        <Link
                          href={`/orders/${table.currentOrder.id}`}
                          className="touch-target w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 font-semibold text-sm transition-colors border border-amber-500/30 flex items-center justify-center gap-2"
                        >
                          <span>Xem đơn hiện tại</span>
                          <ArrowRight className="w-4 h-4" />
                        </Link>
                      ) : (
                        <Link
                          href={`/orders/new?tableId=${table.id}&tableCode=${encodeURIComponent(table.tableCode)}&tableVersion=${table.version}`}
                          className="touch-target w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-bold text-sm transition-all shadow-md shadow-amber-500/20 flex items-center justify-center gap-2"
                        >
                          <PlusCircle className="w-4 h-4" />
                          <span>Mở đơn mới</span>
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ==================================================================== */}
        {/* VIEW 2: ĐƠN HÀNG TỪ SÀN ONLINE CHO PHỤC VỤ (ONLINE_ORDERS)            */}
        {/* ==================================================================== */}
        {activeView === 'ONLINE_ORDERS' && (
          <div>
            {/* Thanh lọc trạng thái đơn sàn */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-6 p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
              {/* Lọc trạng thái */}
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { key: 'ALL', label: 'Tất cả' },
                  { key: 'NEW', label: 'Đơn mới' },
                  { key: 'CONFIRMED', label: 'Đã xác nhận' },
                  { key: 'PREPARING', label: 'Đang nấu' },
                  { key: 'COMPLETED', label: 'Hoàn tất' },
                  { key: 'CANCELLED', label: 'Đã hủy' },
                ].map((st) => {
                  const isSel = onlineStatusFilter === st.key;
                  return (
                    <button
                      key={st.key}
                      onClick={() => setOnlineStatusFilter(st.key)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        isSel
                          ? 'bg-orange-500 text-slate-950 shadow-xs'
                          : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                      }`}
                    >
                      {st.label}
                    </button>
                  );
                })}
              </div>

              {/* Lọc theo sàn */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 font-medium">Sàn:</span>
                <select
                  value={onlineChannelFilter}
                  onChange={(e) => setOnlineChannelFilter(e.target.value)}
                  className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:outline-hidden focus:border-orange-500"
                >
                  <option value="ALL">Tất cả sàn</option>
                  <option value="GRABFOOD">GrabFood</option>
                  <option value="SHOPEEFOOD">ShopeeFood</option>
                  <option value="BEFOOD">BeFood</option>
                </select>
              </div>
            </div>

            {/* Loading */}
            {isOnlineLoading && onlineOrders.length === 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="h-64 rounded-2xl bg-slate-900/60 animate-pulse border border-slate-800" />
                ))}
              </div>
            )}

            {/* Empty State */}
            {!isOnlineLoading && filteredOnlineOrders.length === 0 && (
              <div className="p-12 text-center glass-panel rounded-2xl border border-slate-800 max-w-md mx-auto">
                <Store className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                <h3 className="text-base font-bold text-slate-200">Không có đơn hàng nào</h3>
                <p className="text-slate-400 text-sm mt-1">
                  Hiện tại không có đơn nào từ sàn thỏa mãn bộ lọc đã chọn.
                </p>
              </div>
            )}

            {/* Grid danh sách đơn sàn */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredOnlineOrders.map((ord) => {
                const channel = getChannelBadge(ord.channel_code);
                const statusBadge = getOnlineStatusBadge(ord.normalized_status);
                const isActionLoading = actionLoadingId === ord.id;
                const isSentToKitchen = Boolean(ord.internal_order_id);

                return (
                  <div
                    key={ord.id}
                    className="glass-panel rounded-2xl p-5 border border-slate-800 hover:border-slate-700 transition-all flex flex-col justify-between shadow-lg relative"
                  >
                    <div>
                      {/* Header đơn: Nền tảng, Mã đơn & Trạng thái */}
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded-md text-[11px] font-extrabold uppercase border ${channel.badge}`}>
                              {channel.name}
                            </span>
                            <span className="text-sm font-bold text-slate-100">
                              #{ord.external_order_code}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span>{formatDateTime(ord.ordered_at || ord.created_at)}</span>
                          </div>
                        </div>

                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${statusBadge.classes}`}>
                          {statusBadge.label}
                        </span>
                      </div>

                      {/* Thông tin khách hàng & Giao nhận */}
                      <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 mb-3 space-y-1 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400 font-medium">Khách hàng:</span>
                          <span className="font-semibold text-slate-200">{ord.customer_name || 'Khách đặt qua sàn'}</span>
                        </div>
                        {ord.customer_phone && (
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400 font-medium">Số điện thoại:</span>
                            <span className="font-mono text-slate-300">{ord.customer_phone}</span>
                          </div>
                        )}
                        {ord.driver_name && (
                          <div className="flex items-center justify-between pt-1 border-t border-slate-800/60">
                            <span className="text-slate-400 flex items-center gap-1">
                              <Truck className="w-3.5 h-3.5 text-amber-400" /> Tài xế:
                            </span>
                            <span className="font-medium text-amber-300">{ord.driver_name}</span>
                          </div>
                        )}
                      </div>

                      {/* Danh sách món ăn */}
                      <div className="mb-4">
                        <div className="text-xs font-bold text-slate-300 mb-2 flex items-center gap-1.5">
                          <ShoppingBag className="w-3.5 h-3.5 text-orange-400" />
                          <span>Món ăn ({ord.items.length}):</span>
                        </div>
                        <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                          {ord.items.map((it, idx) => (
                            <div
                              key={idx}
                              className="text-xs flex items-start justify-between gap-2 p-1.5 rounded-lg bg-slate-900/40 border border-slate-800/40"
                            >
                              <div>
                                <span className="font-bold text-orange-400 mr-1.5">{it.quantity}x</span>
                                <span className="text-slate-200 font-medium">{it.externalItemName}</span>
                                {it.internalMenuItemName && (
                                  <div className="text-[10px] text-amber-400/80">
                                    ↳ {it.internalMenuItemName}
                                  </div>
                                )}
                              </div>
                              <span className="font-mono text-slate-400 shrink-0">
                                {formatCurrency(it.unitPrice * it.quantity)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Phần chân Card: Tổng tiền & Nút duyệt đơn */}
                    <div className="pt-3 border-t border-slate-800">
                      <div className="flex items-center justify-between mb-3 text-xs">
                        <span className="text-slate-400 font-medium">Tổng tiền thu khách:</span>
                        <span className="text-base font-extrabold text-amber-400 font-mono">
                          {formatCurrency(ord.total_amount)}
                        </span>
                      </div>

                      {/* Các nút hành động thao tác cho nhân viên phục vụ */}
                      <div className="flex items-center gap-2">
                        {/* 1. Nút Gửi Bếp (Nếu đơn chưa gửi bếp) */}
                        {!isSentToKitchen && ord.normalized_status !== 'CANCELLED' && (
                          <button
                            type="button"
                            onClick={() => handlePushToKitchen(ord)}
                            disabled={isActionLoading}
                            className="touch-target flex-1 py-2.5 px-3 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-slate-950 font-bold text-xs transition-all flex items-center justify-center gap-1.5 shadow-md shadow-orange-500/20 active:scale-95 disabled:opacity-50"
                          >
                            <ChefHat className="w-4 h-4" />
                            <span>{isActionLoading ? 'Đang gửi...' : 'Gửi Bếp'}</span>
                          </button>
                        )}

                        {/* 2. Nhãn đã gửi bếp */}
                        {isSentToKitchen && (
                          <div className="flex-1 py-2 px-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-bold text-xs flex items-center justify-center gap-1.5">
                            <Check className="w-4 h-4" />
                            <span>Đã gửi Bếp</span>
                          </div>
                        )}

                        {/* 3. Nút Xác nhận (Nếu đơn NEW chưa xác nhận) */}
                        {ord.normalized_status === 'NEW' && (
                          <button
                            type="button"
                            onClick={() => handleUpdateOnlineStatus(ord, 'CONFIRMED')}
                            disabled={isActionLoading}
                            className="touch-target py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700 flex items-center justify-center gap-1"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />
                            <span>Xác nhận</span>
                          </button>
                        )}

                        {/* 4. Nút Hoàn tất khi tài xế đã lấy món */}
                        {ord.normalized_status === 'PREPARING' && (
                          <button
                            type="button"
                            onClick={() => handleUpdateOnlineStatus(ord, 'COMPLETED')}
                            disabled={isActionLoading}
                            className="touch-target py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1 shadow-sm active:scale-95"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Hoàn tất</span>
                          </button>
                        )}

                        {/* 5. Nút Hủy đơn nếu khách sàn hủy */}
                        {ord.normalized_status !== 'COMPLETED' && ord.normalized_status !== 'CANCELLED' && (
                          <button
                            type="button"
                            onClick={() => {
                              const reason = window.prompt('Nhập lý do hủy đơn hàng:');
                              if (reason) handleUpdateOnlineStatus(ord, 'CANCELLED', reason);
                            }}
                            disabled={isActionLoading}
                            title="Hủy đơn hàng"
                            className="p-2 rounded-xl bg-slate-800/80 hover:bg-red-500/20 text-slate-400 hover:text-red-400 border border-slate-700 transition-all"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>

      {/* Modal hiển thị và in mã QR bàn */}
      {selectedQrTable && (
        <TableQrModal
          isOpen={!!selectedQrTable}
          onClose={() => setSelectedQrTable(null)}
          tableCode={selectedQrTable.tableCode}
          areaName={selectedQrTable.areaName}
        />
      )}
    </div>
  );
}
