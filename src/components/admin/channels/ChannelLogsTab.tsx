'use client';

import React from 'react';
import { SyncLogItem } from './types';

interface ChannelLogsTabProps {
  logs: SyncLogItem[];
}

export default function ChannelLogsTab({ logs }: ChannelLogsTabProps) {
  return (
    <div className="glass-card rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
      {logs.length === 0 ? (
        <div className="p-12 text-center text-slate-500 text-sm">
          Chưa có nhật ký đồng bộ nào.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 text-xs uppercase font-extrabold">
                <th className="py-3 px-4">Thời Gian</th>
                <th className="py-3 px-4">Loại Đồng Bộ</th>
                <th className="py-3 px-4">Chiều</th>
                <th className="py-3 px-4">Trạng Thái</th>
                <th className="py-3 px-4">Chi Tiết / Lỗi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.map((l) => (
                <tr key={l.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3.5 px-4 text-xs font-mono text-slate-500">
                    {new Date(l.created_at).toLocaleString('vi-VN')}
                  </td>
                  <td className="py-3.5 px-4 font-bold text-xs text-slate-800">{l.sync_type}</td>
                  <td className="py-3.5 px-4">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-bold ${
                        l.direction === 'INBOUND' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'
                      }`}
                    >
                      {l.direction}
                    </span>
                  </td>
                  <td className="py-3.5 px-4">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                        l.status === 'SUCCESS' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                      }`}
                    >
                      {l.status}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-xs font-mono text-slate-600 max-w-md truncate">
                    {l.error_message || (l.request_data ? JSON.stringify(l.request_data) : 'Thành công')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
