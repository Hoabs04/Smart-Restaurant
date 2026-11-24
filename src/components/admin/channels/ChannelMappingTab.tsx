'use client';

import React from 'react';
import { AlertTriangle, Plus, RefreshCw, Trash2, Zap } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { ChannelMapping } from './types';

interface ChannelMappingTabProps {
  channelName?: string;
  mappings: ChannelMapping[];
  isSyncingStock: boolean;
  onQuickStockSync: () => void;
  onOpenMenuSyncModal: () => void;
  onOpenAddMappingModal: () => void;
  onDeleteMapping: (mappingId: string) => void;
}

export default function ChannelMappingTab({
  channelName,
  mappings,
  isSyncingStock,
  onQuickStockSync,
  onOpenMenuSyncModal,
  onOpenAddMappingModal,
  onDeleteMapping,
}: ChannelMappingTabProps) {
  const diffCount = mappings.filter((m) => m.internal_price !== m.external_price).length;

  return (
    <div className="space-y-4">
      {diffCount > 0 && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-semibold flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
            <span>
              Phát hiện <strong>{diffCount}</strong> món ăn có giá nội bộ thay đổi so với giá đang bán trên {channelName}.
            </span>
          </div>
          <button
            type="button"
            onClick={onOpenMenuSyncModal}
            className="px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shrink-0 shadow-xs transition-all flex items-center gap-1.5"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Xem trước & Đồng bộ giá</span>
          </button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-xs text-slate-500 font-medium">
          Liên kết mã món trên GrabFood/ShopeeFood với món ăn trong thực đơn nội bộ
        </p>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={onQuickStockSync}
            disabled={isSyncingStock}
            className="touch-target px-3.5 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs shadow-xs flex items-center gap-1.5 transition-all"
            title="Cập nhật trạng thái Còn món / Hết món cho các món đã liên kết"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-blue-600 ${isSyncingStock ? 'animate-spin' : ''}`} />
            <span>{isSyncingStock ? 'Đang cập nhật...' : 'Đồng bộ tồn kho'}</span>
          </button>

          <button
            type="button"
            onClick={onOpenMenuSyncModal}
            className="touch-target px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-xs shadow-md shadow-emerald-600/20 flex items-center gap-1.5 transition-all"
            title="Xem trước và đồng bộ menu lên sàn (yêu cầu xác nhận)"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Đồng bộ Menu lên sàn</span>
          </button>

          <button
            type="button"
            onClick={onOpenAddMappingModal}
            className="touch-target px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs shadow-md shadow-orange-600/20 flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Thêm liên kết</span>
          </button>
        </div>
      </div>

      <div className="glass-card rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        {mappings.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-sm">
            Chưa có món nào được liên kết cho kênh này. Hãy nhấn &quot;Thêm liên kết&quot;.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 text-xs uppercase font-extrabold">
                  <th className="py-3 px-4">Món Nội Bộ</th>
                  <th className="py-3 px-4">Danh Mục</th>
                  <th className="py-3 px-4">Giá Nội Bộ</th>
                  <th className="py-3 px-4">Mã Món Sàn</th>
                  <th className="py-3 px-4">Tên Món Trên Sàn</th>
                  <th className="py-3 px-4 text-right">Giá Trên Sàn</th>
                  <th className="py-3 px-4 text-center">Trạng Thái Kho</th>
                  <th className="py-3 px-4 text-center">Tự Động Kho</th>
                  <th className="py-3 px-4 text-center">Lần Sync Cuối</th>
                  <th className="py-3 px-4 text-center">Xóa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {mappings.map((m) => {
                  const isPriceChanged = m.internal_price !== m.external_price;
                  const isOutOfStock = m.stock_quantity <= 0 || m.availability === false;
                  return (
                    <tr key={m.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 font-bold text-slate-900">{m.internal_name}</td>
                      <td className="py-3.5 px-4 text-xs text-slate-500">{m.category_name}</td>
                      <td className="py-3.5 px-4 text-slate-700 font-semibold">
                        {formatCurrency(m.internal_price)}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs font-bold text-orange-600">
                        {m.external_item_id}
                      </td>
                      <td className="py-3.5 px-4 text-slate-800 font-semibold">{m.external_item_name}</td>
                      <td className="py-3.5 px-4 text-right font-bold text-slate-900">
                        <span className={isPriceChanged ? 'text-amber-600 font-black' : ''}>
                          {formatCurrency(m.external_price)}
                        </span>
                        {isPriceChanged && (
                          <span className="block text-2xs text-amber-700 font-normal">
                            Lệch {formatCurrency(m.internal_price - m.external_price)}
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                            isOutOfStock
                              ? 'bg-red-50 text-red-700 border border-red-200'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}
                        >
                          {isOutOfStock ? 'HẾT MÓN' : `Còn (${m.stock_quantity})`}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                            m.sync_stock ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {m.sync_stock ? 'BẬT' : 'TẮT'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center text-xs text-slate-500 font-mono">
                        {m.last_synced_at ? new Date(m.last_synced_at).toLocaleTimeString('vi-VN') : 'Chưa sync'}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <button
                          onClick={() => onDeleteMapping(m.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
