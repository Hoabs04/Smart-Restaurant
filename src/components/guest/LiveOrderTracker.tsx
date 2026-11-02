'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { 
  ChefHat, 
  Clock, 
  Flame, 
  CheckCircle2, 
  UtensilsCrossed, 
  RefreshCw, 
  AlertCircle, 
  Sparkles, 
  Wifi, 
  Check, 
  Copy, 
  X, 
  Receipt, 
  ChevronRight,
  ShieldCheck,
  Ban
} from 'lucide-react';
import { formatCurrency, formatDateTime } from '@/lib/utils';

export interface OrderItem {
  id: string;
  itemName: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  status: 'NEW' | 'SENT_TO_KITCHEN' | 'IN_PROGRESS' | 'READY' | 'CANCELLED';
  cancelReason: string | null;
  cancelledAt: string | null;
  batchSentAt: string | null;
  batchNumber: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface TrackingData {
  table: {
    id: string;
    tableCode: string;
    areaName: string;
  };
  order: {
    id: string;
    orderCode: string;
    status: string;
    overallStage: 'OPEN' | 'SENT_TO_KITCHEN' | 'IN_PROGRESS' | 'READY_TO_CLOSE' | 'CLOSED';
    totalAmount: number;
    paymentMethod: string | null;
    paymentStatus: string | null;
    paymentConfirmedAt: string | null;
    createdAt: string;
    updatedAt: string;
  };
  progress: {
    totalLines: number;
    totalQuantity: number;
    readyQuantity: number;
    inProgressQuantity: number;
    sentQuantity: number;
    newQuantity: number;
    cancelledCount: number;
    percentComplete: number;
  };
  items: OrderItem[];
  history?: {
    id: string;
    itemName: string;
    fromStatus: string;
    toStatus: string;
    changedAt: string;
  }[];
  paymentQr?: {
    configured: boolean;
    qrDataUrl?: string;
    vietQrUrl?: string;
    bankName?: string;
    bankBin?: string;
    accountNumber?: string;
    accountName?: string;
    amount?: number;
    transferContent?: string;
    message?: string;
  } | null;
  serverTime: string;
}

interface LiveOrderTrackerProps {
  tableCode?: string;
  orderCode?: string;
}

export default function LiveOrderTracker({ tableCode, orderCode }: LiveOrderTrackerProps) {
  const [data, setData] = useState<TrackingData | null>(null);
  const [hasActiveOrder, setHasActiveOrder] = useState<boolean | null>(null);
  const [emptyTableInfo, setEmptyTableInfo] = useState<{ tableCode: string; areaName: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [lastSyncTime, setLastSyncTime] = useState<Date>(new Date());
  const [secondsAgo, setSecondsAgo] = useState(0);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // Gọi API lấy dữ liệu tiến độ
  const fetchTracking = useCallback(async (isManual = false) => {
    if (isManual) setIsRefreshing(true);
    try {
      const query = tableCode 
        ? `tableCode=${encodeURIComponent(tableCode)}` 
        : `orderCode=${encodeURIComponent(orderCode || '')}`;
      
      const res = await fetch(`/api/guest/track?${query}`);
      const result = await res.json();

      if (!res.ok || !result.success) {
        setErrorMessage(result.message || 'Không thể tải thông tin đơn hàng.');
        setHasActiveOrder(false);
        return;
      }

      if (result.hasActiveOrder === false) {
        setHasActiveOrder(false);
        setEmptyTableInfo(result.table || null);
        setData(null);
      } else {
        setHasActiveOrder(true);
        setData(result);
        setEmptyTableInfo(null);
      }
      setErrorMessage('');
      setLastSyncTime(new Date());
      setSecondsAgo(0);
    } catch {
      setErrorMessage('Mất kết nối tới máy chủ. Đang tự động thử lại...');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [tableCode, orderCode]);

  // Polling tự động mỗi 4 giây
  useEffect(() => {
    fetchTracking();
    const interval = setInterval(() => {
      fetchTracking();
    }, 4000);
    return () => clearInterval(interval);
  }, [fetchTracking]);

  // Bộ đếm số giây kể từ lần đồng bộ cuối
  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsAgo((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [lastSyncTime]);

  const handleCopy = (text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // 1. Trạng thái Đang tải ban đầu
  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4">
        <div className="relative">
          <div className="w-16 h-16 rounded-full border-4 border-amber-500/20 border-t-amber-500 animate-spin" />
          <ChefHat className="w-7 h-7 text-amber-400 absolute inset-0 m-auto" />
        </div>
        <p className="mt-4 text-sm font-medium text-slate-300 animate-pulse">
          Đang kết nối vào hệ thống bếp nhà hàng...
        </p>
      </div>
    );
  }

  // 2. Trạng thái Bàn chưa có đơn hoặc Lỗi
  if (hasActiveOrder === false && !data) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between p-4 max-w-md mx-auto">
        <header className="py-4 text-center">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800 text-xs font-semibold text-slate-300 border border-slate-700">
            <UtensilsCrossed className="w-3.5 h-3.5 text-amber-400" />
            Smart Restaurant Management
          </span>
        </header>

        <main className="text-center space-y-5 my-auto py-8">
          <div className="w-20 h-20 mx-auto rounded-3xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-xl shadow-amber-500/5">
            <UtensilsCrossed className="w-10 h-10" />
          </div>

          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs text-slate-400 mb-2">
              <span>Khu vực:</span>
              <strong className="text-slate-200">{emptyTableInfo?.areaName || 'Sảnh chính'}</strong>
            </div>
            <h1 className="text-3xl font-black text-slate-100 tracking-tight">
              {emptyTableInfo ? emptyTableInfo.tableCode : tableCode || 'Bàn ăn'}
            </h1>
            <p className="text-amber-400/90 text-sm font-semibold mt-1">
              Bàn hiện chưa có đơn gọi món đang mở
            </p>
          </div>

          {/* Hộp mã bàn để đọc cho nhân viên */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 text-left space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Mã bàn của quý khách:</span>
              <span className="font-mono font-bold text-amber-400 text-sm">{emptyTableInfo?.tableCode || tableCode}</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              👉 Quý khách vui lòng đọc mã bàn này cho nhân viên phục vụ khi gọi món. Hệ thống sẽ tự động hiển thị tiến trình nấu nướng của bếp ngay khi đơn được tạo!
            </p>
          </div>

          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              onClick={() => fetchTracking(true)}
              disabled={isRefreshing}
              className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold transition-all inline-flex items-center gap-2 shadow-lg shadow-amber-500/20 active:scale-95"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>{isRefreshing ? 'Đang kiểm tra...' : 'Kiểm tra đơn ngay'}</span>
            </button>
          </div>
        </main>

        <footer className="text-center text-xs text-slate-500 py-4">
          Tự động đồng bộ mỗi 4 giây • Smart Restaurant
        </footer>
      </div>
    );
  }

  if (errorMessage && !data) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto">
        <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 mb-4">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-100">Không tìm thấy thông tin</h2>
        <p className="text-slate-400 text-sm mt-2">{errorMessage}</p>
        <button
          onClick={() => fetchTracking(true)}
          className="mt-6 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-sm"
        >
          Thử lại
        </button>
      </div>
    );
  }

  if (!data) return null;

  const { table, order, progress, items } = data;

  // Xác định bước tiến độ tổng thể (Stepper 1 -> 4)
  const getStepStatus = (stepIndex: number) => {
    // Step 0: Đã ghi nhận (Luôn hoàn thành nếu có order)
    // Step 1: Đã chuyển bếp (SENT_TO_KITCHEN hoặc hơn)
    // Step 2: Đang nấu (IN_PROGRESS hoặc READY_TO_CLOSE hoặc CLOSED)
    // Step 3: Món sẵn sàng (READY_TO_CLOSE hoặc CLOSED)
    const stage = order.overallStage;
    if (stage === 'CLOSED' || stage === 'READY_TO_CLOSE') {
      return 'completed';
    }
    if (stage === 'IN_PROGRESS') {
      if (stepIndex <= 2) return 'completed';
      if (stepIndex === 3) return 'active';
      return 'pending';
    }
    if (stage === 'SENT_TO_KITCHEN') {
      if (stepIndex <= 1) return 'completed';
      if (stepIndex === 2) return 'active';
      return 'pending';
    }
    // OPEN
    if (stepIndex === 0) return 'active';
    return 'pending';
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-28">
      {/* 1. TOP APP BAR */}
      <header className="sticky top-0 z-30 bg-slate-950/90 backdrop-blur-md border-b border-slate-800 px-4 py-3">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <ChefHat className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-black text-slate-100 text-sm tracking-tight">Smart Restaurant</span>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              </div>
              <p className="text-[10px] text-slate-400">Theo dõi tiến độ bếp trực tiếp</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchTracking(true)}
              disabled={isRefreshing}
              title="Làm mới dữ liệu"
              className="touch-target p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-amber-400 active:scale-95 transition-all"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-amber-400' : ''}`} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 pt-4 space-y-4">
        
        {/* 2. THẺ BÀN & MÃ ĐƠN HÀNG */}
        <section className="glass-panel p-4 rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900/90 to-slate-950">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-bold">
                <UtensilsCrossed className="w-3 h-3" />
                <span>{table.areaName}</span>
              </div>
              <h1 className="text-2xl font-black text-slate-100 mt-1 tracking-tight">
                {table.tableCode}
              </h1>
            </div>

            <div className="text-right">
              <button
                onClick={() => handleCopy(order.orderCode)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-mono font-medium text-slate-300 transition-all active:scale-95"
              >
                <span>{order.orderCode}</span>
                {copiedCode ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-slate-400" />}
              </button>
              <p className="text-[10px] text-slate-400 mt-1 flex items-center justify-end gap-1">
                <Clock className="w-3 h-3" />
                <span>Đặt lúc: {formatDateTime(order.createdAt).split(' ')[0]}</span>
              </p>
            </div>
          </div>
        </section>

        {/* 3. STEPPER TIẾN TRÌNH TỔNG QUAN (LIVE TIMELINE) */}
        <section className="glass-panel p-4 rounded-2xl border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Tiến trình phục vụ</span>
            </h2>
            <span className="text-xs font-bold text-emerald-400">
              {progress.percentComplete}% hoàn thành
            </span>
          </div>

          {/* Stepper 4 bước */}
          <div className="grid grid-cols-4 gap-1 relative">
            
            {/* Bước 1: Tiếp nhận */}
            <div className="flex flex-col items-center text-center space-y-1.5">
              <div className="w-9 h-9 rounded-full bg-emerald-500/20 border-2 border-emerald-500 flex items-center justify-center text-emerald-400 shadow-lg shadow-emerald-500/10">
                <Check className="w-4 h-4" />
              </div>
              <span className="text-[11px] font-bold text-slate-200">Đã đặt</span>
            </div>

            {/* Bước 2: Chuyển bếp */}
            <div className="flex flex-col items-center text-center space-y-1.5">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                getStepStatus(1) === 'completed'
                  ? 'bg-emerald-500/20 border-2 border-emerald-500 text-emerald-400'
                  : getStepStatus(1) === 'active'
                  ? 'bg-blue-500/20 border-2 border-blue-500 text-blue-400 animate-pulse'
                  : 'bg-slate-800 border-2 border-slate-700 text-slate-500'
              }`}>
                {getStepStatus(1) === 'completed' ? <Check className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
              </div>
              <span className={`text-[11px] font-bold ${getStepStatus(1) !== 'pending' ? 'text-slate-200' : 'text-slate-500'}`}>
                Chuyển bếp
              </span>
            </div>

            {/* Bước 3: Đang nấu */}
            <div className="flex flex-col items-center text-center space-y-1.5">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                getStepStatus(2) === 'completed'
                  ? 'bg-emerald-500/20 border-2 border-emerald-500 text-emerald-400'
                  : getStepStatus(2) === 'active'
                  ? 'bg-amber-500/20 border-2 border-amber-500 text-amber-400 animate-pulse shadow-lg shadow-amber-500/20'
                  : 'bg-slate-800 border-2 border-slate-700 text-slate-500'
              }`}>
                {getStepStatus(2) === 'completed' ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <Flame className={`w-4 h-4 ${getStepStatus(2) === 'active' ? 'animate-bounce' : ''}`} />
                )}
              </div>
              <span className={`text-[11px] font-bold ${getStepStatus(2) !== 'pending' ? 'text-amber-400' : 'text-slate-500'}`}>
                Đang nấu
              </span>
            </div>

