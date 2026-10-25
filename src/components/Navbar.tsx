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
  X,
  ChevronDown,
  Settings
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

  const [adminDropdownOpen, setAdminDropdownOpen] = useState(false);
  const adminDropdownRef = React.useRef<HTMLDivElement>(null);

  // Đóng dropdown khi click ra ngoài
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (adminDropdownRef.current && !adminDropdownRef.current.contains(event.target as Node)) {
        setAdminDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

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

  // Các mục điều hướng chính
  const mainNavLinks = [
    { href: '/', label: 'Trang chủ', icon: UtensilsCrossed, roles: ['waiter', 'kitchen', 'manager'] },
    { href: '/tables', label: 'Sơ đồ bàn', icon: Grid, roles: ['waiter', 'manager'] },
    { href: '/orders/new', label: 'Tạo đơn mới', icon: PlusCircle, roles: ['waiter'] },
    { href: '/kitchen/queue', label: 'Queue Bếp', icon: ChefHat, roles: ['kitchen'] },
    { href: '/reports', label: 'Báo cáo', icon: BarChart3, roles: ['manager'] },
  ];

  // Các mục quản trị gom nhóm cho Quản lý (Manager)
  const adminLinks = [
    { href: '/admin/menu', label: 'Quản lý Menu', icon: BookOpen, desc: 'Món ăn & tồn kho' },
    { href: '/admin/tables', label: 'Quản lý Bàn', icon: Grid, desc: 'Khu vực & sơ đồ bàn' },
    { href: '/admin/users', label: 'Tài khoản', icon: Users, desc: 'Phân quyền nhân viên' },
    { href: '/admin/audit-log', label: 'Lịch sử thao tác', icon: FileText, desc: 'Nhật ký kiểm toán' },
  ];

  const allowedMainLinks = mainNavLinks.filter(l => user && l.roles.includes(user.role));
  const isManager = user?.role === 'manager';
  const isAdminActive = pathname.startsWith('/admin');

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
              <Link href="/" className="flex items-center gap-2.5">
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
            <nav className="hidden tablet:flex items-center gap-1.5 py-1">
              {allowedMainLinks.map((link) => {
                const Icon = link.icon;
                const isActive = pathname === link.href || (link.href !== '/' && link.href !== '/tables' && pathname.startsWith(link.href));
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

              {/* Menu Gom nhóm "Quản trị" cho Manager */}
              {isManager && (
                <div className="relative" ref={adminDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setAdminDropdownOpen(!adminDropdownOpen)}
                    className={`touch-target px-3.5 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-1.5 whitespace-nowrap ${
                      isAdminActive
                        ? 'bg-amber-500 text-slate-950 font-semibold shadow-md shadow-amber-500/20'
                        : adminDropdownOpen
                        ? 'bg-slate-800 text-slate-100'
                        : 'text-slate-300 hover:text-slate-100 hover:bg-slate-800/60'
                    }`}
                    aria-expanded={adminDropdownOpen}
                    aria-haspopup="true"
                  >
                    <Shield className="w-4 h-4" />
                    <span>Quản trị</span>
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${adminDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {/* Dropdown Menu */}
                  {adminDropdownOpen && (
                    <div className="absolute right-0 mt-2 w-64 rounded-2xl bg-slate-900/95 backdrop-blur-xl border border-slate-700/80 shadow-2xl p-2 z-50 animate-in fade-in zoom-in-95 duration-150">
                      <div className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-800 mb-1 flex items-center gap-1.5">
                        <Settings className="w-3.5 h-3.5 text-amber-400" />
                        <span>Khu vực Quản trị</span>
                      </div>
                      <div className="space-y-1">
                        {adminLinks.map((link) => {
                          const Icon = link.icon;
                          const isActive = pathname === link.href || pathname.startsWith(link.href);
                          return (
                            <Link
                              key={link.href}
                              href={link.href}
                              onClick={() => setAdminDropdownOpen(false)}
                              className={`flex items-start gap-3 p-2.5 rounded-xl transition-colors ${
                                isActive
                                  ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                                  : 'text-slate-300 hover:bg-slate-800/80 hover:text-slate-100'
                              }`}
                            >
                              <div className={`p-1.5 rounded-lg ${isActive ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-400'}`}>
                                <Icon className="w-4 h-4" />
                              </div>
                              <div>
                                <div className="text-sm font-semibold">{link.label}</div>
                                <div className="text-[11px] text-slate-400">{link.desc}</div>
                              </div>
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
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
          <div className="tablet:hidden border-t border-slate-800 bg-slate-900/95 backdrop-blur-md px-4 pt-3 pb-6 space-y-3">
            {user && (
              <div className="p-3 bg-slate-800/60 rounded-xl flex items-center justify-between">
                <div>
                  <div className="font-semibold text-slate-200 text-sm">{user.displayName}</div>
                  <div className="text-xs text-slate-400">@{user.username}</div>
                </div>
                {getRoleBadge(user.role)}
              </div>
            )}

            <div className="space-y-1">
              {allowedMainLinks.map((link) => {
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

            {/* Gom nhóm Quản trị trong mobile drawer */}
            {isManager && (
              <div className="pt-2 border-t border-slate-800/80">
                <div className="px-2 mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-amber-400" />
                  <span>Khu vực Quản trị</span>
                </div>
                <div className="space-y-1">
                  {adminLinks.map((link) => {
                    const Icon = link.icon;
                    const isActive = pathname === link.href;
                    return (
                      <Link
                        key={link.href}
                        href={link.href}
                        onClick={() => setMobileMenuOpen(false)}
                        className={`touch-target w-full px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-3 ${
                          isActive
                            ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                            : 'text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        <Icon className="w-4 h-4 text-slate-400" />
                        <div>
                          <div className="font-medium">{link.label}</div>
                          <div className="text-[11px] text-slate-500">{link.desc}</div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}

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
