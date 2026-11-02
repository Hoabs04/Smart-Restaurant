import React from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import DishBannerCarousel from '@/components/DishBannerCarousel';
import { getSessionUser } from '@/lib/auth';
import { 
  Grid, 
  ChefHat, 
  BookOpen, 
  BarChart3, 
  FileText, 
  ShieldCheck, 
  ArrowRight,
  LogIn
} from 'lucide-react';

export default async function HomePage() {
  const session = await getSessionUser();

  return (
    <div className="min-h-screen bg-slate-950 pb-20">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-8">
        
        {/* 1. HERO DISH BANNER CAROUSEL & MARQUEE */}
        <section>
          <DishBannerCarousel />
        </section>

        {/* 2. CHÀO MỪNG & TRUY CẬP NHANH NGHIỆP VỤ */}
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-100 tracking-tight flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-emerald-500 animate-ping" />
                Hệ thống Quản lý Nhà hàng Thông minh
              </h1>
              <p className="text-slate-400 text-xs sm:text-sm mt-0.5">
                {session ? (
                  <>
                    Xin chào, <strong className="text-amber-400 font-semibold">{session.displayName}</strong> ({session.role.toUpperCase()}). Vui lòng chọn phân hệ làm việc bên dưới:
                  </>
                ) : (
                  'Kiến trúc Modular Monolith tối ưu cảm ứng Tablet-First, vận hành mượt mà và trực quan.'
                )}
              </p>
            </div>

            {!session && (
              <Link
                href="/login"
                className="touch-target px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-sm shadow-lg shadow-amber-500/20 transition-all flex items-center gap-2 shrink-0 self-start sm:self-auto"
              >
                <LogIn className="w-4 h-4" />
                <span>Đăng nhập hệ thống</span>
              </Link>
            )}
          </div>

          {/* Grid các Phân hệ chức năng chính */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            
            {/* Phân hệ Sơ đồ bàn & Order */}
            <Link
              href="/tables"
              className="glass-panel p-5 rounded-2xl border border-slate-800 hover:border-amber-500/50 hover:shadow-xl hover:shadow-amber-500/5 transition-all group block"
            >
              <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 group-hover:scale-110 group-hover:bg-amber-500 group-hover:text-slate-950 transition-all mb-4">
                <Grid className="w-6 h-6" />
              </div>
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-slate-100 text-base group-hover:text-amber-400 transition-colors">
                  Sơ đồ bàn & Gọi món
                </h2>
                <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-amber-400 group-hover:translate-x-1 transition-all" />
              </div>
              <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                Theo dõi trạng thái bàn (Trống, Đang phục vụ, Chờ thanh toán), tạo order với snapshot giá và trừ kho nguyên tử.
              </p>
            </Link>

            {/* Phân hệ Queue Bếp Chế biến */}
            <Link
              href="/kitchen/queue"
              className="glass-panel p-5 rounded-2xl border border-slate-800 hover:border-emerald-500/50 hover:shadow-xl hover:shadow-emerald-500/5 transition-all group block"
            >
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 group-hover:scale-110 group-hover:bg-emerald-500 group-hover:text-slate-950 transition-all mb-4">
                <ChefHat className="w-6 h-6" />
              </div>
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-slate-100 text-base group-hover:text-emerald-400 transition-colors">
                  Hàng đợi Bếp chế biến
                </h2>
                <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 group-hover:translate-x-1 transition-all" />
              </div>
              <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                Sắp xếp batch theo sent_at tăng dần, cảnh báo tự động thông minh khi thời gian chờ món vượt quá 10 phút.
              </p>
            </Link>

            {/* Phân hệ Quản lý Menu & Tồn kho */}
            <Link
              href="/admin/menu"
              className="glass-panel p-5 rounded-2xl border border-slate-800 hover:border-purple-500/50 hover:shadow-xl hover:shadow-purple-500/5 transition-all group block"
            >
              <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 group-hover:scale-110 group-hover:bg-purple-500 group-hover:text-slate-950 transition-all mb-4">
                <BookOpen className="w-6 h-6" />
              </div>
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-slate-100 text-base group-hover:text-purple-400 transition-colors">
                  Quản lý Thực đơn & Tồn kho
                </h2>
                <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-purple-400 group-hover:translate-x-1 transition-all" />
              </div>
              <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                Cập nhật giá, kiểm soát số phần khả dụng (stock_quantity), ngưỡng cảnh báo sắp hết và quản lý ảnh món ăn.
              </p>
            </Link>

            {/* Phân hệ Báo cáo Doanh thu */}
            <Link
              href="/reports"
              className="glass-panel p-5 rounded-2xl border border-slate-800 hover:border-blue-500/50 hover:shadow-xl hover:shadow-blue-500/5 transition-all group block"
            >
              <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 group-hover:scale-110 group-hover:bg-blue-500 group-hover:text-slate-950 transition-all mb-4">
                <BarChart3 className="w-6 h-6" />
              </div>
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-slate-100 text-base group-hover:text-blue-400 transition-colors">
                  Báo cáo Doanh thu & Món chạy
                </h2>
                <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-blue-400 group-hover:translate-x-1 transition-all" />
              </div>
              <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                Thống kê doanh thu từ các đơn hàng CLOSED, lọc theo khoảng thời gian và xếp hạng các món ăn bán chạy nhất.
              </p>
            </Link>

            {/* Phân hệ Lịch sử thao tác Audit Log */}
            <Link
              href="/admin/audit-log"
              className="glass-panel p-5 rounded-2xl border border-slate-800 hover:border-cyan-500/50 hover:shadow-xl hover:shadow-cyan-500/5 transition-all group block"
            >
              <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 group-hover:scale-110 group-hover:bg-cyan-500 group-hover:text-slate-950 transition-all mb-4">
                <FileText className="w-6 h-6" />
              </div>
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-slate-100 text-base group-hover:text-cyan-400 transition-colors">
                  Nhật ký Thao tác (Audit Log)
                </h2>
                <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-cyan-400 group-hover:translate-x-1 transition-all" />
              </div>
              <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                Ghi nhận chi tiết mọi thao tác gửi bếp, hủy món, chốt đơn, đăng nhập kèm IP và thông tin bảo mật.
              </p>
            </Link>

            {/* Phân hệ Quản trị Bàn & Tài khoản */}
            <Link
              href="/admin/tables"
              className="glass-panel p-5 rounded-2xl border border-slate-800 hover:border-pink-500/50 hover:shadow-xl hover:shadow-pink-500/5 transition-all group block"
            >
              <div className="w-12 h-12 rounded-xl bg-pink-500/10 border border-pink-500/20 flex items-center justify-center text-pink-400 group-hover:scale-110 group-hover:bg-pink-500 group-hover:text-slate-950 transition-all mb-4">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-slate-100 text-base group-hover:text-pink-400 transition-colors">
                  Quản lý Bàn & Tài khoản
                </h2>
                <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-pink-400 group-hover:translate-x-1 transition-all" />
              </div>
              <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                Cấu hình số lượng bàn theo từng khu vực, phân quyền ba vai trò Manager, Waiter, Kitchen an toàn.
              </p>
            </Link>

          </div>
        </section>

      </main>
    </div>
  );
}
