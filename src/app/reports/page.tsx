'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
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
  FileSpreadsheet,
  Receipt,
  Eye,
  X,
  UserCheck,
  User,
  Clock,
  ExternalLink,
  CheckCircle2
} from 'lucide-react';
import { formatCurrency, formatDateTime } from '@/lib/utils';

export default function ReportsPage() {
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'ALL' | 'DINE_IN' | 'ONLINE'>('ALL');

  const [revenueData, setRevenueData] = useState<any>(null);
  const [bestSellingItems, setBestSellingItems] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  // State xem chi tiết hóa đơn cũ
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [orderDetailLoading, setOrderDetailLoading] = useState(false);
  const [orderDetailData, setOrderDetailData] = useState<any | null>(null);

  // Mở modal xem chi tiết hóa đơn đã chốt
  const handleSelectOrder = async (ord: any) => {
    setSelectedOrder(ord);
    setOrderDetailLoading(true);
    setOrderDetailData(null);

    try {
      const res = await fetch(`/api/orders/${ord.id}`);
      const data = await res.json();
      if (data.success && data.order) {
        setOrderDetailData(data.order);
      }
    } catch (err) {
      console.error('Lỗi tải chi tiết đơn hàng:', err);
    } finally {
      setOrderDetailLoading(false);
    }
  };

  const fetchReports = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage('');

    try {
      const params = new URLSearchParams();
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);
      if (sourceFilter !== 'ALL') params.set('source', sourceFilter);

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
  }, [fromDate, toDate, sourceFilter]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const handleFilterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchReports();
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        
        {/* Header Báo cáo */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <BarChart3 className="w-7 h-7 text-orange-600" />
              Báo cáo Doanh thu & Thống kê
            </h1>
            <p className="text-slate-600 text-xs sm:text-sm mt-0.5 font-medium">
              Dành riêng cho Quản lý: Tổng hợp đơn hàng đã chốt (CLOSED) và phân tích món bán chạy
            </p>
          </div>

          <button
            onClick={fetchReports}
            disabled={isLoading}
            className="touch-target px-4 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 text-sm font-bold border border-slate-200 transition-colors flex items-center gap-2 shrink-0 shadow-xs"
          >
            <RefreshCw className={`w-4 h-4 text-orange-600 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Làm mới số liệu</span>
          </button>
        </div>

        {/* Thông báo phạm vi MVP */}
        <div className="mb-6 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-medium flex items-center gap-2.5 shadow-xs">
          <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
          <span>Ghi chú: Dữ liệu báo cáo chỉ phản ánh các đơn hàng đã được chốt (CLOSED) trong phạm vi mô phỏng MVP. Món đã hủy không tính vào doanh thu.</span>
        </div>

        {/* Bộ lọc theo khoảng ngày */}
        <form onSubmit={handleFilterSubmit} className="bg-white p-5 rounded-2xl border border-slate-200 mb-6 flex flex-col sm:flex-row items-end gap-4 shadow-sm">
          <div className="flex-1 w-full sm:w-auto">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-orange-600" />
              Từ ngày:
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full touch-target px-3.5 py-2 rounded-xl bg-white border border-slate-300 text-slate-900 text-sm focus:outline-none focus:border-orange-500 font-medium shadow-xs"
            />
          </div>

          <div className="flex-1 w-full sm:w-auto">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-orange-600" />
              Đến ngày:
            </label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full touch-target px-3.5 py-2 rounded-xl bg-white border border-slate-300 text-slate-900 text-sm focus:outline-none focus:border-orange-500 font-medium shadow-xs"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="submit"
              className="touch-target px-6 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-extrabold text-sm shadow-md shadow-orange-600/20 transition-all shrink-0 active:scale-95 flex-1 sm:flex-none"
            >
              Lọc kết quả
            </button>
            {(fromDate || toDate) && (
              <button
                type="button"
                onClick={() => {
                  setFromDate('');
                  setToDate('');
                }}
                className="touch-target px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold border border-slate-200 transition-colors"
              >
                Xóa lọc
              </button>
            )}
          </div>
        </form>

        {/* Lỗi nếu có */}
        {errorMessage && (
          <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium">
            {errorMessage}
          </div>
        )}

        {/* Thống kê Tổng quan (KPI Cards) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-8">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Tổng doanh thu</span>
              <div className="w-10 h-10 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center font-bold">
                <DollarSign className="w-5 h-5" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-orange-600 font-mono tracking-tight">
              {formatCurrency(revenueData?.summary?.totalRevenue || 0)}
            </div>
            <div className="text-xs text-slate-500 mt-1 font-medium">Các đơn hàng đã chốt (CLOSED)</div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Đơn hàng đã chốt</span>
              <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                <ShoppingBag className="w-5 h-5" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight font-mono">
              {revenueData?.summary?.totalClosedOrders || 0} đơn
            </div>
            <div className="text-xs text-slate-500 mt-1 font-medium">Đã phục vụ hoàn tất</div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Món bán chạy nhất</span>
              <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold">
                <Award className="w-5 h-5" />
              </div>
            </div>
            <div className="text-lg font-black text-slate-900 truncate">
              {bestSellingItems[0]?.itemName || 'Chưa có số liệu'}
            </div>
            <div className="text-xs text-slate-500 mt-1 font-medium">
              {bestSellingItems[0] ? `Đã bán ${bestSellingItems[0].totalQuantitySold} phần` : 'N/A'}
            </div>
          </div>
        </div>

        {/* 2 Bảng: Món bán chạy & Danh sách đơn đã chốt */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* CỘT TOP MÓN BÁN CHẠY (5 CỘT) */}
          <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
              <h2 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-orange-600" />
                Món bán chạy theo số lượng
              </h2>
            </div>

            <div className="divide-y divide-slate-100">
              {bestSellingItems.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-sm">
                  Chưa có số liệu món bán chạy.
                </div>
              ) : (
                bestSellingItems.map((item) => (
                  <div key={item.menuItemId} className="p-4 flex items-center justify-between gap-3 hover:bg-orange-50/40 transition-colors">
                    <div className="flex items-center gap-3">
                      <span className={`w-6 h-6 rounded-lg text-xs font-black flex items-center justify-center ${
                        item.rank === 1
                          ? 'bg-amber-500 text-slate-950 shadow-xs'
                          : item.rank === 2
                          ? 'bg-slate-200 text-slate-800'
                          : item.rank === 3
                          ? 'bg-amber-100 text-amber-900'
                          : 'bg-slate-100 text-slate-600'
                      }`}>
                        {item.rank}
                      </span>
                      <div>
                        <div className="font-bold text-slate-900 text-sm">
                          {item.itemName}
                        </div>
                        <div className="text-xs text-slate-500 font-medium">
                          {item.categoryName}
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="font-extrabold text-orange-600 text-sm font-mono">
                        {item.totalQuantitySold} phần
                      </div>
                      <div className="text-xs text-slate-500 font-mono font-medium">
                        {formatCurrency(item.totalSalesAmount)}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* CỘT DANH SÁCH ĐƠN HÀNG ĐÃ CHỐT (7 CỘT) */}
          <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
              <div>
                <h2 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                  Đơn hàng đã chốt gần đây
                </h2>
                <p className="text-xs text-slate-500 mt-0.5 font-medium">
                  Bấm vào đơn hàng bất kỳ để xem ai chốt, món ăn và hóa đơn
                </p>
              </div>

              {/* Phân hệ nguồn đơn: Tất cả, Tại bàn, Sàn online */}
              <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => setSourceFilter('ALL')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    sourceFilter === 'ALL'
                      ? 'bg-white text-orange-600 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Tất cả ({revenueData?.summary?.totalClosedOrders || 0})
                </button>
                <button
                  type="button"
                  onClick={() => setSourceFilter('DINE_IN')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    sourceFilter === 'DINE_IN'
                      ? 'bg-white text-orange-600 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Tại bàn ({revenueData?.summary?.dineInCount || 0})
                </button>
                <button
                  type="button"
                  onClick={() => setSourceFilter('ONLINE')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    sourceFilter === 'ONLINE'
                      ? 'bg-white text-orange-600 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Sàn online ({revenueData?.summary?.onlineCount || 0})
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-100/90 text-slate-700 text-xs uppercase tracking-wider font-extrabold border-b border-slate-200">
                  <tr>
                    <th className="py-3.5 px-4">Mã đơn</th>
                    <th className="py-3.5 px-4">Bàn</th>
                    <th className="py-3.5 px-4">Người chốt</th>
                    <th className="py-3.5 px-4">Thời gian chốt</th>
                    <th className="py-3.5 px-4 text-right">Doanh thu</th>
                    <th className="py-3.5 px-4 text-center">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {(!revenueData?.orders || revenueData.orders.length === 0) ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-slate-400 text-sm">
                        Không có đơn hàng nào trong khoảng thời gian đã chọn.
                      </td>
                    </tr>
                  ) : (
                    revenueData.orders.map((ord: any) => (
                      <tr 
                        key={ord.id} 
                        onClick={() => handleSelectOrder(ord)}
                        className="hover:bg-orange-50/50 cursor-pointer transition-colors group"
                        title="Bấm để xem ai chốt và chi tiết hóa đơn"
                      >
                        <td className="py-3.5 px-4 font-mono font-bold text-orange-600 text-xs whitespace-nowrap">
                          <div className="flex items-center gap-1.5 group-hover:text-orange-700">
                            <Receipt className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                            <span>{ord.orderCode}</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-slate-900 font-semibold text-xs whitespace-nowrap">
                          {ord.orderSource === 'GRABFOOD' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              GrabFood
                            </span>
                          ) : ord.orderSource === 'SHOPEEFOOD' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-orange-50 text-orange-700 border border-orange-200">
                              ShopeeFood
                            </span>
                          ) : ord.orderSource === 'BEFOOD' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-yellow-50 text-yellow-800 border border-yellow-200">
                              BeFood
                            </span>
                          ) : (
                            <>
                              {ord.tableCode} <span className="text-slate-500 text-xs font-normal">({ord.areaName})</span>
                            </>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-xs whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-xs">
                            <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                            {ord.closedByName || 'Quản lý'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-slate-600 text-xs whitespace-nowrap font-medium">
                          {formatDateTime(ord.closedAt)}
                        </td>
                        <td className="py-3.5 px-4 text-right font-black text-slate-900 font-mono text-sm whitespace-nowrap">
                          {formatCurrency(ord.totalAmount)}
                        </td>
                        <td className="py-3.5 px-4 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => handleSelectOrder(ord)}
                              className="touch-target px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold border border-slate-200 transition-colors flex items-center gap-1"
                              title="Xem chi tiết đơn"
                            >
                              <Eye className="w-3.5 h-3.5 text-orange-600" />
                              <span className="hidden sm:inline">Chi tiết</span>
                            </button>
                            <Link
                              href={`/orders/${ord.id}/invoice`}
                              className="touch-target px-2.5 py-1 rounded-lg bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs shadow-xs transition-colors flex items-center gap-1"
                              title="Xem hóa đơn và in"
                            >
                              <Receipt className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">Hóa đơn</span>
                            </Link>
                          </div>
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

      {/* MODAL XEM CHI TIẾT ĐƠN HÀNG & AI CHỐT HÓA ĐƠN: THIẾT KẾ SÁNG, RÕ RÀNG, ĐỘ TƯƠNG PHẢN CAO */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="max-w-2xl w-full bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-orange-100 text-orange-600 flex items-center justify-center font-bold">
                  <Receipt className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-black text-slate-900 text-lg tracking-tight">
                      {selectedOrder.orderCode}
                    </h3>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-800 border border-purple-200">
                      ĐÃ CHỐT
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-0.5 font-medium">
                    Bàn: <strong className="text-orange-600 font-bold">{selectedOrder.tableCode}</strong> ({selectedOrder.areaName})
                  </p>
                </div>
              </div>

              <button 
                onClick={() => setSelectedOrder(null)}
                className="text-slate-400 hover:text-slate-700 p-2 rounded-xl hover:bg-slate-100 transition-colors"
                title="Đóng cửa sổ"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-5 flex-1 bg-white">
              
              {/* Thẻ thông tin người chốt & thời gian: Nền sáng trang nhã, tương phản cao */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs">
                <div>
                  <span className="text-slate-500 font-semibold block mb-1">Nhân viên tạo đơn:</span>
                  <div className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                    <User className="w-4 h-4 text-slate-400" />
                    <span>{selectedOrder.creatorName || orderDetailData?.creatorName || 'Phục vụ'}</span>
                  </div>
                  <span className="text-xs text-slate-500 mt-0.5 block font-medium">
                    {formatDateTime(selectedOrder.createdAt)}
                  </span>
                </div>

                <div>
                  <span className="text-slate-500 font-semibold block mb-1">Nhân viên chốt đơn:</span>
                  <div className="font-extrabold text-orange-600 text-sm flex items-center gap-1.5">
                    <UserCheck className="w-4 h-4 text-emerald-600" />
                    <span>{selectedOrder.closedByName || orderDetailData?.closedByName || 'Quản lý'}</span>
                  </div>
                  <span className="text-xs text-emerald-700 font-bold mt-0.5 block">
                    {formatDateTime(selectedOrder.closedAt)}
                  </span>
                </div>

                <div className="col-span-1 sm:col-span-2 pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-emerald-700 font-bold">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Thanh toán: Chuyển khoản VietQR đã được xác nhận</span>
                  </div>
                  {orderDetailData?.paymentReference && (
                    <span className="text-xs font-mono font-bold text-slate-700 bg-white px-2 py-0.5 rounded border border-slate-200">
                      Mã đối soát: {orderDetailData.paymentReference}
                    </span>
                  )}
                </div>
              </div>

              {/* Danh sách các món ăn trong đơn */}
              <div>
                <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider mb-2.5 flex items-center justify-between">
                  <span>Danh sách món ăn trong hóa đơn</span>
                  {orderDetailData?.items && (
                    <span className="text-xs font-bold text-slate-500 lowercase">
                      ({orderDetailData.items.filter((it: any) => it.status !== 'CANCELLED').length} món)
                    </span>
                  )}
                </h4>

                {orderDetailLoading ? (
                  <div className="py-10 text-center text-slate-500 text-xs flex items-center justify-center gap-2">
                    <div className="w-5 h-5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                    <span className="font-medium">Đang tải danh sách món ăn...</span>
                  </div>
                ) : orderDetailData?.items ? (
                  <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-100 text-slate-700 uppercase text-xs font-extrabold border-b border-slate-200">
                        <tr>
                          <th className="py-3 px-4">Món ăn</th>
                          <th className="py-3 px-3 text-center">SL</th>
                          <th className="py-3 px-4 text-right">Đơn giá</th>
                          <th className="py-3 px-4 text-right">Thành tiền</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {orderDetailData.items
                          .filter((it: any) => it.status !== 'CANCELLED')
                          .map((item: any) => (
                            <tr key={item.id} className="hover:bg-orange-50/40 transition-colors">
                              <td className="py-3 px-4 font-bold text-slate-900">
                                {item.itemName || item.item_name_snapshot}
                              </td>
                              <td className="py-3 px-3 text-center font-black text-slate-900">
                                {item.quantity}
                              </td>
                              <td className="py-3 px-4 text-right font-mono font-medium text-slate-700">
                                {formatCurrency(item.unitPrice || item.unit_price_snapshot)}
                              </td>
                              <td className="py-3 px-4 text-right font-mono font-extrabold text-slate-900">
                                {formatCurrency(item.lineTotal || (Number(item.unitPrice || item.unit_price_snapshot) * item.quantity))}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-slate-400 text-xs py-6 text-center">
                    Không tìm thấy chi tiết món.
                  </div>
                )}
              </div>

              {/* Tổng tiền */}
              <div className="p-4 rounded-2xl bg-orange-50 border border-orange-200 flex items-center justify-between">
                <span className="text-xs font-black text-slate-800 uppercase tracking-wider">
                  Tổng tiền đã thanh toán:
                </span>
                <span className="text-2xl font-black text-orange-600 font-mono">
                  {formatCurrency(selectedOrder.totalAmount)}
                </span>
              </div>

            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                className="touch-target px-4 py-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 text-xs font-extrabold border border-slate-200 transition-colors shadow-xs"
              >
                Đóng
              </button>

              <Link
                href={`/orders/${selectedOrder.id}/invoice`}
                className="touch-target px-5 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-extrabold text-xs shadow-md shadow-orange-600/20 transition-all flex items-center gap-2 active:scale-95"
              >
                <Receipt className="w-4 h-4" />
                <span>Xem & In hóa đơn đầy đủ</span>
                <ExternalLink className="w-3.5 h-3.5 ml-0.5" />
              </Link>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
