'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { 
  ChevronLeft, 
  ChevronRight, 
  Sparkles, 
  UtensilsCrossed, 
  Flame, 
  ArrowRight,
  Pause,
  Play
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
    badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  },
  {
    id: 'lobster-cheese',
    name: 'Tôm hùm bông nướng phô mai',
    tagline: 'Tôm hùm tươi sống phủ lớp phô mai Mozzarella đút lò vàng óng, thơm béo ngất ngây',
    category: 'Hải sản tươi sống',
    price: 980000,
    image: '/images/dishes/tom-hum-nuong.jpg',
    badge: 'Món bán chạy',
    badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
  },
  {
    id: 'salmon-fillet',
    name: 'Cá hồi Na-uy áp chảo sốt chanh leo',
    tagline: 'Phi lê cá hồi tươi hảo hạng áp chảo da giòn tan, hòa quyện sốt chanh leo thanh mát',
    category: 'Món chính đặc sắc',
    price: 320000,
    image: '/images/dishes/ca-hoi-ap-chao.jpg',
    badge: 'Sắp hết hàng',
    badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  },
  {
    id: 'abalone-soup',
    name: 'Súp bào ngư vi cá',
    tagline: 'Bào ngư cao cấp nấu cùng nước hầm thảo mộc thượng hạng, bồi bổ sức khỏe',
    category: 'Khai vị hoàng gia',
    price: 280000,
    image: '/images/dishes/sup-bao-ngu.jpg',
    badge: 'Món khai vị',
    badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  },
  {
    id: 'panna-cotta',
    name: 'Bánh Panna Cotta dâu tây rừng',
    tagline: 'Kem sữa béo ngậy kiểu Ý kết hợp sốt dâu tây rừng chua ngọt thanh mát tròn vị',
    category: 'Tráng miệng',
    price: 85000,
    image: '/images/dishes/panna-cotta.jpg',
    badge: 'Tráng miệng cao cấp',
    badgeColor: 'bg-pink-500/20 text-pink-300 border-pink-500/40',
  },
  {
    id: 'lamb-chops',
    name: 'Sườn cừu đút lò thảo mộc',
    tagline: 'Sườn cừu New Zealand ướp lá hương thảo, đút lò vừa chín tới cùng sốt vang đỏ Bordeaux',
    category: 'Món chính',
    price: 420000,
    image: '/images/dishes/suon-cuu.jpg',
    badge: 'Hương vị phương Tây',
    badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
  },
  {
    id: 'seafood-rice',
    name: 'Cơm chiên hải sản hoàng bào',
    tagline: 'Cơm đảo trứng muối giòn thơm vàng óng cùng tôm sú biển và sò điệp Nhật Bản',
    category: 'Món chính',
    price: 195000,
    image: '/images/dishes/com-chien-hai-san.jpg',
    badge: 'Được yêu thích',
    badgeColor: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40',
  },
  {
    id: 'bird-nest',
    name: 'Chè yến sào hạt sen tuyết nhĩ',
    tagline: 'Tổ yến thiên nhiên chưng đường phèn, hạt sen tươi và tuyết nhĩ thanh khiết',
    category: 'Tráng miệng dưỡng nhan',
    price: 180000,
    image: '/images/dishes/che-yen-sao.jpg',
    badge: 'Bồi bổ sức khỏe',
    badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
  },
];

interface DishBannerCarouselProps {
  compact?: boolean;
}

