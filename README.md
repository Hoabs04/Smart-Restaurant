# Hệ thống Quản lý Nhà hàng Thông minh trên Nền tảng Amazon Web Services (AWS)
> **Đề tài:** Nghiên cứu và triển khai Hệ thống Quản lý Nhà hàng thông minh trên nền tảng điện toán đám mây Amazon Web Services  
> **Kiến trúc:** Modular Monolith, Tablet-first Responsive, Micro-Automation theo quy tắc nghiệp vụ  
> **Cơ sở dữ liệu:** PostgreSQL / Amazon RDS for PostgreSQL  
> **Đám mây AWS:** EC2, Nginx, HTTPS Let's Encrypt, RDS Private, S3 Private, CloudWatch  

---

## 1. Tổng quan & Mục tiêu Đề tài

Hệ thống Quản lý Nhà hàng Thông minh (Smart Restaurant Management) là giải pháp website chuyên nghiệp được thiết kế theo kiến trúc **Modular Monolith**, tối ưu hóa cho thao tác trên máy tính bảng (**Tablet-first**) tại nhà hàng.

Hệ thống số hóa toàn bộ quy trình vận hành khép kín:
1. **Nhân viên phục vụ (Waiter):** Tiếp nhận khách theo bàn, gọi món theo nhóm thực đơn, gửi batch vào bếp, theo dõi tiến độ, xem hóa đơn và chốt đơn mô phỏng.
2. **Nhân viên bếp (Kitchen):** Theo dõi hàng đợi chế biến theo thời gian thực, sắp xếp ưu tiên theo thời gian chờ của đợt gửi (`sent_at` tăng dần), cảnh báo các món và batch chờ quá 10 phút, cập nhật trạng thái từng món ăn.
3. **Quản lý nhà hàng (Manager):** Cấu hình bàn ăn, khu vực, danh mục, thực đơn, quản lý tài khoản nhân sự (RBAC), kiểm soát tồn kho (`stock_quantity`) và xem báo cáo doanh thu, món bán chạy cùng lịch sử thao tác (Audit Log).

> ⚠️ **Lưu ý nguyên tắc nghiệp vụ & Thanh toán:** Các tính năng "thông minh" trong hệ thống là các cảnh báo và tự động hóa theo quy tắc nghiệp vụ (Business Rules Automation), không sử dụng AI dự đoán. Hệ thống sử dụng **mã QR chuyển khoản mô phỏng (chuẩn VietQR thủ công)** hiển thị số tài khoản, tên ngân hàng, chủ tài khoản, tổng tiền do server tính và nội dung chuyển khoản theo mã order (`THANHTOAN ORD-xxxx`).  
> **Hệ thống KHÔNG tích hợp cổng thanh toán thực tế, không có Webhook ngân hàng và KHÔNG tự động xác nhận giao dịch.** Nhân viên phục vụ (`waiter`) hoặc Quản lý (`manager`) phải chủ động kiểm tra giao dịch thực tế và bấm nút *"Đã kiểm tra và nhận chuyển khoản"* để ghi nhận trạng thái thanh toán thủ công (`MANUALLY_CONFIRMED`) trước khi chốt đơn và giải phóng bàn ăn.

---

## 2. Kiến trúc Hệ thống & Triển khai AWS

### Sơ đồ Luồng Kiến trúc Production

