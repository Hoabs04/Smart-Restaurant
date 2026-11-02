'use client';

import React, { useState, useEffect, useCallback, use } from 'react';
import Link from 'next/link';
import Image from 'next/image';
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
  X,
  QrCode,
  Copy,
  Check,
  Building2,
  CreditCard,
  UserCheck,
  Info
} from 'lucide-react';
import { formatCurrency, formatDateTime } from '@/lib/utils';

interface QrPaymentData {
  configured: boolean;
  message?: string;
  bankBin?: string;
  bankName?: string;
  accountNumber?: string;
  accountName?: string;
  amount?: number;
  orderCode?: string;
  transferContent?: string;
  qrDataUrl?: string;
  vietQrUrl?: string;
}

interface InvoiceData {
  id: string;
  orderCode: string;
  tableId: string;
  tableCode: string;
  areaName: string;
  creatorName: string;
  status: 'OPEN' | 'SENT_TO_KITCHEN' | 'IN_PROGRESS' | 'READY_TO_CLOSE' | 'CLOSED';
  totalAmount: number;
  paymentMethod: string;
  paymentStatus: 'PENDING' | 'MANUALLY_CONFIRMED';
  paymentConfirmedAt: string | null;
  paymentConfirmedBy: string | null;
  paymentConfirmerName: string | null;
  closedByName?: string | null;
  paymentReference: string | null;
  qrPayment?: QrPaymentData;
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

interface CurrentUser {
  id: string;
  username: string;
  displayName: string;
  role: 'admin' | 'manager' | 'waiter' | 'kitchen';
}

export default function OrderInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const orderId = resolvedParams.id;
  const router = useRouter();

