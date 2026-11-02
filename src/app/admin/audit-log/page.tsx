'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Navbar from '@/components/Navbar';
import AdminNavTabs from '@/components/admin/AdminNavTabs';
import { 
  FileText, 
  RefreshCw, 
  Filter, 
  Shield, 
  Clock, 
  User, 
  Activity,
  Code
} from 'lucide-react';
import { formatDateTime } from '@/lib/utils';

export default function AdminAuditLogPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [selectedAction, setSelectedAction] = useState<string>('ALL');
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [viewDetailLog, setViewDetailLog] = useState<any | null>(null);

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    try {
      const url = selectedAction !== 'ALL'
        ? `/api/admin/audit-log?action=${selectedAction}`
        : '/api/admin/audit-log';

      const res = await fetch(url);
      if (res.status === 403) {
        window.location.href = '/unauthorized';
        return;
      }
      const data = await res.json();
      if (data.success) {
        setLogs(data.logs || []);
      }
    } catch {
      setErrorMessage('Không thể tải nhật ký thao tác.');
    } finally {
      setIsLoading(false);
    }
  }, [selectedAction]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'LOGIN':
      case 'LOGOUT':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
      case 'CREATE_ORDER':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      case 'SEND_TO_KITCHEN':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      case 'CANCEL_ITEM':
      case 'CANCEL_ORDER':
      case 'DELETE_USER':
        return 'bg-red-500/10 text-red-400 border-red-500/30';
      case 'UPDATE_ITEM_STATUS':
        return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30';
      case 'CLOSE_ORDER':
        return 'bg-purple-500/10 text-purple-400 border-purple-500/30';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 pb-20">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        
        {/* SUB-NAVBAR CHUYỂN NHANH CÁC PHÂN HỆ QUẢN TRỊ */}
        <AdminNavTabs />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-black text-slate-100 tracking-tight flex items-center gap-2">
              <FileText className="w-7 h-7 text-amber-500" />
              Nhật ký Thao tác & Kiểm toán (Audit Log)
            </h1>
            <p className="text-slate-400 text-xs sm:text-sm mt-0.5">
              Theo dõi toàn bộ biến động nghiệp vụ quan trọng: Đăng nhập, Tạo đơn, Gửi bếp, Hủy món, Chốt đơn
            </p>
          </div>

          <div className="flex items-center gap-3">
            <select
              value={selectedAction}
              onChange={(e) => setSelectedAction(e.target.value)}
              className="touch-target px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 text-xs sm:text-sm focus:outline-none focus:border-amber-500 font-medium"
            >
              <option value="ALL">Tất cả hành động</option>
              <option value="LOGIN">Đăng nhập (LOGIN)</option>
              <option value="LOGOUT">Đăng xuất (LOGOUT)</option>
              <option value="CREATE_ORDER">Tạo đơn (CREATE_ORDER)</option>
              <option value="SEND_TO_KITCHEN">Gửi bếp (SEND_TO_KITCHEN)</option>
              <option value="CANCEL_ITEM">Hủy món (CANCEL_ITEM)</option>
              <option value="UPDATE_ITEM_STATUS">Cập nhật món (UPDATE_ITEM_STATUS)</option>
              <option value="CLOSE_ORDER">Chốt đơn (CLOSE_ORDER)</option>
              <option value="CREATE_MENU_ITEM">Thêm món menu</option>
              <option value="UPDATE_MENU_ITEM">Sửa món menu</option>
              <option value="CREATE_TABLE">Thêm bàn</option>
              <option value="UPDATE_TABLE">Sửa bàn</option>
              <option value="CREATE_USER">Tạo tài khoản</option>
              <option value="UPDATE_USER">Sửa tài khoản</option>
              <option value="DELETE_USER">Xóa tài khoản (DELETE_USER)</option>
            </select>

            <button
              onClick={fetchLogs}
              disabled={isLoading}
              className="touch-target px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium border border-slate-700 transition-colors flex items-center gap-2 shrink-0"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Làm mới</span>
            </button>
          </div>
        </div>

        {errorMessage && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            {errorMessage}
          </div>
        )}

        <div className="glass-panel rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-900/60 text-slate-400 text-xs uppercase tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Thời gian</th>
                  <th className="py-3 px-4">Người thực hiện</th>
                  <th className="py-3 px-4">Hành động</th>
                  <th className="py-3 px-4">Đối tượng</th>
                  <th className="py-3 px-4">IP</th>
                  <th className="py-3 px-4 text-center">Chi tiết</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-500 text-sm">
                      Không có bản ghi nhật ký nào.
                    </td>
                  </tr>
                ) : (
                  logs.map(log => (
                    <tr key={log.id} className="hover:bg-slate-900/40">
                      <td className="py-3.5 px-4 font-mono text-xs text-slate-400 whitespace-nowrap">
                        {formatDateTime(log.createdAt)}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-200 text-xs">
                          {log.actorDisplayName}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          @{log.actorUsername} ({log.actorRole})
                        </div>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold border font-mono ${getActionBadge(log.action)}`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-300">
                        <span className="font-mono text-slate-400">{log.entityType}</span>
                        {log.entityId && (
                          <div className="text-[10px] text-slate-500 font-mono truncate max-w-xs">
                            ID: {log.entityId}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs text-slate-500 whitespace-nowrap">
                        {log.ipAddress || '127.0.0.1'}
                      </td>
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        {log.details ? (
                          <button
                            type="button"
                            onClick={() => setViewDetailLog(log)}
                            className="touch-target px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-400 text-xs font-mono font-semibold transition-colors"
                          >
                            Xem JSON
                          </button>
                        ) : (
                          <span className="text-slate-600 text-xs">--</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </main>

      {/* MODAL XEM CHI TIẾT AUDIT LOG JSON */}
      {viewDetailLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="max-w-xl w-full glass-panel rounded-2xl p-6 border border-slate-700 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <h3 className="font-bold text-slate-100 text-base flex items-center gap-2">
                <Code className="w-5 h-5 text-amber-500" />
                Chi tiết Audit Log: {viewDetailLog.action}
              </h3>
              <button onClick={() => setViewDetailLog(null)} className="text-slate-400 hover:text-slate-200">
                ✕
              </button>
            </div>

            <div className="mb-4 text-xs text-slate-400 space-y-1">
              <div>Thực hiện bởi: <strong className="text-slate-200">{viewDetailLog.actorDisplayName}</strong> (@{viewDetailLog.actorUsername})</div>
              <div>Thời gian: {formatDateTime(viewDetailLog.createdAt)}</div>
              <div>Đối tượng: {viewDetailLog.entityType} ({viewDetailLog.entityId || 'N/A'})</div>
            </div>

            <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-emerald-400 font-mono text-xs overflow-x-auto max-h-80">
              {JSON.stringify(viewDetailLog.details, null, 2)}
            </pre>

            <div className="flex justify-end mt-5">
              <button
                type="button"
                onClick={() => setViewDetailLog(null)}
                className="touch-target px-5 py-2 rounded-xl bg-slate-800 text-slate-200 font-semibold text-sm hover:bg-slate-700"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