```text
       Thiết bị Tablet / Laptop (Nhà hàng)
                      │
                      │ HTTPS (TCP 443)
                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Amazon Virtual Private Cloud (VPC)                                      │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ Public Subnet (Route Table -> Internet Gateway)                   │  │
│  │                                                                   │  │
│  │   Security Group Ứng dụng: Chỉ mở TCP 443 và TCP 80 (Certbot/301) │  │
│  │                                                                   │  │
│  │   ┌─────────────────────────────────────────────────────────────┐ │  │
│  │   │ Amazon EC2 Instance (t3.micro / t4g.small)                  │ │  │
│  │   │  ├── Nginx Reverse Proxy (HTTPS TLS Let's Encrypt)          │ │  │
│  │   │  │    └── Certbot HTTP-01 Auto-Renewal (Cron/Systemd)       │ │  │
│  │   │  └── Docker Container (Next.js Standalone Modular Monolith) │ │  │
│  │   └──────────────────────────┬──────────────────────────────────┘ │  │
│  └──────────────────────────────┼────────────────────────────────────┘  │
│                                 │                                       │
│          TCP 5432 nội bộ        │ IAM Role (Quyền tối thiểu)            │
│          (Chỉ từ SG App)        ▼                                       │
│  ┌──────────────────────────────┴──────┐    ┌────────────────────────┐  │
│  │ Private DB Subnets (Trải trên 2 AZ) │    │ Amazon S3 Bucket       │  │
│  │                                     │    │ (Private, Block Public)│  │
│  │   Amazon RDS for PostgreSQL         │    │ Lưu trữ ảnh món ăn     │  │
│  │   (Tắt Public Access hoàn toàn)     │    └────────────────────────┘  │
│  │   - Automated Backups & Snapshots   │                                │
│  └─────────────────────────────────────┘    ┌────────────────────────┐  │
│                                             │ Amazon CloudWatch      │  │
│  Giám sát & Logs JSON tương thích ─────────►│ - CloudWatch Logs      │  │
│                                             │ - Metric & Alarms      │  │
│                                             └────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Ngăn xếp Công nghệ (Technology Stack)

- **Frontend:** Next.js 15 (App Router), React 19, TypeScript.
- **Giao diện (UI):** Tailwind CSS, Vanilla CSS Glassmorphism, Responsive Tablet-first (Breakpoints 375px, 768px, 1280px, vùng chạm nút tối thiểu 44×44px).
- **Backend:** Next.js API Routes (Modular Monolith trong cùng ứng dụng).
- **Cơ sở dữ liệu:** PostgreSQL 16 / Amazon RDS for PostgreSQL.
- **Engine DB Local / Fallback:** `@electric-sql/pglite` (WebAssembly PostgreSQL v16 engine in-process độc lập) kết hợp `pg` pool và Prisma Client.
- **Xác thực & Phân quyền:** JWT an toàn (`jose`), Cookie HttpOnly SameSite=Lax, mật khẩu mã hóa Bcrypt salt rounds = 10.
- **Hạ tầng & Triển khai:** Docker Multi-stage build, Docker Compose, Nginx, Certbot Let's Encrypt TLS.
- **Lưu trữ Cloud:** Amazon S3 Private Bucket.
- **Giám sát:** Amazon CloudWatch structured JSON logging.

---

## 4. Tài khoản Mẫu & Phân quyền (RBAC)

Hệ thống khởi tạo sẵn tài khoản mẫu cho cả 3 vai trò (có thể bấm chọn nhanh tại trang `/login`):

| Vai trò | Tên đăng nhập | Mật khẩu mẫu | Tên hiển thị | Thẩm quyền chính |
| :--- | :--- | :--- | :--- | :--- |
| **Quản lý** (`manager`) | `manager` | `Restaurant@2026` | Nguyễn Văn Quản Lý | Quản lý tài khoản, bàn, thực đơn; xem báo cáo doanh thu, món bán chạy, audit log. |
| **Phục vụ** (`waiter`) | `waiter` | `Restaurant@2026` | Trần Thị Phục Vụ | Xem sơ đồ bàn, tạo order, gửi batch vào bếp, xem hóa đơn, hủy món NEW/SENT, chốt đơn mô phỏng. |
| **Bếp** (`kitchen`) | `kitchen` | `Restaurant@2026` | Lê Văn Đầu Bếp | Xem hàng đợi chế biến (Queue), cập nhật trạng thái món (SENT -> IN_PROGRESS -> READY). |

> 🔒 *Mật khẩu được băm bằng thuật toán Bcrypt an toàn, không hiển thị mật khẩu thật trên UI hoặc tài liệu.*

---

## 5. Danh sách 11 Route Chức năng

| Route | Tên màn hình | Quyền truy cập | Chức năng chính |
| :--- | :--- | :--- | :--- |
| `/login` | Đăng nhập | Tất cả | Đăng nhập bằng tài khoản, chọn nhanh tài khoản demo, thông báo lỗi xác thực. |
| `/tables` | Sơ đồ bàn ăn | `waiter`, `manager` | Xem bàn dạng grid theo khu vực, trạng thái (Trống, Đang phục vụ, Chờ thanh toán), mở order hiện tại hoặc tạo order mới. |
| `/orders/new` | Tạo đơn hàng mới | `waiter` | Chọn bàn, duyệt menu theo nhóm món, tìm kiếm, kiểm tra tồn kho, tạo giỏ hàng draft, gửi batch vào bếp an toàn. |
| `/orders/[id]` | Chi tiết đơn hàng | `waiter`, `manager`, `kitchen` | Danh sách món theo batch, hủy món (modal xác nhận bắt buộc lý do), gửi thêm batch mới, theo dõi trạng thái. |
| `/orders/[id]/invoice` | Hóa đơn & QR Chuyển khoản | `waiter`, `manager` | Xem hóa đơn snapshot, hiển thị mã QR VietQR, sao chép STK/nội dung, nhân viên xác nhận thanh toán thủ công, chốt đơn giải phóng bàn, in ấn tối ưu CSS `@media print`. |
| `/kitchen/queue` | Hàng đợi Bếp | `kitchen` | Queue sắp xếp theo `sent_at` tăng dần, thời gian chờ, cảnh báo >10 phút, nút thao tác lớn (Bắt đầu làm, Sẵn sàng). |
| `/reports` | Báo cáo Quản trị | `manager` | Doanh thu các đơn CLOSED, số lượng đơn đã chốt, top món bán chạy theo số lượng, lọc theo khoảng ngày. |
| `/admin/menu` | Quản trị Thực đơn | `manager` | Thêm/sửa món ăn, danh mục, cập nhật `stock_quantity` và ngưỡng cảnh báo sắp hết `low_stock_threshold`. |
| `/admin/tables` | Quản trị Bàn ăn | `manager` | Thêm/sửa bàn ăn, khu vực, sức chứa, trạng thái hoạt động. |
| `/admin/users` | Quản trị Người dùng | `manager` | Thêm/sửa tài khoản, gán vai trò (`manager`, `waiter`, `kitchen`), kích hoạt/khóa tài khoản. |
| `/admin/audit-log` | Lịch sử Thao tác | `manager` | Xem toàn bộ nhật ký thao tác quan trọng, actor, thời gian, IP và chi tiết JSON. |

---

## 6. Cấu hình Mã QR Chuyển khoản VietQR & Quy trình Xác nhận Thủ công

### 6.1. Biến môi trường cấu hình QR (`.env` / `.env.example`)
Thêm các biến cấu hình tài khoản nhận tiền chuyển khoản vào file `.env`:

```env
# Mã định danh ngân hàng (BIN code theo chuẩn Napas/VietQR, ví dụ: 970436 cho Vietcombank, 970422 cho MBBank)
PAYMENT_BANK_BIN=970436

