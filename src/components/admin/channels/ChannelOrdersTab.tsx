'use client';

import React from 'react';
import { RefreshCw } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { ChannelOrder } from './types';

interface ChannelOrdersTabProps {
  orders: ChannelOrder[];
  statusFilter: string;
  onStatusFilterChange: (status: string) => void;
  onRefresh: () => void;
  onPushToKitchen: (orderId: string) => void;
  onUpdateOrderStatus: (orderId: string, status: string) => void;
}

export default function ChannelOrdersTab({
  orders,
  statusFilter,
  onStatusFilterChange,
  onRefresh,
  onPushToKitchen,
  onUpdateOrderStatus,
}: ChannelOrdersTabProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {['ALL', 'NEW', 'CONFIRMED', 'PREPARING', 'COMPLETED', 'CANCELLED'].map((st) => (
            <button
              key={st}
              onClick={() => onStatusFilterChange(st)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                statusFilter === st
                  ? 'bg-orange-600 text-white shadow-xs'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {st === 'ALL' ? 'Tất cả' : st}
            </button>
          ))}
        </div>

        <button
          onClick={onRefresh}
          className="touch-target px-3.5 py-1.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs shadow-xs flex items-center gap-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Làm mới</span>
        </button>
      </div>

      <div className="glass-card rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        {orders.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-sm">
            Chưa có đơn hàng nào ở trạng thái này.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 text-xs uppercase font-extrabold">
                  <th className="py-3 px-4">Mã Đơn</th>
                  <th className="py-3 px-4">Khách Hàng</th>
                  <th className="py-3 px-4">Địa Chỉ</th>
                  <th className="py-3 px-4">Món Ăn</th>
                  <th className="py-3 px-4 text-right">Tổng Tiền</th>
                  <th className="py-3 px-4 text-right">Thực Nhận</th>
                  <th className="py-3 px-4 text-center">Trạng Thái</th>
                  <th className="py-3 px-4 text-center">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orders.map((o) => (
                  <tr key={o.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                      {o.external_order_code}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-800">{o.customer_name}</div>
                      <div className="text-xs text-slate-400">{o.customer_phone}</div>
                      {o.driver_name && (
                        <div className="text-[11px] font-bold text-emerald-600 mt-0.5 flex items-center gap-1">
                          <span>🛵 {o.driver_name}</span>
                          {o.driver_phone && <span className="text-slate-400">({o.driver_phone})</span>}
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-600 max-w-xs truncate">
                      {o.delivery_address}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-700">
                      {o.items.map((it, idx) => (
                        <div key={idx} className="flex items-center gap-1">
                          <span>{it.quantity}x {it.externalItemName}</span>
                          {it.internalMenuItemName && (
                            <span className="text-orange-600 text-[11px]">({it.internalMenuItemName})</span>
                          )}
                        </div>
                      ))}
                    </td>
                    <td className="py-3.5 px-4 text-right font-bold text-slate-900">
                      {formatCurrency(o.total_amount)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-bold text-emerald-700">
                      {formatCurrency(o.net_revenue)}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
                          {o.normalized_status}
                        </span>
                        {o.internal_order_id ? (
                          <span className="text-[10px] font-extrabold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                            ✓ Đã gửi Bếp
                          </span>
                        ) : o.normalized_status !== 'CANCELLED' ? (
                          <span className="text-[10px] text-slate-400">Chưa vào Bếp</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5 flex-wrap">
                        {!o.internal_order_id && o.normalized_status !== 'CANCELLED' && o.normalized_status !== 'COMPLETED' && (
                          <button
                            type="button"
                            onClick={() => onPushToKitchen(o.id)}
                            className="px-2 py-1 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-slate-950 text-xs font-extrabold shadow-xs"
                            title="Đẩy đơn vào Queue Bếp ngay lập tức"
                          >
                            Gửi Bếp
                          </button>
                        )}
                        {o.normalized_status === 'NEW' && (
                          <button
                            onClick={() => onUpdateOrderStatus(o.id, 'CONFIRMED')}
                            className="px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
                          >
                            Xác nhận
                          </button>
                        )}
                        {o.normalized_status === 'CONFIRMED' && (
                          <button
                            onClick={() => onUpdateOrderStatus(o.id, 'PREPARING')}
                            className="px-2 py-1 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold"
                          >
                            Đang nấu
                          </button>
                        )}
                        {o.normalized_status === 'PREPARING' && (
                          <button
                            onClick={() => onUpdateOrderStatus(o.id, 'COMPLETED')}
                            className="px-2 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold"
                          >
                            Hoàn tất
                          </button>
                        )}
                        {o.normalized_status !== 'COMPLETED' && o.normalized_status !== 'CANCELLED' && (
                          <button
                            onClick={() => onUpdateOrderStatus(o.id, 'CANCELLED')}
                            className="px-2 py-1 rounded-lg bg-red-50 text-red-700 hover:bg-red-100 text-xs font-bold"
                          >
                            Hủy
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
