import React from 'react';
import Link from 'next/link';
import { UtensilsCrossed, ArrowLeft } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-center">
      <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-4 shadow-lg shadow-amber-500/5">
        <UtensilsCrossed className="w-8 h-8" />
      </div>
      <h1 className="text-3xl font-black text-slate-100 tracking-tight mb-2">
        404 - Không tìm thấy trang
      </h1>
      <p className="text-slate-400 text-sm max-w-sm mb-6 leading-relaxed">
        Trang hoặc liên kết bạn yêu cầu không tồn tại hoặc đã được chuyển sang đường dẫn khác trong hệ thống.
      </p>
      <Link
        href="/"
        className="touch-target px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-sm shadow-md transition-all inline-flex items-center gap-2"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Về trang chủ nhà hàng</span>
      </Link>
    </div>
  );
}