# Tên ngân hàng thụ hưởng hiển thị cho khách
PAYMENT_BANK_NAME=Vietcombank

# Số tài khoản ngân hàng thụ hưởng
PAYMENT_ACCOUNT_NUMBER=1234567890

# Tên chủ tài khoản ngân hàng thụ hưởng (viết hoa không dấu)
PAYMENT_ACCOUNT_NAME=NHA HANG SMART RESTAURANT

# Bật/tắt tính năng QR chuyển khoản trên hóa đơn
PAYMENT_QR_ENABLED=true
```

> 🔒 **Quy tắc bảo mật & an toàn dữ liệu:**
> - **Không hard-code** thông tin tài khoản thật vào mã nguồn repository.
> - **Không lưu** dữ liệu nhạy cảm (mật khẩu ngân hàng, mã PIN, số thẻ thanh toán).
> - **Tổng tiền tạo QR** (`amount`) bắt buộc do Server tính toán trực tiếp từ cơ sở dữ liệu (`total_amount` snapshot), tuyệt đối **không nhận tiền từ client** để ngăn ngừa gian lận.
> - **Cơ chế Fallback an toàn:** Nếu thiếu biến môi trường hoặc `PAYMENT_QR_ENABLED=false`, giao diện hóa đơn sẽ hiển thị thông báo nhẹ nhàng: *"Chưa cấu hình thông tin QR chuyển khoản."* mà không làm crash ứng dụng.

### 6.2. Quy trình Xác nhận Thanh toán Thủ công & Chốt đơn
- **Bản chất tính năng:** Đây là hệ thống QR chuyển khoản mô phỏng/thủ công phục vụ đề tài nghiên cứu. Hệ thống **chưa tích hợp Webhook ngân hàng và chưa tự động xác nhận giao dịch**.
- **Quy trình vận hành:**
  1. Khách hàng quét mã QR trên màn hình hoặc hóa đơn in (nội dung chuyển khoản tự động gắn mã order, ví dụ: `THANHTOAN ORD-20261026-A12B`).
  2. Khách hàng thực hiện chuyển khoản trên ứng dụng ngân hàng.
  3. Nhân viên phục vụ (`waiter`) hoặc Quản lý (`manager`) kiểm tra biến động số dư thực tế, sau đó bấm nút: **"Đã kiểm tra và nhận chuyển khoản"**.
  4. Hệ thống cập nhật `payment_status = 'MANUALLY_CONFIRMED'`, lưu thời gian `payment_confirmed_at`, người xác nhận `payment_confirmed_by` và ghi nhận nhật ký `Audit Log`.
  5. Khi đã xác nhận thanh toán và tất cả món ăn chưa hủy đều đã sẵn sàng (`READY`), nhân viên mới có thể bấm **"Xác nhận chốt đơn mô phỏng"** để chuyển trạng thái order sang `CLOSED` và giải phóng bàn ăn về `AVAILABLE` (Trống).
  6. Nếu chưa xác nhận thanh toán, hệ thống chặn chốt đơn với mã lỗi `PAYMENT_NOT_CONFIRMED` (HTTP 400).

---

## 7. Hướng dẫn Chạy Thử Local

### Cách 1: Chạy trực tiếp bằng Node.js & npm (Khuyên dùng - Zero Config)

Hệ thống được tích hợp sẵn engine PostgreSQL v16 nhúng (PGlite) persistent tại thư mục `.db_pglite`, cho phép bạn chạy ngay lập tức mà không cần cài đặt thêm phần mềm máy chủ database bên ngoài:

```bash
# 1. Cài đặt các dependencies
npm install

