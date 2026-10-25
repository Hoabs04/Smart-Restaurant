'use client';

import React, { useState, useEffect } from 'react';
import Navbar from '@/components/Navbar';
import { 
  Grid, 
  Plus, 
  Edit2, 
  Check, 
  AlertCircle, 
  RefreshCw,
  X,
  Users
} from 'lucide-react';

export default function AdminTablesPage() {
  const [tables, setTables] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTable, setEditingTable] = useState<any | null>(null);
  const [formData, setFormData] = useState({
    area_name: 'Khu Trong Nhà',
    table_code: '',
    capacity: 4,
    status: 'AVAILABLE',
    is_active: true,
  });

  const fetchTables = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/admin/tables');
      if (res.status === 403) {
        window.location.href = '/unauthorized';
        return;
      }
      const data = await res.json();
      if (data.success) {
        setTables(data.tables || []);
      }
    } catch {
      setErrorMessage('Không thể tải danh sách bàn quản trị.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTables();
  }, []);

  const openCreateModal = () => {
    setEditingTable(null);
    setFormData({
      area_name: 'Khu Trong Nhà',
      table_code: `Bàn ${String(tables.length + 1).padStart(2, '0')}`,
      capacity: 4,
      status: 'AVAILABLE',
      is_active: true,
    });
    setModalOpen(true);
  };

  const openEditModal = (t: any) => {
    setEditingTable(t);
    setFormData({
      area_name: t.area_name,
      table_code: t.table_code,
      capacity: t.capacity,
      status: t.status,
      is_active: t.is_active,
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const url = '/api/admin/tables';
      const method = editingTable ? 'PUT' : 'POST';
      const body = editingTable ? { id: editingTable.id, ...formData } : formData;

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMessage(data.message || 'Lỗi khi lưu bàn ăn.');
        return;
      }

      setSuccessMessage(editingTable ? 'Đã cập nhật bàn ăn thành công!' : 'Đã thêm bàn mới thành công!');
      setModalOpen(false);
      await fetchTables();
    } catch {
      setErrorMessage('Lỗi mạng khi lưu bàn ăn.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 pb-20">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-black text-slate-100 tracking-tight flex items-center gap-2">
              <Grid className="w-7 h-7 text-amber-500" />
              Quản trị Khu vực & Bàn ăn
            </h1>
            <p className="text-slate-400 text-xs sm:text-sm mt-0.5">
              Cấu hình vị trí khu vực, mã số bàn ăn và số lượng chỗ ngồi phục vụ
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={openCreateModal}
              className="touch-target px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-sm shadow-md transition-all flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Thêm bàn mới</span>
            </button>
          </div>
        </div>

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

        <div className="glass-panel rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-900/60 text-slate-400 text-xs uppercase tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Mã bàn</th>
                  <th className="py-3 px-4">Khu vực</th>
                  <th className="py-3 px-4 text-center">Sức chứa</th>
                  <th className="py-3 px-4">Trạng thái hiện tại</th>
                  <th className="py-3 px-4 text-center">Version</th>
                  <th className="py-3 px-4 text-center">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {tables.map(table => (
                  <tr key={table.id} className="hover:bg-slate-900/40">
                    <td className="py-3.5 px-4 font-bold text-slate-100">
                      {table.table_code}
                    </td>
                    <td className="py-3.5 px-4 text-slate-300">
                      {table.area_name}
                    </td>
                    <td className="py-3.5 px-4 text-center font-bold text-slate-200">
                      {table.capacity} khách
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${
                        table.status === 'AVAILABLE' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
                        table.status === 'OCCUPIED' ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' :
                        'bg-purple-500/10 text-purple-400 border-purple-500/30'
                      }`}>
                        {table.status === 'AVAILABLE' ? 'Trống' : table.status === 'OCCUPIED' ? 'Đang phục vụ' : 'Chờ thanh toán'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-center font-mono text-xs text-slate-500">
                      v{table.version}
                    </td>
                    <td className="py-3.5 px-4 text-center whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => openEditModal(table)}
                        className="touch-target p-2 rounded-xl text-slate-300 hover:text-amber-400 hover:bg-slate-800 transition-colors"
                        title="Sửa bàn"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </main>

      {/* MODAL THÊM / SỬA BÀN */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="max-w-md w-full glass-panel rounded-2xl p-6 border border-slate-700 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <h3 className="font-bold text-slate-100 text-base flex items-center gap-2">
                <Grid className="w-5 h-5 text-amber-500" />
                {editingTable ? 'Cập nhật bàn ăn' : 'Thêm bàn ăn mới'}
              </h3>
              <button onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Khu vực nhà hàng *
                </label>
                <input
                  type="text"
                  value={formData.area_name}
                  onChange={(e) => setFormData({ ...formData, area_name: e.target.value })}
                  placeholder="Ví dụ: Khu Trong Nhà, Khu Sân Vườn, Phòng VIP"
                  required
                  className="w-full touch-target px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Mã số bàn *
                </label>
                <input
                  type="text"
                  value={formData.table_code}
                  onChange={(e) => setFormData({ ...formData, table_code: e.target.value })}
                  placeholder="Ví dụ: Bàn 01, VIP-01"
                  required
                  className="w-full touch-target px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Sức chứa (số chỗ ngồi) *
                </label>
                <input
                  type="number"
                  value={formData.capacity}
                  onChange={(e) => setFormData({ ...formData, capacity: parseInt(e.target.value, 10) || 4 })}
                  min={1}
                  required
                  className="w-full touch-target px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-amber-500"
                />
              </div>

              {editingTable && (
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Trạng thái bàn
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full touch-target px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-amber-500"
                  >
                    <option value="AVAILABLE">Trống (AVAILABLE)</option>
                    <option value="OCCUPIED">Đang phục vụ (OCCUPIED)</option>
                    <option value="AWAITING_PAYMENT">Chờ thanh toán (AWAITING_PAYMENT)</option>
                  </select>
                </div>
              )}

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
                  {editingTable ? 'Lưu thay đổi' : 'Thêm bàn mới'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
