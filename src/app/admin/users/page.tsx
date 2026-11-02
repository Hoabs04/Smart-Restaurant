'use client';

import React, { useState, useEffect } from 'react';
import Navbar from '@/components/Navbar';
import AdminNavTabs from '@/components/admin/AdminNavTabs';
import { 
  Users, 
  Plus, 
  Edit2, 
  Check, 
  AlertCircle, 
  RefreshCw,
  X,
  Shield,
  UtensilsCrossed,
  ChefHat,
  Trash2,
  UserX,
  AlertTriangle,
  Filter
} from 'lucide-react';
import { formatDateTime } from '@/lib/utils';

export default function AdminUsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Bộ lọc trạng thái làm việc
  const [filterTab, setFilterTab] = useState<'ALL' | 'ACTIVE' | 'RESIGNED'>('ALL');

  // Modal Tạo / Sửa
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    display_name: '',
    role_code: 'waiter',
    is_active: true,
  });

  // Modal Xóa / Thôi việc
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<any | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchCurrentUser = async () => {
    try {
      const res = await fetch('/api/auth/me');
      const data = await res.json();
      if (data.success && data.user) {
        setCurrentUser(data.user);
      }
    } catch {}
  };

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/admin/users');
      if (res.status === 403) {
        window.location.href = '/unauthorized';
        return;
      }
      const data = await res.json();
      if (data.success) {
        setUsers(data.users || []);
        setRoles(data.roles || []);
      }
    } catch {
      setErrorMessage('Không thể tải danh sách tài khoản.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCurrentUser();
    fetchUsers();
  }, []);

  const openCreateModal = () => {
    setEditingUser(null);
    setFormData({
      username: '',
      password: '',
      display_name: '',
      role_code: 'waiter',
      is_active: true,
    });
    setModalOpen(true);
  };

  const openEditModal = (u: any) => {
    setEditingUser(u);
    setFormData({
      username: u.username,
      password: '', // Không nạp mật khẩu cũ
      display_name: u.display_name,
      role_code: u.role_code,
      is_active: u.is_active,
    });
    setModalOpen(true);
  };

  const openDeleteModal = (u: any) => {
    setUserToDelete(u);
    setDeleteModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const url = '/api/admin/users';
      const method = editingUser ? 'PUT' : 'POST';
      const body = editingUser ? { id: editingUser.id, ...formData } : formData;

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMessage(data.message || 'Lỗi khi lưu tài khoản.');
        return;
      }

      setSuccessMessage(editingUser ? 'Đã cập nhật thông tin tài khoản!' : 'Đã tạo tài khoản người dùng mới!');
      setModalOpen(false);
      await fetchUsers();
    } catch {
      setErrorMessage('Lỗi mạng khi lưu tài khoản.');
    }
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    setIsDeleting(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const res = await fetch(`/api/admin/users?id=${userToDelete.id}`, {
        method: 'DELETE',
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMessage(data.message || 'Lỗi khi xóa tài khoản nhân viên.');
        setDeleteModalOpen(false);
        return;
      }

      setSuccessMessage(data.message || `Đã xử lý xóa tài khoản @${userToDelete.username} thành công.`);
      setDeleteModalOpen(false);
      setUserToDelete(null);
      await fetchUsers();
    } catch {
      setErrorMessage('Lỗi mạng khi kết nối đến máy chủ.');
      setDeleteModalOpen(false);
    } finally {
      setIsDeleting(false);
    }
  };

  const getRoleIcon = (roleCode: string) => {
    switch (roleCode) {
      case 'manager':
        return <Shield className="w-3.5 h-3.5 text-purple-400" />;
      case 'kitchen':
        return <ChefHat className="w-3.5 h-3.5 text-emerald-400" />;
      default:
        return <UtensilsCrossed className="w-3.5 h-3.5 text-amber-400" />;
    }
  };

  // Lọc danh sách theo tab
  const activeCount = users.filter(u => u.is_active).length;
  const resignedCount = users.filter(u => !u.is_active).length;

  const filteredUsers = users.filter(u => {
    if (filterTab === 'ACTIVE') return u.is_active;
    if (filterTab === 'RESIGNED') return !u.is_active;
    return true;
  });

  return (
    <div className="min-h-screen bg-slate-950 pb-20">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        
        {/* SUB-NAVBAR CHUYỂN NHANH CÁC PHÂN HỆ QUẢN TRỊ */}
        <AdminNavTabs />

        {/* TIÊU ĐỀ & NÚT THÊM */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-black text-slate-100 tracking-tight flex items-center gap-2">
              <Users className="w-7 h-7 text-amber-500" />
              Quản trị Tài khoản & Phân quyền (RBAC)
            </h1>
            <p className="text-slate-400 text-xs sm:text-sm mt-0.5">
              Quản lý danh sách nhân sự nhà hàng, gán vai trò quyền hạn và quản lý xóa tài khoản nhân viên thôi việc
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchUsers}
              disabled={isLoading}
              className="touch-target p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-slate-100 hover:bg-slate-800 transition-colors"
              title="Làm mới danh sách"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={openCreateModal}
              className="touch-target px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-sm shadow-md transition-all flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Tạo tài khoản mới</span>
            </button>
          </div>
        </div>

        {/* THÔNG BÁO THÀNH CÔNG / THẤT BẠI */}
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

        {/* BỘ LỌC TRẠNG THÁI (TẤT CẢ / ĐANG LÀM VIỆC / ĐÃ NGHỈ VIỆC) */}
        <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1">
          <button
            onClick={() => setFilterTab('ALL')}
            className={`touch-target px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              filterTab === 'ALL'
                ? 'bg-amber-500 text-slate-950 shadow-md'
                : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Tất cả nhân sự</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
              filterTab === 'ALL' ? 'bg-slate-950/20 text-slate-950' : 'bg-slate-800 text-slate-400'
            }`}>
              {users.length}
            </span>
          </button>

          <button
            onClick={() => setFilterTab('ACTIVE')}
            className={`touch-target px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              filterTab === 'ACTIVE'
                ? 'bg-emerald-500 text-slate-950 shadow-md'
                : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-emerald-400'
            }`}
          >
            <span>Đang làm việc</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
              filterTab === 'ACTIVE' ? 'bg-slate-950/20 text-slate-950' : 'bg-emerald-500/10 text-emerald-400'
            }`}>
              {activeCount}
            </span>
          </button>

          <button
            onClick={() => setFilterTab('RESIGNED')}
            className={`touch-target px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              filterTab === 'RESIGNED'
                ? 'bg-red-500 text-white shadow-md'
                : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-red-400'
            }`}
          >
            <span>Đã nghỉ việc / Khóa</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
              filterTab === 'RESIGNED' ? 'bg-white/20 text-white' : 'bg-red-500/10 text-red-400'
            }`}>
              {resignedCount}
            </span>
          </button>
        </div>

        {/* BẢNG DANH SÁCH NHÂN SỰ */}
        <div className="glass-panel rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-900/60 text-slate-400 text-xs uppercase tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Tên hiển thị</th>
                  <th className="py-3 px-4">Tên đăng nhập</th>
                  <th className="py-3 px-4">Vai trò (Role)</th>
                  <th className="py-3 px-4 text-center">Trạng thái</th>
                  <th className="py-3 px-4">Ngày tạo</th>
                  <th className="py-3 px-4 text-center">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500 text-xs">
                      Không tìm thấy nhân sự nào trong danh mục này.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map(u => {
                    const isSelf = currentUser && currentUser.id === u.id;
                    return (
                      <tr key={u.id} className={`hover:bg-slate-900/40 transition-colors ${!u.is_active ? 'opacity-70 bg-slate-950/40' : ''}`}>
                        <td className="py-3.5 px-4 font-bold text-slate-100">
                          <div className="flex items-center gap-2">
                            <span>{u.display_name}</span>
                            {isSelf && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-400 font-medium">
                                Bạn
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 font-mono text-slate-300 text-xs">
                          @{u.username}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-800 border border-slate-700 text-slate-200 inline-flex items-center gap-1.5">
                            {getRoleIcon(u.role_code)}
                            <span>{u.role_name}</span>
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold inline-flex items-center gap-1 ${
                            u.is_active 
                              ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400' 
                              : 'bg-red-500/10 border border-red-500/30 text-red-400'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${u.is_active ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
                            {u.is_active ? 'Đang làm việc' : 'Đã nghỉ việc'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-slate-400 text-xs whitespace-nowrap">
                          {formatDateTime(u.created_at)}
                        </td>
                        <td className="py-3.5 px-4 text-center whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openEditModal(u)}
                              className="touch-target p-2 rounded-xl text-slate-300 hover:text-amber-400 hover:bg-slate-800 transition-colors"
                              title="Sửa thông tin hoặc phân quyền"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>

                            {isSelf ? (
                              <button
                                type="button"
                                disabled
                                className="touch-target p-2 rounded-xl text-slate-600 cursor-not-allowed opacity-30"
                                title="Không thể tự xóa tài khoản của chính mình"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => openDeleteModal(u)}
                                className="touch-target p-2 rounded-xl text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                title="Xóa tài khoản nhân viên thôi việc"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
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

      {/* MODAL THÊM / SỬA USER */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="max-w-md w-full glass-panel rounded-2xl p-6 border border-slate-700 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <h3 className="font-bold text-slate-100 text-base flex items-center gap-2">
                <Users className="w-5 h-5 text-amber-500" />
                {editingUser ? 'Cập nhật tài khoản' : 'Tạo tài khoản mới'}
              </h3>
              <button onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Tên đăng nhập (username) *
                </label>
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  placeholder="Ví dụ: waiter2, chef_nam"
                  disabled={!!editingUser}
                  required
                  className="w-full touch-target px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-amber-500 disabled:opacity-50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Tên hiển thị *
                </label>
                <input
                  type="text"
                  value={formData.display_name}
                  onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                  placeholder="Ví dụ: Nguyễn Văn Nam"
                  required
                  className="w-full touch-target px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  {editingUser ? 'Mật khẩu mới (để trống nếu không đổi)' : 'Mật khẩu khởi tạo *'}
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="Nhập mật khẩu an toàn"
                  required={!editingUser}
                  className="w-full touch-target px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Vai trò (Role RBAC) *
                </label>
                <select
                  value={formData.role_code}
                  onChange={(e) => setFormData({ ...formData, role_code: e.target.value })}
                  className="w-full touch-target px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-amber-500"
                >
                  <option value="waiter">Nhân viên phục vụ (waiter)</option>
                  <option value="kitchen">Nhân viên bếp (kitchen)</option>
                  <option value="manager">Quản lý nhà hàng (manager)</option>
                </select>
              </div>

              {editingUser && (
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="isActiveCheck"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    className="w-4 h-4 rounded text-amber-500 focus:ring-amber-500 bg-slate-900 border-slate-700"
                  />
                  <label htmlFor="isActiveCheck" className="text-xs text-slate-300 font-medium">
                    Kích hoạt tài khoản này (Đang làm việc)
                  </label>
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
                  {editingUser ? 'Lưu cập nhật' : 'Tạo tài khoản'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL XÁC NHẬN XÓA TÀI KHOẢN NHÂN VIÊN */}
      {deleteModalOpen && userToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="max-w-md w-full glass-panel rounded-2xl p-6 border border-red-500/30 shadow-2xl space-y-4">
            
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-slate-100 text-base">
                  Xác nhận xóa tài khoản nhân viên?
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Bạn đang chuẩn bị xóa tài khoản nhân viên không còn làm việc tại nhà hàng.
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

            {/* Thông tin nhân viên */}
            <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Tên nhân viên:</span>
                <span className="font-bold text-slate-200">{userToDelete.display_name}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Tài khoản:</span>
                <span className="font-mono text-amber-400">@{userToDelete.username}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Vai trò:</span>
                <span className="text-slate-300 font-semibold">{userToDelete.role_name || userToDelete.role_code}</span>
              </div>
            </div>

            {/* Cảnh báo bảo vệ dữ liệu kinh doanh */}
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 space-y-1">
              <div className="flex items-center gap-1.5 font-bold">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>Quy tắc bảo toàn dữ liệu:</span>
              </div>
              <ul className="list-disc list-inside text-[11px] text-amber-400/90 space-y-0.5 pl-1">
                <li>Nếu nhân viên <strong>chưa từng tạo đơn/giao dịch</strong>: Tài khoản sẽ được xóa sạch khỏi cơ sở dữ liệu.</li>
                <li>Nếu nhân viên <strong>đã có lịch sử đơn hàng/chế biến</strong>: Tài khoản sẽ bị khóa vĩnh viễn và đánh dấu &quot;Đã nghỉ việc&quot; để bảo vệ dữ liệu kế toán và kiểm toán.</li>
              </ul>
            </div>

            {/* Nút hành động */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteModalOpen(false)}
                disabled={isDeleting}
                className="touch-target px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-medium text-xs hover:bg-slate-700 transition-colors"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleDeleteUser}
                disabled={isDeleting}
                className="touch-target px-4 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold text-xs shadow-md transition-all flex items-center gap-1.5 disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Đang xử lý...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Xác nhận xóa tài khoản</span>
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