# 2. Khởi tạo cơ sở dữ liệu và nạp dữ liệu mẫu cho 3 vai trò
npm run db:seed

# 3. Khởi chạy máy chủ phát triển
npm run dev
```

Mở trình duyệt tại: `http://localhost:3000`

---

### Cách 2: Chạy bằng Docker Compose (PostgreSQL 16 + App)

```bash
# 1. Khởi động PostgreSQL và App Container
docker compose up -d --build

# 2. Nạp dữ liệu mẫu vào container
docker compose exec app npm run db:seed

# 3. Kiểm tra trạng thái containers
docker compose ps
```

---

## 8. Chạy Bộ Kiểm thử Toàn diện (Automated Tests)

Chạy bộ kiểm thử tự động toàn diện kiểm tra 100% các tiêu chí bắt buộc theo đặc tả hệ thống:

```bash
npm run test
```

### Chi tiết các bộ test tự động:
1. **Bộ kiểm thử cốt lõi (`tests/run-all.ts`):**
   - Xác thực mật khẩu Bcrypt và ký/giải mã token JWT.
   - Phân quyền chặt chẽ trên API: Phục vụ không sửa được Menu (403), Bếp không xem được Báo cáo (403), Phục vụ không vào được Queue Bếp (403).
   - Phân loại trạng thái tồn kho: 0 (Hết hàng), 1-4 (Sắp hết), >=5 (Bình thường).
   - Tạo order theo bàn và chống tạo 2 order mở trên cùng một bàn.
   - Snapshot giá và tên món ăn: bảo toàn dữ liệu hóa đơn cũ khi Menu cập nhật giá mới.
   - Trừ kho nguyên tử khi gửi batch và Idempotency key chống trừ lặp khi retry.
   - Hủy món `SENT_TO_KITCHEN` trước khi bếp nấu: hoàn kho đúng một lần và ghi sổ cái `inventory_ledger`.
   - Chặn tuyệt đối không cho hủy món khi bếp đã chuyển sang `IN_PROGRESS` hoặc `READY`.
   - Hàng đợi bếp sắp xếp đúng theo `sent_at` tăng dần.
   - Cảnh báo quá 10 phút: tại đúng mốc 10 phút chưa cảnh báo, chỉ cảnh báo khi `now - sent_at > 10 phút`.
   - Chốt đơn mô phỏng: kiểm tra toàn bộ món đã READY và tự động giải phóng bàn về `AVAILABLE`.
   - Báo cáo doanh thu: chỉ tính các đơn hàng đã `CLOSED`.

