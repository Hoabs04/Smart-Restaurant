'use client';

import React from 'react';
import Link from 'next/link';
import { ShieldAlert, ArrowLeft, Home } from 'lucide-react';

export default function UnauthorizedPage() {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="max-w-md w-full glass-panel rounded-2xl p-6 sm:p-8 text-center border border-red-500/20 shadow-2xl">
        <div className="w-16 h-16 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-center justify-center mx-auto mb-5 text-red-400">
          <ShieldAlert className="w-8 h-8" />
        </div>
        
        <h1 className="text-2xl font-bold text-slate-100 mb-2">Không có quyền truy cập</h1>
        <p className="text-slate-400 text-sm mb-6 leading-relaxed">
          Tài khoản của bạn không có đủ thẩm quyền để xem hoặc thao tác trên màn hình này. Hệ thống quản lý nhà hàng áp dụng phân quyền nghiêm ngặt trên từng khu vực nghiệp vụ.
        </p>

        <div className="space-y-3">
          <Link
            href="/tables"
            className="w-full touch-target bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold rounded-xl transition-colors shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2"
          >
            <Home className="w-5 h-5" />
            Về sơ đồ bàn ăn
          </Link>

          <Link
            href="/login"
            className="w-full touch-target bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            <ArrowLeft className="w-5 h-5" />
            Đổi tài khoản đăng nhập
          </Link>
        </div>
      </div>
    </div>
  );
}
