'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Navbar from '@/components/Navbar';
import AdminNavTabs from '@/components/admin/AdminNavTabs';
import { 
  BookOpen, 
  Plus, 
  Edit2, 
  Check, 
  X, 
  AlertCircle, 
  RefreshCw, 
  Search,
  Package,
  Trash2,
  Image as ImageIcon,
  CheckCircle2,
  AlertTriangle,
  Eye,
  Filter
} from 'lucide-react';
import { formatCurrency, getStockStatusInfo } from '@/lib/utils';

// Danh sách các ảnh món ăn có sẵn trong hệ thống
const PRESET_DISH_IMAGES = [
  { name: 'Bò Wagyu', url: '/images/dishes/bo-wagyu.jpg' },
  { name: 'Cá hồi áp chảo', url: '/images/dishes/ca-hoi-ap-chao.jpg' },
  { name: 'Tôm hùm nướng', url: '/images/dishes/tom-hum-nuong.jpg' },
  { name: 'Cua tuyết', url: '/images/dishes/cua-tuyet.jpg' },
  { name: 'Súp bào ngư', url: '/images/dishes/sup-bao-ngu.jpg' },
  { name: 'Salad cá ngừ', url: '/images/dishes/salad-ca-ngu.jpg' },
  { name: 'Cơm chiên hải sản', url: '/images/dishes/com-chien-hai-san.jpg' },
  { name: 'Sườn cừu', url: '/images/dishes/suon-cuu.jpg' },
  { name: 'Panna Cotta', url: '/images/dishes/panna-cotta.jpg' },
  { name: 'Chè yến sào', url: '/images/dishes/che-yen-sao.jpg' },
  { name: 'Nước cam ép', url: '/images/dishes/nuoc-cam-ep.svg' },
  { name: 'Rượu vang Chateau', url: '/images/dishes/ruou-vang-chateau.jpg' },
];

