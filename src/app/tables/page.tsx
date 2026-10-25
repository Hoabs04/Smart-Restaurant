'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import DishBannerCarousel from '@/components/DishBannerCarousel';
import { 
  Users, 
  Clock, 
  Utensils, 
  RefreshCw, 
  PlusCircle, 
  AlertTriangle,
  Layers,
  ArrowRight,
  Sparkles
} from 'lucide-react';
import { formatDateTime, formatCurrency } from '@/lib/utils';

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

export default function TablesPage() {
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [areas, setAreas] = useState<string[]>([]);
  const [selectedArea, setSelectedArea] = useState<string>('ALL');
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [conflictNotice, setConflictNotice] = useState<string | null>(null);
  const [showBanner, setShowBanner] = useState(true);

  const fetchTables = async () => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const res = await fetch('/api/tables');
      const data = await res.json();
      if (data.success) {
        setTables(data.data);
        setAreas(data.areas || []);
      } else {
        setErrorMessage(data.message || 'Lỗi khi tải dữ liệu bàn.');
      }
    } catch {
      setErrorMessage('Không thể kết nối đến máy chủ.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTables();
    const interval = setInterval(fetchTables, 10000); // Tự động làm mới mỗi 10s
    return () => clearInterval(interval);
  }, []);

  const filteredTables = selectedArea === 'ALL'
    ? tables
    : tables.filter(t => t.areaName === selectedArea);

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

  return (
    <div className="min-h-screen bg-slate-950 pb-16">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        
        {/* Tiêu đề & Nút làm mới */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-100 tracking-tight flex items-center gap-2">
              <Layers className="w-6 h-6 text-amber-500" />
              Sơ đồ bàn ăn
            </h1>
            <p className="text-slate-400 text-sm mt-0.5">
              Theo dõi trực quan trạng thái bàn ăn, đơn hàng đang mở và sức chứa
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowBanner(!showBanner)}
              className={`touch-target px-3.5 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 border ${
                showBanner
                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                  : 'bg-slate-800 text-slate-300 border-slate-700'
              }`}
              title="Ẩn/hiện banner món ăn nổi bật"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{showBanner ? 'Ẩn banner món' : 'Hiện banner món'}</span>
            </button>

            <button
              onClick={fetchTables}
              disabled={isLoading}
              className="touch-target px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium transition-colors border border-slate-700 flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Làm mới</span>
            </button>
          </div>
        </div>

        {/* Banner Món ăn chạy nổi bật */}
        {showBanner && (
          <div className="mb-6">
            <DishBannerCarousel compact />
          </div>
        )}

        {/* Xung đột hoặc cảnh báo */}
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
                      <div className="text-lg font-bold text-slate-100 tracking-tight">
                        {table.tableCode}
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

                {/* Nút hành động chính (Touch target >= 44x44px) */}
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
      </main>
    </div>
  );
}