2. **Bộ kiểm thử tương tranh & Idempotency (`tests/concurrency-api.test.ts`):**
   - Hai Waiter cùng gửi order trên một bàn đồng thời qua API: 1 Thành công (201), 1 Xung đột (409).
   - Hai Batch cùng tranh chấp trừ tồn kho qua API: Trừ kho nguyên tử an toàn, không bao giờ âm kho.
   - Thử lại (Retry) request qua API với Idempotency Key: Replay an toàn (200), không trừ kho 2 lần.
   - Hủy món đồng thời với Bếp chuyển sang `IN_PROGRESS`: Loại trừ lẫn nhau, không bao giờ hủy món đang nấu.

3. **Bộ kiểm thử thanh toán QR & xác nhận thủ công (`tests/payment-qr.test.ts`):**
   - **Test 1:** Order trả đúng số tiền server đã tính khi tạo QR.
   - **Test 2:** Nội dung chuyển khoản chứa đúng mã order (`THANHTOAN <orderCode>`).
   - **Test 3:** QR không tạo từ giá trị tiền do client gửi (chống gian lận giá).
   - **Test 4:** Nhân viên phục vụ (`waiter`) có thể xác nhận thanh toán thủ công.
   - **Test 5:** Nhân viên bếp (`kitchen`) không thể xác nhận thanh toán (bị chặn 403 Forbidden).
   - **Test 6:** Phục vụ / Quản lý có thể chốt đơn và giải phóng bàn sau khi đã xác nhận thanh toán.
   - **Test 7:** Hệ thống chặn tuyệt đối không cho chốt đơn nếu chưa xác nhận thanh toán (báo lỗi 400 `PAYMENT_NOT_CONFIRMED`).
   - **Test 8:** Retry xác nhận thanh toán không ghi nhận lặp (cơ chế Idempotency).
   - **Test 9:** Mã QR và thông tin chuyển khoản xuất hiện đầy đủ khi in hóa đơn (`@media print` và disclaimer bắt buộc).
   - **Test 10:** Thiếu cấu hình biến môi trường QR không làm trang hóa đơn bị lỗi (Graceful Fallback).

---

## 9. Hướng dẫn Triển khai lên AWS (EC2 + RDS + S3 + CloudWatch)

### Bước 1: Tạo VPC và Mạng Subnet
- Tạo 1 VPC `10.0.0.0/16`.
- **Public Subnet:** `10.0.1.0/24` (gắn Internet Gateway).
- **Private Subnet 1:** `10.0.10.0/24` (Availability Zone A).
- **Private Subnet 2:** `10.0.11.0/24` (Availability Zone B).
- Tạo **DB Subnet Group** gồm Private Subnet 1 và 2.

### Bước 2: Thiết lập Security Groups (Theo nguyên tắc quyền tối thiểu)
1. **Security Group App (EC2):**
   - Inbound: Cho phép TCP 443 (HTTPS) từ `0.0.0.0/0`.
   - Inbound: Cho phép TCP 80 (HTTP) từ `0.0.0.0/0` (dùng cho Certbot xác thực và chuyển hướng 301).
   - Inbound: Cho phép TCP 22 (SSH) chỉ từ IP quản trị cố định của bạn (hoặc dùng AWS Systems Manager Session Manager).
   - Outbound: All traffic.
2. **Security Group Database (RDS):**
   - Inbound: Cho phép TCP 5432 (PostgreSQL) **CHỈ TỪ Security Group App**.
   - Outbound: All traffic.
   - **Tắt hoàn toàn Public Access của RDS**.

### Bước 3: Tạo Amazon RDS for PostgreSQL
- Engine: PostgreSQL 16.
- Template: Free tier / Dev/Test (loại instance `db.t4g.micro` hoặc `db.t3.micro`).
- DB Subnet Group: Chọn Subnet Group đã tạo ở Bước 1.
- Public Access: **No**.
- Security Group: Chọn SG Database.
- Backup Retention: 7 ngày (Automated backups).

