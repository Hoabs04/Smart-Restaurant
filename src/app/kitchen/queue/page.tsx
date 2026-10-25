'use client';

import React, { useState, useEffect } from 'react';
import Navbar from '@/components/Navbar';
import { 
  ChefHat, 
  Clock, 
  AlertTriangle, 
  Play, 
  CheckCircle, 
  RefreshCw, 
  WifiOff, 
  Check, 
  Layers,
  Utensils
} from 'lucide-react';
import { formatDateTime } from '@/lib/utils';

interface KitchenItem {
  id: string;
  itemName: string;
  quantity: number;
  status: 'SENT_TO_KITCHEN' | 'IN_PROGRESS' | 'READY';
  isOverdue: boolean;
  canStart: boolean;
  canReady: boolean;
}

interface KitchenBatch {
  batchId: string;
  batchNumber: number;
  orderId: string;
  orderCode: string;
  tableCode: string;
  areaName: string;
  creatorName: string;
  sentAt: string;
  orderCreatedAt: string;
  waitTimeSeconds: number;
  waitTimeFormatted: string;
  isOverdue: boolean;
  items: KitchenItem[];
}

export default function KitchenQueuePage() {
  const [batches, setBatches] = useState<KitchenBatch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  
  // Trạng thái đồng bộ mạng thực tế
  const [syncStatus, setSyncStatus] = useState<'IDLE' | 'UPDATING' | 'SAVED' | 'OFFLINE'>('IDLE');
  const [updatingItemId, setUpdatingItemId] = useState<string | null>(null);

  const fetchQueue = async () => {
    try {
      const res = await fetch('/api/kitchen/queue');
      const data = await res.json();

      if (res.status === 403) {
        window.location.href = '/unauthorized';
        return;
      }

      if (data.success) {
        setBatches(data.batches || []);
        setErrorMessage('');
      } else {
        setErrorMessage(data.message || 'Lỗi khi tải hàng đợi bếp.');
      }
    } catch {
      setSyncStatus('OFFLINE');
      setErrorMessage('Mất kết nối tới máy chủ. Dữ liệu chưa được đồng bộ mới nhất.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchQueue();
    // Polling tự động làm mới hàng đợi mỗi 5 giây
    const interval = setInterval(fetchQueue, 5000);
    return () => clearInterval(interval);
  }, []);

  // Chuyển trạng thái món ăn: SENT -> IN_PROGRESS hoặc IN_PROGRESS -> READY
  const handleUpdateStatus = async (item: KitchenItem, targetStatus: 'IN_PROGRESS' | 'READY') => {
    setUpdatingItemId(item.id);
    setSyncStatus('UPDATING');
    setErrorMessage('');

    try {
      const res = await fetch(`/api/order-items/${item.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: targetStatus }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setSyncStatus('OFFLINE');
        setErrorMessage(data.message || 'Lỗi khi cập nhật trạng thái món.');
        setUpdatingItemId(null);
        return;
      }

      setSyncStatus('SAVED');
      setTimeout(() => setSyncStatus('IDLE'), 2500);
      await fetchQueue();
    } catch {
      setSyncStatus('OFFLINE');
      setErrorMessage('Mất kết nối mạng. Thao tác chưa được lưu lên máy chủ.');
    } finally {
      setUpdatingItemId(null);
    }
  };

  const getStatusBadge = (status: KitchenItem['status']) => {
    switch (status) {
      case 'SENT_TO_KITCHEN':
        return { label: 'Chờ làm', classes: 'bg-amber-500/10 text-amber-400 border-amber-500/30' };
      case 'IN_PROGRESS':
        return { label: 'Đang nấu', classes: 'bg-blue-500/10 text-blue-400 border-blue-500/30' };
      case 'READY':
        return { label: 'Sẵn sàng', classes: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' };
      default:
        return { label: status, classes: 'bg-slate-800 text-slate-400 border-slate-700' };
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 pb-20">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        
        {/* Header Queue Bếp & Sync Status */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black text-slate-100 tracking-tight flex items-center gap-2">
                <ChefHat className="w-7 h-7 text-amber-500" />
                Hàng đợi chế biến Bếp
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                {batches.length} Batch
              </span>
            </div>
            <p className="text-slate-400 text-xs sm:text-sm mt-0.5">
              Ưu tiên theo thời gian chờ của lần gửi bếp (sent_at tăng dần). Cảnh báo món/batch chờ trên 10 phút.
            </p>
          </div>

          {/* CHỈ BÁO TRẠNG THÁI KẾT NỐI & ĐỒNG BỘ THỰC TẾ */}
          <div className="flex items-center gap-2">
            {syncStatus === 'UPDATING' && (
              <span className="px-3 py-1.5 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs font-semibold flex items-center gap-1.5 animate-pulse">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Đang cập nhật...
              </span>
            )}

            {syncStatus === 'SAVED' && (
              <span className="px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5" />
                Đã lưu thành công
              </span>
            )}

            {syncStatus === 'OFFLINE' && (
              <span className="px-3 py-1.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-semibold flex items-center gap-1.5">
                <WifiOff className="w-3.5 h-3.5" />
                Mất kết nối
              </span>
            )}

            <button
              onClick={fetchQueue}
              disabled={isLoading}
              className="touch-target px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium border border-slate-700 transition-colors flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Làm mới</span>
            </button>
          </div>
        </div>

        {/* Thông báo lỗi nếu có */}
        {errorMessage && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-center gap-2.5 shadow-lg">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Loading State */}
        {isLoading && batches.length === 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-64 rounded-2xl bg-slate-900/60 animate-pulse border border-slate-800" />
            ))}
          </div>
        )}

        {/* Empty State */}
        {!isLoading && batches.length === 0 && (
          <div className="py-20 text-center glass-panel rounded-2xl border border-slate-800 max-w-lg mx-auto">
            <Utensils className="w-16 h-16 text-slate-600 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-slate-100">Hiện không có món nào chờ nấu</h2>
            <p className="text-slate-400 text-sm mt-1 max-w-sm mx-auto">
              Khi nhân viên phục vụ gửi batch món mới từ bàn ăn, các món sẽ xuất hiện ngay tại đây.
            </p>
          </div>
        )}

        {/* Grid Danh sách các Kitchen Batch (Sắp theo sent_at tăng dần) */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {batches.map((batch, index) => {
            const hasOverdue = batch.isOverdue;

            return (
              <div
                key={batch.batchId}
                className={`glass-panel rounded-2xl p-5 border transition-all flex flex-col justify-between shadow-xl relative overflow-hidden ${
                  hasOverdue
                    ? 'border-red-500/60 bg-red-950/20 shadow-red-950/30'
                    : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                {/* Dải màu đỉnh cảnh báo nếu quá 10 phút */}
                {hasOverdue && (
                  <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-red-600 to-amber-600" />
                )}

                <div>
                  {/* Header Batch: Thứ tự ưu tiên, Bàn, và Thời gian chờ */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-400 text-xs font-black flex items-center justify-center">
                          #{index + 1}
                        </span>
                        <span className="text-base font-extrabold text-slate-100">
                          {batch.tableCode}
                        </span>
                        <span className="text-xs text-slate-400 font-medium">
                          ({batch.areaName})
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        Batch #{batch.batchNumber} &bull; Đơn: <span className="font-mono text-slate-300">{batch.orderCode}</span>
                      </div>
                    </div>

                    {/* Badge Thời gian chờ (Tính từ sent_at) */}
                    <div className="text-right">
                      <div className={`px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 border ${
                        hasOverdue
                          ? 'bg-red-500/20 text-red-400 border-red-500/40 animate-pulse'
                          : 'bg-slate-800 text-slate-300 border-slate-700'
                      }`}>
                        <Clock className="w-3.5 h-3.5" />
                        <span>{batch.waitTimeFormatted}</span>
                      </div>
                      <div className="text-[10px] text-slate-500 mt-1">
                        Gửi lúc: {formatDateTime(batch.sentAt)}
                      </div>
                    </div>
                  </div>

                  {/* Banner Cảnh báo khi chờ quá 10 phút */}
                  {hasOverdue && (
                    <div className="mb-3.5 p-2.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs font-bold flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
                      <span>CẢNH BÁO: Batch chờ quá 10 phút! Cần ưu tiên chế biến.</span>
                    </div>
                  )}

                  {/* Danh sách món trong batch */}
                  <div className="space-y-2.5 mb-4">
                    {batch.items.map((item) => {
                      const badge = getStatusBadge(item.status);
                      const isItemUpdating = updatingItemId === item.id;

                      return (
                        <div
                          key={item.id}
                          className={`p-3 rounded-xl border transition-all flex flex-col justify-between gap-2.5 ${
                            item.isOverdue
                              ? 'bg-red-950/30 border-red-500/30'
                              : 'bg-slate-900/80 border-slate-800/80'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="font-semibold text-slate-200 text-sm">
                              {item.itemName}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-black text-amber-400 text-sm px-2 py-0.5 rounded bg-slate-800">
                                x{item.quantity}
                              </span>
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${badge.classes}`}>
                                {badge.label}
                              </span>
                            </div>
                          </div>

                          {/* Cảnh báo món nếu chờ > 10 phút và chưa làm */}
                          {item.isOverdue && (
                            <div className="text-[11px] text-red-400 font-semibold flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              Món chờ quá 10 phút
                            </div>
                          )}

                          {/* Nút hành động Bếp (Touch target >= 44x44px) */}
                          <div className="flex items-center gap-2 pt-1 border-t border-slate-800/60">
                            {item.canStart && (
                              <button
                                type="button"
                                disabled={isItemUpdating}
                                onClick={() => handleUpdateStatus(item, 'IN_PROGRESS')}
                                className="touch-target flex-1 py-2 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition-colors flex items-center justify-center gap-1.5 shadow-md shadow-blue-600/20 disabled:opacity-50"
                              >
                                {isItemUpdating ? (
                                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                ) : (
                                  <>
                                    <Play className="w-3.5 h-3.5 fill-current" />
                                    <span>Bắt đầu làm</span>
                                  </>
                                )}
                              </button>
                            )}

                            {item.canReady && (
                              <button
                                type="button"
                                disabled={isItemUpdating}
                                onClick={() => handleUpdateStatus(item, 'READY')}
                                className="touch-target flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-colors flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/20 disabled:opacity-50"
                              >
                                {isItemUpdating ? (
                                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                ) : (
                                  <>
                                    <CheckCircle className="w-3.5 h-3.5" />
                                    <span>Sẵn sàng phục vụ</span>
                                  </>
                                )}
                              </button>
                            )}

                            {item.status === 'READY' && (
                              <div className="w-full text-center py-1.5 text-xs text-emerald-400 font-semibold flex items-center justify-center gap-1">
                                <CheckCircle className="w-3.5 h-3.5" />
                                Đã sẵn sàng phục vụ
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Footer Batch */}
                <div className="pt-2 border-t border-slate-800/80 text-[11px] text-slate-500 flex items-center justify-between">
                  <span>Phục vụ: {batch.creatorName}</span>
                  <span>Ưu tiên #{index + 1}</span>
                </div>
              </div>
            );
          })}
        </div>

      </main>
    </div>
  );
}
