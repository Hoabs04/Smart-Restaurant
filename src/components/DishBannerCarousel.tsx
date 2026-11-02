'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Sparkles, 
  UtensilsCrossed, 
  Flame, 
  ArrowRight
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

export interface FeaturedDish {
  id: string;
  name: string;
  tagline: string;
  category: string;
  price: number;
  image: string;
  badge: string;
  badgeColor: string;
}

const FEATURED_DISHES: FeaturedDish[] = [
  {
    id: 'wagyu-beef',
    name: 'Bò Wagyu Úc nướng đá muối',
    tagline: 'Thịt bò Wagyu MB9 vân mỡ cẩm thạch nướng trực tiếp tại bàn trên đá muối Himalaya',
    category: 'Món chính thượng hạng',
    price: 650000,
    image: '/images/dishes/bo-wagyu.jpg',
    badge: 'Chef’s Special',
    badgeColor: 'bg-amber-100 text-amber-900 border-amber-300',
  },
  {
    id: 'lobster-cheese',
    name: 'Tôm hùm bông nướng phô mai',
    tagline: 'Tôm hùm tươi sống phủ lớp phô mai Mozzarella đút lò vàng óng, thơm béo ngất ngây',
    category: 'Hải sản tươi sống',
    price: 980000,
    image: '/images/dishes/tom-hum-nuong.jpg',
    badge: 'Món bán chạy',
    badgeColor: 'bg-rose-100 text-rose-800 border-rose-300',
  },
  {
    id: 'salmon-fillet',
    name: 'Cá hồi Na-uy áp chảo sốt chanh leo',
    tagline: 'Phi lê cá hồi tươi hảo hạng áp chảo da giòn tan, hòa quyện sốt chanh leo thanh mát',
    category: 'Món chính đặc sắc',
    price: 320000,
    image: '/images/dishes/ca-hoi-ap-chao.jpg',
    badge: 'Sắp hết hàng',
    badgeColor: 'bg-orange-100 text-orange-900 border-orange-300',
  },
  {
    id: 'abalone-soup',
    name: 'Súp bào ngư vi cá',
    tagline: 'Bào ngư cao cấp nấu cùng nước hầm thảo mộc thượng hạng, bồi bổ sức khỏe',
    category: 'Khai vị hoàng gia',
    price: 280000,
    image: '/images/dishes/sup-bao-ngu.jpg',
    badge: 'Món khai vị',
    badgeColor: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  },
  {
    id: 'panna-cotta',
    name: 'Bánh Panna Cotta dâu tây rừng',
    tagline: 'Kem sữa béo ngậy kiểu Ý kết hợp sốt dâu tây rừng chua ngọt thanh mát tròn vị',
    category: 'Tráng miệng',
    price: 85000,
    image: '/images/dishes/panna-cotta.jpg',
    badge: 'Tráng miệng cao cấp',
    badgeColor: 'bg-pink-100 text-pink-900 border-pink-300',
  },
  {
    id: 'lamb-chops',
    name: 'Sườn cừu đút lò thảo mộc',
    tagline: 'Sườn cừu New Zealand ướp lá hương thảo, đút lò vừa chín tới cùng sốt vang đỏ Bordeaux',
    category: 'Món chính',
    price: 420000,
    image: '/images/dishes/suon-cuu.jpg',
    badge: 'Hương vị phương Tây',
    badgeColor: 'bg-indigo-100 text-indigo-900 border-indigo-300',
  },
  {
    id: 'seafood-rice',
    name: 'Cơm chiên hải sản hoàng bào',
    tagline: 'Cơm đảo trứng muối giòn thơm vàng óng cùng tôm sú biển và sò điệp Nhật Bản',
    category: 'Món chính',
    price: 195000,
    image: '/images/dishes/com-chien-hai-san.jpg',
    badge: 'Được yêu thích',
    badgeColor: 'bg-yellow-100 text-yellow-900 border-yellow-300',
  },
  {
    id: 'bird-nest',
    name: 'Chè yến sào hạt sen tuyết nhĩ',
    tagline: 'Tổ yến thiên nhiên chưng đường phèn, hạt sen tươi và tuyết nhĩ thanh khiết',
    category: 'Tráng miệng dưỡng nhan',
    price: 180000,
    image: '/images/dishes/che-yen-sao.jpg',
    badge: 'Bồi bổ sức khỏe',
    badgeColor: 'bg-cyan-100 text-cyan-900 border-cyan-300',
  },
];

interface DishBannerCarouselProps {
  compact?: boolean;
}

