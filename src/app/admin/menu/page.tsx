'use client';

import React, { useState, useEffect } from 'react';
import Navbar from '@/components/Navbar';
import { 
  BookOpen, 
  Plus, 
  Edit2, 
  Check, 
  X, 
  AlertCircle, 
  RefreshCw,
  Search,
  Package
} from 'lucide-react';
import { formatCurrency, getStockStatusInfo } from '@/lib/utils';

export default function AdminMenuPage() {
  const [items, setItems] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Modal Thêm / Sửa
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [formData, setFormData] = useState({
    category_id: '',
    name: '',
    description: '',
    current_price: 0,
    stock_quantity: 10,
    low_stock_threshold: 5,
    availability: true,
  });

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/admin/menu-items');
      if (res.status === 403) {
        window.location.href = '/unauthorized';
        return;
      }
      const data = await res.json();
      if (data.success) {
        setItems(data.items || []);
        setCategories(data.categories || []);
        if (data.categories?.length > 0 && !formData.category_id) {
          setFormData(prev => ({ ...prev, category_id: data.categories[0].id }));
        }
      }
    } catch {
      setErrorMessage('Không thể tải danh sách thực đơn quản trị.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const openCreateModal = () => {
    setEditingItem(null);
    setFormData({
      category_id: categories[0]?.id || '',
      name: '',
      description: '',
      current_price: 100000,
      stock_quantity: 15,
      low_stock_threshold: 5,
      availability: true,
    });
    setModalOpen(true);
  };

  const openEditModal = (item: any) => {
    setEditingItem(item);
    setFormData({
      category_id: item.category_id,
      name: item.name,
      description: item.description || '',
      current_price: item.current_price,
      stock_quantity: item.stock_quantity,
      low_stock_threshold: item.low_stock_threshold,
      availability: item.availability,
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const url = '/api/admin/menu-items';
      const method = editingItem ? 'PUT' : 'POST';
      const body = editingItem ? { id: editingItem.id, ...formData } : formData;

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMessage(data.message || 'Lỗi khi lưu món ăn.');
        return;
      }

      setSuccessMessage(editingItem ? 'Đã cập nhật món ăn thành công!' : 'Đã thêm món mới vào thực đơn!');
      setModalOpen(false);
      await fetchData();
    } catch {
      setErrorMessage('Lỗi mạng khi lưu món ăn.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 pb-20">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        
        {/* Header Quản trị Thực đơn */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-black text-slate-100 tracking-tight flex items-center gap-2">
              <BookOpen className="w-7 h-7 text-amber-500" />
              Quản trị Thực đơn & Tồn kho
            </h1>
            <p className="text-slate-400 text-xs sm:text-sm mt-0.5">
              Cập nhật giá, kiểm soát số phần khả dụng (stock_quantity) và ngưỡng cảnh báo sắp hết (low_stock_threshold)
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={openCreateModal}
              className="touch-target px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-sm shadow-md transition-all flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Thêm món mới</span>
            </button>
          </div>
        </div>

        {/* Thông báo Thành công hoặc Lỗi */}
        {successMessage && (
          <div className="mb-6 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm flex items-center gap-2">
            <Check className="w-4 h-4" />
            <span>{successMessage}</span>
          </div>
        )}

        {errorMessage && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Bảng danh sách món ăn */}
        <div className="glass-panel rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-900/60 text-slate-400 text-xs uppercase tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Tên món ăn</th>
                  <th className="py-3 px-4">Danh mục</th>
                  <th className="py-3 px-4 text-right">Đơn giá</th>
                  <th className="py-3 px-4 text-center">Tồn khả dụng</th>
                  <th className="py-3 px-4 text-center">Ngưỡng cảnh báo</th>
                  <th className="py-3 px-4">Trạng thái kho</th>
                  <th className="py-3 px-4 text-center">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {items.map(item => {
                  const stockBadge = getStockStatusInfo(item.stock_quantity, item.low_stock_threshold);

                  return (
                    <tr key={item.id} className="hover:bg-slate-900/40">
                      <td className="py-3.5 px-4 font-bold text-slate-100">
                        {item.name}
                        {item.description && (
                          <div className="text-xs text-slate-500 font-normal truncate max-w-xs">
                            {item.description}
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-slate-300 text-xs">
                        {item.category_name}
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono font-bold text-amber-400 text-xs">
                        {formatCurrency(item.current_price)}
                      </td>

                      <td className="py-3.5 px-4 text-center font-bold text-slate-100">
                        {item.stock_quantity}
                      </td>

                      <td className="py-3.5 px-4 text-center text-slate-400 text-xs">
                        &lt; {item.low_stock_threshold} phần
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${stockBadge.badgeClass}`}>
                          {stockBadge.label}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => openEditModal(item)}
                          className="touch-target p-2 rounded-xl text-slate-300 hover:text-amber-400 hover:bg-slate-800 transition-colors"
                          title="Sửa món"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

      </main>

      {/* MODAL THÊM / SỬA MÓN ĂN */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="max-w-lg w-full glass-panel rounded-2xl p-6 border border-slate-700 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <h3 className="font-bold text-slate-100 text-base flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-amber-500" />
                {editingItem ? 'Cập nhật món ăn' : 'Thêm món ăn mới'}
              </h3>
              <button onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Danh mục món *
                </label>
                <select
                  value={formData.category_id}
                  onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                  required
                  className="w-full touch-target px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-amber-500"
                >
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Tên món ăn *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ví dụ: Bò Wagyu nướng đá muối"
                  required
                  className="w-full touch-target px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Mô tả món ăn
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={2}
                  placeholder="Mô tả nguyên liệu, cách chế biến..."
                  className="w-full p-3 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Đơn giá (VND) *
                  </label>
                  <input
                    type="number"
                    value={formData.current_price}
                    onChange={(e) => setFormData({ ...formData, current_price: parseInt(e.target.value, 10) || 0 })}
                    min={0}
                    step={1000}
                    required
                    className="w-full touch-target px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Tồn khả dụng (phần) *
                  </label>
                  <input
                    type="number"
                    value={formData.stock_quantity}
                    onChange={(e) => setFormData({ ...formData, stock_quantity: parseInt(e.target.value, 10) || 0 })}
                    min={0}
                    required
                    className="w-full touch-target px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Ngưỡng cảnh báo sắp hết (mặc định 5 phần)
                </label>
                <input
                  type="number"
                  value={formData.low_stock_threshold}
                  onChange={(e) => setFormData({ ...formData, low_stock_threshold: parseInt(e.target.value, 10) || 5 })}
                  min={1}
                  required
                  className="w-full touch-target px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-amber-500 font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="touch-target px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-medium text-sm hover:bg-slate-700"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="touch-target px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-sm shadow-md"
                >
                  {editingItem ? 'Lưu thay đổi' : 'Thêm món mới'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
