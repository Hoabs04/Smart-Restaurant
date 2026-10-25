'use client';

import React, { useState, useEffect, useId, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Navbar from '@/components/Navbar';
import { 
  UtensilsCrossed, 
  Search, 
  Plus, 
  Minus, 
  Trash2, 
  Send, 
  AlertCircle, 
  CheckCircle2, 
  AlertTriangle,
  ShoppingCart,
  ArrowLeft,
  RefreshCw
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

interface MenuItem {
  id: string;
  categoryId: string;
  categoryName: string;
  name: string;
  description: string | null;
  currentPrice: number;
  stockQuantity: number;
  lowStockThreshold: number;
  stockStatus: 'OUT_OF_STOCK' | 'LOW_STOCK' | 'NORMAL';
  stockLabel: string;
  stockBadgeClass: string;
  canOrder: boolean;
  imageUrl?: string | null;
}

interface CartItem {
  menuItem: MenuItem;
  quantity: number;
}

interface TableOption {
  id: string;
  tableCode: string;
  areaName: string;
  status: string;
  version: number;
}

function NewOrderContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTableId = searchParams.get('tableId') || '';
  const initialTableCode = searchParams.get('tableCode') || '';
  const initialTableVersion = searchParams.get('tableVersion') ? parseInt(searchParams.get('tableVersion')!, 10) : undefined;

  const [tables, setTables] = useState<TableOption[]>([]);
  const [selectedTableId, setSelectedTableId] = useState(initialTableId);
  const [tableVersion, setTableVersion] = useState<number | undefined>(initialTableVersion);

  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterAvailability, setFilterAvailability] = useState<'all' | 'in_stock'>('all');

  const [cart, setCart] = useState<CartItem[]>([]);
  const [idempotencyKey, setIdempotencyKey] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successNotice, setSuccessNotice] = useState('');
  const [isLoadingMenu, setIsLoadingMenu] = useState(true);

  // Sinh idempotency key ban đầu cho bản nháp
  useEffect(() => {
    setIdempotencyKey(`ord_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`);
  }, []);

  // Lấy danh sách bàn ăn trống
  useEffect(() => {
    fetch('/api/tables')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          const availableTables = data.data.filter((t: any) => t.status === 'AVAILABLE');
          setTables(availableTables);
          if (!selectedTableId && availableTables.length > 0) {
            setSelectedTableId(availableTables[0].id);
            setTableVersion(availableTables[0].version);
          }
        }
      })
      .catch(() => {});
  }, [selectedTableId]);

  // Lấy Menu từ server
  const fetchMenu = async () => {
    setIsLoadingMenu(true);
    try {
      const res = await fetch('/api/menu');
      const data = await res.json();
      if (data.success) {
        setMenuItems(data.data);
        setCategories(data.categories || []);
      }
    } catch {
      setErrorMessage('Không thể tải danh sách thực đơn.');
    } finally {
      setIsLoadingMenu(false);
    }
  };

  useEffect(() => {
    fetchMenu();
  }, []);

  // Thêm món vào giỏ hàng
  const addToCart = (item: MenuItem) => {
    if (!item.canOrder || item.stockQuantity <= 0) return;

    setCart(prev => {
      const existing = prev.find(i => i.menuItem.id === item.id);
      if (existing) {
        if (existing.quantity >= item.stockQuantity) {
          setErrorMessage(`Số lượng đặt món '${item.name}' đã đạt giới hạn tồn kho khả dụng (${item.stockQuantity} phần).`);
          return prev;
        }
        return prev.map(i =>
          i.menuItem.id === item.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prev, { menuItem: item, quantity: 1 }];
    });
    setErrorMessage('');
  };

  // Cập nhật số lượng trong giỏ
  const updateQuantity = (itemId: string, delta: number) => {
    setCart(prev => {
      return prev.map(i => {
        if (i.menuItem.id === itemId) {
          const newQty = i.quantity + delta;
          if (newQty <= 0) return null;
          if (newQty > i.menuItem.stockQuantity) {
            setErrorMessage(`Món '${i.menuItem.name}' chỉ còn ${i.menuItem.stockQuantity} phần.`);
            return i;
          }
          return { ...i, quantity: newQty };
        }
        return i;
      }).filter(Boolean) as CartItem[];
    });
    setErrorMessage('');
  };

  // Xóa món khỏi giỏ
  const removeFromCart = (itemId: string) => {
    setCart(prev => prev.filter(i => i.menuItem.id !== itemId));
  };

  // Tính tạm tính client (chỉ để xem, server tự xác thực và tính lại)
  const cartSubtotal = cart.reduce(
    (sum, it) => sum + it.menuItem.currentPrice * it.quantity,
    0
  );

  // Lọc món theo tab & ô tìm kiếm
  const filteredMenuItems = menuItems.filter(item => {
    const matchCat = selectedCategory === 'ALL' || item.categoryId === selectedCategory;
    const matchQuery = !searchQuery || item.name.toLowerCase().includes(searchQuery.toLowerCase()) || (item.description && item.description.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchAvail = filterAvailability === 'all' || item.canOrder;
    return matchCat && matchQuery && matchAvail;
  });

  // Gửi tạo đơn hàng và gửi bếp
  const handleSubmitOrder = async () => {
    if (!selectedTableId) {
      setErrorMessage('Vui lòng chọn bàn ăn cần mở đơn.');
      return;
    }
    if (cart.length === 0) {
      setErrorMessage('Vui lòng chọn ít nhất một món ăn vào đơn.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      // 1. Tạo Order mới
      // Client CHỈ GỬI menu_item_id, quantity, idempotency_key!
      const payload = {
        table_id: selectedTableId,
        idempotency_key: idempotencyKey,
        expected_table_version: tableVersion,
        items: cart.map(c => ({
          menu_item_id: c.menuItem.id,
          quantity: c.quantity,
        })),
      };

      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        // GIỮ NGUYÊN BẢN NHÁP VÀ HIỂN THỊ LÝ DO CÓ THỂ XỬ LÝ
        setErrorMessage(data.message || 'Lỗi khi gửi đơn hàng lên máy chủ.');
        setIsSubmitting(false);
        return;
      }

      const createdOrderId = data.order.orderId || data.order.id;

      // 2. Gửi batch đầu tiên vào bếp với idempotency key riêng
      const sendBatchRes = await fetch(`/api/orders/${createdOrderId}/send-to-kitchen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idempotency_key: `batch_init_${idempotencyKey}` }),
      });

      const batchData = await sendBatchRes.json();

      if (!sendBatchRes.ok || !batchData.success) {
        setErrorMessage(`Đã tạo đơn nhưng lỗi khi chuyển bếp: ${batchData.message}. Bạn có thể gửi lại trong màn hình đơn hàng.`);
        router.push(`/orders/${createdOrderId}`);
        return;
      }

      // CHỈ XÓA BẢN NHÁP SAU KHI SERVER XÁC NHẬN THÀNH CÔNG!
      setCart([]);
      setSuccessNotice('Tạo đơn và gửi bếp thành công!');
      router.push(`/orders/${createdOrderId}`);
    } catch {
      setErrorMessage('Mất kết nối mạng hoặc lỗi đường truyền. Đơn hàng vẫn được giữ nguyên trong bản nháp. Vui lòng bấm thử lại khi có mạng.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 pb-20">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        
        {/* Navigation Breadcrumb & Title */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/tables')}
              className="touch-target p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-100 tracking-tight flex items-center gap-2">
                <UtensilsCrossed className="w-6 h-6 text-amber-500" />
                Tạo đơn hàng mới
              </h1>
              <p className="text-slate-400 text-xs sm:text-sm">
                Chọn món ăn, kiểm tra tồn kho tự động và chuyển batch vào bếp
              </p>
            </div>
          </div>

          {/* Chọn Bàn */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 hidden sm:inline">Bàn ăn:</span>
            <select
              value={selectedTableId}
              onChange={(e) => {
                setSelectedTableId(e.target.value);
                const t = tables.find(x => x.id === e.target.value);
                setTableVersion(t?.version);
              }}
              className="touch-target px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-amber-400 font-bold text-sm focus:outline-none focus:border-amber-500"
            >
              {initialTableCode && !tables.some(t => t.id === selectedTableId) && (
                <option value={selectedTableId}>{initialTableCode}</option>
              )}
              {tables.map(t => (
                <option key={t.id} value={t.id}>
                  {t.tableCode} ({t.areaName})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Thông báo lỗi nếu có */}
        {errorMessage && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-start gap-2.5 shadow-lg">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-semibold">Thông báo xử lý</div>
              <div>{errorMessage}</div>
            </div>
          </div>
        )}

        {/* Layout 2 cột: Cột Menu (Trái) & Cột Giỏ hàng Order (Phải) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* CỘT MENU (8 CỘT) */}
          <div className="lg:col-span-7 xl:col-span-8 space-y-4">
            
            {/* Thanh tìm kiếm & lọc */}
            <div className="glass-panel p-4 rounded-2xl space-y-3">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Tìm món ăn theo tên hoặc mô tả..."
                    className="w-full touch-target pl-10 pr-4 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setFilterAvailability(filterAvailability === 'all' ? 'in_stock' : 'all')}
                    className={`touch-target px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all whitespace-nowrap ${
                      filterAvailability === 'in_stock'
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                        : 'bg-slate-900 text-slate-400 border-slate-800'
                    }`}
                  >
                    {filterAvailability === 'in_stock' ? '✓ Chỉ món còn hàng' : 'Tất cả trạng thái'}
                  </button>

                  <button
                    onClick={fetchMenu}
                    title="Làm mới thực đơn"
                    className="touch-target p-2 rounded-xl bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800"
                  >
                    <RefreshCw className={`w-4 h-4 ${isLoadingMenu ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>

              {/* Danh mục Categories Tabs */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-1">
                <button
                  onClick={() => setSelectedCategory('ALL')}
                  className={`touch-target px-3.5 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all ${
                    selectedCategory === 'ALL'
                      ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
                      : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
                  }`}
                >
                  Tất cả ({menuItems.length})
                </button>

                {categories.map(c => {
                  const count = menuItems.filter(i => i.categoryId === c.id).length;
                  const isSel = selectedCategory === c.id;
                  return (
                    <button
                      key={c.id}
                      onClick={() => setSelectedCategory(c.id)}
                      className={`touch-target px-3.5 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all ${
                        isSel
                          ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
                          : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
                      }`}
                    >
                      {c.name} ({count})
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Danh sách món ăn Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {filteredMenuItems.map(item => (
                <div
                  key={item.id}
                  className={`glass-panel rounded-2xl border transition-all flex flex-col justify-between overflow-hidden group ${
                    !item.canOrder
                      ? 'border-slate-800/50 opacity-60 bg-slate-950/40'
                      : 'border-slate-800 hover:border-amber-500/40 hover:shadow-xl hover:shadow-amber-500/5'
                  }`}
                >
                  {/* Ảnh món ăn */}
                  {item.imageUrl ? (
                    <div className="relative w-full h-40 bg-slate-900 overflow-hidden shrink-0">
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/20 to-transparent" />
                      
                      {/* Trạng thái tồn kho: CẢ MÀU VÀ NHÃN CHỮ */}
                      <span className={`absolute top-2.5 right-2.5 px-2.5 py-1 rounded-full text-[11px] font-bold border backdrop-blur-md shadow-md ${item.stockBadgeClass}`}>
                        {item.stockLabel}
                      </span>
                    </div>
                  ) : (
                    <div className="p-4 pb-0 flex items-start justify-between gap-2">
                      <div className="font-bold text-slate-100 text-base leading-snug">
                        {item.name}
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border shrink-0 ${item.stockBadgeClass}`}>
                        {item.stockLabel}
                      </span>
                    </div>
                  )}

                  <div className="p-4 flex flex-col justify-between flex-1">
                    <div>
                      {item.imageUrl && (
                        <div className="font-bold text-slate-100 text-base leading-snug mb-1">
                          {item.name}
                        </div>
                      )}

                      <p className="text-xs text-slate-400 line-clamp-2 mb-3">
                        {item.description || 'Hương vị thơm ngon chế biến theo công thức nhà hàng.'}
                      </p>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                      <div className="text-amber-400 font-extrabold text-base">
                        {formatCurrency(item.currentPrice)}
                      </div>

                      <button
                        type="button"
                        disabled={!item.canOrder}
                        onClick={() => addToCart(item)}
                        className={`touch-target px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                          item.canOrder
                            ? 'bg-amber-500 hover:bg-amber-600 text-slate-950 shadow-md shadow-amber-500/20 active:scale-95'
                            : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                        }`}
                      >
                        <Plus className="w-4 h-4" />
                        <span>{item.canOrder ? 'Thêm món' : 'Hết hàng'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

          </div>

          {/* CỘT GIỎ HÀNG ORDER (4 CỘT - STICKY) */}
          <div className="lg:col-span-5 xl:col-span-4 sticky top-20">
            <div className="glass-panel p-5 rounded-2xl border border-slate-800 shadow-xl space-y-4">
              
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="w-5 h-5 text-amber-500" />
                  <h2 className="font-bold text-slate-100 text-base">Đơn hàng nháp</h2>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-amber-400 font-semibold">
                  {cart.reduce((s, i) => s + i.quantity, 0)} phần
                </span>
              </div>

              {/* Danh sách món trong giỏ */}
              {cart.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-sm">
                  <UtensilsCrossed className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  Chưa có món nào được chọn.
                  <br />
                  <span className="text-xs text-slate-600">Chọn món bên thực đơn để thêm vào đơn</span>
                </div>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                  {cart.map((item) => (
                    <div
                      key={item.menuItem.id}
                      className="p-3 rounded-xl bg-slate-900/80 border border-slate-800/80 flex items-center justify-between gap-3"
                    >
                      {item.menuItem.imageUrl && (
                        <img
                          src={item.menuItem.imageUrl}
                          alt={item.menuItem.name}
                          className="w-10 h-10 rounded-lg object-cover shrink-0 border border-slate-700/60"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-slate-200 text-sm truncate">
                          {item.menuItem.name}
                        </div>
                        <div className="text-xs text-amber-400 font-medium">
                          {formatCurrency(item.menuItem.currentPrice)}
                        </div>
                      </div>

                      {/* Bộ nút tăng giảm số lượng */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.menuItem.id, -1)}
                          className="touch-target w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition-colors"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>

                        <span className="w-6 text-center text-sm font-bold text-slate-100">
                          {item.quantity}
                        </span>

                        <button
                          type="button"
                          onClick={() => updateQuantity(item.menuItem.id, 1)}
                          className="touch-target w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => removeFromCart(item.menuItem.id)}
                          className="touch-target w-7 h-7 ml-1 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 flex items-center justify-center transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Tạm tính & Nút Gửi Bếp */}
              <div className="pt-4 border-t border-slate-800 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400">Tạm tính:</span>
                  <span className="text-lg font-bold text-slate-100">
                    {formatCurrency(cartSubtotal)}
                  </span>
                </div>
                
                <p className="text-[11px] text-slate-500 leading-tight">
                  Tạm tính do client ước tính. Khi gửi, server tự đối chiếu giá hiện hành, trừ tồn kho an toàn và tạo snapshot.
                </p>

                <button
                  type="button"
                  disabled={cart.length === 0 || isSubmitting}
                  onClick={handleSubmitOrder}
                  className="touch-target w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-extrabold text-sm transition-all shadow-lg shadow-amber-500/25 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                      <span>Đang gửi bếp...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Gửi vào bếp ngay</span>
                    </>
                  )}
                </button>
              </div>

            </div>
          </div>

        </div>

      </main>
    </div>
  );
}

export default function NewOrderPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
          <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <NewOrderContent />
    </Suspense>
  );
}