### Bước 4: Tạo Amazon S3 Private Bucket
- Tạo bucket: `smart-restaurant-media-private`.
- Bật tính năng **Block all public access** (100% private).
- Tạo IAM Role cho EC2 với quyền `s3:GetObject`, `s3:PutObject` trên bucket này.

### Bước 5: Cấu hình EC2 Instance & Chạy Ứng dụng
1. Khởi tạo EC2 Ubuntu 24.04 LTS (t3.micro) trong Public Subnet, gán Elastic IP.
2. Cài đặt Docker và Nginx:
   ```bash
   sudo apt update && sudo apt install -y docker.io docker-compose nginx certbot python3-certbot-nginx
   sudo systemctl enable docker nginx
   ```
3. Trỏ bản ghi DNS Domain `A record` về Elastic IP của EC2.
4. Cấp chứng chỉ SSL miễn phí bằng Let's Encrypt:
   ```bash
   sudo certbot --nginx -d your-domain.com -d www.your-domain.com
   # Kiểm tra tự động gia hạn chứng chỉ
   sudo certbot renew --dry-run
   ```
5. Clone mã nguồn, copy cấu hình Nginx:
   ```bash
   sudo cp nginx.conf /etc/nginx/nginx.conf
   sudo nginx -t && sudo systemctl reload nginx
   ```
6. Cấu hình file `.env` với URL kết nối RDS PostgreSQL và các biến thanh toán QR:
   ```env
   DATABASE_URL="postgresql://postgres:YOUR_RDS_PASSWORD@YOUR_RDS_ENDPOINT:5432/smart_restaurant?schema=public"
   JWT_SECRET="YOUR_STRONG_RANDOM_SECRET_KEY"
   NODE_ENV="production"
   PAYMENT_BANK_BIN=970436
   PAYMENT_BANK_NAME=Vietcombank
   PAYMENT_ACCOUNT_NUMBER=1234567890
   PAYMENT_ACCOUNT_NAME=NHA HANG SMART RESTAURANT
   PAYMENT_QR_ENABLED=true
   ```
7. Khởi động ứng dụng bằng Docker:
   ```bash
   docker build -t smart-restaurant-app .
   docker run -d --name smart-restaurant-app -p 3000:3000 --env-file .env --restart always smart-restaurant-app
   ```
8. Chạy seed dữ liệu:
   ```bash
   docker exec -it smart-restaurant-app npm run db:seed
   ```

---

## 10. Hướng dẫn Sao lưu & Khôi phục (Backup & Restore)

Hệ thống cung cấp sẵn các script tự động trong thư mục `scripts/`:

### Sao lưu (Backup):
- **Linux/EC2:**
  ```bash
  chmod +x scripts/backup.sh
  ./scripts/backup.sh
  ```
- **Windows PowerShell:**
  ```powershell
  .\scripts\backup.ps1
  ```

### Khôi phục (Restore):
- **Linux/EC2:**
  ```bash
  chmod +x scripts/restore.sh
  ./scripts/restore.sh backups/smart_restaurant_backup_YYYYMMDD_HHMMSS.sql.gz
  ```
- **Windows PowerShell:**
  ```powershell
  .\scripts\restore.ps1 -BackupFile backups\smart_restaurant_backup_YYYYMMDD_HHMMSS.sql
  ```

---

## 11. Kịch bản Diễn tập Demo Toàn diện (Bao gồm Thanh toán QR Thủ công)

