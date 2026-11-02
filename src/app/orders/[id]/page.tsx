'use client';

import React, { useState, useEffect, useCallback, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import { 
  UtensilsCrossed, 
  Send, 
  Ban, 
  CheckCircle2, 
  Clock, 
  ChefHat, 
  AlertCircle, 
  ArrowLeft, 
  Receipt, 
  Plus, 
  RefreshCw,
  X,
  FileCheck,
  QrCode
} from 'lucide-react';
import { formatCurrency, formatDateTime } from '@/lib/utils';

interface OrderItem {
  id: string;
  menuItemId: string;
  kitchenBatchId: string | null;
  batchNumber: number | null;
  batchSentAt: string | null;
  itemName: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  status: 'NEW' | 'SENT_TO_KITCHEN' | 'IN_PROGRESS' | 'READY' | 'CANCELLED';
  cancelReason: string | null;
  cancelledAt: string | null;
  createdAt: string;
  canCancel: boolean;
}

interface OrderDetail {
  id: string;
  orderCode: string;
  tableId: string;
  tableCode: string;
  areaName: string;
  creatorName: string;
  status: 'OPEN' | 'SENT_TO_KITCHEN' | 'IN_PROGRESS' | 'READY_TO_CLOSE' | 'CLOSED';
  totalAmount: number;
  version: number;
  createdAt: string;
  closedAt: string | null;
  canCloseOrder: boolean;
  summary: {
    totalItems: number;
    newCount: number;
    sentCount: number;
    inProgressCount: number;
    readyCount: number;
    cancelledCount: number;
  };
  items: OrderItem[];
  batches: { id: string; batchNumber: number; sentAt: string; creatorName: string }[];
}

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const orderId = resolvedParams.id;
  const router = useRouter();

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');
  
  // Modal Hủy món
  const [cancelModalItem, setCancelModalItem] = useState<OrderItem | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);

  // Modal Hủy toàn bộ đơn hàng
  const [cancelOrderModalOpen, setCancelOrderModalOpen] = useState(false);
  const [orderCancelReason, setOrderCancelReason] = useState('');
  const [isCancellingOrder, setIsCancellingOrder] = useState(false);

  // Gửi batch món mới vào bếp
  const [isSendingBatch, setIsSendingBatch] = useState(false);

  // Modal Thêm món mới
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [selectedAddItems, setSelectedAddItems] = useState<{ [id: string]: number }>({});
  const [isAddingItems, setIsAddingItems] = useState(false);

  const fetchOrderDetail = useCallback(async () => {
    try {
      const res = await fetch(`/api/orders/${orderId}`);
      const data = await res.json();
      if (data.success) {
        setOrder(data.order);
      } else {
        setErrorMessage(data.message || 'Lỗi khi tải thông tin đơn hàng.');
      }
    } catch {
      setErrorMessage('Không thể kết nối đến máy chủ.');
    } finally {
      setIsLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    fetchOrderDetail();
    const interval = setInterval(fetchOrderDetail, 8000); // Polling tự động làm mới
    return () => clearInterval(interval);
  }, [fetchOrderDetail]);

  // Load menu khi mở modal thêm món
  const openAddModal = async () => {
    setAddModalOpen(true);
    try {
      const res = await fetch('/api/menu?availability=in_stock');
      const data = await res.json();
      if (data.success) {
        setMenuItems(data.data);
      }
    } catch {}
  };

  // Xác nhận gửi batch món NEW vào bếp
  const handleSendBatch = async () => {
    if (!order || order.summary.newCount === 0) return;

    setIsSendingBatch(true);
    setErrorMessage('');
    setActionSuccess('');

    try {
      const idempKey = `batch_${order.id}_${Date.now()}`;
      const res = await fetch(`/api/orders/${order.id}/send-to-kitchen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idempotency_key: idempKey }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMessage(data.message || 'Lỗi khi gửi batch vào bếp.');
      } else {
        setActionSuccess(`Đã gửi thành công Batch #${data.batch.batchNumber} vào bếp.`);
        await fetchOrderDetail();
      }
    } catch {
      setErrorMessage('Lỗi mạng khi gửi món vào bếp. Món vẫn được lưu an toàn.');
    } finally {
      setIsSendingBatch(false);
    }
  };

  // Xác nhận HỦY MÓN
  const handleConfirmCancel = async () => {
    if (!cancelModalItem || !cancelReason.trim()) {
      alert('Vui lòng nhập lý do hủy món ăn.');
      return;
    }

    setIsCancelling(true);
    setErrorMessage('');
    setActionSuccess('');

    try {
      const res = await fetch(`/api/order-items/${cancelModalItem.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cancel_reason: cancelReason.trim() }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMessage(data.message || 'Lỗi khi hủy món ăn.');
      } else {
        const msg = data.data?.orderAutoClosed
          ? `Đã hủy món '${cancelModalItem.itemName}' thành công. Toàn bộ món đã hủy: Đơn hàng đã tự động chốt và giải phóng bàn ăn.`
          : `Đã hủy món '${cancelModalItem.itemName}' thành công.`;
        setActionSuccess(msg);
        setCancelModalItem(null);
        setCancelReason('');
        await fetchOrderDetail();
      }
    } catch {
      setErrorMessage('Lỗi mạng khi thực hiện hủy món.');
    } finally {
      setIsCancelling(false);
    }
  };

  // Xác nhận HỦY TOÀN BỘ ĐƠN HÀNG
  const handleConfirmCancelOrder = async () => {
    if (!order || !orderCancelReason.trim()) {
      alert('Vui lòng nhập lý do hủy đơn hàng.');
      return;
    }

    setIsCancellingOrder(true);
    setErrorMessage('');
    setActionSuccess('');

    try {
      const res = await fetch(`/api/orders/${order.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cancel_reason: orderCancelReason.trim() }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMessage(data.message || 'Lỗi khi hủy đơn hàng.');
      } else {
        setActionSuccess(data.message || 'Đã hủy toàn bộ đơn hàng và giải phóng bàn ăn thành công.');
        setCancelOrderModalOpen(false);
        setOrderCancelReason('');
        await fetchOrderDetail();
      }
    } catch {
      setErrorMessage('Lỗi mạng khi thực hiện hủy đơn hàng.');
    } finally {
      setIsCancellingOrder(false);
    }
  };

  // Thêm các món mới vào order
  const handleAddItemsSubmit = async () => {
    const itemsToAdd = Object.entries(selectedAddItems)
      .filter(([_, qty]) => qty > 0)
      .map(([mId, qty]) => ({ menu_item_id: mId, quantity: qty }));

    if (itemsToAdd.length === 0) {
      alert('Vui lòng chọn số lượng ít nhất một món.');
      return;
    }

    setIsAddingItems(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: itemsToAdd }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.message || 'Lỗi khi thêm món.');
      } else {
        setActionSuccess('Đã thêm món mới vào đơn. Hãy bấm Gửi bếp để chuyển các món này sang bếp.');
        setAddModalOpen(false);
        setSelectedAddItems({});
        await fetchOrderDetail();
      }
    } catch {
      setErrorMessage('Lỗi mạng khi thêm món.');
    } finally {
      setIsAddingItems(false);
    }
  };

  const getItemStatusBadge = (status: OrderItem['status']) => {
    switch (status) {
      case 'NEW':
        return { label: 'Chờ gửi bếp', classes: 'bg-slate-700 text-slate-300 border-slate-600' };
      case 'SENT_TO_KITCHEN':
        return { label: 'Đã gửi bếp', classes: 'bg-amber-500/10 text-amber-400 border-amber-500/30' };
      case 'IN_PROGRESS':
        return { label: 'Đang chế biến', classes: 'bg-blue-500/10 text-blue-400 border-blue-500/30' };
      case 'READY':
        return { label: 'Sẵn sàng phục vụ', classes: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' };
      case 'CANCELLED':
        return { label: 'Đã hủy', classes: 'bg-red-500/10 text-red-400 border-red-500/30 line-through' };
      default:
        return { label: status, classes: 'bg-slate-800 text-slate-400 border-slate-700' };
    }
  };

  const getOrderStatusBadge = (status: OrderDetail['status']) => {
    switch (status) {
      case 'OPEN':
        return { label: 'Đang mở (Chờ gửi)', classes: 'bg-slate-500/10 text-slate-300 border-slate-500/30' };
      case 'SENT_TO_KITCHEN':
        return { label: 'Đã chuyển bếp', classes: 'bg-amber-500/10 text-amber-400 border-amber-500/30' };
      case 'IN_PROGRESS':
        return { label: 'Bếp đang làm', classes: 'bg-blue-500/10 text-blue-400 border-blue-500/30' };
      case 'READY_TO_CLOSE':
        return { label: 'Sẵn sàng chốt đơn', classes: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' };
      case 'CLOSED':
        return { label: 'Đã chốt (Mô phỏng)', classes: 'bg-purple-500/10 text-purple-400 border-purple-500/30' };
      default:
        return { label: status, classes: 'bg-slate-800 text-slate-400 border-slate-700' };
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950">
        <Navbar />
        <div className="max-w-5xl mx-auto px-4 py-16 text-center text-slate-400">
          <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          Đang tải chi tiết đơn hàng...
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-slate-950">
        <Navbar />
        <div className="max-w-md mx-auto px-4 py-20 text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
          <h2 className="text-xl font-bold text-slate-100">Không tìm thấy đơn hàng</h2>
          <p className="text-slate-400 text-sm mt-1 mb-5">{errorMessage || 'Đơn hàng không tồn tại hoặc đã bị xóa.'}</p>
          <Link href="/tables" className="touch-target px-4 py-2 rounded-xl bg-amber-500 text-slate-950 font-bold text-sm">
            Về sơ đồ bàn
          </Link>
        </div>
      </div>
    );
  }

  const orderBadge = getOrderStatusBadge(order.status);

  return (
    <div className="min-h-screen bg-slate-950 pb-20">
      <Navbar />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        
        {/* Navigation & Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <Link
              href="/tables"
              className="touch-target p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-extrabold text-slate-100 tracking-tight">
                  {order.orderCode}
                </h1>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${orderBadge.classes}`}>
                  {orderBadge.label}
                </span>
              </div>
              <p className="text-slate-400 text-xs sm:text-sm mt-0.5">
                Bàn: <strong className="text-amber-400">{order.tableCode}</strong> ({order.areaName}) &bull; Mở lúc: {formatDateTime(order.createdAt)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={fetchOrderDetail}
              className="touch-target p-2 rounded-xl bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800"
              title="Làm mới"
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            {/* Nút Xem trang khách theo dõi */}
            <Link
              href={`/track/table/${encodeURIComponent(order.tableCode)}`}
              target="_blank"
              title="Mở giao diện khách ngồi tại bàn theo dõi tiến độ"
              className="touch-target px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 font-semibold text-xs sm:text-sm border border-slate-800 transition-colors flex items-center gap-1.5"
            >
              <QrCode className="w-4 h-4 text-amber-400" />
              <span className="hidden sm:inline">Khách theo dõi</span>
            </Link>

            {/* Nút Thêm món mới */}
            {order.status !== 'CLOSED' && (
              <button
                onClick={openAddModal}
                className="touch-target px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 font-semibold text-xs sm:text-sm border border-slate-700 transition-colors flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Thêm món</span>
              </button>
            )}

            {/* Nút Hủy toàn bộ đơn hàng */}
            {order.status !== 'CLOSED' && (
              <button
                onClick={() => setCancelOrderModalOpen(true)}
                className="touch-target px-3.5 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 font-semibold text-xs sm:text-sm border border-red-500/30 transition-colors flex items-center gap-1.5"
                title="Hủy toàn bộ đơn hàng và giải phóng bàn ăn"
              >
                <Ban className="w-4 h-4" />
                <span>Hủy đơn</span>
              </button>
            )}

            {/* Nút Xem hóa đơn & Chốt đơn */}
            <Link
              href={`/orders/${order.id}/invoice`}
              className={`touch-target px-4 py-2 rounded-xl font-bold text-xs sm:text-sm transition-all flex items-center gap-1.5 ${
                order.canCloseOrder || order.status === 'CLOSED'
                  ? 'bg-amber-500 hover:bg-amber-600 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
              }`}
            >
              <Receipt className="w-4 h-4" />
              <span>{order.status === 'CLOSED' ? 'Xem hóa đơn' : 'Hóa đơn / Chốt đơn'}</span>
            </Link>
          </div>
        </div>

        {/* Thông báo Thành công / Thất bại */}
        {actionSuccess && (
          <div className="mb-6 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <span>{actionSuccess}</span>
          </div>
        )}

        {errorMessage && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-center gap-2.5">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Banner gửi batch món mới nếu có món NEW */}
        {order.summary.newCount > 0 && order.status !== 'CLOSED' && (
          <div className="mb-6 p-4 rounded-2xl glass-panel border border-amber-500/30 bg-amber-500/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="font-bold text-amber-400 text-sm flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Có {order.summary.newCount} món mới đang chờ gửi bếp
              </div>
              <div className="text-slate-400 text-xs mt-0.5">
                Các món này chưa trừ tồn kho. Bấm &quot;Gửi bếp ngay&quot; để tạo batch mới và trừ tồn kho nguyên tử.
              </div>
            </div>

            <button
              onClick={handleSendBatch}
              disabled={isSendingBatch}
              className="touch-target px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 text-slate-950 font-bold text-sm shadow-md shadow-amber-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isSendingBatch ? (
                <>
                  <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                  <span>Đang gửi...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Gửi bếp ngay</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* Tóm tắt tổng tiền & tiến độ */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="glass-panel p-3.5 rounded-2xl border border-slate-800">
            <div className="text-xs text-slate-400 font-medium">Tổng tiền (Chưa hủy)</div>
            <div className="text-lg font-extrabold text-amber-400 mt-0.5">
              {formatCurrency(order.totalAmount)}
            </div>
          </div>

          <div className="glass-panel p-3.5 rounded-2xl border border-slate-800">
            <div className="text-xs text-slate-400 font-medium">Món sẵn sàng</div>
            <div className="text-lg font-bold text-emerald-400 mt-0.5">
              {order.summary.readyCount} / {order.summary.totalItems - order.summary.cancelledCount}
            </div>
          </div>

          <div className="glass-panel p-3.5 rounded-2xl border border-slate-800">
            <div className="text-xs text-slate-400 font-medium">Đang làm / Đã gửi</div>
            <div className="text-lg font-bold text-blue-400 mt-0.5">
              {order.summary.inProgressCount + order.summary.sentCount}
            </div>
          </div>

          <div className="glass-panel p-3.5 rounded-2xl border border-slate-800">
            <div className="text-xs text-slate-400 font-medium">Món đã hủy</div>
            <div className="text-lg font-bold text-red-400 mt-0.5">
              {order.summary.cancelledCount}
            </div>
          </div>
        </div>

        {/* Bảng danh sách món ăn trong Order */}
        <div className="glass-panel rounded-2xl border border-slate-800 overflow-hidden shadow-xl mb-6">
          <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
            <h2 className="font-bold text-slate-100 text-base flex items-center gap-2">
              <UtensilsCrossed className="w-5 h-5 text-amber-500" />
              Danh sách món ăn trong đơn
            </h2>
            <span className="text-xs text-slate-400">
              Tổng {order.items.length} dòng
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-900/60 text-slate-400 text-xs uppercase tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Món ăn</th>
                  <th className="py-3 px-4">Batch</th>
                  <th className="py-3 px-4 text-center">SL</th>
                  <th className="py-3 px-4 text-right">Đơn giá</th>
                  <th className="py-3 px-4 text-right">Thành tiền</th>
                  <th className="py-3 px-4">Trạng thái</th>
                  <th className="py-3 px-4 text-center">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {order.items.map((item) => {
                  const itemBadge = getItemStatusBadge(item.status);
                  const isCancelled = item.status === 'CANCELLED';

                  return (
                    <tr key={item.id} className={isCancelled ? 'opacity-40 bg-slate-900/40' : 'hover:bg-slate-900/30'}>
                      <td className="py-3.5 px-4 font-medium text-slate-200">
                        <div>{item.itemName}</div>
                        {isCancelled && item.cancelReason && (
                          <div className="text-[11px] text-red-400 font-normal italic mt-0.5">
                            Lý do: {item.cancelReason}
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-xs text-slate-400 whitespace-nowrap">
                        {item.batchNumber ? (
                          <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                            #{item.batchNumber}
                          </span>
                        ) : (
                          <span className="text-slate-500 italic">Chưa gửi</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-center font-bold text-slate-100">
                        {item.quantity}
                      </td>

                      <td className="py-3.5 px-4 text-right text-slate-300 whitespace-nowrap font-mono text-xs">
                        {formatCurrency(item.unitPrice)}
                      </td>

                      <td className="py-3.5 px-4 text-right font-bold text-amber-400 whitespace-nowrap font-mono text-xs">
                        {isCancelled ? (
                          <span className="line-through text-slate-500">
                            {formatCurrency(item.lineTotal)}
                          </span>
                        ) : (
                          formatCurrency(item.lineTotal)
                        )}
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${itemBadge.classes}`}>
                          {itemBadge.label}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        {order.status !== 'CLOSED' && item.canCancel && (
                          <button
                            type="button"
                            onClick={() => {
                              setCancelModalItem(item);
                              setCancelReason('');
                            }}
                            className="touch-target px-2.5 py-1 rounded-lg text-xs font-semibold text-red-400 hover:bg-red-500/10 border border-red-500/30 transition-colors"
                          >
                            Hủy món
                          </button>
                        )}
                        {!item.canCancel && !isCancelled && (
                          <span className="text-[11px] text-slate-500 italic">
                            Không thể hủy
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

      </main>

      {/* MODAL XÁC NHẬN HỦY MÓN (BẮT BUỘC NHẬP LÝ DO) */}
      {cancelModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="max-w-md w-full glass-panel rounded-2xl p-6 border border-slate-700 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <h3 className="font-bold text-slate-100 text-base flex items-center gap-2 text-red-400">
                <Ban className="w-5 h-5" />
                Xác nhận hủy món ăn
              </h3>
              <button
                onClick={() => setCancelModalItem(null)}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mb-4 text-sm text-slate-300">
              Bạn có chắc chắn muốn hủy món: <strong className="text-slate-100">{cancelModalItem.itemName}</strong> (x{cancelModalItem.quantity})?
              <div className="text-xs text-slate-400 mt-1">
                {cancelModalItem.status === 'SENT_TO_KITCHEN' && (
                  <span className="text-amber-400">
                    &bull; Món này đã gửi bếp: Khi hủy sẽ tự động hoàn lại {cancelModalItem.quantity} phần vào tồn kho đúng một lần.
                  </span>
                )}
                {cancelModalItem.status === 'NEW' && (
                  <span>
                    &bull; Món này chưa gửi bếp: Hủy trực tiếp, không hoàn tồn kho.
                  </span>
                )}
              </div>
            </div>

            <div className="mb-5">
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Lý do hủy món <span className="text-red-400">*</span>:
              </label>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                rows={3}
                placeholder="Nhập lý do hủy (ví dụ: Khách đổi món, Hết nguyên liệu phụ, v.v.)..."
                required
                className="w-full p-3 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-red-500"
              />
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setCancelModalItem(null)}
                className="touch-target px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-medium text-sm hover:bg-slate-700"
              >
                Đóng
              </button>
              <button
                type="button"
                disabled={isCancelling || !cancelReason.trim()}
                onClick={handleConfirmCancel}
                className="touch-target px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-sm shadow-md shadow-red-600/20 disabled:opacity-50"
              >
                {isCancelling ? 'Đang hủy...' : 'Xác nhận hủy món'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL THÊM MÓN MỚI VÀO ĐƠN */}
      {addModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="max-w-2xl w-full max-h-[85vh] flex flex-col glass-panel rounded-2xl border border-slate-700 shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-slate-100 text-base flex items-center gap-2">
                <Plus className="w-5 h-5 text-amber-500" />
                Thêm món vào đơn hàng ({order.orderCode})
              </h3>
              <button onClick={() => setAddModalOpen(false)} className="text-slate-400 hover:text-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-3 flex-1">
              {menuItems.map(item => {
                const qty = selectedAddItems[item.id] || 0;
                return (
                  <div key={item.id} className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold text-slate-200 text-sm">{item.name}</div>
                      <div className="text-xs text-amber-400 font-mono">{formatCurrency(item.currentPrice)} &bull; Còn {item.stockQuantity}</div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedAddItems(prev => ({ ...prev, [item.id]: Math.max(0, (prev[item.id] || 0) - 1) }))}
                        className="touch-target w-7 h-7 rounded-lg bg-slate-800 text-slate-300 flex items-center justify-center"
                      >
                        -
                      </button>
                      <span className="w-6 text-center text-sm font-bold text-slate-100">{qty}</span>
                      <button
                        type="button"
                        onClick={() => setSelectedAddItems(prev => ({ ...prev, [item.id]: Math.min(item.stockQuantity, (prev[item.id] || 0) + 1) }))}
                        className="touch-target w-7 h-7 rounded-lg bg-slate-800 text-slate-300 flex items-center justify-center"
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="px-6 py-4 border-t border-slate-800 flex items-center justify-end gap-3 bg-slate-900/60">
              <button
                type="button"
                onClick={() => setAddModalOpen(false)}
                className="touch-target px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-medium text-sm"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={isAddingItems}
                onClick={handleAddItemsSubmit}
                className="touch-target px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-sm shadow-md"
              >
                {isAddingItems ? 'Đang thêm...' : 'Lưu món vào đơn'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL HỦY TOÀN BỘ ĐƠN HÀNG */}
      {cancelOrderModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="max-w-md w-full glass-panel rounded-2xl p-6 border border-slate-700 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <h3 className="font-bold text-slate-100 text-base flex items-center gap-2 text-red-400">
                <Ban className="w-5 h-5" />
                Hủy toàn bộ đơn hàng {order.orderCode}
              </h3>
              <button
                onClick={() => {
                  setCancelOrderModalOpen(false);
                  setOrderCancelReason('');
                }}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-slate-300 mb-4">
              Bạn có chắc chắn muốn hủy toàn bộ đơn hàng <strong className="text-amber-400">{order.orderCode}</strong> cho bàn <strong className="text-amber-400">{order.tableCode}</strong>?
            </p>

            <div className="p-3 bg-red-500/10 rounded-xl border border-red-500/20 text-xs text-red-300 space-y-1 mb-4">
              <div>&bull; Toàn bộ món trong đơn sẽ chuyển sang trạng thái <strong>ĐÃ HỦY</strong>.</div>
              <div>&bull; Các món đã gửi bếp sẽ được <strong>hoàn lại tồn kho</strong> tự động.</div>
              <div>&bull; Bàn {order.tableCode} sẽ được <strong>giải phóng về trạng thái Trống (AVAILABLE)</strong>.</div>
            </div>

            <div className="mb-5">
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Lý do hủy đơn hàng <span className="text-red-400">*</span>
              </label>
              <textarea
                value={orderCancelReason}
                onChange={e => setOrderCancelReason(e.target.value)}
                placeholder="Ví dụ: Khách đổi ý rời quán, đặt nhầm bàn, khách bận việc đột xuất..."
                className="w-full h-24 p-3 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-red-500 transition-colors resize-none placeholder:text-slate-600"
              />
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setCancelOrderModalOpen(false);
                  setOrderCancelReason('');
                }}
                className="touch-target px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-medium text-sm hover:bg-slate-700"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                disabled={isCancellingOrder || !orderCancelReason.trim()}
                onClick={handleConfirmCancelOrder}
                className="touch-target px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-sm shadow-md disabled:opacity-50 flex items-center gap-2"
              >
                {isCancellingOrder ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Đang hủy...</span>
                  </>
                ) : (
                  <span>Xác nhận hủy đơn</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
