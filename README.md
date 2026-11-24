# 🍽️ Hệ thống Quản lý Nhà hàng Thông minh (Smart Restaurant Management)

> **Đề tài:** Nghiên cứu và triển khai Hệ thống Quản lý Nhà hàng Thông minh trên Nền tảng Điện toán Đám mây Amazon Web Services (AWS)  
> **Kiến trúc:** Modular Monolith (Next.js App Router + Edge Middleware), Tablet-First Responsive, Micro-Automation theo quy tắc nghiệp vụ, Đa kênh bán hàng trực tuyến (GrabFood, ShopeeFood, BeFood)  
> **Cơ sở dữ liệu:** PostgreSQL 16 / Amazon RDS for PostgreSQL / PGlite Embedded Engine (Zero-Config Local)  
> **Đám mây AWS:** EC2, Nginx, HTTPS TLS Let's Encrypt, RDS Private Multi-AZ, S3 Private Bucket (SigV4 Upload), CloudWatch Logging

[![Next.js 15](https://img.shields.io/badge/Next.js-15.1%2B-black?style=flat&logo=next.js)](https://nextjs.org/)
[![React 19](https://img.shields.io/badge/React-19.0-blue?style=flat&logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?style=flat&logo=typescript)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16.0-336791?style=flat&logo=postgresql)](https://www.postgresql.org/)
[![Tailwind CSS](https://img.shields.io/badge/TailwindCSS-3.4-38B2AC?style=flat&logo=tailwind-css)](https://tailwindcss.com/)
[![AWS Architecture](https://img.shields.io/badge/AWS-EC2%20%7C%20RDS%20%7C%20S3%20%7C%20CloudWatch-FF9900?style=flat&logo=amazon-aws)](https://aws.amazon.com/)
[![Test Suite](https://img.shields.io/badge/Tests-12%2F12%20Suites%20Passed%20(100%25)-brightgreen?style=flat)]()

---

## 📑 Mục lục
1. [Tổng quan & Mục tiêu Đề tài](#1-tổng-quan--mục-tiêu-đề-tài)
2. [Kiến trúc Hệ thống & Hạ tầng AWS](#2-kiến-trúc-hệ-thống--hạ-tầng-aws)
3. [Các Phân hệ Tính năng Nổi bật](#3-các-phân-hệ-tính-năng-nổi-bật)
4. [Bảo mật, Mã hóa & Tính Toàn vẹn Dữ liệu](#4-bảo-mật-mã-hóa--tính-toàn-vẹn-dữ-liệu)
5. [Tài khoản Mẫu & Phân quyền (RBAC)](#5-tài-khoản-mẫu--phân-quyền-rbac)
6. [Danh sách Route Giao diện & API Endpoints](#6-danh-sách-route-giao-diện--api-endpoints)
7. [Hướng dẫn Khởi chạy Cục bộ (Local Quickstart)](#7-hướng-dẫn-khởi-chạy-cục-bộ-local-quickstart)
8. [Bộ Kiểm thử Tự động Toàn diện (12 Test Suites)](#8-bộ-kiểm-thử-tự-động-toàn-diện-12-test-suites)
9. [Hướng dẫn Triển khai Production trên AWS](#9-hướng-dẫn-triển-khai-production-trên-aws)
10. [Sao lưu & Phục hồi CSDL (Backup & Restore)](#10-sao-lưu--phục-hồi-csdl-backup--restore)
11. [Kịch bản Diễn tập Demo Mẫu](#11-kịch-bản-diễn-tập-demo-mẫu)

---

## 1. Tổng quan & Mục tiêu Đề tài

Hệ thống Quản lý Nhà hàng Thông minh (**Smart Restaurant Management System**) là giải pháp số hóa khép kín quy trình vận hành nhà hàng từ phục vụ tại bàn, điều phối bếp (KDS), tương tác khách hàng qua mã QR đến quản lý đa kênh giao đồ ăn trực tuyến (Omnichannel F&B).

### Các nguyên tắc thiết kế then chốt:
- **Tablet-First Light UX:** Giao diện sáng sủa, độ tương phản cao với điểm nhấn Cam-Vàng (Amber/Orange), vùng chạm cảm ứng ≥ 44×44px tối ưu cho máy tính bảng phục vụ và màn hình bếp.
- **Quy tắc Nghiệp vụ Thông minh (Business Rules Automation):** Mọi tự động hóa (cảnh báo bếp trễ > 10 phút, cảnh báo tồn kho thấp, tự động đóng đơn khi hủy hết món, tự động đồng bộ hết hàng sang sàn giao hàng, tự động chuyển trạng thái bàn `AWAITING_PAYMENT` khi khách bấm yêu cầu thanh toán từ QR) đều vận hành bằng máy trạng thái hữu hạn (State Machine) và ràng buộc CSDL.
- **Toàn vẹn Giao dịch & Chống Xung đột (ACID & Idempotency):** Khóa dòng theo thứ tự chuẩn (`orders -> order_items -> menu_items ORDER BY id ASC`) để chống deadlock, kết hợp partial unique index `idx_orders_one_open_per_table`, khóa lạc quan (`version`), sổ cái tồn kho (`inventory_ledger`) và `idempotency_key`.

---

## 2. Kiến trúc Hệ thống & Hạ tầng AWS

Ứng dụng đóng gói theo mô hình **Next.js Standalone Modular Monolith**, triển khai trong **Amazon VPC** với phân tách Public/Private Subnet:

```text
 ┌────────────────────────────────────────────────────────────────────────┐
 │                    NGƯỜI DÙNG & CÁC KÊNH BÁN HÀNG                      │
 │  ┌─────────────────────────┐  ┌────────────────┐  ┌─────────────────┐  │
 │  │ Khách quét QR Bàn       │  │ Máy tính bảng  │  │ Grab / Shopee / │  │
 │  │ (Track + Gọi phục vụ)   │  │ Phục vụ & Bếp  │  │ BeFood Webhooks │  │
 │  └────────────┬────────────┘  └───────┬────────┘  └────────┬────────┘  │
 └───────────────┼───────────────────────┼────────────────────┼───────────┘
                 │ HTTPS (Port 443 TLS)  │                    │
                 ▼                       ▼                    ▼
 ┌────────────────────────────────────────────────────────────────────────┐
 │ AMAZON VPC (10.0.0.0/16)                                               │
 │  ┌──────────────────────────────────────────────────────────────────┐  │
 │  │ Public Subnet (10.0.1.0/24 - Internet Gateway)                   │  │
 │  │  ├── Nginx Reverse Proxy (TLS 1.2/1.3 Let's Encrypt + Gzip)      │  │
 │  │  └── Docker Container (Next.js Standalone Monolith)              │  │
 │  │       ├── Edge Middleware (JWT + Role Guard trước khi render)    │  │
 │  │       ├── Frontend App Router (SSR + Client Hydration)           │  │
 │  │       ├── Backend RESTful APIs (RBAC + Cryptography)             │  │
 │  │       └── Omnichannel Integration Engine                         │  │
 │  └─────────────────────────────┬────────────────────────────────────┘  │
 │                                │                                       │
 │       TCP 5432 Nội bộ          │ AWS SigV4 / IAM Role                  │
 │       ▼                        ▼                                       │
 │  ┌────────────────────────────────────┐    ┌────────────────────────┐  │
 │  │ Private DB Subnets (Multi-AZ)      │    │ Amazon S3 Bucket       │  │
 │  │   Amazon RDS for PostgreSQL 16     │    │ (Private Media Bucket) │  │
 │  └────────────────────────────────────┘    └────────────────────────┘  │
 │                                            ┌────────────────────────┐  │
 │  Structured JSON Logs (Redacted) ─────────►│ Amazon CloudWatch Logs │  │
 │                                            └────────────────────────┘  │
 └────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Các Phân hệ Tính năng Nổi bật

### 3.1. Sơ đồ Bàn ăn, Gọi món & Chuyển bàn (`/tables`, `/orders/new`, `/orders/[id]`)
- **Sơ đồ bàn trực quan:** Phân chia theo khu vực (Khu Trong Nhà, Sân Vườn, VIP) với 3 trạng thái: `AVAILABLE` (Trống), `OCCUPIED` (Đang phục vụ), `AWAITING_PAYMENT` (Chờ thanh toán).
- **Chống mở trùng đơn:** Đảm bảo tối đa **01 đơn hàng mở** trên mỗi bàn cả ở tầng ứng dụng (HTTP 409) lẫn partial unique index trong PostgreSQL.
- **Gọi món & Ghi chú cho Bếp:** Hỗ trợ chọn nhanh tag ghi chú (`+ Ít cay`, `+ Không hành`, `+ Ít đá`, `+ Chín kỹ`) hoặc nhập tay cho từng món; snapshot giá & tên món tại thời điểm gọi.
- **Chuyển bàn an toàn:** Cho phép chuyển toàn bộ đơn đang mở (kèm yêu cầu QR đang chờ) sang bàn trống khác trong 1 transaction nguyên tử, giải phóng bàn cũ về `AVAILABLE`.

### 3.2. Hàng đợi Bếp & Chế biến Thông minh (`/kitchen/queue`)
- **Sắp xếp theo `sent_at` tăng dần:** Đợt món gửi trước luôn ưu tiên đứng đầu hàng đợi, hiển thị rõ ghi chú chế biến của từng món và nhãn đơn giao hàng (`GRABFOOD`, `SHOPEEFOOD`, `BEFOOD`).
- **Cảnh báo trễ > 10 phút:** Tự động nổi bật đỏ và gắn nhãn cảnh báo khi batch chờ quá 10 phút.
- **State Machine chặt chẽ:** `SENT_TO_KITCHEN` ➔ `IN_PROGRESS` ➔ `READY`. Cấm hủy món khi bếp đã bắt đầu chế biến; hủy món `SENT_TO_KITCHEN` tự động hoàn kho 1 lần duy nhất vào `inventory_ledger`.

### 3.3. Tích hợp Đa Kênh Bán Hàng Trực Tuyến (`/admin/channels`)
- **Hỗ trợ GrabFood, ShopeeFood, BeFood & Mock Sandbox:** Mã hóa credentials bằng **AES-256-GCM**, hỗ trợ Auto-confirm, tính phí sàn & doanh thu thực nhận (`Net Revenue`), xuất đối soát CSV chống Formula Injection.
- **Quy đổi món ăn & Tự động tra cứu lại Mapping:** Ánh xạ `external_item_id` với món nội bộ; khi đẩy đơn cũ vào bếp sẽ tự động đối chiếu lại bảng `channel_menu_mappings` mới nhất nếu trước đó chưa gán món.
- **Webhook bảo mật & Đồng bộ 2 chiều:** Xác thực HMAC-SHA256, chống replay attack (cửa sổ 300s), vô hiệu hóa kênh `MOCK` trên production, và tự động đẩy trạng thái `READY` sang sàn khi bếp hoàn tất món.

### 3.4. Cổng Theo dõi & Trợ lý Gọi Phục Vụ từ QR Bàn (`/track/table/[code]`, `/track/[orderCode]`)
- **Theo dõi tiến độ 4 bước thời gian thực:** `Đã ghi nhận ➔ Chuyển bếp ➔ Đang nấu ➔ Sẵn sàng`.
- **Trợ lý gọi phục vụ ngay trên điện thoại khách:** Khách quét QR bàn có thể bấm **"Gọi phục vụ"**, **"Xin thêm đá / khăn"** hoặc **"Yêu cầu thanh toán"** (`POST /api/guest/service-request`). Bàn yêu cầu thanh toán tự động chuyển sang `AWAITING_PAYMENT` và hiển thị thông báo nổi bật kèm nút **"Đã tiếp nhận"** ngay trên màn hình `/tables` của nhân viên.

### 3.5. Thanh toán VietQR Thủ công & In Hóa đơn A4 / Bill Nhiệt K80 (`/orders/[id]/invoice`)
- **VietQR chuẩn Napas:** Sinh mã QR theo tổng tiền server tính toán với cú pháp `THANHTOAN ORD-xxxx`.
- **Xác nhận thủ công bắt buộc:** Chặn chốt đơn khi chưa bấm **"Đã kiểm tra và nhận chuyển khoản"** (`MANUALLY_CONFIRMED`). Nếu thêm món mới sau khi đã xác nhận thanh toán, hệ thống tự động đặt lại `payment_status = PENDING` để tránh thất thu.
- **Chế độ In A4 & Bill K80 (80mm):** Hỗ trợ chuyển đổi trực tiếp giữa khổ A4 và khổ giấy nhiệt K80 (`80mm`) với CSS `@media print` tối ưu.

### 3.6. Quản trị, Upload Ảnh S3/Local & Báo cáo Trực quan (`/admin/*`, `/reports`)
- **Upload ảnh món ăn (`/admin/menu`):** Hỗ trợ chọn ảnh mẫu hoặc tải ảnh trực tiếp qua `POST /api/admin/menu-items/upload` (tự động ký **AWS SigV4** đẩy lên Amazon S3 khi có cấu hình AWS, đồng thời lưu local tại `public/images/dishes/`).
- **Quản lý Nhân sự (`/admin/users`):** Tự động Soft Delete với nhân viên đã có lịch sử đơn/audit, chặn tự khóa và chặn khóa/hạ quyền manager cuối cùng.
- **Báo cáo Doanh thu (`/reports`):** Chỉ tính đơn `CLOSED` (loại bỏ đơn hủy), có **Biểu đồ cột Doanh thu theo ngày**, **Biểu đồ Tỷ trọng Tại bàn vs Sàn Online**, lọc nguồn đơn và top món bán chạy.
- **Audit Log (`/admin/audit-log`):** Ghi vết toàn bộ thao tác nhạy cảm kèm IP và metadata JSON.

---

## 4. Bảo mật, Mã hóa & Tính Toàn vẹn Dữ liệu

| Hạng mục | Cơ chế Bảo mật & Kỹ thuật Áp dụng |
| :--- | :--- |
| **Edge Middleware** | `src/middleware.ts` xác thực JWT (`jose`, `HS256`) và kiểm tra role ở tầng server trước khi render mọi route nội bộ. |
| **Xác thực & RBAC động** | `requireAuth` truy vấn lại `is_active` và `role_code` mới nhất từ CSDL (fail-closed `503` khi mất kết nối DB). |
| **Mật khẩu & Rate Limit** | `bcryptjs` (10 rounds); rate-limit chống brute-force ở `/api/auth/login`, `/api/guest/track`, `/api/guest/service-request`. |
| **Mã hóa Credentials** | App Secret & Webhook Secret của đối tác mã hóa bằng **AES-256-GCM** (random 12-byte IV + 16-byte Auth Tag). |
| **Chống XSS & CSV Injection** | Escape HTML khi in thẻ QR bàn (`TableQrModal`), vô hiệu hóa công thức `= + - @` khi xuất CSV đối soát. |
| **Production Fail-Fast** | Khi `NODE_ENV=production`, hệ thống bắt buộc PostgreSQL server, `JWT_SECRET` (≥ 32 ký tự), `SALES_CHANNEL_ENCRYPTION_KEY`, và chặn kênh `MOCK`. |

---

## 5. Tài khoản Mẫu & Phân quyền (RBAC)

Dữ liệu seed mặc định cho môi trường phát triển (mật khẩu có thể cấu hình qua `SEED_DEFAULT_PASSWORD`):

| Vai trò | Tên đăng nhập | Mật khẩu mẫu | Quyền hạn chính |
| :--- | :--- | :--- | :--- |
| **Quản lý** (`manager`) | `manager` | `Restaurant@2026` | Toàn quyền cấu hình bàn, thực đơn, nhân sự, kênh bán hàng, báo cáo doanh thu và audit log. |
| **Phục vụ** (`waiter`) | `waiter` | `Restaurant@2026` | Sơ đồ bàn, mở đơn, thêm món/ghi chú, chuyển bàn, tiếp nhận yêu cầu QR, xác nhận thanh toán & chốt đơn. |
| **Bếp** (`kitchen`) | `kitchen` | `Restaurant@2026` | Xem hàng đợi chế biến (Queue KDS) và cập nhật trạng thái món (`IN_PROGRESS`, `READY`). |

*(Lưu ý: Khối nút chọn nhanh tài khoản demo trên `/login` bị ẩn mặc định trên production; chỉ hiển thị khi `NEXT_PUBLIC_ENABLE_DEMO_ACCOUNTS=true`.)*

---

## 6. Danh sách Route Giao diện & API Endpoints

### 6.1. Các Trang Giao diện (Frontend Routes)
- `/`, `/login`, `/unauthorized`
- `/tables`, `/orders/new`, `/orders/[id]`, `/orders/[id]/invoice`
- `/kitchen/queue`
- `/track/[orderCode]`, `/track/table/[code]`
- `/reports`
- `/admin/channels`, `/admin/channels/[channelCode]`, `/admin/menu`, `/admin/tables`, `/admin/users`, `/admin/audit-log`

### 6.2. Các Nhóm API Chính (Backend REST APIs)
- **Auth:** `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- **Bàn & Thực đơn:** `GET /api/tables`, `POST /api/tables/[id]/acknowledge-requests`, `GET /api/menu`
- **Đơn hàng & Bếp:** `GET|POST /api/orders`, `GET /api/orders/[id]`, `POST /api/orders/[id]/items`, `POST /api/orders/[id]/send-to-kitchen`, `POST /api/orders/[id]/transfer-table`, `POST /api/orders/[id]/confirm-payment`, `POST /api/orders/[id]/close`, `POST /api/orders/[id]/cancel`, `PATCH /api/order-items/[id]/status`, `POST /api/order-items/[id]/cancel`, `GET /api/kitchen/queue`
- **Khách hàng (Public):** `GET /api/guest/track`, `POST /api/guest/service-request`
- **Quản trị & Báo cáo:** `GET|POST|PUT|DELETE /api/admin/menu-items`, `POST /api/admin/menu-items/upload`, `GET|POST|PUT|DELETE /api/admin/tables`, `GET|POST|PUT|DELETE /api/admin/users`, `GET /api/admin/audit-log`, `GET /api/reports/revenue`, `GET /api/reports/best-selling`
- **Đa kênh & Webhooks:** `GET /api/admin/channels`, `GET|PUT /api/admin/channels/[channelCode]`, `POST /api/admin/channels/[channelCode]/test`, `GET|POST /api/admin/channels/[channelCode]/orders`, `POST /api/admin/channels/[channelCode]/orders/[orderId]/push-kitchen`, `PUT /api/admin/channels/[channelCode]/orders/[orderId]/status`, `GET|POST|DELETE /api/admin/channels/[channelCode]/mappings`, `POST /api/admin/channels/[channelCode]/menu/sync`, `POST /api/admin/channels/[channelCode]/menu/stock-sync`, `GET /api/admin/channels/reports`, `POST /api/webhooks/channels/[channelCode]`

---

## 7. Hướng dẫn Khởi chạy Cục bộ (Local Quickstart)

### Cách 1: Khởi chạy trực tiếp với PGlite nhúng (Zero-Config)
```bash
# 1. Cài đặt dependencies
npm install

# 2. Khởi tạo schema & nạp dữ liệu mẫu
npm run db:seed

# 3. Chạy nhanh với Turbopack (Dev)
npx next dev --turbopack
```
Hoặc để trải nghiệm tốc độ mượt tối đa trên local với PGlite:
```powershell
npm run build
$env:FORCE_LOCAL_PGLITE="true"; npm run start
```
Truy cập ứng dụng tại `http://localhost:3000`.

### Cách 2: Khởi chạy bằng Docker Compose (PostgreSQL 16 + Next.js App)
```bash
docker compose up -d --build
docker compose exec app npm run db:seed
docker compose ps
```

---

## 8. Bộ Kiểm thử Tự động Toàn diện (12 Test Suites)

Chạy toàn bộ 12 bộ kiểm thử cách ly trên `.db_pglite_test`:

```bash
npm test
```

1. `tests/run-all.ts`: Auth/RBAC, quy tắc tồn kho, snapshot giá, trừ kho nguyên tử, state machine bếp, cảnh báo > 10 phút, chốt đơn, báo cáo doanh thu.
2. `tests/concurrency-api.test.ts`: Race condition qua HTTP API (mở trùng bàn, tranh chấp tồn kho, idempotent replay, hủy món đồng thời với bếp).
3. `tests/payment-qr.test.ts`: VietQR, xác nhận chuyển khoản thủ công, chặn chốt đơn khi chưa thanh toán.
4. `tests/guest-tracking.test.ts`: Theo dõi đơn qua QR bàn & mã đơn, bảo mật dữ liệu ẩn.
5. `tests/high-priority-fixes.test.ts`: Đóng đơn khi hủy hết món, standalone build isolation, production fail-fast.
6. `tests/admin-delete-user.test.ts`: Soft Delete vs Hard Delete, chặn tự xóa & xóa manager cuối cùng.
7. `tests/admin-menu.test.ts`: CRUD thực đơn & audit log.
8. `tests/sales-channels.test.ts`: Mã hóa AES-256-GCM credentials & kết nối kênh bán hàng.
9. `tests/sales-channels-phase2.test.ts`: Menu mapping, ingest đơn sàn, đồng bộ 2 chiều, tính hoa hồng.
10. `tests/sales-channels-phase3.test.ts`: Đẩy bếp, đồng bộ hết hàng tự động, báo cáo tài chính & xuất CSV.
11. `tests/sales-channels-reliability.test.ts`: HMAC fail-closed, replay attack, webhook hủy hoàn kho 1 lần, OAuth fail-closed.
12. `tests/security-and-logic-fixes.test.ts`: Hồi quy bảo mật & nghiệp vụ (chặn `bypassPaymentCheck`, reset `payment_status` khi thêm món, lọc `source=ONLINE`, chặn `MOCK` trên production, trợ lý gọi phục vụ QR, ghi chú món ăn & chuyển bàn).

---

## 9. Hướng dẫn Triển khai Production trên AWS

1. **Mạng VPC:** Public Subnet (`10.0.1.0/24`) cho EC2 + Nginx; 2 Private Subnets (`10.0.10.0/24`, `10.0.11.0/24`) cho Amazon RDS Multi-AZ.
2. **Security Groups:** EC2 chỉ mở TCP `80/443` (và `22` cho IP quản trị); RDS chỉ nhận TCP `5432` từ Security Group của EC2.
3. **Amazon RDS (PostgreSQL 16) & Migrations:**
   ```bash
   npx prisma migrate deploy
   ```
   *(Thư mục `prisma/migrations/` gồm 5 migrations: `0_init`, `1_sales_channels`, `2_hardening_constraints_indexes`, `3_guest_service_requests`, `4_item_notes` cùng `migration_lock.toml`.)*
4. **Amazon S3 & CloudWatch:** Tạo S3 Private Bucket (Block All Public Access) và cấu hình `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET_NAME` để upload ảnh món ăn trực tiếp lên S3.
5. **EC2 + Nginx + Docker:**
   ```bash
   sudo cp nginx.conf /etc/nginx/nginx.conf
   sudo certbot --nginx -d your-domain.com
   docker build -t smart-restaurant-app .
   docker run -d --name smart-restaurant-app --restart always -p 3000:3000 --env-file .env smart-restaurant-app
   SEED_DEFAULT_PASSWORD="YourStrongSeedPassword@2026" docker exec -it smart-restaurant-app npm run db:seed
   ```

---

## 10. Sao lưu & Phục hồi CSDL (Backup & Restore)

- **Linux / EC2:**
  ```bash
  DATABASE_URL="postgresql://..." ./scripts/backup.sh
  DATABASE_URL="postgresql://..." ./scripts/restore.sh backups/smart_restaurant_backup_YYYYMMDD_HHMMSS.sql.gz
  ```
- **Windows PowerShell:**
  ```powershell
  .\scripts\backup.ps1 -DbPassword "your_password"
  .\scripts\restore.ps1 -BackupFile backups\smart_restaurant_backup_YYYYMMDD_HHMMSS.sql -DbPassword "your_password"
  ```

---

## 11. Kịch bản Diễn tập Demo Mẫu

1. **Đăng nhập Phục vụ (`/login`):** Đăng nhập tài khoản `waiter`, xác minh không thấy menu Quản trị.
2. **Mở bàn & Gọi món có Ghi chú (`/tables` → `/orders/new`):** Chọn Bàn 01, chọn món + tag ghi chú (*"Ít cay"*), nhấn **"Gửi vào bếp ngay"**.
3. **Đầu bếp tiếp nhận (`/kitchen/queue`):** Đăng nhập `kitchen`, thấy Batch #1 kèm ghi chú chế biến, chuyển `IN_PROGRESS` → `READY`.
4. **Khách quét QR & Gọi phục vụ (`/track/table/Bàn%2001`):** Xem tiến độ món, bấm **"Gọi phục vụ"** hoặc **"Yêu cầu thanh toán"**, kiểm tra thông báo nhấp nháy & nút **"Đã tiếp nhận"** ở `/tables`.
5. **Chuyển bàn (`/orders/[id]`):** Thử bấm **"Chuyển bàn"** sang một bàn trống khác.
6. **Hóa đơn VietQR & In Bill K80 (`/orders/[id]/invoice`):** Kiểm tra mã VietQR, chuyển đổi khổ in **A4 / Bill K80 (80mm)**, bấm **"Đã kiểm tra và nhận chuyển khoản"** rồi chốt đơn (`CLOSED`).
7. **Đa kênh & Báo cáo (`/admin/channels`, `/reports`, `/admin/audit-log`):** Nhận/đẩy đơn GrabFood, xem biểu đồ doanh thu theo ngày & tỷ trọng kênh bán hàng, và kiểm tra Audit Log.

---

## 📄 Bản quyền & Tuyên bố Miễn trừ Trách nhiệm
- Dự án phục vụ mục đích nghiên cứu, học thuật và triển khai kiến trúc trên nền tảng Amazon Web Services (AWS).
- Mã QR thanh toán hiển thị thông tin chuyển khoản thủ công theo chuẩn VietQR, không kết nối cổng thanh toán thương mại tự động.
