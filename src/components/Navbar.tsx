'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { 
  UtensilsCrossed, 
  ChefHat, 
  BarChart3, 
  BookOpen, 
  Users, 
  FileText, 
  LogOut, 
  WifiOff, 
  Grid, 
  PlusCircle,
  Shield,
  Menu,
  X
} from 'lucide-react';

interface UserSession {
  id: string;
  username: string;
  displayName: string;
  role: 'manager' | 'waiter' | 'kitchen';
}

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<UserSession | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Lắng nghe trạng thái mạng Online / Offline
  useEffect(() => {
    setIsOffline(!navigator.onLine);

    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Lấy thông tin user hiện tại
    fetch('/api/auth/me')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.user) {
          setUser(data.user);
        } else if (pathname !== '/login') {
          router.push('/login');
        }
      })
      .catch(() => {});

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [pathname, router]);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
      router.refresh();
    } catch {
      router.push('/login');
    }
  };

  const getRoleBadge = (role?: string) => {
    switch (role) {
      case 'manager':
        return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/30 flex items-center gap-1"><Shield className="w-3 h-3" /> Quản lý</span>;
      case 'waiter':
        return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center gap-1"><UtensilsCrossed className="w-3 h-3" /> Phục vụ</span>;
      case 'kitchen':
        return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1"><ChefHat className="w-3 h-3" /> Bếp</span>;
      default:
        return null;
    }
  };

  const navLinks = [
    // Phục vụ & Quản lý
    { href: '/tables', label: 'Sơ đồ bàn', icon: Grid, roles: ['waiter', 'manager'] },
    { href: '/orders/new', label: 'Tạo đơn mới', icon: PlusCircle, roles: ['waiter'] },
    
    // Bếp
    { href: '/kitchen/queue', label: 'Queue Bếp', icon: ChefHat, roles: ['kitchen'] },

    // Quản lý
    { href: '/reports', label: 'Báo cáo', icon: BarChart3, roles: ['manager'] },
    { href: '/admin/menu', label: 'Quản lý Menu', icon: BookOpen, roles: ['manager'] },
    { href: '/admin/tables', label: 'Quản lý Bàn', icon: Grid, roles: ['manager'] },
    { href: '/admin/users', label: 'Tài khoản', icon: Users, roles: ['manager'] },
    { href: '/admin/audit-log', label: 'Lịch sử thao tác', icon: FileText, roles: ['manager'] },
  ];

  const allowedLinks = navLinks.filter(l => user && l.roles.includes(user.role));

  return (
    <>
      {/* Banner cảnh báo Mất kết nối mạng */}
      {isOffline && (
        <div className="bg-red-600 text-white px-4 py-2 text-center text-sm font-medium flex items-center justify-center gap-2 sticky top-0 z-50 shadow-md animate-pulse">
          <WifiOff className="w-4 h-4" />
          <span>Mất kết nối mạng Internet. Các đơn hàng chưa gửi được giữ an toàn trong bản nháp cục bộ.</span>
        </div>
      )}

      <header className="sticky top-0 z-40 w-full glass-panel border-b border-slate-800 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            
            {/* Logo */}
            <div className="flex items-center gap-3">
              <Link href={user?.role === 'kitchen' ? '/kitchen/queue' : '/tables'} className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-600 flex items-center justify-center text-slate-950 font-bold shadow-md shadow-amber-500/20">
                  <UtensilsCrossed className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-base font-bold text-slate-100 tracking-tight flex items-center gap-1.5">
                    SMART RESTAURANT
                    <span className="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">AWS MVP</span>
                  </div>
                  <div className="text-[11px] text-slate-400 font-medium">Hệ thống quản lý nhà hàng thông minh</div>
                </div>
              </Link>
            </div>

            {/* Desktop & Tablet Navigation */}
            <nav className="hidden tablet:flex items-center gap-1 overflow-x-auto py-1">
              {allowedLinks.map((link) => {
                const Icon = link.icon;
                const isActive = pathname === link.href || (link.href !== '/tables' && pathname.startsWith(link.href));
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`touch-target px-3.5 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2 whitespace-nowrap ${
                      isActive
                        ? 'bg-amber-500 text-slate-950 font-semibold shadow-md shadow-amber-500/20'
                        : 'text-slate-300 hover:text-slate-100 hover:bg-slate-800/60'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{link.label}</span>
                  </Link>
                );
              })}
            </nav>

            {/* User Profile & Logout */}
            <div className="hidden tablet:flex items-center gap-3">
              {user && (
                <div className="text-right">
                  <div className="text-sm font-semibold text-slate-200">{user.displayName}</div>
                  <div className="flex items-center justify-end gap-1 mt-0.5">
                    {getRoleBadge(user.role)}
                  </div>
                </div>
              )}

              <button
                onClick={handleLogout}
                title="Đăng xuất"
                className="touch-target p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-colors border border-slate-700/60"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>

            {/* Mobile menu trigger */}
            <div className="flex tablet:hidden items-center gap-2">
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="touch-target p-2 rounded-xl bg-slate-800 text-slate-300"
              >
                {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>

          </div>
        </div>

        {/* Mobile dropdown menu */}
        {mobileMenuOpen && (
          <div className="tablet:hidden border-t border-slate-800 bg-slate-900/95 backdrop-blur-md px-4 pt-3 pb-6 space-y-2">
            {user && (
              <div className="p-3 bg-slate-800/60 rounded-xl mb-3 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-slate-200 text-sm">{user.displayName}</div>
                  <div className="text-xs text-slate-400">@{user.username}</div>
                </div>
                {getRoleBadge(user.role)}
              </div>
            )}

            <div className="space-y-1">
              {allowedLinks.map((link) => {
                const Icon = link.icon;
                const isActive = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`touch-target w-full px-4 py-2.5 rounded-xl text-sm font-medium flex items-center gap-3 ${
                      isActive
                        ? 'bg-amber-500 text-slate-950 font-semibold'
                        : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span>{link.label}</span>
                  </Link>
                );
              })}
            </div>

            <button
              onClick={handleLogout}
              className="touch-target w-full px-4 py-2.5 mt-2 rounded-xl text-sm font-medium text-red-400 hover:bg-red-500/10 flex items-center gap-3 border border-red-500/20"
            >
              <LogOut className="w-5 h-5" />
              <span>Đăng xuất</span>
            </button>
          </div>
        )}
      </header>
    </>
  );
}
