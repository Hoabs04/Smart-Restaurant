'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { UtensilsCrossed, Shield, ChefHat, LogIn, AlertCircle } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!username || !password) {
      setErrorMessage('Vui lòng nhập tên đăng nhập và mật khẩu.');
      return;
    }

    setIsLoading(true);
    setErrorMessage('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMessage(data.message || 'Đăng nhập không thành công.');
        setIsLoading(false);
        return;
      }

      // Điều hướng theo vai trò
      if (data.user.role === 'kitchen') {
        router.push('/kitchen/queue');
      } else {
        router.push('/tables');
      }
      router.refresh();
    } catch {
      setErrorMessage('Không thể kết nối đến máy chủ. Vui lòng kiểm tra đường truyền.');
      setIsLoading(false);
    }
  };

  const selectDemoAccount = (u: string, p: string) => {
    setUsername(u);
    setPassword(p);
    setErrorMessage('');
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4 sm:p-6 lg:p-8 relative overflow-hidden">
      {/* Decorative ambient glows */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-80 h-80 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-md w-full relative z-10">
        {/* Header Branding */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-amber-500 to-amber-600 flex items-center justify-center mx-auto mb-4 shadow-xl shadow-amber-500/20 text-slate-950 font-bold">
            <UtensilsCrossed className="w-8 h-8" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-100 tracking-tight">
            SMART RESTAURANT
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Hệ thống Quản lý Nhà hàng Thông minh trên nền tảng AWS
          </p>
        </div>

        {/* Login Card */}
        <div className="glass-panel rounded-2xl p-6 sm:p-8 shadow-2xl border border-slate-800">
          <h2 className="text-lg font-bold text-slate-200 mb-5 flex items-center gap-2">
            <LogIn className="w-5 h-5 text-amber-500" />
            Đăng nhập hệ thống
          </h2>

          {errorMessage && (
            <div className="mb-5 p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-start gap-2.5">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Tên đăng nhập
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Ví dụ: waiter, kitchen, manager"
                required
                className="w-full touch-target px-4 py-3 rounded-xl bg-slate-900/80 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Mật khẩu
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Nhập mật khẩu"
                required
                className="w-full touch-target px-4 py-3 rounded-xl bg-slate-900/80 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all text-sm"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full touch-target py-3.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-bold text-sm transition-all shadow-lg shadow-amber-500/25 disabled:opacity-50 disabled:cursor-not-allowed mt-2 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                  Đang xác thực...
                </>
              ) : (
                'Đăng nhập'
              )}
            </button>
          </form>

          {/* Quick Demo Accounts Selection */}
          <div className="mt-8 pt-6 border-t border-slate-800">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 text-center">
              Tài khoản demo mẫu (Chọn nhanh)
            </div>
            
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => selectDemoAccount('waiter', 'Restaurant@2026')}
                className="touch-target p-2 rounded-xl bg-slate-900/60 hover:bg-amber-500/10 border border-slate-800 hover:border-amber-500/40 text-left transition-all group"
              >
                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400 group-hover:text-amber-300">
                  <UtensilsCrossed className="w-3.5 h-3.5" />
                  Phục vụ
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5 truncate">waiter</div>
              </button>

              <button
                type="button"
                onClick={() => selectDemoAccount('kitchen', 'Restaurant@2026')}
                className="touch-target p-2 rounded-xl bg-slate-900/60 hover:bg-emerald-500/10 border border-slate-800 hover:border-emerald-500/40 text-left transition-all group"
              >
                <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 group-hover:text-emerald-300">
                  <ChefHat className="w-3.5 h-3.5" />
                  Bếp
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5 truncate">kitchen</div>
              </button>

              <button
                type="button"
                onClick={() => selectDemoAccount('manager', 'Restaurant@2026')}
                className="touch-target p-2 rounded-xl bg-slate-900/60 hover:bg-purple-500/10 border border-slate-800 hover:border-purple-500/40 text-left transition-all group"
              >
                <div className="flex items-center gap-1.5 text-xs font-bold text-purple-400 group-hover:text-purple-300">
                  <Shield className="w-3.5 h-3.5" />
                  Quản lý
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5 truncate">manager</div>
              </button>
            </div>
            <p className="text-[11px] text-slate-500 text-center mt-3">
              Mật khẩu mẫu được mã hóa an toàn bằng Bcrypt. Không hiển thị mật khẩu thật ra giao diện.
            </p>
          </div>
        </div>

        {/* Footer info */}
        <div className="text-center text-xs text-slate-500 mt-6">
          Kiến trúc Modular Monolith &bull; Tối ưu Tablet-First &bull; Bảo mật đa tầng
        </div>
      </div>
    </div>
  );
}
