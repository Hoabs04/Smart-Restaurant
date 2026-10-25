import fs from 'fs';
import path from 'path';
import { getDb, closeDb } from '../src/lib/db';

async function main() {
  console.log('🖼️ Bắt đầu cấu hình hình ảnh cho Menu...');

  const publicDishesDir = path.join(process.cwd(), 'public', 'images', 'dishes');
  fs.mkdirSync(publicDishesDir, { recursive: true });

  const brainDir = 'C:\\Users\\ADMIN\\.gemini\\antigravity-ide\\brain\\eebc3706-2530-4dfb-a3d3-6f930957964f';

  const imageMap: Record<string, string> = {
    'Súp bào ngư vi cá': 'abalone_soup_1792923994061.jpg',
    'Salad cá ngừ đại dương': 'tuna_salad_1792924042194.jpg',
    'Bò Wagyu Úc nướng đá muối': 'wagyu_beef_1792923930867.jpg',
    'Sườn cừu đút lò thảo mộc': 'lamb_chops_1792924066035.jpg',
    'Cơm chiên hải sản hoàng bào': 'seafood_rice_1792924098534.jpg',
    'Cá hồi Na-uy áp chảo sốt chanh leo': 'salmon_dish_1792923975291.jpg',
    'Rượu vang đỏ Chateau Bordeaux': 'bordeaux_wine_1792924152412.jpg',
    'Tôm hùm bông nướng phô mai': 'lobster_cheese_1792923949419.jpg',
    'Cua tuyết Hokkaido hấp sake': 'snow_crab_1792924130900.jpg',
    'Bánh Panna Cotta dâu tây rừng': 'panna_cotta_1792924018224.jpg',
    'Chè yến sào hạt sen tuyết nhĩ': 'bird_nest_1792924183398.jpg',
  };

  const fileSlugMap: Record<string, string> = {
    'Súp bào ngư vi cá': 'sup-bao-ngu.jpg',
    'Salad cá ngừ đại dương': 'salad-ca-ngu.jpg',
    'Bò Wagyu Úc nướng đá muối': 'bo-wagyu.jpg',
    'Sườn cừu đút lò thảo mộc': 'suon-cuu.jpg',
    'Cơm chiên hải sản hoàng bào': 'com-chien-hai-san.jpg',
    'Cá hồi Na-uy áp chảo sốt chanh leo': 'ca-hoi-ap-chao.jpg',
    'Rượu vang đỏ Chateau Bordeaux': 'ruou-vang-chateau.jpg',
    'Tôm hùm bông nướng phô mai': 'tom-hum-nuong.jpg',
    'Cua tuyết Hokkaido hấp sake': 'cua-tuyet.jpg',
    'Bánh Panna Cotta dâu tây rừng': 'panna-cotta.jpg',
    'Chè yến sào hạt sen tuyết nhĩ': 'che-yen-sao.jpg',
  };

  // 1. Copy generated images
  for (const [dishName, srcFileName] of Object.entries(imageMap)) {
    const srcPath = path.join(brainDir, srcFileName);
    const destSlug = fileSlugMap[dishName];
    const destPath = path.join(publicDishesDir, destSlug);

    if (fs.existsSync(srcPath)) {
      fs.copyFileSync(srcPath, destPath);
      console.log(`✅ Đã sao chép ảnh: ${destSlug}`);
    } else {
      console.warn(`⚠️ Không tìm thấy ảnh nguồn: ${srcPath}`);
    }
  }

  // 2. Tạo hình ảnh vector SVG bắt mắt cho 2 đồ uống còn lại
  const orangeJuiceSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="100%" height="100%">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#1e1b18" />
        <stop offset="100%" stop-color="#0f172a" />
      </linearGradient>
      <linearGradient id="juice" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#f97316" />
        <stop offset="50%" stop-color="#ea580c" />
        <stop offset="100%" stop-color="#c2410c" />
      </linearGradient>
      <linearGradient id="glass" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="rgba(255,255,255,0.4)" />
        <stop offset="30%" stop-color="rgba(255,255,255,0.1)" />
        <stop offset="100%" stop-color="rgba(255,255,255,0.3)" />
      </linearGradient>
    </defs>
    <rect width="400" height="300" fill="url(#bg)" />
    <!-- Table base -->
    <ellipse cx="200" cy="260" rx="140" ry="25" fill="#090d16" opacity="0.6" />
    <!-- Glass container -->
    <path d="M140 70 L155 240 Q157 250 170 250 L230 250 Q243 250 245 240 L260 70 Z" fill="url(#glass)" stroke="rgba(255,255,255,0.3)" stroke-width="2" />
    <!-- Juice content -->
    <path d="M143 100 L156 238 Q158 246 170 246 L230 246 Q242 246 244 238 L257 100 Z" fill="url(#juice)" />
    <!-- Ice cubes -->
    <rect x="170" y="110" width="28" height="28" rx="6" fill="rgba(255,255,255,0.4)" stroke="rgba(255,255,255,0.7)" stroke-width="1.5" transform="rotate(15 184 124)" />
    <rect x="200" y="130" width="30" height="30" rx="6" fill="rgba(255,255,255,0.35)" stroke="rgba(255,255,255,0.7)" stroke-width="1.5" transform="rotate(-20 215 145)" />
    <!-- Orange Slice on rim -->
    <circle cx="140" cy="70" r="32" fill="#fb923c" stroke="#f97316" stroke-width="4" />
    <circle cx="140" cy="70" r="26" fill="#ea580c" />
    <circle cx="140" cy="70" r="6" fill="#fed7aa" />
    <path d="M140 44 L140 96 M114 70 L166 70 M121 51 L159 89 M121 89 L159 51" stroke="#fed7aa" stroke-width="2" />
    <!-- Mint leaf -->
    <path d="M135 45 Q125 25 140 20 Q155 25 145 45 Z" fill="#22c55e" />
    <!-- Straw -->
    <line x1="220" y1="50" x2="190" y2="230" stroke="#f43f5e" stroke-width="6" stroke-linecap="round" />
    <!-- Text badge -->
    <text x="200" y="285" fill="#f97316" font-family="sans-serif" font-size="12" font-weight="bold" text-anchor="middle" letter-spacing="1">CAM SÀNH TƯƠI NGUYÊN CHẤT</text>
  </svg>`;
  fs.writeFileSync(path.join(publicDishesDir, 'nuoc-cam-ep.svg'), orangeJuiceSvg, 'utf-8');
  console.log('✅ Đã tạo ảnh: nuoc-cam-ep.svg');

  const teaSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="100%" height="100%">
    <defs>
      <linearGradient id="teaBg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#1c1917" />
        <stop offset="100%" stop-color="#0c0a09" />
      </linearGradient>
      <linearGradient id="teaLiquid" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#fef08a" />
        <stop offset="100%" stop-color="#eab308" />
      </linearGradient>
    </defs>
    <rect width="400" height="300" fill="url(#teaBg)" />
    <!-- Shadow -->
    <ellipse cx="200" cy="255" rx="130" ry="20" fill="#000" opacity="0.6" />
    <!-- Cup Plate -->
    <ellipse cx="200" cy="245" rx="100" ry="18" fill="#292524" stroke="#44403c" stroke-width="2" />
    <!-- Glass Teacup -->
    <path d="M140 140 Q135 220 180 230 L220 230 Q265 220 260 140 Z" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.3)" stroke-width="2" />
    <!-- Tea liquid -->
    <path d="M145 160 Q140 215 180 226 L220 226 Q260 215 255 160 Z" fill="url(#teaLiquid)" opacity="0.85" />
    <!-- Cup handle -->
    <path d="M260 160 Q290 160 290 190 Q290 215 255 210" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="3" />
    <!-- Blooming Chrysanthemum Flower in Tea -->
    <g transform="translate(200, 190) scale(0.7)">
      <circle cx="0" cy="0" r="14" fill="#ca8a04" />
      <!-- Petals -->
      <ellipse cx="0" cy="-24" rx="6" ry="14" fill="#fde047" />
      <ellipse cx="0" cy="24" rx="6" ry="14" fill="#fde047" />
      <ellipse cx="-24" cy="0" rx="14" ry="6" fill="#fde047" />
      <ellipse cx="24" cy="0" rx="14" ry="6" fill="#fde047" />
      <ellipse cx="-17" cy="-17" rx="12" ry="7" transform="rotate(45 -17 -17)" fill="#facc15" />
      <ellipse cx="17" cy="17" rx="12" ry="7" transform="rotate(45 17 17)" fill="#facc15" />
      <ellipse cx="17" cy="-17" rx="12" ry="7" transform="rotate(-45 17 -17)" fill="#facc15" />
      <ellipse cx="-17" cy="17" rx="12" ry="7" transform="rotate(-45 -17 17)" fill="#facc15" />
    </g>
    <!-- Steam -->
    <path d="M185 130 Q175 100 185 80 Q195 60 185 40" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="2.5" stroke-linecap="round" />
    <path d="M215 130 Q225 100 215 80 Q205 60 215 40" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="2" stroke-linecap="round" />
    <text x="200" y="285" fill="#eab308" font-family="sans-serif" font-size="12" font-weight="bold" text-anchor="middle" letter-spacing="1">TRÀ HOA CÚC MẬT ONG RỪNG</text>
  </svg>`;
  fs.writeFileSync(path.join(publicDishesDir, 'tra-hoa-cuc.svg'), teaSvg, 'utf-8');
  console.log('✅ Đã tạo ảnh: tra-hoa-cuc.svg');

  // 3. Cập nhật đường dẫn ảnh vào Database
  const db = await getDb();

  const dishToImage: Record<string, string> = {
    'Súp bào ngư vi cá': '/images/dishes/sup-bao-ngu.jpg',
    'Salad cá ngừ đại dương': '/images/dishes/salad-ca-ngu.jpg',
    'Bò Wagyu Úc nướng đá muối': '/images/dishes/bo-wagyu.jpg',
    'Sườn cừu đút lò thảo mộc': '/images/dishes/suon-cuu.jpg',
    'Cơm chiên hải sản hoàng bào': '/images/dishes/com-chien-hai-san.jpg',
    'Cá hồi Na-uy áp chảo sốt chanh leo': '/images/dishes/ca-hoi-ap-chao.jpg',
    'Rượu vang đỏ Chateau Bordeaux': '/images/dishes/ruou-vang-chateau.jpg',
    'Tôm hùm bông nướng phô mai': '/images/dishes/tom-hum-nuong.jpg',
    'Cua tuyết Hokkaido hấp sake': '/images/dishes/cua-tuyet.jpg',
    'Bánh Panna Cotta dâu tây rừng': '/images/dishes/panna-cotta.jpg',
    'Chè yến sào hạt sen tuyết nhĩ': '/images/dishes/che-yen-sao.jpg',
    'Nước ép cam sành tươi nguyên chất': '/images/dishes/nuoc-cam-ep.svg',
    'Trà hoa cúc mật ong rừng': '/images/dishes/tra-hoa-cuc.svg',
  };

  for (const [name, imgUrl] of Object.entries(dishToImage)) {
    const res = await db.execute(
      `UPDATE menu_items SET image_key = $1 WHERE name = $2;`,
      [imgUrl, name]
    );
    console.log(`Cập nhật món "${name}" -> ${imgUrl} (${res.rowCount} row)`);
  }

  console.log('🎉 Hoàn tất nạp ảnh và cập nhật cơ sở dữ liệu!');
  await closeDb();
}

main().catch(err => {
  console.error('Lỗi thiết lập ảnh:', err);
  process.exit(1);
});
