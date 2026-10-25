'use client';

import React, { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import { 
  Receipt, 
  CheckCircle2, 
  AlertCircle, 
  ArrowLeft, 
  Printer, 
  ShieldCheck, 
  Clock, 
  UtensilsCrossed,
  X
} from 'lucide-react';
import { formatCurrency, formatDateTime } from '@/lib/utils';

interface InvoiceData {
  id: string;
  orderCode: string;
  tableId: string;
  tableCode: string;
  areaName: string;
  creatorName: string;
  status: 'OPEN' | 'SENT_TO_KITCHEN' | 'IN_PROGRESS' | 'READY_TO_CLOSE' | 'CLOSED';
  totalAmount: number;
  createdAt: string;
  closedAt: string | null;
  canCloseOrder: boolean;
  items: {
    id: string;
    itemName: string;
    unitPrice: number;
    quantity: number;
    lineTotal: number;
    status: string;
  }[];
}

export default function OrderInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const orderId = resolvedParams.id;
  const router = useRouter();

  const [order, setOrder] = useState<InvoiceData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [isClosing, setIsClosing] = useState(false);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [closeSuccess, setCloseSuccess] = useState(false);

  const fetchOrder = async () => {
    try {
      const res = await fetch(`/api/orders/${orderId}`);
      const data = await res.json();
      if (data.success) {
        setOrder(data.order);
      } else {
        setErrorMessage(data.message || 'Không thể tải hóa đơn.');
      }
    } catch {
      setErrorMessage('Lỗi kết nối khi tải hóa đơn.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOrder();
  }, [orderId]);

  // Xử lý chốt đơn mô phỏng
  const handleCloseOrder = async () => {
    setIsClosing(true);
    setErrorMessage('');

    try {
      const res = await fetch(`/api/orders/${orderId}/close`, {
        method: 'POST',
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMessage(data.message || 'Lỗi khi chốt đơn hàng.');
      } else {
        setCloseSuccess(true);
        setConfirmModalOpen(false);
        await fetchOrder();
      }
    } catch {
      setErrorMessage('Lỗi mạng khi chốt đơn.');
    } finally {
      setIsClosing(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950">
        <Navbar />
        <div className="max-w-xl mx-auto px-4 py-20 text-center text-slate-400">
          <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          Đang chuẩn bị hóa đơn mô phỏng...
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
          <h2 className="text-xl font-bold text-slate-100">Không tìm thấy hóa đơn</h2>
          <p className="text-slate-400 text-sm mt-1 mb-5">{errorMessage}</p>
          <Link href="/tables" className="touch-target px-4 py-2 rounded-xl bg-amber-500 text-slate-950 font-bold text-sm">
            Về sơ đồ bàn
          </Link>
        </div>
      </div>
    );
  }

  // Lọc chỉ lấy các món chưa hủy để hiển thị trên hóa đơn
  const validItems = order.items.filter(it => it.status !== 'CANCELLED');
  const isClosed = order.status === 'CLOSED';

  return (
    <div className="min-h-screen bg-slate-950 pb-20">
      <Navbar />

      <main className="max-w-2xl mx-auto px-4 sm:px-6 pt-6">
        
        {/* Navigation & Controls */}
        <div className="flex items-center justify-between mb-6 print:hidden">
          <Link
            href={`/orders/${order.id}`}
            className="touch-target p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-colors flex items-center gap-2 text-sm font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Quay lại đơn hàng</span>
          </Link>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="touch-target px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium border border-slate-700 transition-colors flex items-center gap-2"
            >
              <Printer className="w-4 h-4" />
              <span>In hóa đơn</span>
            </button>
          </div>
        </div>

        {/* Thông báo Thành công hoặc Lỗi */}
        {closeSuccess && (
          <div className="mb-6 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm flex items-center gap-2.5 print:hidden">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <span>Đã chốt đơn hàng mô phỏng thành công! Bàn ăn đã được giải phóng về trạng thái trống.</span>
          </div>
        )}

        {errorMessage && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-center gap-2.5 print:hidden">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* PHIẾU HÓA ĐƠN MÔ PHỎNG (IN ĐƯỢC) */}
        <div className="glass-panel bg-slate-900/90 rounded-2xl p-6 sm:p-8 border border-slate-800 shadow-2xl space-y-6 print:bg-white print:text-black print:border-black print:p-0 print:shadow-none">
          
          {/* Header Nhà Hàng */}
          <div className="text-center pb-6 border-b border-dashed border-slate-800 print:border-black">
            <div className="w-12 h-12 rounded-xl bg-amber-500 text-slate-950 font-bold flex items-center justify-center mx-auto mb-2 print:border">
              <UtensilsCrossed className="w-6 h-6" />
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-100 print:text-black tracking-tight">
              SMART RESTAURANT
            </h1>
            <p className="text-xs text-slate-400 print:text-gray-600 mt-0.5">
              Hệ thống Quản lý Nhà hàng Thông minh AWS
            </p>

            {/* DÒNG BẮT BUỘC: HÓA ĐƠN MÔ PHỎNG */}
            <div className="mt-3 inline-block px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 print:text-black print:border-black text-xs font-bold uppercase tracking-wider">
              Hóa đơn mô phỏng – không thực hiện thanh toán thật
            </div>
          </div>

          {/* Thông tin đơn hàng & Bàn */}
          <div className="grid grid-cols-2 gap-4 text-xs sm:text-sm py-2">
            <div>
              <span className="text-slate-400 print:text-gray-600">Mã đơn: </span>
              <strong className="text-slate-100 print:text-black font-mono">{order.orderCode}</strong>
            </div>
            <div className="text-right">
              <span className="text-slate-400 print:text-gray-600">Bàn: </span>
              <strong className="text-amber-400 print:text-black font-bold">{order.tableCode} ({order.areaName})</strong>
            </div>
            <div>
              <span className="text-slate-400 print:text-gray-600">Nhân viên: </span>
              <span className="text-slate-200 print:text-black">{order.creatorName}</span>
            </div>
            <div className="text-right">
              <span className="text-slate-400 print:text-gray-600">Thời gian: </span>
              <span className="text-slate-200 print:text-black">{formatDateTime(order.createdAt)}</span>
            </div>
            {isClosed && order.closedAt && (
              <div className="col-span-2 text-right text-xs text-purple-400 print:text-black font-semibold">
                Đã chốt lúc: {formatDateTime(order.closedAt)}
              </div>
            )}
          </div>

          {/* Bảng kê chi tiết món ăn (Snapshot) */}
          <div className="pt-2">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="border-b border-dashed border-slate-700 print:border-black text-slate-400 print:text-black text-[11px] uppercase">
                <tr>
                  <th className="py-2">Món ăn</th>
                  <th className="py-2 text-center">SL</th>
                  <th className="py-2 text-right">Đơn giá</th>
                  <th className="py-2 text-right">Thành tiền</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 print:divide-gray-300">
                {validItems.map((item) => (
                  <tr key={item.id}>
                    <td className="py-2.5 pr-2 font-medium text-slate-200 print:text-black">
                      {item.itemName}
                    </td>
                    <td className="py-2.5 px-2 text-center font-bold text-slate-100 print:text-black">
                      {item.quantity}
                    </td>
                    <td className="py-2.5 px-2 text-right text-slate-300 print:text-black font-mono text-xs">
                      {formatCurrency(item.unitPrice)}
                    </td>
                    <td className="py-2.5 pl-2 text-right font-bold text-slate-100 print:text-black font-mono text-xs">
                      {formatCurrency(item.lineTotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Tổng tiền thanh toán */}
          <div className="pt-4 border-t-2 border-dashed border-slate-700 print:border-black space-y-2">
            <div className="flex items-center justify-between text-base sm:text-lg font-black text-slate-100 print:text-black">
              <span>TỔNG TIỀN THANH TOÁN:</span>
              <span className="text-amber-400 print:text-black font-mono text-xl sm:text-2xl">
                {formatCurrency(order.totalAmount)}
              </span>
            </div>

            <div className="text-[11px] text-slate-500 print:text-gray-500 text-center pt-3 border-t border-slate-800 print:border-gray-300">
              Cảm ơn quý khách đã dùng bữa tại nhà hàng!
              <br />
              Đơn hàng này được ghi nhận trong cơ sở dữ liệu PostgreSQL cho đề tài nghiên cứu.
            </div>
          </div>

          {/* NÚT CHỐT ĐƠN MÔ PHỎNG */}
          {!isClosed && (
            <div className="pt-4 border-t border-slate-800 print:hidden">
              <button
                type="button"
                disabled={!order.canCloseOrder || isClosing}
                onClick={() => setConfirmModalOpen(true)}
                className={`touch-target w-full py-4 px-4 rounded-xl font-black text-sm uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
                  order.canCloseOrder
                    ? 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 shadow-xl shadow-amber-500/25'
                    : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                }`}
              >
                <ShieldCheck className="w-5 h-5" />
                <span>
                  {order.canCloseOrder
                    ? 'Xác nhận chốt đơn mô phỏng'
                    : 'Chưa đủ điều kiện chốt đơn (Món chưa sẵn sàng)'}
                </span>
              </button>

              {!order.canCloseOrder && (
                <p className="text-xs text-amber-400 text-center mt-2">
                  * Đơn chỉ có thể chốt khi toàn bộ các món chưa hủy đều đã được bếp chuyển sang trạng thái Sẵn sàng (READY).
                </p>
              )}
            </div>
          )}

          {isClosed && (
            <div className="p-4 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-300 text-xs text-center font-semibold print:hidden flex items-center justify-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-purple-400" />
              Đơn hàng này đã được chốt mô phỏng hoàn tất và lưu trữ vĩnh viễn.
            </div>
          )}

        </div>

      </main>

      {/* MODAL XÁC NHẬN CHỐT ĐƠN */}
      {confirmModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="max-w-md w-full glass-panel rounded-2xl p-6 border border-slate-700 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <h3 className="font-bold text-slate-100 text-base flex items-center gap-2 text-amber-400">
                <Receipt className="w-5 h-5" />
                Xác nhận chốt đơn mô phỏng
              </h3>
              <button onClick={() => setConfirmModalOpen(false)} className="text-slate-400 hover:text-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-slate-300 mb-4 leading-relaxed">
              Bạn có chắc chắn muốn chốt đơn <strong className="text-slate-100">{order.orderCode}</strong> cho bàn <strong className="text-amber-400">{order.tableCode}</strong>?
            </p>

            <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 text-xs text-slate-400 space-y-1 mb-5">
              <div>&bull; Tổng tiền: <strong className="text-slate-100">{formatCurrency(order.totalAmount)}</strong></div>
              <div>&bull; Bàn {order.tableCode} sẽ tự động được giải phóng về trạng thái <strong>Trống (AVAILABLE)</strong>.</div>
              <div>&bull; Thao tác này là chốt đơn mô phỏng, không thực hiện thu tiền hay lưu trữ thông tin thanh toán.</div>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmModalOpen(false)}
                className="touch-target px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-medium text-sm hover:bg-slate-700"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                disabled={isClosing}
                onClick={handleCloseOrder}
                className="touch-target px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-sm shadow-md disabled:opacity-50 flex items-center gap-2"
              >
                {isClosing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                    <span>Đang chốt...</span>
                  </>
                ) : (
                  <span>Đồng ý chốt đơn</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