export default function DishBannerCarousel({ compact = false }: DishBannerCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  // Tự động chuyển slide liên tục mượt mà sau mỗi 4 giây
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % FEATURED_DISHES.length);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  const currentDish = FEATURED_DISHES[currentIndex];

  return (
    <div className="w-full space-y-4">
      {/* 1. SLIDE BANNER HERO CHÍNH: Tự động chạy mượt mà, Bố cục Tươi sáng & Sang trọng */}
      <div 
        className={`relative w-full rounded-3xl overflow-hidden border border-orange-100/90 shadow-xl bg-gradient-to-br from-amber-50/80 via-white to-orange-50/70 group ${
          compact ? 'min-h-[300px]' : 'min-h-[400px] md:h-[440px] lg:h-[470px]'
        }`}
      >
        {/* Hào quang màu ấm nhẹ nhàng tạo chiều sâu ẩm thực */}
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-orange-400/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 right-1/4 w-96 h-96 bg-amber-400/15 rounded-full blur-3xl pointer-events-none" />

        {/* Nội dung Banner: Bố cục 2 Cột hiện đại (Chữ bên trái, Ảnh món ăn bên phải) */}
        <div className="relative w-full h-full flex flex-col md:flex-row items-center justify-between p-6 sm:p-8 lg:p-10 gap-6 z-10">
          
          {/* CỘT TRÁI: Thông tin món ăn (Nền tươi sáng, chữ than đậm cực kỳ sắc nét) */}
          <div className="w-full md:w-[50%] lg:w-[48%] flex flex-col justify-center order-2 md:order-1">
            {/* Badge phân loại & điểm nhấn */}
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <span className={`px-3 py-1 rounded-full text-xs font-bold border shadow-xs flex items-center gap-1.5 ${currentDish.badgeColor}`}>
                <Sparkles className="w-3.5 h-3.5" />
                {currentDish.badge}
              </span>
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-white text-slate-700 border border-slate-200 shadow-xs">
                {currentDish.category}
              </span>
              <span className="inline-flex items-center gap-1 text-xs font-bold text-orange-700 bg-orange-100/90 px-2.5 py-1 rounded-full border border-orange-200">
                <Flame className="w-3.5 h-3.5 text-orange-600 animate-pulse" />
                Gợi ý hôm nay
              </span>
            </div>

            {/* Tên món ăn */}
            <h2 className="text-2xl sm:text-3xl lg:text-4xl xl:text-5xl font-black text-slate-900 tracking-tight leading-tight mb-2.5">
              {currentDish.name}
            </h2>

            {/* Mô tả ngắn món ăn */}
            <p className="text-xs sm:text-sm lg:text-base text-slate-600 line-clamp-2 max-w-xl mb-6 font-medium leading-relaxed">
              {currentDish.tagline}
            </p>

            {/* Giá món & Nút Thao tác */}
            <div className="flex items-center gap-4 sm:gap-6 flex-wrap">
              <div className="text-orange-600 font-black text-3xl sm:text-4xl font-mono tracking-tight drop-shadow-xs">
                {formatCurrency(currentDish.price)}
              </div>

              <Link
                href="/tables"
                className="touch-target px-5 py-2.5 sm:px-6 sm:py-3 rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 hover:from-amber-600 hover:to-orange-600 text-white font-extrabold text-sm shadow-xl shadow-orange-500/25 transition-all flex items-center gap-2 active:scale-95 group/btn"
              >
                <UtensilsCrossed className="w-4 h-4" />
                <span>Chọn bàn & Gọi món ngay</span>
                <ArrowRight className="w-4 h-4 transition-transform group-hover/btn:translate-x-1" />
              </Link>
            </div>
          </div>

          {/* CỘT PHẢI: Khung ảnh món ăn tươi rói, không bị phủ đen, khung viền trắng sang trọng */}
          <div className="w-full md:w-[50%] lg:w-[52%] h-[240px] sm:h-[300px] md:h-full relative flex items-center justify-center order-1 md:order-2">
            <div className="relative w-full h-full max-h-[350px] rounded-2xl sm:rounded-3xl overflow-hidden shadow-2xl border-4 border-white bg-slate-50 group/photo">
              {FEATURED_DISHES.map((dish, idx) => (
                <div
                  key={dish.id}
                  className={`absolute inset-0 transition-opacity duration-700 ease-in-out ${
                    idx === currentIndex ? 'opacity-100 scale-100' : 'opacity-0 scale-105 pointer-events-none'
                  } transform transition-transform duration-700`}
                >
                  <img
                    src={dish.image}
                    alt={dish.name}
                    className="w-full h-full object-cover object-center"
                  />
                  {/* Subtle soft edge gradient */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/15 via-transparent to-transparent pointer-events-none" />
                </div>
              ))}

              {/* Huy hiệu trên góc ảnh món */}
              <div className="absolute top-3 right-3 z-10 bg-white/95 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold text-slate-800 shadow-md border border-slate-100 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-orange-500" />
                <span>Đầu bếp gợi ý</span>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* 2. DẢI MÓN ĂN CHẠY LIÊN TỤC (INFINITE MARQUEE STRIP) */}
      <div className="relative w-full rounded-2xl overflow-hidden bg-white border border-slate-200/90 p-2.5 shadow-md">
        {/* Gradient mờ 2 bên mép dải marquee */}
        <div className="absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-white to-transparent z-10 pointer-events-none" />
        <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-white to-transparent z-10 pointer-events-none" />

        <div className="flex items-center">
          <div className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-50 border border-orange-200 text-orange-700 text-xs font-black mr-3 z-20 shadow-xs">
            <Flame className="w-3.5 h-3.5 text-orange-600" />
            <span>MÓN ĂN BÁN CHẠY</span>
          </div>

          <div className="overflow-hidden flex-1">
            {/* Double list for seamless continuous infinite looping */}
            <div className="animate-marquee gap-3 flex">
              {[...FEATURED_DISHES, ...FEATURED_DISHES].map((dish, idx) => (
                <div
                  key={`${dish.id}-${idx}`}
                  onClick={() => setCurrentIndex(idx % FEATURED_DISHES.length)}
                  className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-orange-50/80 border border-slate-200/90 hover:border-orange-300 cursor-pointer transition-all shrink-0 group/card shadow-xs"
                >
                  <img
                    src={dish.image}
                    alt={dish.name}
                    className="w-8 h-8 rounded-lg object-cover border border-slate-200 shrink-0 group-hover/card:scale-110 transition-transform shadow-xs"
                  />
                  <div className="text-left">
                    <div className="text-xs font-bold text-slate-800 group-hover/card:text-orange-600 transition-colors truncate max-w-[150px]">
                      {dish.name}
                    </div>
                    <div className="text-[11px] font-mono font-bold text-orange-600">
                      {formatCurrency(dish.price)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
