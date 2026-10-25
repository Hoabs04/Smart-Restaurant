'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Navbar from '@/components/Navbar';
import { 
  BarChart3, 
  TrendingUp, 
  DollarSign, 
  ShoppingBag, 
  Calendar, 
  RefreshCw, 
  AlertCircle,
  Award,
  FileSpreadsheet
} from 'lucide-react';
import { formatCurrency, formatDateTime } from '@/lib/utils';

export default function ReportsPage() {
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const [revenueData, setRevenueData] = useState<any>(null);
  const [bestSellingItems, setBestSellingItems] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  const fetchReports = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage('');

    try {
      const params = new URLSearchParams();
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);

      const [revRes, bestRes] = await Promise.all([
        fetch(`/api/reports/revenue?${params.toString()}`),
        fetch(`/api/reports/best-selling?${params.toString()}`),
      ]);

      if (revRes.status === 403 || bestRes.status === 403) {
        window.location.href = '/unauthorized';
        return;
      }

      const revJson = await revRes.json();
      const bestJson = await bestRes.json();

      if (revJson.success) {
        setRevenueData(revJson);
      }
      if (bestJson.success) {
        setBestSellingItems(bestJson.items || []);
      }
    } catch {
      setErrorMessage('Không thể tải dữ liệu báo cáo quản trị.');
    } finally {
      setIsLoading(false);
    }
  }, [fromDate, toDate]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const handleFilterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchReports();
  };

  return (
    <div className="min-h-screen bg-slate-950 pb-20">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        
        {/* Header Báo cáo */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-black text-slate-100 tracking-tight flex items-center gap-2">
              <BarChart3 className="w-7 h-7 text-amber-500" />
              Báo cáo Doanh thu & Thống kê
            </h1>
            <p className="text-slate-400 text-xs sm:text-sm mt-0.5">
              Dành riêng cho Quản lý: Tổng hợp đơn hàng đã chốt (CLOSED) và phân tích món bán chạy
            </p>
          </div>

          <button
            onClick={fetchReports}
            disabled={isLoading}
            className="touch-target px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium border border-slate-700 transition-colors flex items-center gap-2 shrink-0"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Làm mới số liệu</span>
          </button>
        </div>

        {/* Thông báo phạm vi MVP */}
        <div className="mb-6 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-medium flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
          <span>Ghi chú: Dữ liệu báo cáo chỉ phản ánh các đơn hàng đã được chốt (CLOSED) trong phạm vi mô phỏng MVP. Món đã hủy không tính vào doanh thu.</span>
        </div>

        {/* Bộ lọc theo khoảng ngày */}
        <form onSubmit={handleFilterSubmit} className="glass-panel p-4 rounded-2xl border border-slate-800 mb-6 flex flex-col sm:flex-row items-end gap-3">
          <div className="flex-1 w-full sm:w-auto">
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Từ ngày:
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full touch-target px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 text-sm focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="flex-1 w-full sm:w-auto">
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Đến ngày:
            </label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full touch-target px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 text-sm focus:outline-none focus:border-amber-500"
            />
          </div>

          <button
            type="submit"
            className="touch-target px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-sm shadow-md transition-all shrink-0"
          >
            Lọc kết quả
          </button>
        </form>

        {/* Lỗi nếu có */}
        {errorMessage && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            {errorMessage}
          </div>
        )}

        {/* Thống kê Tổng quan (KPI Cards) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="glass-panel p-5 rounded-2xl border border-slate-800 relative overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Tổng doanh thu</span>
              <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center">
                <DollarSign className="w-5 h-5" />
              </div>
            </div>
            <div className="text-2xl font-black text-slate-100 font-mono tracking-tight">
              {formatCurrency(revenueData?.summary?.totalRevenue || 0)}
            </div>
            <div className="text-xs text-slate-400 mt-1">Các đơn hàng đã CLOSED</div>
          </div>

          <div className="glass-panel p-5 rounded-2xl border border-slate-800 relative overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Đơn hàng đã chốt</span>
              <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <ShoppingBag className="w-5 h-5" />
              </div>
            </div>
            <div className="text-2xl font-black text-slate-100 tracking-tight">
              {revenueData?.summary?.totalClosedOrders || 0} đơn
            </div>
            <div className="text-xs text-slate-400 mt-1">Đã phục vụ hoàn tất</div>
          </div>

          <div className="glass-panel p-5 rounded-2xl border border-slate-800 relative overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Món bán chạy nhất</span>
              <div className="w-8 h-8 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center">
                <Award className="w-5 h-5" />
              </div>
            </div>
            <div className="text-lg font-black text-slate-100 truncate">
              {bestSellingItems[0]?.itemName || 'Chưa có số liệu'}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              {bestSellingItems[0] ? `Đã bán ${bestSellingItems[0].totalQuantitySold} phần` : 'N/A'}
            </div>
          </div>
        </div>

        {/* 2 Bảng: Món bán chạy & Danh sách đơn đã chốt */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* CỘT TOP MÓN BÁN CHẠY (5 CỘT) */}
          <div className="lg:col-span-5 glass-panel rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
              <h2 className="font-bold text-slate-100 text-base flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-amber-500" />
                Món bán chạy theo số lượng
              </h2>
            </div>

            <div className="divide-y divide-slate-800">
              {bestSellingItems.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-sm">
                  Chưa có số liệu món bán chạy.
                </div>
              ) : (
                bestSellingItems.map((item) => (
                  <div key={item.menuItemId} className="p-4 flex items-center justify-between gap-3 hover:bg-slate-900/40 transition-colors">
                    <div className="flex items-center gap-3">
                      <span className={`w-6 h-6 rounded-lg text-xs font-black flex items-center justify-center ${
                        item.rank === 1
                          ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                          : item.rank === 2
                          ? 'bg-slate-300 text-slate-950'
                          : item.rank === 3
                          ? 'bg-amber-800 text-amber-100'
                          : 'bg-slate-800 text-slate-400'
                      }`}>
                        {item.rank}
                      </span>
                      <div>
                        <div className="font-semibold text-slate-200 text-sm">
                          {item.itemName}
                        </div>
                        <div className="text-xs text-slate-500 font-medium">
                          {item.categoryName}
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="font-extrabold text-amber-400 text-sm">
                        {item.totalQuantitySold} phần
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        {formatCurrency(item.totalSalesAmount)}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* CỘT DANH SÁCH ĐƠN HÀNG ĐÃ CHỐT (7 CỘT) */}
          <div className="lg:col-span-7 glass-panel rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
              <h2 className="font-bold text-slate-100 text-base flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-500" />
                Đơn hàng đã chốt gần đây
              </h2>
              <span className="text-xs text-slate-400 font-medium">
                {revenueData?.orders?.length || 0} đơn
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-900/60 text-slate-400 text-xs uppercase tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Mã đơn</th>
                    <th className="py-3 px-4">Bàn</th>
                    <th className="py-3 px-4">Thời gian chốt</th>
                    <th className="py-3 px-4 text-right">Doanh thu</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {(!revenueData?.orders || revenueData.orders.length === 0) ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-slate-500 text-sm">
                        Không có đơn hàng nào trong khoảng thời gian đã chọn.
                      </td>
                    </tr>
                  ) : (
                    revenueData.orders.map((ord: any) => (
                      <tr key={ord.id} className="hover:bg-slate-900/40">
                        <td className="py-3 px-4 font-mono font-semibold text-amber-400 text-xs">
                          {ord.orderCode}
                        </td>
                        <td className="py-3 px-4 text-slate-200 text-xs">
                          {ord.tableCode} ({ord.areaName})
                        </td>
                        <td className="py-3 px-4 text-slate-400 text-xs whitespace-nowrap">
                          {formatDateTime(ord.closedAt)}
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-slate-100 font-mono text-xs whitespace-nowrap">
                          {formatCurrency(ord.totalAmount)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>

      </main>
    </div>
  );
}