export default function AdminMenuPage() {
  const [items, setItems] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Bộ lọc & Tìm kiếm
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  // Modal Thêm / Sửa
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    category_id: '',
    name: '',
    description: '',
    current_price: 120000,
    stock_quantity: 15,
    low_stock_threshold: 5,
    availability: true,
    image_key: '/images/dishes/bo-wagyu.jpg',
  });

  // Modal Xóa món
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<any | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchData = useCallback(async () => {
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
        if (data.categories?.length > 0) {
          setFormData(prev => prev.category_id ? prev : ({ ...prev, category_id: data.categories[0].id }));
        }
      }
    } catch {
      setErrorMessage('Không thể tải danh sách thực đơn quản trị.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();

    // Tự động mở modal nếu URL có tham số ?create=true
    if (typeof window !== 'undefined' && window.location.search.includes('create=true')) {
      openCreateModal();
    }
  }, [fetchData]);

  const openCreateModal = () => {
    setEditingItem(null);
    setFormData({
      category_id: categories[0]?.id || '',
      name: '',
      description: '',
      current_price: 120000,
      stock_quantity: 15,
      low_stock_threshold: 5,
      availability: true,
      image_key: '/images/dishes/bo-wagyu.jpg',
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
      image_key: item.image_key || '',
    });
    setModalOpen(true);
  };

  const openDeleteModal = (item: any) => {
    setItemToDelete(item);
    setDeleteModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');
    setIsSubmitting(true);

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

      setSuccessMessage(editingItem ? `Đã cập nhật món '${formData.name}' thành công!` : `Đã thêm món mới '${formData.name}' vào thực đơn!`);
      setModalOpen(false);
      await fetchData();
    } catch {
      setErrorMessage('Lỗi mạng khi lưu món ăn.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteItem = async () => {
    if (!itemToDelete) return;
    setIsDeleting(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const res = await fetch(`/api/admin/menu-items?id=${itemToDelete.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMessage(data.message || 'Lỗi khi xóa món ăn.');
        setDeleteModalOpen(false);
        return;
      }

      setSuccessMessage(data.message || `Đã xóa món '${itemToDelete.name}' khỏi thực đơn.`);
      setDeleteModalOpen(false);
      setItemToDelete(null);
      await fetchData();
    } catch {
      setErrorMessage('Lỗi mạng khi xóa món ăn.');
      setDeleteModalOpen(false);
    } finally {
      setIsDeleting(false);
    }
  };

  // Thống kê nhanh
  const stats = useMemo(() => {
    const total = items.length;
    const available = items.filter(i => i.availability && i.stock_quantity > 0).length;
    const lowStock = items.filter(i => i.stock_quantity > 0 && i.stock_quantity <= i.low_stock_threshold).length;
    const outOfStock = items.filter(i => i.stock_quantity === 0 || !i.availability).length;
    return { total, available, lowStock, outOfStock };
  }, [items]);

  // Lọc món ăn theo tìm kiếm và danh mục
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const matchCat = selectedCategory === 'ALL' || item.category_id === selectedCategory;
      const matchSearch = searchQuery.trim() === '' || 
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.description && item.description.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchCat && matchSearch;
    });
  }, [items, selectedCategory, searchQuery]);

  return (
    <div className="min-h-screen bg-slate-950 pb-20">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        
        {/* SUB-NAVBAR CHUYỂN NHANH CÁC PHÂN HỆ QUẢN TRỊ */}
        <AdminNavTabs onOpenCreateDish={openCreateModal} showCreateDishButton={true} />

        {/* TIÊU ĐỀ TRANG & NÚT THÊM MÓN */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-black text-slate-100 tracking-tight flex items-center gap-2">
              <BookOpen className="w-7 h-7 text-amber-500" />
              Quản trị Thực đơn & Thêm món mới
            </h1>
            <p className="text-slate-400 text-xs sm:text-sm mt-0.5">
              Thêm món ăn mới cho cửa hàng, cập nhật giá bán, số phần tồn kho (stock_quantity) và ngưỡng cảnh báo
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchData}
              disabled={isLoading}
              className="touch-target p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-slate-100 hover:bg-slate-800 transition-colors"
              title="Làm mới thực đơn"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={openCreateModal}
              className="touch-target px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-sm shadow-md shadow-amber-500/20 transition-all flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>+ Thêm món ăn mới</span>
            </button>
          </div>
        </div>

        {/* THẺ THỐNG KÊ NHANH (KPI METRICS) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="glass-panel p-4 rounded-xl border border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-[11px] text-slate-400 uppercase tracking-wider block font-semibold">Tổng số món</span>
              <span className="text-xl font-black text-slate-100">{stats.total}</span>
            </div>
            <div className="w-9 h-9 rounded-lg bg-slate-800 flex items-center justify-center text-amber-400">
              <BookOpen className="w-4 h-4" />
            </div>
          </div>

          <div className="glass-panel p-4 rounded-xl border border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-[11px] text-slate-400 uppercase tracking-wider block font-semibold">Đang phục vụ</span>
              <span className="text-xl font-black text-emerald-400">{stats.available}</span>
            </div>
            <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>

          <div className="glass-panel p-4 rounded-xl border border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-[11px] text-slate-400 uppercase tracking-wider block font-semibold">Sắp hết hàng</span>
              <span className="text-xl font-black text-amber-400">{stats.lowStock}</span>
            </div>
            <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>

          <div className="glass-panel p-4 rounded-xl border border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-[11px] text-slate-400 uppercase tracking-wider block font-semibold">Hết / Ngừng bán</span>
              <span className="text-xl font-black text-red-400">{stats.outOfStock}</span>
            </div>
            <div className="w-9 h-9 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400">
              <Package className="w-4 h-4" />
            </div>
          </div>
        </div>

        {/* THÔNG BÁO */}
        {successMessage && (
          <div className="mb-6 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm flex items-center gap-2 animate-in fade-in">
            <Check className="w-4 h-4 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {errorMessage && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-center gap-2 animate-in fade-in">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* THANH TÌM KIẾM VÀ TABS DANH MỤC */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          {/* Tabs danh mục */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
            <button
              onClick={() => setSelectedCategory('ALL')}
              className={`touch-target px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                selectedCategory === 'ALL'
                  ? 'bg-amber-500 text-slate-950 shadow-sm'
                  : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              Tất cả ({items.length})
            </button>
            {categories.map((c) => {
              const count = items.filter(i => i.category_id === c.id).length;
              const isSelected = selectedCategory === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => setSelectedCategory(c.id)}
                  className={`touch-target px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                    isSelected
                      ? 'bg-amber-500 text-slate-950 shadow-sm'
                      : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {c.name} ({count})
                </button>
              );
            })}
          </div>

          {/* Ô tìm kiếm món */}
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm tên món ăn..."
              className="w-full touch-target pl-9 pr-3.5 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 text-xs focus:outline-none focus:border-amber-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* BẢNG DANH SÁCH MÓN ĂN */}
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
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-500 text-xs">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <BookOpen className="w-8 h-8 text-slate-600" />
                        <span>Không tìm thấy món ăn nào phù hợp với bộ lọc.</span>
                        <button
                          onClick={openCreateModal}
                          className="mt-2 touch-target px-4 py-2 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs"
                        >
                          + Thêm món ăn mới ngay
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredItems.map(item => {
                    const stockBadge = getStockStatusInfo(item.stock_quantity, item.low_stock_threshold);

                    return (
                      <tr key={item.id} className="hover:bg-slate-900/40 transition-colors">
                        <td className="py-3.5 px-4 font-bold text-slate-100">
                          <div className="flex items-center gap-3">
                            {item.image_key ? (
                              <img
                                src={item.image_key}
                                alt={item.name}
                                className="w-11 h-11 rounded-xl object-cover shrink-0 border border-slate-700 shadow-sm"
                              />
                            ) : (
                              <div className="w-11 h-11 rounded-xl bg-slate-800 border border-slate-700/60 flex items-center justify-center shrink-0 text-slate-500">
                                <BookOpen className="w-5 h-5" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
                                <span>{item.name}</span>
                                {!item.availability && (
                                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-red-500/10 border border-red-500/20 text-red-400 font-semibold">
                                    Ngừng bán
                                  </span>
                                )}
                              </div>
                              {item.description && (
                                <div className="text-xs text-slate-500 font-normal truncate max-w-xs mt-0.5">
                                  {item.description}
                                </div>
                              )}
                            </div>
                          </div>
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
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openEditModal(item)}
                              className="touch-target p-2 rounded-xl text-slate-300 hover:text-amber-400 hover:bg-slate-800 transition-colors"
                              title="Sửa thông tin món"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => openDeleteModal(item)}
                              className="touch-target p-2 rounded-xl text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                              title="Xóa món khỏi thực đơn"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

      </main>

      {/* MODAL THÊM / SỬA MÓN ĂN */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="max-w-xl w-full glass-panel rounded-2xl p-6 border border-slate-700 shadow-2xl max-h-[90vh] overflow-y-auto space-y-4">
            
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <Plus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-100 text-base">
                    {editingItem ? 'Cập nhật món ăn' : 'Thêm món ăn mới vào thực đơn'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {editingItem ? 'Sửa đổi đơn giá, số phần tồn kho và hình ảnh' : 'Nhập thông tin món mới để phục vụ khách hàng'}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setModalOpen(false)} 
                className="text-slate-400 hover:text-slate-200 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              
              {/* Danh mục & Tên món */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-1">
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Danh mục món *
                  </label>
                  <select
                    value={formData.category_id}
                    onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                    required
                    className="w-full touch-target px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-amber-500"
                  >
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Tên món ăn *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Ví dụ: Bò Wagyu A5 sốt tiêu đen"
                    required
                    className="w-full touch-target px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Mô tả món ăn */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Mô tả món ăn (nguyên liệu, cách chế biến)
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={2}
                  placeholder="Mô tả tóm tắt nguyên liệu hảo hạng, gia vị và cách thưởng thức..."
                  className="w-full p-3 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Đơn giá, Tồn kho & Ngưỡng cảnh báo */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                    className="w-full touch-target px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-amber-500 font-mono"
                  />
                  <div className="text-[11px] text-amber-400 font-mono mt-1">
                    {formatCurrency(formData.current_price)}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Số phần tồn sẵn *
                  </label>
                  <input
                    type="number"
                    value={formData.stock_quantity}
                    onChange={(e) => setFormData({ ...formData, stock_quantity: parseInt(e.target.value, 10) || 0 })}
                    min={0}
                    required
                    className="w-full touch-target px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-amber-500 font-mono"
                  />
                  <div className="text-[11px] text-slate-400 mt-1">
                    Trừ dần khi gửi bếp
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Báo sắp hết (&lt;) *
                  </label>
                  <input
                    type="number"
                    value={formData.low_stock_threshold}
                    onChange={(e) => setFormData({ ...formData, low_stock_threshold: parseInt(e.target.value, 10) || 5 })}
                    min={1}
                    required
                    className="w-full touch-target px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-amber-500 font-mono"
                  />
                  <div className="text-[11px] text-slate-400 mt-1">
                    Mặc định 5 phần
                  </div>
                </div>
              </div>

              {/* CHỌN ẢNH MÓN ĂN (PRESET THUMBNAILS & CUSTOM URL) */}
              <div className="space-y-2 pt-1 border-t border-slate-800">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Hình ảnh món ăn (Chọn nhanh ảnh mẫu hoặc nhập URL)
                  </label>
                  <span className="text-[11px] text-slate-500">1 chạm chọn ảnh</span>
                </div>

                {/* Preset Thumbnails */}
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 p-2 rounded-xl bg-slate-900/60 border border-slate-800">
                  {PRESET_DISH_IMAGES.map((preset) => {
                    const isSelected = formData.image_key === preset.url;
                    return (
                      <button
                        key={preset.url}
                        type="button"
                        onClick={() => setFormData({ ...formData, image_key: preset.url })}
                        className={`group relative rounded-lg overflow-hidden border transition-all text-left aspect-square ${
                          isSelected 
                            ? 'border-amber-500 ring-2 ring-amber-500/50' 
                            : 'border-slate-700 hover:border-slate-500 opacity-70 hover:opacity-100'
                        }`}
                        title={preset.name}
                      >
                        <img 
                          src={preset.url} 
                          alt={preset.name} 
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform" 
                        />
                        <div className="absolute inset-x-0 bottom-0 bg-slate-950/80 px-1 py-0.5 text-[9px] text-slate-200 font-medium truncate text-center">
                          {preset.name}
                        </div>
                        {isSelected && (
                          <div className="absolute top-1 right-1 w-3.5 h-3.5 rounded-full bg-amber-500 flex items-center justify-center text-slate-950">
                            <Check className="w-2.5 h-2.5 stroke-[3]" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Nhập URL ảnh tùy chọn */}
                <div className="flex gap-2 items-center">
                  <input
                    type="text"
                    value={formData.image_key}
                    onChange={(e) => setFormData({ ...formData, image_key: e.target.value })}
                    placeholder="URL ảnh hoặc /images/dishes/ten-anh.jpg"
                    className="flex-1 touch-target px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 text-xs focus:outline-none focus:border-amber-500 font-mono"
                  />
                  {formData.image_key && (
                    <img
                      src={formData.image_key}
                      alt="Preview"
                      className="w-9 h-9 rounded-lg object-cover border border-slate-700 shrink-0"
                    />
                  )}
                </div>
              </div>

              {/* Trạng thái kinh doanh */}
              {editingItem && (
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="isAvailCheck"
                    checked={formData.availability}
                    onChange={(e) => setFormData({ ...formData, availability: e.target.checked })}
                    className="w-4 h-4 rounded text-amber-500 focus:ring-amber-500 bg-slate-900 border-slate-700"
                  />
                  <label htmlFor="isAvailCheck" className="text-xs text-slate-300 font-medium">
                    Món đang kinh doanh (hiển thị trên thực đơn của khách và phục vụ)
                  </label>
                </div>
              )}

              {/* Nút hành động Submit */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  disabled={isSubmitting}
                  className="touch-target px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-medium text-sm hover:bg-slate-700"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="touch-target px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-sm shadow-md flex items-center gap-2 disabled:opacity-50"
                >
                  {isSubmitting && <RefreshCw className="w-4 h-4 animate-spin" />}
                  <span>{editingItem ? 'Lưu cập nhật' : 'Thêm món ăn vào menu'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL XÁC NHẬN XÓA MÓN */}
      {deleteModalOpen && itemToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="max-w-md w-full glass-panel rounded-2xl p-6 border border-red-500/30 shadow-2xl space-y-4">
            
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-slate-100 text-base">
                  Xác nhận xóa món ăn?
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Món ăn sẽ bị gỡ bỏ khỏi thực đơn bán hàng.
                </p>
              </div>
              <button 
                onClick={() => setDeleteModalOpen(false)} 
                disabled={isDeleting}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Tên món:</span>
                <span className="font-bold text-slate-200">{itemToDelete.name}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Danh mục:</span>
                <span className="text-slate-300">{itemToDelete.category_name}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Đơn giá:</span>
                <span className="font-mono text-amber-400 font-bold">{formatCurrency(itemToDelete.current_price)}</span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300">
              <span className="font-bold">Lưu ý:</span> Nếu món đã có trong đơn hàng lịch sử, hệ thống sẽ tự động tắt trạng thái kinh doanh (ngừng bán) để bảo toàn dữ liệu doanh thu.
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteModalOpen(false)}
                disabled={isDeleting}
                className="touch-target px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-medium text-xs hover:bg-slate-700"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleDeleteItem}
                disabled={isDeleting}
                className="touch-target px-4 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold text-xs shadow-md flex items-center gap-1.5 disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Đang xóa...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Xác nhận xóa món</span>
                  </>
                )}
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
