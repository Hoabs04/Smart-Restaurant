'use client';

import React from 'react';
import { AlertTriangle, Check, RefreshCw, X, Zap } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { InternalMenuItem, MenuDiffItem } from './types';

interface ChannelSyncModalsProps {
  channelName?: string;
  // Add mapping modal
  mappingModalOpen: boolean;
  onCloseMappingModal: () => void;
  internalItems: InternalMenuItem[];
  selectedInternalId: string;
  onSelectInternalId: (id: string) => void;
  externalItemId: string;
  onChangeExternalItemId: (val: string) => void;
  externalItemName: string;
  onChangeExternalItemName: (val: string) => void;
  externalPrice: number;
  onChangeExternalPrice: (val: number) => void;
  onCreateMapping: (e: React.FormEvent) => void;
  // Sync menu modal
  syncMenuModalOpen: boolean;
  onCloseSyncMenuModal: () => void;
  menuDiffs: MenuDiffItem[];
  confirmMenuSyncCheckbox: boolean;
  onChangeConfirmCheckbox: (checked: boolean) => void;
  isSyncingMenu: boolean;
  onConfirmMenuSync: () => void;
}

export default function ChannelSyncModals({
  channelName,
  mappingModalOpen,
  onCloseMappingModal,
  internalItems,
  selectedInternalId,
  onSelectInternalId,
  externalItemId,
  onChangeExternalItemId,
  externalItemName,
  onChangeExternalItemName,
  externalPrice,
  onChangeExternalPrice,
  onCreateMapping,
  syncMenuModalOpen,
  onCloseSyncMenuModal,
  menuDiffs,
  confirmMenuSyncCheckbox,
  onChangeConfirmCheckbox,
  isSyncingMenu,
  onConfirmMenuSync,
}: ChannelSyncModalsProps) {
  return (
    <>
      {mappingModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
              <h3 className="text-lg font-black text-slate-900">Liên Kết Món Ăn</h3>
              <button onClick={onCloseMappingModal}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <form onSubmit={onCreateMapping} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Chọn Món Nội Bộ *
                </label>
                <select
                  required
                  value={selectedInternalId}
                  onChange={(e) => {
                    const id = e.target.value;
                    onSelectInternalId(id);
                    const item = internalItems.find((i) => i.id === id);
                    if (item) {
                      onChangeExternalItemName(item.name);
                      onChangeExternalPrice(item.current_price);
                    }
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                >
                  <option value="">-- Chọn món trong thực đơn --</option>
                  {internalItems.map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.name} ({formatCurrency(it.current_price)}) - {it.category_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Mã Món Trên Sàn (External Item ID) *
                </label>
                <input
                  type="text"
                  required
                  value={externalItemId}
                  onChange={(e) => onChangeExternalItemId(e.target.value)}
                  placeholder="VD: GF-ITEM-101"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Tên Món Hiển Thị Trên Sàn *
                </label>
                <input
                  type="text"
                  required
                  value={externalItemName}
                  onChange={(e) => onChangeExternalItemName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Giá Bán Trên Sàn (VND) *
                </label>
                <input
                  type="number"
                  required
                  step="1000"
                  value={externalPrice}
                  onChange={(e) => onChangeExternalPrice(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                />
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={onCloseMappingModal}
                  className="touch-target px-4 py-2 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="touch-target px-5 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-sm font-bold shadow-md shadow-orange-600/20"
                >
                  Lưu Liên Kết
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {syncMenuModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                  <Zap className="w-5 h-5 text-emerald-600" />
                  Đồng Bộ Menu & Bảng Giá Lên {channelName}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Kiểm tra chênh lệch giá trước khi cập nhật chính thức lên sàn đối tác
                </p>
              </div>
              <button onClick={onCloseSyncMenuModal} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-medium mb-4 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong>Cảnh báo an toàn:</strong> Giá bán trên sàn sẽ được cập nhật trực tiếp theo giá thực đơn nội bộ. Vui lòng rà soát danh sách món ăn dưới đây trước khi bấm xác nhận.
              </div>
            </div>

            <div className="flex-1 overflow-y-auto mb-4 border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-extrabold uppercase sticky top-0 border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3">Món Ăn</th>
                    <th className="py-2.5 px-3 text-right">Giá Cũ Trên Sàn</th>
                    <th className="py-2.5 px-3 text-right">Giá Mới Nội Bộ</th>
                    <th className="py-2.5 px-3 text-right">Chênh Lệch</th>
                    <th className="py-2.5 px-3 text-center">Tồn Kho</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {menuDiffs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400">
                        Chưa có món nào được cấu hình quy đổi.
                      </td>
                    </tr>
                  ) : (
                    menuDiffs.map((d) => (
                      <tr key={d.mappingId} className="hover:bg-slate-50/50">
                        <td className="py-2.5 px-3 font-bold text-slate-900">
                          {d.internalItemName}
                          <span className="block text-2xs font-mono font-normal text-slate-400">{d.externalItemId}</span>
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-600 font-medium">
                          {formatCurrency(d.externalPrice)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                          {formatCurrency(d.internalPrice)}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          {d.priceDiff !== 0 ? (
                            <span className={`font-bold ${d.priceDiff > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                              {d.priceDiff > 0 ? `+${formatCurrency(d.priceDiff)}` : formatCurrency(d.priceDiff)}
                            </span>
                          ) : (
                            <span className="text-slate-400">Không đổi</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-2xs font-bold ${
                              d.isOutOfStock ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'
                            }`}
                          >
                            {d.isOutOfStock ? 'Hết món' : `Còn (${d.internalStock})`}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 mb-4">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={confirmMenuSyncCheckbox}
                  onChange={(e) => onChangeConfirmCheckbox(e.target.checked)}
                  className="w-4 h-4 mt-0.5 rounded text-orange-600 focus:ring-orange-500 shrink-0"
                />
                <span className="text-xs font-bold text-slate-800">
                  Tôi đã kiểm tra kỹ bảng giá và xác nhận cập nhật bảng giá cùng danh mục trên sang sàn {channelName}.
                </span>
              </label>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={onCloseSyncMenuModal}
                className="touch-target px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={onConfirmMenuSync}
                disabled={!confirmMenuSyncCheckbox || isSyncingMenu}
                className={`touch-target px-5 py-2 rounded-xl font-bold text-xs shadow-md flex items-center gap-1.5 transition-all ${
                  confirmMenuSyncCheckbox && !isSyncingMenu
                    ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-emerald-600/20 active:scale-95'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}
              >
                {isSyncingMenu ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Đang đồng bộ...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Xác nhận & Đồng bộ</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