            {/* Bước 4: Món sẵn sàng */}
            <div className="flex flex-col items-center text-center space-y-1.5">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                getStepStatus(3) === 'completed'
                  ? 'bg-emerald-500/20 border-2 border-emerald-500 text-emerald-400 shadow-lg shadow-emerald-500/30'
                  : 'bg-slate-800 border-2 border-slate-700 text-slate-500'
              }`}>
                {getStepStatus(3) === 'completed' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <UtensilsCrossed className="w-4 h-4" />
                )}
              </div>
              <span className={`text-[11px] font-bold ${getStepStatus(3) === 'completed' ? 'text-emerald-400 font-extrabold' : 'text-slate-500'}`}>
                Sẵn sàng
              </span>
            </div>

          </div>

          {/* Thanh phần trăm tiến độ */}
          <div className="w-full bg-slate-800/80 rounded-full h-2 overflow-hidden">
            <div 
              className="bg-gradient-to-r from-amber-500 to-emerald-400 h-2 rounded-full transition-all duration-700 ease-out"
              style={{ width: `${progress.percentComplete}%` }}
            />
          </div>

          {/* Tóm tắt nhanh số lượng món theo trạng thái (Tính theo Tổng phần món) */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs pt-1 gap-2">
            <span className="text-slate-400">
              Tổng <strong className="text-slate-200">{progress.totalQuantity || progress.totalLines} phần</strong> ({progress.totalLines || items.length} món gọi)
            </span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {progress.inProgressQuantity > 0 && (
                <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold text-[11px]">
                  🔥 {progress.inProgressQuantity} phần đang nấu
                </span>
              )}
              {progress.readyQuantity > 0 && (
                <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold text-[11px]">
                  ✓ {progress.readyQuantity} phần bếp nấu xong
                </span>
              )}
              {progress.sentQuantity > 0 && (
                <span className="px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20 font-bold text-[11px]">
                  ⌛ {progress.sentQuantity} phần chờ lượt
                </span>
              )}
            </div>
          </div>
        </section>

        {/* 4. DANH SÁCH CHI TIẾT TỪNG MÓN ĂN */}
        <section className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <span>Chi tiết món ăn ({items.length})</span>
            </h2>
            {data.history && data.history.length > 0 && (
              <button
                type="button"
                onClick={() => setShowHistoryModal(true)}
                className="text-[11px] font-bold text-amber-400 hover:text-amber-300 underline underline-offset-2 flex items-center gap-1 transition-colors"
              >
                <Clock className="w-3 h-3" />
                <span>Nhật ký bếp ({data.history.length})</span>
              </button>
            )}
          </div>

          <div className="space-y-2.5">
            {items.map((item, index) => {
              const isReady = item.status === 'READY';
              const isInProgress = item.status === 'IN_PROGRESS';
              const isSent = item.status === 'SENT_TO_KITCHEN';
              const isNew = item.status === 'NEW';
              const isCancelled = item.status === 'CANCELLED';

              return (
                <div 
                  key={item.id || index}
                  className={`p-3.5 rounded-2xl border transition-all ${
                    isReady
                      ? 'bg-emerald-950/20 border-emerald-500/40 shadow-lg shadow-emerald-500/5'
                      : isInProgress
                      ? 'bg-amber-950/20 border-amber-500/40 shadow-lg shadow-amber-500/5'
                      : isSent
                      ? 'bg-slate-900/80 border-slate-700/60'
                      : isCancelled
                      ? 'bg-rose-950/10 border-rose-900/30 opacity-60'
                      : 'bg-slate-900/50 border-slate-800'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-black text-amber-400 shrink-0">
                          {item.quantity}×
                        </span>
                        <h3 className={`font-bold text-sm truncate ${isCancelled ? 'line-through text-slate-400' : 'text-slate-100'}`}>
                          {item.itemName}
                        </h3>
                      </div>
                      
                      <div className="flex items-center gap-2 mt-1.5 text-xs text-slate-400 pl-8">
                        <span>{formatCurrency(item.unitPrice)}</span>
                        {item.quantity > 1 && (
                          <span className="font-semibold text-slate-300">
                            = {formatCurrency(item.lineTotal)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Huy hiệu trạng thái món (Tách bạch Bếp đã nấu xong với Đã phục vụ) */}
                    <div className="shrink-0 text-right">
                      {isReady && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/50 text-emerald-400 font-black text-xs shadow-md shadow-emerald-500/20">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Bếp đã nấu xong</span>
                        </span>
                      )}

                      {isInProgress && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/50 text-amber-400 font-black text-xs animate-pulse shadow-md shadow-amber-500/20">
                          <Flame className="w-3.5 h-3.5 animate-bounce" />
                          <span>Đang nấu...</span>
                        </span>
                      )}

                      {isSent && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-400 font-semibold text-xs">
                          <Clock className="w-3 h-3" />
                          <span>Chờ lượt bếp</span>
                        </span>
                      )}

                      {isNew && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-400 font-medium text-xs">
                          <Clock className="w-3 h-3" />
                          <span>Chờ gửi bếp</span>
                        </span>
                      )}

                      {isCancelled && (
                        <div className="text-right">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-400 font-semibold text-xs">
                            <Ban className="w-3 h-3" />
                            <span>Đã hủy</span>
                          </span>
                          {item.cancelReason && (
                            <p className="text-[10px] text-rose-400/80 mt-0.5 max-w-[130px] truncate">
                              {item.cancelReason}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Trạng thái chú thích thêm nếu món đã xong ở bếp */}
                  {isReady && (
                    <div className="mt-2.5 pt-2 border-t border-emerald-500/20 flex items-center gap-1.5 text-[11px] text-emerald-300">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>Bếp đã nấu xong phần món này. Đang chờ nhân viên phục vụ bưng ra bàn cho quý khách!</span>
                    </div>
                  )}

                  {/* Trạng thái chú thích thêm nếu món đang nấu */}
                  {isInProgress && (
                    <div className="mt-2.5 pt-2 border-t border-amber-500/20 flex items-center gap-1.5 text-[11px] text-amber-300">
                      <Flame className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>Đầu bếp đang chế biến tươi nóng. Quý khách vui lòng đợi trong giây lát!</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

      </main>

      {/* 5. STICKY BOTTOM BAR: TỔNG TIỀN & XEM MÃ THANH TOÁN QR */}
      <div className="fixed bottom-0 inset-x-0 z-30 bg-slate-950/95 backdrop-blur-lg border-t border-slate-800 p-4">
        <div className="max-w-md mx-auto flex items-center justify-between gap-4">
          <div>
            <span className="text-[10px] text-slate-400 block uppercase tracking-wider font-semibold">Tạm tính hóa đơn</span>
            <span className="text-xl font-black text-amber-400 tracking-tight">
              {formatCurrency(order.totalAmount)}
            </span>
          </div>

          {/* Trạng thái thanh toán (Khách chỉ thanh toán khi đã ăn xong) */}
          {order.paymentStatus === 'MANUALLY_CONFIRMED' ? (
            <div className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-bold text-xs">
              <CheckCircle2 className="w-4 h-4" />
              <span>Đã thanh toán</span>
            </div>
          ) : order.status === 'CLOSED' ? (
            <div className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 font-bold text-xs">
              <Receipt className="w-4 h-4 text-amber-400" />
              <span>Đơn đã chốt</span>
            </div>
          ) : (
            <div className="text-right">
              <div className="inline-flex items-center gap-1.5 text-xs text-amber-400 font-semibold bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-xl">
                <Clock className="w-3.5 h-3.5" />
                <span>Thanh toán khi dùng bữa xong</span>
              </div>
              <p className="text-[10px] text-slate-500 mt-1">Vui lòng gọi nhân viên khi thanh toán</p>
            </div>
          )}
        </div>

        {/* Thanh nhỏ hiển thị thời gian đồng bộ (Polling gần thời gian thực) */}
        <div className="max-w-md mx-auto text-center mt-2 flex items-center justify-center gap-1.5 text-[10px] text-slate-500">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span>Tự động cập nhật gần thời gian thực (mỗi 4s)</span>
          <span>•</span>
          <span>Đồng bộ {secondsAgo}s trước</span>
        </div>
      </div>

      {/* 7. MODAL NHẬT KÝ CHẾ BIẾN BẾP (STATUS HISTORY) */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 space-y-5 max-h-[85vh] overflow-y-auto">
            
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-100 text-base">Nhật ký chế biến</h3>
                  <p className="text-xs text-slate-400">Các mốc thời gian cập nhật từ bếp</p>
                </div>
              </div>
              <button
                onClick={() => setShowHistoryModal(false)}
                className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-slate-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {data.history && data.history.length > 0 ? (
              <div className="space-y-3 relative before:absolute before:inset-0 before:left-3.5 before:w-0.5 before:bg-slate-800">
                {data.history.map((log) => {
                  const getStatusLabel = (st: string) => {
                    switch (st) {
                      case 'NEW': return 'Mới ghi món';
                      case 'SENT_TO_KITCHEN': return 'Đã gửi bếp';
                      case 'IN_PROGRESS': return 'Bếp bắt đầu nấu';
                      case 'READY': return 'Bếp nấu xong';
                      case 'CANCELLED': return 'Đã hủy';
                      case 'READY_TO_CLOSE': return 'Tất cả món đã xong';
                      case 'CLOSED': return 'Đã chốt hóa đơn';
                      default: return st;
                    }
                  };

                  return (
                    <div key={log.id} className="relative flex items-start gap-3 pl-1 text-xs">
                      <div className="w-6 h-6 rounded-full bg-slate-950 border-2 border-amber-500 flex items-center justify-center text-[10px] text-amber-400 shrink-0 z-10 shadow">
                        •
                      </div>
                      <div className="flex-1 bg-slate-950/70 p-3 rounded-xl border border-slate-800/80">
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <strong className="text-slate-200 font-semibold">{log.itemName}</strong>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {formatDateTime(log.changedAt).split(' ')[0]}
                          </span>
                        </div>
                        <div className="text-slate-400 flex items-center gap-1.5 flex-wrap">
                          <span className="text-slate-400">{getStatusLabel(log.fromStatus)}</span>
                          <span className="text-amber-400">➔</span>
                          <span className={`font-bold ${
                            log.toStatus === 'READY' 
                              ? 'text-emerald-400' 
                              : log.toStatus === 'IN_PROGRESS' 
                              ? 'text-amber-400' 
                              : 'text-slate-200'
                          }`}>
                            {getStatusLabel(log.toStatus)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-slate-400 text-xs">
                Chưa có mốc cập nhật trạng thái nào được ghi nhận.
              </div>
            )}

            <button
              onClick={() => setShowHistoryModal(false)}
              className="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-colors"
            >
              Đóng
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
