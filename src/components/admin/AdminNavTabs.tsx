'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  BookOpen, 
  Grid, 
  Users, 
  FileText,
  Plus,
  Store
} from 'lucide-react';

interface AdminNavTabsProps {
  onOpenCreateDish?: () => void;
  showCreateDishButton?: boolean;
}

export default function AdminNavTabs({ onOpenCreateDish, showCreateDishButton = true }: AdminNavTabsProps) {
  const pathname = usePathname();

  const tabs = [
    { href: '/admin/channels', label: 'Kênh bán hàng', icon: Store, desc: 'GrabFood & ShopeeFood' },
    { href: '/admin/menu', label: 'Thực đơn & Thêm món', icon: BookOpen, desc: 'Món ăn & tồn kho' },
    { href: '/admin/tables', label: 'Quản lý Bàn', icon: Grid, desc: 'Khu vực & bàn ăn' },
    { href: '/admin/users', label: 'Tài khoản Nhân viên', icon: Users, desc: 'Phân quyền RBAC' },
    { href: '/admin/audit-log', label: 'Lịch sử Kiểm toán', icon: FileText, desc: 'Nhật ký thao tác' },
  ];

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 pb-4 border-b border-slate-800">
      {/* Danh sách các Tab Phân hệ Quản trị */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = pathname === tab.href;

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`touch-target px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 whitespace-nowrap shrink-0 ${
                isActive
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20 font-extrabold'
                  : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </div>

      {/* Nút hành động nhanh Thêm món mới */}
      {showCreateDishButton && (
        <div className="flex items-center gap-2 shrink-0">
          {onOpenCreateDish ? (
            <button
              type="button"
              onClick={onOpenCreateDish}
              className="touch-target px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-slate-950 font-bold text-xs sm:text-sm shadow-md shadow-amber-500/20 transition-all flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>+ Thêm món ăn mới</span>
            </button>
          ) : (
            <Link
              href="/admin/menu?create=true"
              className="touch-target px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-slate-950 font-bold text-xs sm:text-sm shadow-md shadow-amber-500/20 transition-all flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>+ Thêm món ăn mới</span>
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
