'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import AdminNavTabs from '@/components/admin/AdminNavTabs';
import { 
  Store, 
  RefreshCw, 
  AlertCircle, 
  CheckCircle2, 
  Settings, 
  TrendingUp, 
  ShoppingBag, 
  AlertTriangle, 
  DollarSign, 
  Plus, 
  ExternalLink, 
  Layers, 
  Sliders, 
  Clock, 
  Check, 
  X,
  Play,
  Download,
  FileSpreadsheet,
  Calendar
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

interface ChannelSummary {
  id: string;
  code: string;
  name: string;
  logo_url: string | null;
  is_active: boolean;
  connection_status: 'UNCONFIGURED' | 'CONNECTED' | 'ERROR' | 'DISABLED';
  last_sync_at: string | null;
  last_error_message: string | null;
  auto_confirm_order: boolean;
  merchant_id: string | null;
  environment: string | null;
  hasCredentials: boolean;
}

interface DashboardMetrics {
  totalOrders: number;
  totalRevenue: number;
  totalPlatformFee: number;
  totalNetRevenue: number;
  averageOrderValue?: number;
  averageCommissionRate?: number;
  completedOrders?: number;
  cancelledOrders?: number;
  errorCount: number;
  channelSummaries: Array<{
    channelCode: string;
    channelName: string;
    orderCount: number;
    revenue: number;
    platformFee?: number;
    netRevenue: number;
    commissionRate?: number;
    averageOrderValue?: number;
    completedCount?: number;
    cancelledCount?: number;
    isActive: boolean;
    status: string;
    lastSyncAt: string | null;
  }>;
}

interface RecentOrder {
  id: string;
  external_order_code: string;
  channel_code: string;
  channel_name: string;
  normalized_status: string;
  customer_name: string;
  total_amount: number;
  net_revenue: number;
  ordered_at: string;
  items: Array<{
    externalItemName: string;
    quantity: number;
    unitPrice: number;
    internalMenuItemName?: string;
  }>;
}

export default function AdminChannelsPage() {
  const [channels, setChannels] = useState<ChannelSummary[]>([]);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Bộ lọc thời gian cho báo cáo tài chính kênh
  const [period, setPeriod] = useState<'ALL' | 'TODAY' | 'WEEK' | 'MONTH' | 'CUSTOM'>('ALL');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Trạng thái modal mô phỏng nhận đơn
  const [simulateModalOpen, setSimulateModalOpen] = useState(false);
  const [simulateChannel, setSimulateChannel] = useState('GRABFOOD');
  const [simulateCustomer, setSimulateCustomer] = useState('Khách Đặt Hàng Demo');
  const [simulateAmount, setSimulateAmount] = useState(190000);
  const [isSimulating, setIsSimulating] = useState(false);

  const handlePeriodChange = (newPeriod: 'ALL' | 'TODAY' | 'WEEK' | 'MONTH' | 'CUSTOM') => {
    setPeriod(newPeriod);
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);

    if (newPeriod === 'TODAY') {
      setFromDate(todayStr);
      setToDate(todayStr);
    } else if (newPeriod === 'WEEK') {
      const past = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      setFromDate(past.toISOString().slice(0, 10));
      setToDate(todayStr);
    } else if (newPeriod === 'MONTH') {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      setFromDate(firstDay.toISOString().slice(0, 10));
      setToDate(todayStr);
    } else if (newPeriod === 'ALL') {
      setFromDate('');
      setToDate('');
    }
  };

  const handleExportCsv = () => {
    const params = new URLSearchParams({ format: 'csv' });
    if (fromDate) params.set('from', fromDate);
    if (toDate) params.set('to', toDate);
    window.open(`/api/admin/channels/reports?${params.toString()}`, '_blank');
  };

  const fetchChannelData = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const params = new URLSearchParams();
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);

      const res = await fetch(`/api/admin/channels?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setChannels(data.channels || []);
        setMetrics(data.metrics || null);
      } else {
        setErrorMessage(data.message || 'Không thể tải danh sách kênh.');
      }

      // Tải thêm đơn hàng gần đây từ kênh đầu tiên đang active
      const ordersRes = await fetch('/api/admin/channels/GRABFOOD/orders?limit=10');
      const ordersData = await ordersRes.json();
      if (ordersData.success) {
        setRecentOrders(ordersData.orders || []);
      }
    } catch {
      setErrorMessage('Lỗi kết nối khi tải dữ liệu kênh bán hàng.');
    } finally {
      setIsLoading(false);
    }
  }, [fromDate, toDate]);

  useEffect(() => {
    fetchChannelData();
  }, [fetchChannelData]);

  // Bật / Tắt kênh bán hàng nhanh
  const handleToggleChannel = async (channel: ChannelSummary) => {
    const nextState = !channel.is_active;
    try {
      const res = await fetch(`/api/admin/channels/${channel.code}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: nextState }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMessage(`Đã ${nextState ? 'kích hoạt' : 'tạm dừng'} kênh ${channel.name}.`);
        fetchChannelData();
        setTimeout(() => setSuccessMessage(''), 4000);
      } else {
        setErrorMessage(data.message || 'Lỗi khi cập nhật trạng thái kênh.');
      }
    } catch {
      setErrorMessage('Lỗi mạng khi cập nhật kênh.');
    }
  };

  // Kích hoạt mô phỏng nhận đơn
  const handleSimulateOrder = async () => {
    setIsSimulating(true);
    setErrorMessage('');
    try {
      const res = await fetch(`/api/admin/channels/${simulateChannel}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: simulateCustomer,
          totalAmount: simulateAmount,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMessage(`Đã mô phỏng nhận đơn mới [${data.order?.externalOrderCode}] từ ${simulateChannel} thành công!`);
        setSimulateModalOpen(false);
        fetchChannelData();
        setTimeout(() => setSuccessMessage(''), 4000);
      } else {
        setErrorMessage(data.message || 'Lỗi khi mô phỏng nhận đơn.');
      }
    } catch {
      setErrorMessage('Lỗi mạng khi gửi yêu cầu mô phỏng.');
    } finally {
      setIsSimulating(false);
    }
  };

  const getStatusBadge = (status: string, isActive: boolean) => {
    if (!isActive) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">
          <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
          Đã tắt
        </span>
      );
    }

    switch (status) {
      case 'CONNECTED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            Đang kết nối
          </span>
        );
      case 'ERROR':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-red-50 text-red-700 border border-red-200">
            <AlertCircle className="w-3 h-3 text-red-500" />
            Kết nối lỗi
          </span>
        );
      case 'UNCONFIGURED':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
            Chưa cấu hình
          </span>
        );
    }
  };

  const getChannelBrandColor = (code: string) => {
    switch (code.toUpperCase()) {
      case 'GRABFOOD':
        return {
          bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
          accent: 'from-emerald-500 to-teal-600',
          tag: 'GrabFood',
        };
      case 'SHOPEEFOOD':
        return {
          bg: 'bg-orange-50 text-orange-700 border-orange-200',
          accent: 'from-orange-500 to-amber-600',
          tag: 'ShopeeFood',
        };
      case 'BEFOOD':
        return {
          bg: 'bg-yellow-50 text-yellow-800 border-yellow-200',
          accent: 'from-yellow-500 to-amber-500',
          tag: 'BeFood',
        };
      default:
        return {
          bg: 'bg-blue-50 text-blue-700 border-blue-200',
          accent: 'from-blue-500 to-indigo-600',
          tag: 'Mock',
        };
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <AdminNavTabs showCreateDishButton={false} />

        {/* Thông báo Thành công / Thất bại */}
        {successMessage && (
          <div className="mb-6 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-semibold flex items-center justify-between shadow-xs animate-in fade-in">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <span>{successMessage}</span>
            </div>
            <button onClick={() => setSuccessMessage('')} className="text-emerald-600 hover:text-emerald-800">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {errorMessage && (
          <div className="mb-6 p-4 rounded-2xl bg-red-50 border border-red-200 text-red-800 text-sm font-semibold flex items-center justify-between shadow-xs animate-in fade-in">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button onClick={() => setErrorMessage('')} className="text-red-600 hover:text-red-800">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Tiêu đề & Hành động */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
              <Store className="w-7 h-7 text-orange-600" />
              Kênh Bán Hàng Trực Tuyến
            </h1>
            <p className="text-sm text-slate-500 font-medium mt-1">
              Quản lý kết nối GrabFood, ShopeeFood, đồng bộ đơn hàng và menu thời gian thực
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setSimulateModalOpen(true)}
              className="touch-target px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-sm shadow-md shadow-emerald-600/20 transition-all flex items-center gap-2"
            >
              <Play className="w-4 h-4" />
              <span>Mô phỏng nhận đơn</span>
            </button>

            <button
              onClick={fetchChannelData}
              disabled={isLoading}
              className="touch-target px-4 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-sm shadow-xs transition-all flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-orange-600' : ''}`} />
              <span>Làm mới</span>
            </button>
          </div>
        </div>

        {/* Bộ lọc khoảng thời gian & Xuất đối soát CSV */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 mb-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mr-1 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-orange-600" />
              Kỳ báo cáo:
            </span>
            <button
              onClick={() => handlePeriodChange('ALL')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                period === 'ALL'
                  ? 'bg-orange-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Toàn bộ
            </button>
            <button
              onClick={() => handlePeriodChange('TODAY')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                period === 'TODAY'
                  ? 'bg-orange-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Hôm nay
            </button>
            <button
              onClick={() => handlePeriodChange('WEEK')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                period === 'WEEK'
                  ? 'bg-orange-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              7 ngày qua
            </button>
            <button
              onClick={() => handlePeriodChange('MONTH')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                period === 'MONTH'
                  ? 'bg-orange-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Tháng này
            </button>
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto justify-end">
            <button
              onClick={handleExportCsv}
              className="touch-target px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-xs transition-all flex items-center gap-1.5"
              title="Xuất file đối soát Excel/CSV cho kế toán"
            >
              <Download className="w-3.5 h-3.5 text-orange-400" />
              <span>Xuất đối soát CSV</span>
            </button>
          </div>
        </div>

        {/* Dashboard Thống kê Kênh */}
        {metrics && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="glass-card p-5 rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">Tổng Đơn Kênh</span>
                <ShoppingBag className="w-5 h-5 text-blue-600" />
              </div>
              <div className="text-2xl font-black text-slate-900">{metrics.totalOrders} đơn</div>
              <div className="text-xs text-slate-500 mt-1">GrabFood, ShopeeFood & BeFood</div>
            </div>

            <div className="glass-card p-5 rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">Doanh Thu Gộp</span>
                <DollarSign className="w-5 h-5 text-emerald-600" />
              </div>
              <div className="text-2xl font-black text-slate-900">{formatCurrency(metrics.totalRevenue)}</div>
              <div className="text-xs text-slate-500 mt-1">Tổng tiền khách đặt trên sàn</div>
            </div>

            <div className="glass-card p-5 rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">Chiết Khấu Sàn</span>
                <TrendingUp className="w-5 h-5 text-amber-600" />
              </div>
              <div className="text-2xl font-black text-amber-700">{formatCurrency(metrics.totalPlatformFee)}</div>
              <div className="text-xs text-slate-500 mt-1">Phí hoa hồng dịch vụ sàn (20-22%)</div>
            </div>

            <div className="glass-card p-5 rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">Thực Nhận Ròng</span>
                <CheckCircle2 className="w-5 h-5 text-orange-600" />
              </div>
              <div className="text-2xl font-black text-orange-600">{formatCurrency(metrics.totalNetRevenue)}</div>
              <div className="text-xs text-slate-500 mt-1">Doanh thu nhà hàng thực nhận</div>
            </div>
          </div>
        )}

        {/* Danh sách Kênh Bán Hàng */}
        <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
          <span>Nền tảng Tích hợp</span>
          <span className="px-2 py-0.5 rounded-full text-xs bg-slate-200 text-slate-700 font-extrabold">{channels.length}</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-10">
          {channels.map((channel) => {
            const brand = getChannelBrandColor(channel.code);
            return (
              <div
                key={channel.id}
                className="glass-card rounded-2xl border border-slate-200 p-6 flex flex-col justify-between hover:border-orange-300 transition-all shadow-xs"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-12 h-12 rounded-xl bg-gradient-to-tr ${brand.accent} flex items-center justify-center text-white font-black text-lg shadow-md`}>
                        {channel.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-extrabold text-slate-900 text-base">{channel.name}</div>
                        <div className="text-xs text-slate-400 font-medium">Mã: {channel.code}</div>
                      </div>
                    </div>

                    {getStatusBadge(channel.connection_status, channel.is_active)}
                  </div>

                  <div className="space-y-2.5 py-3 border-y border-slate-100 text-xs">
                    <div className="flex items-center justify-between text-slate-600">
                      <span>Môi trường:</span>
                      <span className="font-semibold uppercase text-slate-800">{channel.environment || 'SANDBOX'}</span>
                    </div>

                    <div className="flex items-center justify-between text-slate-600">
                      <span>Tài khoản Merchant:</span>
                      <span className="font-semibold text-slate-800">
                        {channel.merchant_id ? `${channel.merchant_id.slice(0, 10)}...` : 'Chưa cấu hình'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-slate-600">
                      <span>Tự động nhận đơn:</span>
                      <span className={`font-semibold ${channel.auto_confirm_order ? 'text-emerald-600' : 'text-slate-500'}`}>
                        {channel.auto_confirm_order ? 'BẬT' : 'TẮT'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-slate-600">
                      <span>Đồng bộ gần nhất:</span>
                      <span className="font-semibold text-slate-800">
                        {channel.last_sync_at ? new Date(channel.last_sync_at).toLocaleTimeString('vi-VN') : 'Chưa đồng bộ'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-2 flex items-center justify-between gap-2">
                  <button
                    onClick={() => handleToggleChannel(channel)}
                    className={`touch-target px-3.5 py-2 rounded-xl text-xs font-bold transition-all border ${
                      channel.is_active
                        ? 'bg-slate-100 text-slate-700 hover:bg-red-50 hover:text-red-700 hover:border-red-200'
                        : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200'
                    }`}
                  >
                    {channel.is_active ? 'Tắt kênh' : 'Bật kết nối'}
                  </button>

                  <div className="flex items-center gap-2">
                    <Link
                      href={`/admin/channels/${channel.code}`}
                      className="touch-target px-4 py-2 rounded-xl bg-orange-50 text-orange-700 hover:bg-orange-100 border border-orange-200 font-bold text-xs flex items-center gap-1.5 transition-colors"
                    >
                      <Settings className="w-3.5 h-3.5" />
                      <span>Cấu hình & Đơn</span>
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Bảng Đối Soát Hiệu Quả Kênh Bán Hàng */}
        {metrics && metrics.channelSummaries && metrics.channelSummaries.length > 0 && (
          <div className="glass-card rounded-2xl border border-slate-200 p-6 shadow-xs mb-10">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
              <div>
                <h2 className="text-base font-black text-slate-900 tracking-tight flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                  Đối Soát Doanh Thu & Chiết Khấu Sàn
                </h2>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Bảng chiết khấu hoa hồng và thực nhận ròng theo từng kênh bán hàng
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 text-xs uppercase font-extrabold tracking-wider bg-slate-50/50">
                    <th className="py-3 px-4">Kênh Bán Hàng</th>
                    <th className="py-3 px-4 text-center">Số Đơn</th>
                    <th className="py-3 px-4 text-right">Doanh Thu Gộp (GMV)</th>
                    <th className="py-3 px-4 text-right">Chiết Khấu Sàn</th>
                    <th className="py-3 px-4 text-right">Thực Nhận Ròng</th>
                    <th className="py-3 px-4 text-right">AOV</th>
                    <th className="py-3 px-4 text-center">Tỷ Lệ Đạt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {metrics.channelSummaries.map((c) => {
                    const brand = getChannelBrandColor(c.channelCode);
                    return (
                      <tr key={c.channelCode} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3.5 px-4 font-bold text-slate-900 flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-md text-xs font-extrabold border ${brand.bg}`}>
                            {c.channelName}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-center font-bold text-slate-800">
                          {c.orderCount} đơn
                        </td>
                        <td className="py-3.5 px-4 text-right font-bold text-slate-900">
                          {formatCurrency(c.revenue)}
                        </td>
                        <td className="py-3.5 px-4 text-right font-bold text-amber-700">
                          {formatCurrency(c.platformFee || 0)}{' '}
                          <span className="text-xs font-normal text-amber-600">({c.commissionRate || 20}%)</span>
                        </td>
                        <td className="py-3.5 px-4 text-right font-black text-emerald-700">
                          {formatCurrency(c.netRevenue)}
                        </td>
                        <td className="py-3.5 px-4 text-right font-medium text-slate-700">
                          {formatCurrency(c.averageOrderValue || 0)}
                        </td>
                        <td className="py-3.5 px-4 text-center text-xs">
                          <span className="px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 font-bold">
                            {c.completedCount || c.orderCount} xong
                          </span>
                          {c.cancelledCount && c.cancelledCount > 0 ? (
                            <span className="ml-1 px-2 py-1 rounded-full bg-red-50 text-red-700 font-bold">
                              {c.cancelledCount} hủy
                            </span>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Danh sách Đơn hàng Mới nhận */}
        <div className="glass-card rounded-2xl border border-slate-200 p-6 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-orange-600" />
                Đơn Hàng Kênh Gần Đây
              </h2>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Các đơn hàng tiếp nhận từ GrabFood, ShopeeFood kèm thông tin quy đổi món
              </p>
            </div>
          </div>

          {recentOrders.length === 0 ? (
            <div className="text-center py-12">
              <ShoppingBag className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <div className="text-sm font-bold text-slate-700">Chưa có đơn hàng nào từ các sàn</div>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                Nhấn &quot;Mô phỏng nhận đơn&quot; phía trên để gửi thử nghiệm một đơn hàng mẫu vào hệ thống!
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 text-xs uppercase font-extrabold tracking-wider">
                    <th className="py-3 px-4">Mã Đơn Sàn</th>
                    <th className="py-3 px-4">Kênh</th>
                    <th className="py-3 px-4">Khách Hàng</th>
                    <th className="py-3 px-4">Món Ăn</th>
                    <th className="py-3 px-4 text-right">Tổng Tiền</th>
                    <th className="py-3 px-4 text-right">Thực Nhận</th>
                    <th className="py-3 px-4 text-center">Trạng Thái</th>
                    <th className="py-3 px-4 text-right">Thời Gian</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recentOrders.map((order) => {
                    const brand = getChannelBrandColor(order.channel_code);
                    return (
                      <tr key={order.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                          {order.external_order_code}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className={`px-2 py-0.5 rounded-md text-xs font-extrabold border ${brand.bg}`}>
                            {order.channel_code}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-slate-800 font-semibold">
                          {order.customer_name}
                        </td>
                        <td className="py-3.5 px-4 text-xs text-slate-600">
                          {order.items.map((it, idx) => (
                            <div key={idx} className="flex items-center gap-1">
                              <span>• {it.quantity}x {it.externalItemName}</span>
                              {it.internalMenuItemName && (
                                <span className="text-orange-600 font-medium">({it.internalMenuItemName})</span>
                              )}
                            </div>
                          ))}
                        </td>
                        <td className="py-3.5 px-4 text-right font-bold text-slate-900">
                          {formatCurrency(order.total_amount)}
                        </td>
                        <td className="py-3.5 px-4 text-right font-bold text-emerald-700">
                          {formatCurrency(order.net_revenue)}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
                            {order.normalized_status}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right text-xs text-slate-500 font-medium">
                          {new Date(order.ordered_at).toLocaleTimeString('vi-VN')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Modal Mô Phỏng Nhận Đơn */}
      {simulateModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2">
                <Play className="w-5 h-5 text-emerald-600" />
                <h3 className="text-lg font-black text-slate-900">Mô Phỏng Nhận Đơn Từ Sàn</h3>
              </div>
              <button onClick={() => setSimulateModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">Chọn Nền Tảng</label>
                <select
                  value={simulateChannel}
                  onChange={(e) => setSimulateChannel(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                >
                  <option value="GRABFOOD">GrabFood</option>
                  <option value="SHOPEEFOOD">ShopeeFood</option>
                  <option value="BEFOOD">BeFood</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">Tên Khách Hàng</label>
                <input
                  type="text"
                  value={simulateCustomer}
                  onChange={(e) => setSimulateCustomer(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">Tổng Giá Trị Đơn (VND)</label>
                <input
                  type="number"
                  step="10000"
                  value={simulateAmount}
                  onChange={(e) => setSimulateAmount(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                />
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                💡 Hệ thống sẽ tự động tạo đơn, kiểm tra chữ ký số, tính chiết khấu sàn 20-22%, snapshot món ăn và ghi log kiểm toán.
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setSimulateModalOpen(false)}
                className="touch-target px-4 py-2 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                disabled={isSimulating}
                onClick={handleSimulateOrder}
                className="touch-target px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-sm font-bold shadow-md shadow-emerald-600/20 flex items-center gap-2"
              >
                {isSimulating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                <span>Gửi Đơn Mô Phỏng</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