1. **Bước 1 (Đăng nhập Phục vụ):** Truy cập `/login`, chọn tài khoản **waiter**. Chứng minh tài khoản không thấy các tab quản trị menu/báo cáo của Quản lý.
2. **Bước 2 (Mở đơn theo bàn):** Vào `/tables`, chọn Bàn 01 (Trống). Chọn các món còn hàng trên thực đơn (ví dụ: Bò Wagyu, Súp bào ngư). Nhấn **Gửi vào bếp ngay**.
3. **Bước 3 (Gửi bếp & Trừ kho):** Server thực thi transaction trừ kho nguyên tử, ghi sổ cái `inventory_ledger` và tạo `kitchen_batch`.
4. **Bước 4 (Đăng nhập Bếp):** Mở cửa sổ trình duyệt khác hoặc đăng nhập tài khoản **kitchen**. Vào `/kitchen/queue`. Xác nhận batch mới xuất hiện, sắp xếp theo `sent_at`.
5. **Bước 5 (Cảnh báo quá 10 phút):** Quan sát batch có thời gian gửi > 10 phút hiển thị viền đỏ cảnh báo và nhãn cảnh báo trên từng món.
6. **Bước 6 (Bếp cập nhật món):** Bấm **Bắt đầu làm** (`IN_PROGRESS`), sau đó bấm **Sẵn sàng phục vụ** (`READY`).
7. **Bước 7 (Hóa đơn & Quét mã QR VietQR):**
   - Quay lại màn hình của **waiter**, mở `/orders/[id]/invoice`.
   - Quan sát khu vực **"Thanh toán chuyển khoản"**:
     - Mã QR VietQR kích thước lớn, sắc nét, có thể quét trực tiếp bằng camera điện thoại hoặc ứng dụng ngân hàng.
     - Thông tin ngân hàng: Ngân hàng Vietcombank, Số tài khoản, Chủ tài khoản, Số tiền cần chuyển (tính từ server snapshot).
     - Nội dung chuyển khoản theo đúng mã đơn hàng, ví dụ: `THANHTOAN ORD-xxxx`.
     - Bấm thử các nút **"Sao chép"** số tài khoản và nội dung chuyển khoản (hiển thị trạng thái "Đã chép").
     - Quan sát huy hiệu trạng thái: **"Chờ xác nhận chuyển khoản"** (màu vàng cam).
     - Quan sát dòng cảnh báo bắt buộc: *"Hệ thống chưa tự động xác nhận giao dịch. Nhân viên phục vụ cần kiểm tra giao dịch trước khi chốt đơn."*
8. **Bước 8 (Xác nhận nhận chuyển khoản thủ công):**
   - Nếu cố bấm chốt đơn khi chưa xác nhận, hệ thống từ chối cho phép chốt.
   - Waiter kiểm tra biến động số dư và nhấn nút **"Đã kiểm tra và nhận chuyển khoản"**.
   - Trạng thái chuyển sang huy hiệu màu xanh: **"Đã xác nhận chuyển khoản"** (kèm tên người xác nhận và thời gian).
9. **Bước 9 (Chốt đơn mô phỏng & In hóa đơn):**
   - Nhấn **"Xác nhận chốt đơn mô phỏng"**. Bàn 01 tự động chuyển về trạng thái Trống (`AVAILABLE`).
   - Bấm nút **"In hóa đơn"**: Mở hộp thoại in trình duyệt, kiểm tra bản in chuẩn CSS `@media print` — mã QR và thông tin chuyển khoản xuất hiện đầy đủ, các nút bấm thao tác và navbar được ẩn, hiển thị dòng cam kết: *"Hóa đơn mô phỏng – không thực hiện thanh toán tự động."*
10. **Bước 10 (Đăng nhập Quản lý & Audit Log):** Đăng nhập tài khoản **manager**. Mở `/reports` xem tổng doanh thu các đơn đã chốt và danh sách món bán chạy. Mở `/admin/audit-log` xem lịch sử toàn bộ các bước vừa thực hiện (bao gồm hành động `CONFIRM_PAYMENT` và `CLOSE_ORDER`).

---

## 12. Checklist Dọn dẹp Tài nguyên Cloud (Cleanup) Sau Demo

Để tránh phát sinh chi phí ngoài ý muốn sau khi hoàn thành buổi bảo vệ / demo:
- [ ] Dừng hoặc Xóa EC2 Instance (`Terminate instance`).
- [ ] Xóa Elastic IP đã gán cho EC2 (Elastic IP không gắn vào máy đang chạy sẽ bị tính phí).
- [ ] Tạo snapshot cuối cùng của cơ sở dữ liệu nếu cần lưu trữ, sau đó Xóa Amazon RDS Instance (`Delete database`, bỏ chọn `Retain automated backups`).
- [ ] Làm rỗng và Xóa Amazon S3 Bucket ảnh (`Empty bucket` -> `Delete bucket`).
- [ ] Xóa Log Group trong Amazon CloudWatch Logs (`/aws/ec2/smart-restaurant-app`).
- [ ] Kiểm tra lại mục **AWS Cost Explorer** và **Bills** để đảm bảo không còn tài nguyên nào tiếp tục phát sinh chi phí.