  const [order, setOrder] = useState<InvoiceData | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isClosing, setIsClosing] = useState(false);
  const [isConfirmingPayment, setIsConfirmingPayment] = useState(false);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [closeSuccess, setCloseSuccess] = useState(false);
  const [copiedField, setCopiedField] = useState<'account' | 'content' | null>(null);

  // Lấy thông tin user hiện tại
  useEffect(() => {
    fetch('/api/auth/me')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.user) {
          setCurrentUser(data.user);
        }
      })
      .catch(() => {});
  }, []);

  const fetchOrder = useCallback(async () => {
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
  }, [orderId]);

  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

  // Sao chép thông tin tài khoản hoặc nội dung chuyển khoản
  const handleCopy = (text: string, field: 'account' | 'content') => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => {
      setCopiedField(null);
    }, 2500);
  };

  // Xác nhận thanh toán chuyển khoản thủ công (chỉ waiter & manager)
  const handleConfirmPayment = async () => {
    setIsConfirmingPayment(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const res = await fetch(`/api/orders/${orderId}/confirm-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMessage(data.message || 'Không thể xác nhận thanh toán.');
      } else {
        setSuccessMessage('Đã xác nhận kiểm tra và nhận chuyển khoản thành công.');
        await fetchOrder();
      }
    } catch {
      setErrorMessage('Lỗi mạng khi xác nhận thanh toán.');
    } finally {
      setIsConfirmingPayment(false);
    }
  };

  // Xử lý chốt đơn mô phỏng
  const handleCloseOrder = async () => {
    if (!order) return;

    // Kiểm tra trạng thái thanh toán
    if (order.totalAmount > 0 && order.paymentStatus !== 'MANUALLY_CONFIRMED') {
      setErrorMessage('Chưa thể chốt đơn: Vui lòng bấm "Đã kiểm tra và nhận chuyển khoản" trước khi chốt đơn.');
      setConfirmModalOpen(false);
      return;
    }

    setIsClosing(true);
    setErrorMessage('');

    try {
      const res = await fetch(`/api/orders/${orderId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bypassPaymentCheck: order.totalAmount === 0,
        }),
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
          Đang tải dữ liệu hóa đơn và mã QR chuyển khoản...
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

  const validItems = order.items.filter(it => it.status !== 'CANCELLED');
  const isClosed = order.status === 'CLOSED';
  const isZeroAmount = order.totalAmount === 0;
  const isPaymentConfirmed = order.paymentStatus === 'MANUALLY_CONFIRMED';
  const isPaymentSatisfied = isZeroAmount || isPaymentConfirmed;
  const canConfirmPayment = currentUser?.role === 'waiter' || currentUser?.role === 'manager';
  const qr = order.qrPayment;

  return (
    <div className="min-h-screen bg-slate-950 pb-20">
      <Navbar />

      <main className="max-w-2xl mx-auto px-4 sm:px-6 pt-6">
        
        {/* Navigation & In ấn */}
        <div className="flex items-center justify-between mb-6 print:hidden">
          <div className="flex items-center gap-2">
            <Link
              href={`/orders/${order.id}`}
              className="touch-target p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-colors flex items-center gap-2 text-sm font-medium"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Quay lại đơn hàng</span>
            </Link>
            {isClosed && (
              <Link
                href="/reports"
                className="touch-target p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-amber-400 border border-slate-800 transition-colors flex items-center gap-1.5 text-sm font-medium"
              >
                <span>Về báo cáo</span>
              </Link>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              id="btn-print-invoice"
              className="touch-target px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 text-sm font-semibold border border-slate-700 transition-colors flex items-center gap-2 shadow-sm"
            >
              <Printer className="w-4 h-4 text-amber-400" />
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

        {successMessage && !closeSuccess && (
          <div className="mb-6 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm flex items-center gap-2.5 print:hidden">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {errorMessage && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-center gap-2.5 print:hidden">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* PHIẾU HÓA ĐƠN MÔ PHỎNG (HỖ TRỢ IN ẤN) */}
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

            {/* DÒNG BẮT BUỘC THEO QUY CHUẨN */}
            <div className="mt-3 inline-block px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 print:text-black print:border-black text-xs font-bold uppercase tracking-wider">
              Hóa đơn mô phỏng – không thực hiện thanh toán tự động
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
              <span className="text-slate-400 print:text-gray-600">Nhân viên tạo: </span>
              <span className="text-slate-200 print:text-black font-medium">{order.creatorName}</span>
            </div>
            <div className="text-right">
              <span className="text-slate-400 print:text-gray-600">Thời gian tạo: </span>
              <span className="text-slate-200 print:text-black">{formatDateTime(order.createdAt)}</span>
            </div>
            {isClosed && (
              <>
                <div>
                  <span className="text-slate-400 print:text-gray-600">Người chốt đơn: </span>
                  <strong className="text-amber-400 print:text-black font-semibold">
                    {order.closedByName || order.paymentConfirmerName || 'Quản lý'}
                  </strong>
                </div>
                <div className="text-right">
                  <span className="text-slate-400 print:text-gray-600">Thời gian chốt: </span>
                  <span className="text-emerald-400 print:text-black font-semibold">
                    {order.closedAt ? formatDateTime(order.closedAt) : 'N/A'}
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Bảng kê chi tiết món ăn (Snapshot bảo đảm tính toàn vẹn) */}
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

          {/* Tổng tiền thanh toán (Server-calculated) */}
          <div className="pt-4 border-t-2 border-dashed border-slate-700 print:border-black space-y-2">
            <div className="flex items-center justify-between text-base sm:text-lg font-black text-slate-100 print:text-black">
              <span>TỔNG TIỀN THANH TOÁN:</span>
              <span className="text-amber-400 print:text-black font-mono text-xl sm:text-2xl font-bold">
                {formatCurrency(order.totalAmount)}
              </span>
            </div>
          </div>

          {/* KHU VỰC: THANH TOÁN CHUYỂN KHOẢN (QR VIETQR & BANK INFO) */}
          <div className="pt-4 border-t border-slate-800 print:border-black print:pt-4">
            <div className="bg-slate-950/60 rounded-2xl p-5 border border-slate-800 print:bg-white print:border print:border-black print:p-4 space-y-4">
              
              {/* Header khu vực QR */}
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800 print:border-gray-300">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 print:text-black flex items-center justify-center">
                    <QrCode className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-100 print:text-black text-sm sm:text-base">
                      Thanh toán chuyển khoản
                    </h3>
                    <p className="text-[11px] text-slate-400 print:text-gray-600">
                      Quét mã QR bằng ứng dụng ngân hàng hoặc ví điện tử (VietQR)
                    </p>
                  </div>
                </div>

                {/* Badge trạng thái thanh toán có cả màu và chữ */}
                <div className="flex items-center">
                  {isPaymentConfirmed ? (
                    <span
                      id="badge-payment-confirmed"
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 print:text-black print:border-black"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-400 print:text-black" />
                      <span>Đã xác nhận chuyển khoản</span>
                    </span>
                  ) : (
                    <span
                      id="badge-payment-pending"
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30 print:text-black print:border-black"
                    >
                      <Clock className="w-3.5 h-3.5 shrink-0 text-amber-400 print:text-black" />
                      <span>Chờ xác nhận chuyển khoản</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Nếu thiếu cấu hình QR, hiển thị thông báo nhẹ nhàng không làm crash app */}
              {!qr || !qr.configured ? (
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-start gap-2.5">
                  <Info className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                  <div>
                    <strong className="block font-semibold">Chưa cấu hình thông tin QR chuyển khoản.</strong>
                    <span className="text-slate-400 text-[11px]">
                      Vui lòng cấu hình các biến PAYMENT_BANK_BIN, PAYMENT_ACCOUNT_NUMBER,... trong file .env để hiển thị mã QR.
                    </span>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
                  
                  {/* Mã QR kích thước đủ lớn, dễ quét trên điện thoại */}
                  <div className="md:col-span-5 flex flex-col items-center justify-center p-3 bg-white rounded-xl border border-slate-700 shadow-sm print:border-black print:p-2">
                    {qr.qrDataUrl ? (
                      <img
                        id="invoice-qr-image"
                        src={qr.qrDataUrl}
                        alt="Mã QR Chuyển khoản VietQR"
                        className="w-48 h-48 sm:w-52 sm:h-52 object-contain rounded-lg"
                      />
                    ) : qr.vietQrUrl ? (
                      <img
                        id="invoice-qr-image"
                        src={qr.vietQrUrl}
                        alt="Mã QR Chuyển khoản VietQR"
                        className="w-48 h-48 sm:w-52 sm:h-52 object-contain rounded-lg"
                      />
                    ) : (
                      <div className="w-48 h-48 flex items-center justify-center text-xs text-slate-400">
                        Không thể hiển thị ảnh QR
                      </div>
                    )}
                    <span className="text-[10px] text-slate-600 font-semibold mt-1 uppercase tracking-wider print:text-black">
                      VietQR / Napas 247
                    </span>
                  </div>

                  {/* Thông tin tài khoản chi tiết bên cạnh QR */}
                  <div className="md:col-span-7 space-y-2.5 text-xs sm:text-sm">
                    <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 print:bg-transparent print:border-0 print:p-0">
                      <span className="text-slate-400 print:text-gray-600 block text-[11px]">Ngân hàng thụ hưởng:</span>
                      <strong className="text-slate-100 print:text-black font-semibold text-xs sm:text-sm flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-amber-400 print:hidden" />
                        {qr.bankName} {qr.bankBin ? `(${qr.bankBin})` : ''}
                      </strong>
                    </div>

                    <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between print:bg-transparent print:border-0 print:p-0">
                      <div>
                        <span className="text-slate-400 print:text-gray-600 block text-[11px]">Số tài khoản:</span>
                        <strong className="text-amber-400 print:text-black font-mono font-bold text-sm sm:text-base">
                          {qr.accountNumber}
                        </strong>
                      </div>
                      <button
                        type="button"
                        id="btn-copy-account"
                        onClick={() => handleCopy(qr.accountNumber || '', 'account')}
                        className="touch-target px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors flex items-center gap-1 text-xs print:hidden"
                        title="Sao chép số tài khoản"
                      >
                        {copiedField === 'account' ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span className="text-emerald-400 font-medium">Đã chép</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Sao chép</span>
                          </>
                        )}
                      </button>
                    </div>

                    <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 print:bg-transparent print:border-0 print:p-0">
                      <span className="text-slate-400 print:text-gray-600 block text-[11px]">Chủ tài khoản:</span>
                      <strong className="text-slate-100 print:text-black uppercase font-bold text-xs sm:text-sm">
                        {qr.accountName}
                      </strong>
                    </div>

                    <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 print:bg-transparent print:border-0 print:p-0">
                      <span className="text-slate-400 print:text-gray-600 block text-[11px]">Số tiền cần chuyển:</span>
                      <strong className="text-amber-400 print:text-black font-mono font-black text-base sm:text-lg">
                        {formatCurrency(qr.amount || order.totalAmount)}
                      </strong>
                    </div>

                    <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between print:bg-transparent print:border-0 print:p-0">
                      <div className="pr-2">
                        <span className="text-slate-400 print:text-gray-600 block text-[11px]">Nội dung chuyển khoản:</span>
                        <strong className="text-emerald-400 print:text-black font-mono font-bold text-xs sm:text-sm break-all">
                          {qr.transferContent}
                        </strong>
                      </div>
                      <button
                        type="button"
                        id="btn-copy-content"
                        onClick={() => handleCopy(qr.transferContent || '', 'content')}
                        className="touch-target px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors flex items-center gap-1 text-xs shrink-0 print:hidden"
                        title="Sao chép nội dung chuyển khoản"
                      >
                        {copiedField === 'content' ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span className="text-emerald-400 font-medium">Đã chép</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Sao chép</span>
                          </>
                        )}
                      </button>
                    </div>

                  </div>
                </div>
              )}

              {/* Thông tin xác nhận nếu đã MANUALLY_CONFIRMED */}
              {isPaymentConfirmed && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2 print:text-black print:border-black">
                  <UserCheck className="w-4 h-4 shrink-0" />
                  <span>
                    Đã xác nhận thanh toán bởi: <strong>{order.paymentConfirmerName || 'Nhân viên'}</strong> 
                    {order.paymentConfirmedAt ? ` vào lúc ${formatDateTime(order.paymentConfirmedAt)}` : ''}
                    {order.paymentReference ? ` (Mã đối soát: ${order.paymentReference})` : ''}
                  </span>
                </div>
              )}

              {/* CẢNH BÁO BẮT BUỘC: HỆ THỐNG CHƯA TỰ ĐỘNG XÁC NHẬN GIAO DỊCH */}
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 print:text-black print:border-black text-xs leading-relaxed flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 text-amber-400 print:text-black mt-0.5" />
                <span>
                  <strong>Lưu ý:</strong> Hệ thống chưa tự động xác nhận giao dịch. Nhân viên phục vụ cần kiểm tra giao dịch trước khi chốt đơn.
                </span>
              </div>

              {/* NÚT THAO TÁC XÁC NHẬN THANH TOÁN (CHO WAITER / MANAGER) */}
              {!isClosed && !isPaymentConfirmed && (
                <div className="pt-2 print:hidden">
                  <button
                    type="button"
                    id="btn-confirm-payment"
                    disabled={isConfirmingPayment || !canConfirmPayment}
                    onClick={handleConfirmPayment}
                    className={`touch-target w-full py-3.5 px-4 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 shadow-md ${
                      canConfirmPayment
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20'
                        : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                    }`}
                  >
                    {isConfirmingPayment ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Đang ghi nhận xác nhận...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Đã kiểm tra và nhận chuyển khoản</span>
                      </>
                    )}
                  </button>
                  {!canConfirmPayment && (
                    <p className="text-[11px] text-slate-400 text-center mt-1.5">
                      (Chỉ nhân viên Phục vụ hoặc Quản lý mới có quyền xác nhận thanh toán)
                    </p>
                  )}
                </div>
              )}

            </div>
          </div>

          {/* Dòng tri ân & Ghi chú cuối hóa đơn */}
          <div className="text-[11px] text-slate-500 print:text-gray-600 text-center pt-3 border-t border-slate-800 print:border-black">
            Cảm ơn quý khách đã dùng bữa tại Smart Restaurant!
            <br />
            <strong>Hóa đơn mô phỏng – không thực hiện thanh toán tự động.</strong>
          </div>

          {/* NÚT CHỐT ĐƠN MÔ PHỎNG */}
          {!isClosed && (
            <div className="pt-4 border-t border-slate-800 print:hidden space-y-2">
              <button
                type="button"
                id="btn-open-close-modal"
                disabled={!order.canCloseOrder || !isPaymentSatisfied || isClosing}
                onClick={() => setConfirmModalOpen(true)}
                className={`touch-target w-full py-4 px-4 rounded-xl font-black text-sm uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
                  order.canCloseOrder && isPaymentSatisfied
                    ? 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 shadow-xl shadow-amber-500/25'
                    : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                }`}
              >
                <ShieldCheck className="w-5 h-5" />
                <span>
                  {isZeroAmount
                    ? 'Xác nhận chốt đơn 0đ (Đã hủy hết món)'
                    : !isPaymentConfirmed
                    ? 'Cần xác nhận chuyển khoản trước khi chốt đơn'
                    : !order.canCloseOrder
                    ? 'Chưa đủ điều kiện chốt đơn (Món chưa sẵn sàng)'
                    : 'Xác nhận chốt đơn mô phỏng'}
                </span>
              </button>

              {!isZeroAmount && !isPaymentConfirmed && (
                <p className="text-xs text-amber-400 text-center font-medium">
                  * Vui lòng kiểm tra tài khoản và bấm &quot;Đã kiểm tra và nhận chuyển khoản&quot; trước khi có thể chốt đơn.
                </p>
              )}

              {isPaymentSatisfied && !order.canCloseOrder && (
                <p className="text-xs text-amber-400 text-center">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150 print:hidden">
          <div className="max-w-md w-full glass-panel rounded-2xl p-6 border border-slate-700 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <h3 className="font-bold text-slate-100 text-base flex items-center gap-2 text-amber-400">
                <Receipt className="w-5 h-5" />
                {isZeroAmount ? 'Xác nhận chốt đơn 0 đồng' : 'Xác nhận chốt đơn mô phỏng'}
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
              {isZeroAmount ? (
                <div>&bull; Trạng thái: <strong className="text-amber-400">Đơn 0đ (Toàn bộ món đã hủy)</strong></div>
              ) : (
                <div>&bull; Thanh toán: <strong className="text-emerald-400">Đã xác nhận nhận tiền chuyển khoản</strong></div>
              )}
              <div>&bull; Bàn {order.tableCode} sẽ tự động được giải phóng về trạng thái <strong>Trống (AVAILABLE)</strong>.</div>
              <div>&bull; Thao tác này là chốt đơn mô phỏng và giải phóng bàn ăn.</div>
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
                id="btn-confirm-close-order"
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