export default function DishBannerCarousel({ compact = false }: DishBannerCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Tự động chuyển slide sau mỗi 4.5 giây
  useEffect(() => {
    if (isPlaying) {
      timerRef.current = setInterval(() => {
        setCurrentIndex((prev) => (prev + 1) % FEATURED_DISHES.length);
      }, 4500);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying]);

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev - 1 + FEATURED_DISHES.length) % FEATURED_DISHES.length);
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev + 1) % FEATURED_DISHES.length);
  };

  const currentDish = FEATURED_DISHES[currentIndex];

  return (
    <div className="w-full space-y-4">
      {/* 1. SLIDE BANNER HERO CHÍNH */}
      <div 
        className={`relative w-full rounded-3xl overflow-hidden border border-slate-800 shadow-2xl bg-slate-900 group ${
          compact ? 'h-[280px] sm:h-[320px]' : 'h-[360px] sm:h-[420px] lg:h-[460px]'
        }`}
        onMouseEnter={() => setIsPlaying(false)}
        onMouseLeave={() => setIsPlaying(true)}
      >
        {/* Background Images với hiệu ứng chuyển đổi mượt mà */}
        {FEATURED_DISHES.map((dish, idx) => (
          <div
            key={dish.id}
            className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
              idx === currentIndex ? 'opacity-100 scale-100' : 'opacity-0 scale-105 pointer-events-none'
            } transform transition-transform duration-1000`}
          >
            <img
              src={dish.image}
              alt={dish.name}
              className="w-full h-full object-cover"
            />
            {/* Lớp phủ dốc chuyển màu để làm nổi chữ và tạo chiều sâu điện ảnh */}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/60 to-slate-950/20" />
            <div className="absolute inset-0 bg-gradient-to-r from-slate-950/90 via-slate-950/40 to-transparent" />
          </div>
        ))}

        {/* Nội dung thông tin món ăn trên Banner */}
        <div className="absolute inset-0 p-6 sm:p-10 flex flex-col justify-end z-10 max-w-2xl">
          {/* Badge phân loại & điểm nhấn */}
          <div className="flex items-center gap-2.5 mb-2.5 flex-wrap">
            <span className={`px-3 py-1 rounded-full text-xs font-bold border backdrop-blur-md shadow-sm flex items-center gap-1.5 ${currentDish.badgeColor}`}>
              <Sparkles className="w-3.5 h-3.5" />
              {currentDish.badge}
            </span>
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-slate-900/80 text-slate-300 border border-slate-700/80 backdrop-blur-md">
              {currentDish.category}
            </span>
            <span className="hidden sm:inline-flex items-center gap-1 text-xs text-amber-400 font-semibold bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-500/20">
              <Flame className="w-3 h-3 text-amber-500 animate-pulse" />
              Gợi ý hôm nay
            </span>
          </div>

          {/* Tên món ăn */}
          <h2 className="text-2xl sm:text-4xl lg:text-5xl font-black text-slate-100 tracking-tight leading-tight drop-shadow-md mb-2">
            {currentDish.name}
          </h2>

          {/* Mô tả ngắn */}
          <p className="text-xs sm:text-sm text-slate-300 line-clamp-2 max-w-xl mb-4 font-normal drop-shadow">
            {currentDish.tagline}
          </p>

          {/* Giá và Nút Thao tác */}
          <div className="flex items-center gap-4 sm:gap-6 flex-wrap">
            <div className="text-amber-400 font-black text-2xl sm:text-3xl font-mono tracking-tight drop-shadow-lg">
              {formatCurrency(currentDish.price)}
            </div>

            <Link
              href="/tables"
              className="touch-target px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-bold text-sm shadow-xl shadow-amber-500/25 transition-all flex items-center gap-2 active:scale-95 group/btn"
            >
              <UtensilsCrossed className="w-4 h-4" />
              <span>Chọn bàn & Gọi món ngay</span>
              <ArrowRight className="w-4 h-4 transition-transform group-hover/btn:translate-x-1" />
            </Link>
          </div>
        </div>

        {/* Nút điều khiển Trước / Sau */}
        <button
          type="button"
          onClick={handlePrev}
          title="Món trước"
          className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 touch-target w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-slate-950/60 hover:bg-slate-900 border border-slate-700/80 text-slate-200 hover:text-white flex items-center justify-center backdrop-blur-md shadow-xl transition-all opacity-80 hover:opacity-100 active:scale-90 z-20"
        >
          <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
        </button>

        <button
          type="button"
          onClick={handleNext}
          title="Món tiếp theo"
          className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 touch-target w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-slate-950/60 hover:bg-slate-900 border border-slate-700/80 text-slate-200 hover:text-white flex items-center justify-center backdrop-blur-md shadow-xl transition-all opacity-80 hover:opacity-100 active:scale-90 z-20"
        >
          <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6" />
        </button>

        {/* Thanh điều khiển dưới cùng: Dots & Pause/Play */}
        <div className="absolute bottom-4 right-4 sm:right-8 z-20 flex items-center gap-3 bg-slate-950/70 backdrop-blur-md px-3 py-1.5 rounded-full border border-slate-800">
          <button
            type="button"
            onClick={() => setIsPlaying(!isPlaying)}
            title={isPlaying ? 'Tạm dừng chạy tự động' : 'Tiếp tục chạy'}
            className="text-slate-400 hover:text-amber-400 transition-colors p-1"
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          </button>

          <div className="flex items-center gap-1.5">
            {FEATURED_DISHES.map((dish, i) => (
              <button
                key={dish.id}
                onClick={() => setCurrentIndex(i)}
                title={dish.name}
                className={`transition-all rounded-full ${
                  i === currentIndex
                    ? 'w-6 h-2 bg-amber-400'
                    : 'w-2 h-2 bg-slate-600 hover:bg-slate-400'
                }`}
              />
            ))}
          </div>

          <span className="text-[11px] font-mono text-slate-400 font-bold ml-1">
            0{currentIndex + 1} / 0{FEATURED_DISHES.length}
          </span>
        </div>
      </div>

      {/* 2. DẢI MÓN ĂN CHẠY LIÊN TỤC (INFINITE MARQUEE STRIP) */}
      <div className="relative w-full rounded-2xl overflow-hidden bg-slate-900/60 border border-slate-800/80 p-2.5 shadow-lg">
        {/* Gradient mờ 2 bên mép dải marquee */}
        <div className="absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-slate-950 to-transparent z-10 pointer-events-none" />
        <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-slate-950 to-transparent z-10 pointer-events-none" />

        <div className="flex items-center">
          <div className="shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-bold mr-3 z-20">
            <Flame className="w-3.5 h-3.5" />
            <span>MÓN ĂN BÁN CHẠY</span>
          </div>

          <div className="overflow-hidden flex-1">
            {/* Double list for seamless continuous infinite looping */}
            <div className="animate-marquee gap-3 flex">
              {[...FEATURED_DISHES, ...FEATURED_DISHES].map((dish, idx) => (
                <div
                  key={`${dish.id}-${idx}`}
                  onClick={() => setCurrentIndex(idx % FEATURED_DISHES.length)}
                  className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-slate-950/80 hover:bg-amber-500/10 border border-slate-800 hover:border-amber-500/40 cursor-pointer transition-all shrink-0 group/card"
                >
                  <img
                    src={dish.image}
                    alt={dish.name}
                    className="w-8 h-8 rounded-lg object-cover border border-slate-700/80 shrink-0 group-hover/card:scale-110 transition-transform"
                  />
                  <div className="text-left">
                    <div className="text-xs font-bold text-slate-200 group-hover/card:text-amber-300 transition-colors truncate max-w-[150px]">
                      {dish.name}
                    </div>
                    <div className="text-[11px] font-mono font-bold text-amber-400">
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
