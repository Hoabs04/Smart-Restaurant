# 🍽️ Hệ thống Quản lý Nhà hàng Thông minh (Smart Restaurant Management)

> **Đề tài:** Nghiên cứu và triển khai Hệ thống Quản lý Nhà hàng Thông minh trên Nền tảng Điện toán Đám mây Amazon Web Services (AWS)  
> **Kiến trúc:** Modular Monolith, Tablet-first Responsive, Micro-Automation theo quy tắc nghiệp vụ, Đa kênh bán hàng trực tuyến (GrabFood, ShopeeFood, BeFood)  
> **Cơ sở dữ liệu:** PostgreSQL 16 / Amazon RDS for PostgreSQL / PGlite Embedded Engine (Zero-Config Local)  
> **Đám mây AWS:** EC2, Nginx, HTTPS TLS Let's Encrypt, RDS Private Multi-AZ, S3 Private Bucket, CloudWatch Logging  

[![Next.js 15](https://img.shields.io/badge/Next.js-15.5-black?style=flat&logo=next.js)](https://nextjs.org/)
[![React 19](https://img.shields.io/badge/React-19.0-blue?style=flat&logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?style=flat&logo=typescript)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16.0-336791?style=flat&logo=postgresql)](https://www.postgresql.org/)
[![Tailwind CSS](https://img.shields.io/badge/TailwindCSS-3.4-38B2AC?style=flat&logo=tailwind-css)](https://tailwindcss.com/)
[![AWS Architecture](https://img.shields.io/badge/AWS-EC2%20%7C%20RDS%20%7C%20S3%20%7C%20CloudWatch-FF9900?style=flat&logo=amazon-aws)](https://aws.amazon.com/)
[![Test Suite](https://img.shields.io/badge/Tests-11%2F11%20Suites%20Passed%20(100%25)-brightgreen?style=flat&logo=jest)]()

---

## 📑 Mục lục
1. [Tổng quan & Mục tiêu Đề tài](#1-tổng-quan--mục-tiêu-đề-tài)
2. [Kiến trúc Hệ thống & Hạ tầng AWS](#2-kiến-trúc-hệ-thống--hạ-tầng-aws)
3. [Các Phân hệ Tính năng Nổi bật](#3-các-phân-hệ-tính-năng-nổi-bật)
   - [3.1. Sơ đồ Bàn ăn & Gọi món Tại Bàn (Tablet-First Dine-In)](#31-sơ-đồ-bàn-ăn--gọi-món-tại-bàn-tablet-first-dine-in)
   - [3.2. Hàng đợi Bếp & Chế biến Thông minh (Kitchen Queue)](#32-hàng-đợi-bếp--chế-biến-thông-minh-kitchen-queue)
   - [3.3. Tích hợp Đa Kênh Giao Hàng Trực Tuyến (GrabFood, ShopeeFood, BeFood)](#33-tích-hợp-đa-kênh-giao-hàng-trực-tuyến-grabfood-shopeefood-befood)
   - [3.4. Cổng Theo dõi Đơn hàng Thời gian thực cho Khách (Guest Live Tracker & QR Bàn)](#34-cổng-theo-dõi-đơn-hàng-thời-gian-thực-cho-khách-guest-live-tracker--qr-bàn)
   - [3.5. Thanh toán Chuyển khoản VietQR Thủ công & In Hóa đơn](#35-thanh-toán-chuyển-khoản-vietqr-thủ-công--in-hóa-đơn)
   - [3.6. Quản trị Nhà hàng, Thực đơn, Nhân sự & Báo cáo Doanh thu](#36-quản-trị-nhà-hàng-thực-đơn-nhân-sự--báo-cáo-doanh-thu)
4. [Bảo mật, Mã hóa & Tính Toàn vẹn Dữ liệu](#4-bảo-mật-mã-hóa--tính-toàn-vẹn-dữ-liệu)
5. [Tài khoản Mẫu & Phân quyền (RBAC)](#5-tài-khoản-mẫu--phân-quyền-rbac)
6. [Danh sách Route Giao diện & API Endpoints](#6-danh-sách-route-giao-diện--api-endpoints)
7. [Hướng dẫn Khởi chạy Cục bộ (Local Quickstart)](#7-hướng-dẫn-khởi-chạy-cục-bộ-local-quickstart)
8. [Bộ Kiểm thử Tự động Toàn diện (11 Test Suites)](#8-bộ-kiểm-thử-tự-động-toàn-diện-11-test-suites)
9. [Hướng dẫn Triển khai Production trên AWS](#9-hướng-dẫn-triển-khai-production-trên-aws)
10. [Sao lưu & Phục hồi CSDL (Backup & Restore)](#10-sao-lưu--phục-hồi-csdl-backup--restore)
11. [Kịch bản Diễn tập Demo Mẫu](#11-kịch-bản-diễn-tập-demo-mẫu)

---

## 1. Tổng quan & Mục tiêu Đề tài

Hệ thống Quản lý Nhà hàng Thông minh (**Smart Restaurant Management System**) là giải pháp phần mềm toàn diện, đáp ứng nhu cầu số hóa khép kín quy trình phục vụ từ nhà hàng truyền thống đến mô hình ẩm thực hiện đại kết hợp giao đồ ăn trực tuyến (Omnichannel F&B).

### Các nguyên tắc thiết kế then chốt:
- **Tablet-First UX:** Tối ưu hóa tuyệt đối cho thiết bị máy tính bảng của nhân viên phục vụ và màn hình hiển thị tại bếp (vùng chạm cảm ứng ≥ 44×44px, độ tương phản cao, giao diện Dark Mode sang trọng với điểm nhấn vàng hoàng gia Amber và hiệu ứng Glassmorphism).
- **Quy tắc Nghiệp vụ Thông minh (Business Rules Automation):** Không sử dụng AI giả lập thiếu ổn định. Mọi logic tự động hóa (cảnh báo chậm trễ bếp >10 phút, cảnh báo tồn kho sắp hết, tự động đóng đơn, tự động đồng bộ tồn kho sang sàn giao hàng) đều hoạt động dựa trên máy trạng thái hữu hạn (State Machine) và ràng buộc toàn vẹn cơ sở dữ liệu.
- **Toàn vẹn Giao dịch & Chống Xung đột (ACID & Idempotency):** Áp dụng khóa bi quan (`FOR UPDATE`), khóa lạc quan (`version`), trừ tồn kho nguyên tử qua Sổ cái Kho (`inventory_ledger`), và cơ chế Idempotency Key bảo vệ 100% request không bị nhân bản dữ liệu hay trừ kho lặp.

---

## 2. Kiến trúc Hệ thống & Hạ tầng AWS

Ứng dụng được đóng gói theo mô hình **Next.js Standalone Modular Monolith**, triển khai an toàn trong **Amazon Virtual Private Cloud (VPC)** với phân tách ranh giới mạng nghiêm ngặt:

```text
 ┌────────────────────────────────────────────────────────────────────────┐
 │                    NGƯỜI DÙNG & CÁC KÊNH BÁN HÀNG                      │
 │  ┌─────────────────────────┐  ┌────────────────┐  ┌─────────────────┐  │
 │  │ Khách hàng quét QR Bàn  │  │ Máy tính bảng  │  │ Grab / Shopee / │  │
 │  │ / Track đơn trực tiếp   │  │ Phục vụ & Bếp  │  │ BeFood Webhooks │  │
 │  └────────────┬────────────┘  └───────┬────────┘  └────────┬────────┘  │
 └───────────────┼───────────────────────┼────────────────────┼───────────┘
                 │                       │                    │
                 │ HTTPS (Port 443 TLS)  │                    │
                 ▼                       ▼                    ▼
 ┌────────────────────────────────────────────────────────────────────────┐
 │ AMAZON VPC (10.0.0.0/16)                                               │
 │                                                                        │
 │  ┌──────────────────────────────────────────────────────────────────┐  │
 │  │ Public Subnet (10.0.1.0/24 - Internet Gateway)                   │  │
 │  │  Security Group EC2: Chỉ mở Inbound TCP 443 & TCP 80             │  │
 │  │                                                                  │  │
 │  │  ┌────────────────────────────────────────────────────────────┐  │  │
 │  │  │ Amazon EC2 Instance (t3.micro / Ubuntu 24.04 LTS)          │  │  │
 │  │  │  ├── Nginx Reverse Proxy (SSL Let's Encrypt TLS 1.3)       │  │  │
 │  │  │  │    └── Certbot Auto-Renewal (Cron/Systemd)              │  │  │
 │  │  │  └── Docker Container (Next.js Standalone Monolith)        │  │  │
 │  │  │       ├── Frontend App Router (SSR + Client Hydration)     │  │  │
 │  │  │       ├── Backend RESTful APIs (RBAC + Cryptography)       │  │  │
 │  │  │       └── Omnichannel Integration Engine                   │  │  │
 │  │  └─────────────────────────────┬──────────────────────────────┘  │  │
 │  └────────────────────────────────┼─────────────────────────────────┘  │
 │                                   │                                    │
 │       TCP 5432 Nội bộ             │ IAM Role (Least Privilege)         │
 │       (Chỉ cấp phép từ EC2 App SG)│                                    │
 │       ▼                           ▼                                    │
 │  ┌────────────────────────────────────┐    ┌────────────────────────┐  │
 │  │ Private DB Subnets (Multi-AZ)      │    │ Amazon S3 Bucket       │  │
 │  │                                    │    │ (100% Private, Block   │  │
 │  │   Amazon RDS for PostgreSQL 16     │    │ Public Access)         │  │
 │  │   - Automated Backups & Snapshots  │    │ Lưu trữ Media Thực đơn │  │
 │  │   - Multi-AZ High Availability     │    └────────────────────────┘  │
 │  └────────────────────────────────────┘    ┌────────────────────────┐  │
 │                                            │ Amazon CloudWatch      │  │
 │  Giám sát & Structured Logs JSON ─────────►│ - Logs Stream          │  │
 │                                            │ - Alarms & Metrics     │  │
 │                                            └────────────────────────┘  │
 └────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Các Phân hệ Tính năng Nổi bật

### 3.1. Sơ đồ Bàn ăn & Gọi món Tại Bàn (Tablet-First Dine-In)
- **Sơ đồ bàn trực quan (`/tables`):** Hiển thị danh sách bàn theo từng khu vực (Khu Trong Nhà, Khu Sân Vườn, Phòng VIP).
- **Trạng thái bàn tự động:** `AVAILABLE` (Bàn trống), `OCCUPIED` (Đang phục vụ), `WAITING_PAYMENT` (Chờ thanh toán).
- **Chống mở trùng đơn:** Ràng buộc chặt chẽ đảm bảo một bàn chỉ có duy nhất **01 đơn hàng mở** tại một thời điểm (HTTP 409 Conflict nếu cố mở trùng).
- **Gọi món & Tạo Batch (`/orders/new`):**
  - Danh mục món ăn phân cấp, bộ lọc nhanh và tìm kiếm trực tiếp.
  - Snapshot giá (`unit_price_snapshot`) và tên món (`item_name_snapshot`) ngay tại thời điểm gọi, bảo vệ quyền lợi hóa đơn cũ kể cả khi thực đơn thay đổi giá niêm yết.
  - Gửi món theo từng đợt (Batch #1, Batch #2...) kèm `idempotency_key` chống trừ lặp kho.

### 3.2. Hàng đợi Bếp & Chế biến Thông minh (Kitchen Queue)
- **Hàng đợi thời gian thực (`/kitchen/queue`):** Tự động polling và cập nhật đợt gửi bếp mới nhất.
- **Ưu tiên thời gian gửi (`sent_at` tăng dần):** Đợt món gửi trước luôn đứng đầu hàng đợi, đảm bảo công bằng cho khách đợi lâu hơn.
- **Cảnh báo trễ > 10 phút:** Tự động viền đỏ nhấp nháy và hiển thị nhãn cảnh báo trên món và batch khi thời gian chờ vượt ngưỡng 10 phút (`isOverdueWarning`).
- **Máy trạng thái chế biến (Item State Machine):**
  - Chuyển tiếp hợp lệ: `SENT_TO_KITCHEN` ➔ `IN_PROGRESS` ➔ `READY`.
  - Nghiêm cấm hủy món khi bếp đã bấm `IN_PROGRESS` hoặc `READY`.
  - Hủy món khi đang ở `SENT_TO_KITCHEN` yêu cầu nhập lý do bắt buộc và tự động hoàn kho nguyên tử 1 lần duy nhất vào sổ cái.

### 3.3. Tích hợp Đa Kênh Giao Hàng Trực Tuyến (GrabFood, ShopeeFood, BeFood)
- **Trung tâm Quản trị Kênh Bán Hàng (`/admin/channels`):**
  - Quản lý cấu hình API & kết nối cho **GrabFood**, **ShopeeFood**, **BeFood**, và **Mock Sandbox**.
  - Kiểm tra kết nối API tức thì (**Test Connection**) với cơ chế tự động Fallback Sandbox an toàn.
  - Bật / tắt chế độ **Tự động nhận đơn (Auto-confirm)**: khi bật, đơn hàng từ sàn tự động tiếp nhận và chuyển thẳng vào Queue Bếp.
  - Báo cáo tài chính chuyên sâu từng sàn: Tổng doanh số, Tỷ lệ hoa hồng (% Commission), Phí sàn (Platform Fee), và **Doanh thu thực nhận (Net Revenue = Total - Fee)**.
  - Xuất báo cáo doanh thu kênh ra định dạng CSV phục vụ kế toán đối soát.
- **Quy đổi món ăn thông minh (Menu Mapping):**
  - Ánh xạ mã món trên sàn (`external_item_id`) với món ăn nội bộ nhà hàng (`internal_menu_item_id`).
  - Đồng bộ trạng thái hết hàng / tồn kho hai chiều sang các sàn khi món ăn nội bộ hết hàng.
- **Tiếp nhận Webhook & Đồng bộ Trạng thái 2 Chiều:**
  - Xác thực chữ ký điện tử HMAC-SHA256 và chống tấn công phát lại (Replay Attack) dựa trên timestamp.
  - Khi đầu bếp báo nấu xong (`READY`), hệ thống tự động đồng bộ trạng thái sẵn sàng sang GrabFood / ShopeeFood để điều phối tài xế tới lấy hàng.
- **Công cụ Giả lập Nhận Đơn (Simulation Modal):**
  - Cho phép người quản trị mô phỏng gửi đơn thử nghiệm từ bất kỳ sàn nào với tên khách, danh sách món và số tiền tùy ý. Tự động kiểm tra tính tương thích và quy đổi món mượt mà.

### 3.4. Cổng Theo dõi Đơn hàng Thời gian thực cho Khách (Guest Live Tracker & QR Bàn)
- **Tra cứu qua mã đơn (`/track/[orderCode]`):**
  - Khách hàng có thể nhập mã đơn hàng (hoặc nhấp link từ SMS/QR) để theo dõi tiến trình chế biến món ăn mà không cần đăng nhập.
  - Thanh tiến trình trực quan 4 bước: **Đã nhận đơn ➔ Bếp đang nấu ➔ Món ăn sẵn sàng ➔ Hoàn tất**.
  - Thẻ tóm tắt thông tin hóa đơn và các món đang chế biến.
- **Mã QR Đặt Bàn Thông minh (`/track/table/[code]`):**
  - Mỗi bàn ăn trong hệ thống đều có thể sinh mã QR định danh riêng (`TableQrModal`).
  - Khách quét mã QR tại bàn sẽ được dẫn trực tiếp đến trang theo dõi đơn đang mở của bàn đó.
  - Nếu bàn trống, hệ thống hiển thị thông điệp chào đón và mời khách gọi nhân viên phục vụ mở bàn.

### 3.5. Thanh toán Chuyển khoản VietQR Thủ công & In Hóa đơn
- **Hóa đơn điện tử chuyên nghiệp (`/orders/[id]/invoice`):**
  - Tự động sinh mã VietQR chuẩn Napas với số tài khoản, tên ngân hàng và số tiền chính xác do Server tính toán từ CSDL.
  - Cú pháp chuyển khoản định dạng chuẩn: `THANHTOAN ORD-xxxx`.
  - Hỗ trợ nút sao chép nhanh số tài khoản và nội dung chuyển khoản một chạm.
- **Quy trình Xác nhận Thủ công An toàn:**
  - Nhân viên phục vụ / Quản lý kiểm tra biến động số dư tài khoản thực tế và bấm nút **"Đã kiểm tra và nhận chuyển khoản"** (`MANUALLY_CONFIRMED`).
  - Hệ thống chặn tuyệt đối không cho chốt đơn nếu chưa được xác nhận thanh toán (HTTP 400 `PAYMENT_NOT_CONFIRMED`).
- **Tối ưu In ấn (@media print):**
  - Giao diện hóa đơn tự động ẩn thanh điều hướng, nút bấm thao tác khi in ấn.
  - Hiển thị đầy đủ mã QR và dòng cam kết: *"Hóa đơn mô phỏng – không thực hiện thanh toán tự động."*

### 3.6. Quản trị Nhà hàng, Thực đơn, Nhân sự & Báo cáo Doanh thu
- **Quản lý Thực đơn (`/admin/menu`):** Thêm, sửa, xóa món ăn, cập nhật giá bán, số lượng tồn kho `stock_quantity`, ngưỡng cảnh báo `low_stock_threshold`, và upload ảnh món.
- **Quản lý Bàn ăn (`/admin/tables`):** Quản lý mã bàn, khu vực và sức chứa.
- **Quản lý Nhân sự & Vòng đời Tài khoản (`/admin/users`):**
  - Thêm tài khoản mới, phân vai trò (`manager`, `waiter`, `kitchen`).
  - Cơ chế **Xóa tài khoản an toàn**: Tự động Soft Delete (vô hiệu hóa) nếu nhân viên đã từng tạo đơn/ghi audit log để bảo toàn dữ liệu lịch sử; Hard Delete nếu tài khoản mới chưa có ràng buộc CSDL.
- **Báo cáo Doanh thu & Thống kê (`/reports`):**
  - Chỉ ghi nhận doanh thu từ các đơn hàng đã đóng (`CLOSED`).
  - Thống kê tổng doanh thu, số đơn đã chốt, top món bán chạy theo số lượng, lọc theo mốc thời gian linh hoạt (Hôm nay, 7 ngày qua, Tháng này, Tùy chỉnh).
- **Nhật ký Kiểm toán Toàn diện (`/admin/audit-log`):**
  - Ghi nhận chi tiết mọi thao tác nhạy cảm: Đăng nhập, Tạo đơn, Gửi bếp, Hủy món, Đổi trạng thái bếp, Xác nhận thanh toán, Chốt đơn, Cập nhật thực đơn, Xóa nhân viên, Cập nhật kênh bán hàng.
  - Lưu trữ định danh người thực hiện (`actor_id`), IP máy trạm, thời gian và dữ liệu chi tiết dạng JSON.

---

## 4. Bảo mật, Mã hóa & Tính Toàn vẹn Dữ liệu

| Hạng mục | Cơ chế Bảo mật & Kỹ thuật Áp dụng |
| :--- | :--- |
| **Mật khẩu người dùng** | Mã hóa 1 chiều bằng thuật toán **Bcrypt** với Salt Rounds = 10. |
| **Phiên làm việc (Session)** | Token **JWT (HS256)** lưu trữ trong Cookie `HttpOnly`, `SameSite=Lax`, cờ `Secure` tự động kích hoạt trên HTTPS. |
| **Cấu hình Kênh Bán Hàng** | Toàn bộ App Secret, Webhook Secret của GrabFood, ShopeeFood được mã hóa đối xứng **AES-256-GCM** trước khi lưu vào CSDL. |
| **Toàn vẹn Tồn kho** | Sử dụng bảng Sổ cái Kho (`inventory_ledger`) ghi nhận mọi biến động xuất/nhập/hoàn, kết hợp khóa bản ghi `FOR UPDATE` trong giao dịch ACID. |
| **Chống Nhân bản Yêu cầu** | Mọi API gửi bếp, tạo đơn, xác nhận thanh toán, nhận đơn sàn đều yêu cầu `idempotency_key` duy nhất. |
| **Bảo vệ Rò rỉ Dữ liệu** | Số điện thoại khách hàng được tự động che (Masking dạng `091****678`) trên giao diện công cộng và nhật ký log. |
| **Sản xuất Fail-Fast** | Trên môi trường Production (`NODE_ENV=production`), ứng dụng nghiêm cấm fallback sang CSDL cục bộ nhúng; bắt buộc kết nối đúng cụm PostgreSQL server. |

---

## 5. Tài khoản Mẫu & Phân quyền (RBAC)

Dữ liệu khởi tạo sẵn cho phép đăng nhập thử nghiệm ngay tại trang `/login`:

| Vai trò | Tên đăng nhập | Mật khẩu mẫu | Tên hiển thị | Quyền hạn chính |
| :--- | :--- | :--- | :--- | :--- |
| **Quản lý** (`manager`) | `manager` | `Restaurant@2026` | Nguyễn Văn Quản Lý | Toàn quyền cấu hình bàn, thực đơn, nhân sự, kênh bán hàng, xem báo cáo tài chính và audit log. |
| **Phục vụ** (`waiter`) | `waiter` | `Restaurant@2026` | Trần Thị Phục Vụ | Xem sơ đồ bàn, mở đơn, gọi món, gửi bếp, xem hóa đơn VietQR, xác nhận chuyển khoản và chốt đơn. |
| **Bếp** (`kitchen`) | `kitchen` | `Restaurant@2026` | Lê Văn Đầu Bếp | Theo dõi hàng đợi bếp (Queue), cập nhật tiến độ chế biến từng món ăn (`IN_PROGRESS`, `READY`). |

---

## 6. Danh sách Route Giao diện & API Endpoints

### 6.1. Các Trang Giao diện Chính (Frontend Routes)
- `/`: Trang chủ sang trọng với banner món ăn đặc sắc (`DishBannerCarousel`), thanh tin tức chạy tự động (`Marquee`) và bảng điều hướng phân hệ nhanh.
- `/login`: Màn hình đăng nhập tài khoản nhân viên kèm nút chọn nhanh tài khoản demo.
- `/tables`: Sơ đồ bàn ăn trực quan theo từng phân khu.
- `/orders/new`: Giao diện gọi món tại bàn tối ưu cảm ứng máy tính bảng.
- `/orders/[id]`: Chi tiết đơn hàng nội bộ, danh sách món theo đợt gửi và hủy món.
- `/orders/[id]/invoice`: Hóa đơn điện tử, hiển thị mã VietQR thanh toán và chế độ in ấn.
- `/kitchen/queue`: Màn hình điều phối chế biến tại bếp với đồng hồ đếm giờ và cảnh báo trễ.
- `/track/[orderCode]`: Cổng tra cứu tiến độ đơn hàng trực tiếp cho khách hàng.
- `/track/table/[code]`: Cổng tra cứu đơn theo mã bàn quét qua QR.
- `/reports`: Trung tâm báo cáo doanh thu, sản lượng và phân tích kinh doanh.
- `/admin/channels`: Bảng điều khiển tích hợp đa kênh bán hàng trực tuyến (GrabFood, ShopeeFood, BeFood).
- `/admin/channels/[channelCode]`: Chi tiết cấu hình kết nối, quy đổi món ăn và lịch sử đồng bộ của từng sàn.
- `/admin/menu`: Quản lý danh mục và thực đơn món ăn.
- `/admin/tables`: Quản lý danh sách bàn ăn và sức chứa.
- `/admin/users`: Quản lý danh sách tài khoản nhân viên và phân quyền RBAC.
- `/admin/audit-log`: Lịch sử kiểm toán nhật ký thao tác hệ thống.

### 6.2. Các Nhóm API Endpoints Nòng cốt (Backend APIs)
- `POST /api/auth/login` | `POST /api/auth/logout` | `GET /api/auth/me`: Xác thực và cấp phiên người dùng.
- `GET /api/tables`: Danh sách bàn và trạng thái phục vụ thời gian thực.
- `GET /api/menu`: Danh sách thực đơn, giá bán và trạng thái tồn kho.
- `GET|POST /api/orders`: Danh sách và khởi tạo đơn hàng mới.
- `POST /api/orders/[id]/send-to-kitchen`: Gửi batch món ăn vào bếp kèm trừ kho nguyên tử.
- `PATCH /api/order-items/[id]/status`: Bếp cập nhật trạng thái chế biến món ăn.
- `POST /api/order-items/[id]/cancel`: Hủy món ăn kèm hoàn kho an toàn.
- `POST /api/orders/[id]/confirm-payment`: Phục vụ / Quản lý xác nhận thanh toán thủ công.
- `POST /api/orders/[id]/close`: Chốt đơn mô phỏng và giải phóng bàn ăn.
- `GET /api/kitchen/queue`: Danh sách hàng đợi chế biến của bếp theo thứ tự gửi tăng dần.
- `GET /api/guest/track`: API mở tra cứu tiến độ món ăn cho khách qua mã đơn hoặc mã bàn.
- `GET|PUT /api/admin/channels`: Quản lý danh sách và trạng thái kênh bán hàng.
- `POST /api/admin/channels/[channelCode]/test`: Kiểm tra kết nối API tới sàn giao hàng.
- `POST /api/admin/channels/[channelCode]/orders`: Ingest đơn hàng trực tuyến hoặc đơn mô phỏng.
- `POST /api/admin/channels/[channelCode]/orders/[orderId]/push-kitchen`: Đẩy đơn hàng sàn vào hàng đợi bếp.
- `GET|POST|PUT|DELETE /api/admin/channels/[channelCode]/mappings`: Cấu hình quy đổi món ăn giữa sàn và nội bộ.
- `POST /api/webhooks/channels/[channelCode]`: Tiếp nhận Webhook đơn hàng từ GrabFood/ShopeeFood.
- `GET /api/reports/revenue`: Báo cáo doanh thu chi tiết các đơn hàng đã đóng.

---

## 7. Hướng dẫn Khởi chạy Cục bộ (Local Quickstart)

### Cách 1: Khởi chạy trực tiếp (Zero-Config Khuyên dùng)
Hệ thống tích hợp sẵn engine CSDL PostgreSQL v16 nhúng độc lập (`PGlite`) lưu trữ persistent tại `.db_pglite`, cho phép bạn chạy ngay mà **không cần cài đặt phần mềm máy chủ PostgreSQL bên ngoài**:

```bash
# 1. Cài đặt các thư viện phụ thuộc
npm install

# 2. Khởi tạo cấu trúc bảng và nạp dữ liệu mẫu cho 3 vai trò
npm run db:seed

# 3. Khởi chạy máy chủ phát triển
npm run dev
```

Truy cập ứng dụng tại: `http://localhost:3000` (hoặc qua địa chỉ IP mạng nội bộ hiển thị trên terminal).

---

### Cách 2: Khởi chạy bằng Docker Compose (PostgreSQL 16 Server + Web App)

```bash
# 1. Khởi động các container PostgreSQL 16 và Web Application
docker compose up -d --build

# 2. Nạp dữ liệu mẫu ban đầu
docker compose exec app npm run db:seed

# 3. Kiểm tra trạng thái hoạt động của hệ thống
docker compose ps
```

---

## 8. Bộ Kiểm thử Tự động Toàn diện (11 Test Suites)

Hệ thống được trang bị bộ kiểm thử tự động toàn diện gồm **11 Test Suites** độc lập, sử dụng cơ chế cách ly CSDL (`.db_pglite_test`) để không làm ảnh hưởng đến dữ liệu đang chạy:

```bash
npm test
```

### Danh sách 11 Bộ Test Tự động:
1. `tests/run-all.ts`: Kiểm thử cốt lõi (Xác thực Bcrypt/JWT, Phân quyền RBAC, Quy tắc tồn kho, Tạo order, Snapshot giá, Trừ kho nguyên tử, Hủy món hoàn kho, State machine bếp, Cảnh báo trễ >10 phút, Chốt đơn giải phóng bàn, Báo cáo doanh thu).
2. `tests/concurrency-api.test.ts`: Kiểm thử xử lý tương tranh cao qua HTTP API (Hai waiter mở cùng 1 bàn, tranh chấp trừ kho cùng lúc, Replay idempotent, Hủy món đua lệnh với Bếp).
3. `tests/payment-qr.test.ts`: Kiểm thử thanh toán QR VietQR và quy trình nhân viên xác nhận chuyển khoản thủ công.
4. `tests/guest-tracking.test.ts`: Kiểm thử cổng tra cứu tiến độ đơn hàng cho khách và quét mã QR theo bàn.
5. `tests/high-priority-fixes.test.ts`: Kiểm thử các cải tiến kiến trúc (Next.js Standalone build, Dockerignore cách ly, cờ Production Fail-Fast).
6. `tests/admin-delete-user.test.ts`: Kiểm thử an toàn vòng đời tài khoản nhân viên (Soft Delete vs Hard Delete).
7. `tests/admin-menu.test.ts`: Kiểm thử quản trị danh mục, cập nhật giá và kiểm toán thay đổi thực đơn.
8. `tests/sales-channels.test.ts`: Kiểm thử nền tảng kênh bán hàng (GrabFood, ShopeeFood, BeFood, Mã hóa AES-256-GCM credentials).
9. `tests/sales-channels-phase2.test.ts`: Kiểm thử quy đổi món ăn (Menu mapping), Ingest đơn sàn, Đồng bộ trạng thái 2 chiều, Tính hoa hồng và doanh thu thuần.
10. `tests/sales-channels-phase3.test.ts`: Kiểm thử tính năng nâng cao (Đẩy đơn sàn vào bếp, Đồng bộ hết hàng tự động sang sàn, Báo cáo tài chính kênh, Xuất CSV).
11. `tests/sales-channels-reliability.test.ts`: Kiểm thử độ tin cậy và phòng thủ bảo mật (Chữ ký HMAC fail-closed, Replay attack timestamp, Webhook hủy đơn hoàn kho 1 lần, Chống trùng `orders_order_code_key`, OAuth production fail-closed).

---

## 9. Hướng dẫn Triển khai Production trên AWS

### Bước 1: Khởi tạo Amazon VPC & Mạng Subnet
- Tạo VPC dải mạng `10.0.0.0/16`.
- **Public Subnet:** `10.0.1.0/24` (gắn Internet Gateway).
- **Private Subnets:** `10.0.10.0/24` (AZ-a) và `10.0.11.0/24` (AZ-b) dành cho Cơ sở dữ liệu.
- Tạo **DB Subnet Group** liên kết 2 Private Subnet trên.

### Bước 2: Cấu hình Security Groups theo nguyên tắc Quyền tối thiểu (Least Privilege)
1. **Security Group App (EC2):**
   - Inbound: Cho phép TCP 443 (HTTPS) và TCP 80 (HTTP redirect/Certbot) từ `0.0.0.0/0`.
   - Inbound: Cho phép TCP 22 (SSH) chỉ từ IP quản trị viên cố định.
2. **Security Group Database (RDS):**
   - Inbound: Cho phép TCP 5432 (PostgreSQL) **CHỈ DUY NHẤT** từ Security Group App.
   - Tắt hoàn toàn Public Access của RDS.

### Bước 3: Tạo Amazon RDS for PostgreSQL 16
- Instance Type: `db.t4g.micro` hoặc `db.t3.micro` (tối ưu chi phí).
- Gán DB Subnet Group và SG Database đã tạo ở trên.
- Kích hoạt Automated Backups với thời gian lưu trữ tối thiểu 7 ngày.

### Bước 4: Tạo Amazon S3 Private Bucket & CloudWatch
- Tạo S3 Bucket: `smart-restaurant-media-private` (kích hoạt **Block All Public Access**).
- Tạo IAM Role gắn vào EC2 với chính sách cấp quyền đọc/ghi ảnh món ăn.
- Tạo Log Group `/aws/ec2/smart-restaurant-app` trên CloudWatch Logs.

### Bước 5: Cấu hình EC2 Instance & Chạy Ứng dụng
```bash
# 1. Cập nhật hệ thống và cài đặt Docker, Nginx, Certbot
sudo apt update && sudo apt install -y docker.io docker-compose nginx certbot python3-certbot-nginx
sudo systemctl enable docker nginx

# 2. Cấp chứng chỉ SSL Let's Encrypt cho tên miền của bạn
sudo certbot --nginx -d your-domain.com

# 3. Sao chép cấu hình Nginx Reverse Proxy
sudo cp nginx.conf /etc/nginx/nginx.conf
sudo nginx -t && sudo systemctl reload nginx

# 4. Cấu hình biến môi trường production trong .env
cat <<EOF > .env
NODE_ENV=production
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@YOUR_RDS_ENDPOINT:5432/smart_restaurant?schema=public
JWT_SECRET=YOUR_SUPER_SECURE_RANDOM_SECRET_KEY_MIN_32_CHARS
SALES_CHANNEL_ENCRYPTION_KEY=YOUR_32_CHAR_ENCRYPTION_SECRET_KEY
PAYMENT_BANK_BIN=970436
PAYMENT_BANK_NAME=Vietcombank
PAYMENT_ACCOUNT_NUMBER=1234567890
PAYMENT_ACCOUNT_NAME=NHA HANG SMART RESTAURANT
PAYMENT_QR_ENABLED=true
EOF

# 5. Build và khởi chạy Docker Container Standalone
docker build -t smart-restaurant-app .
docker run -d --name smart-restaurant-app --restart always -p 3000:3000 --env-file .env smart-restaurant-app

# 6. Nạp dữ liệu mẫu ban đầu vào RDS
docker exec -it smart-restaurant-app npm run db:seed
```

---

## 10. Sao lưu & Phục hồi CSDL (Backup & Restore)

Hệ thống cung cấp sẵn các kịch bản sao lưu và khôi phục tự động trong thư mục `scripts/`:

### Sao lưu (Backup):
- **Linux / EC2 Server:**
  ```bash
  chmod +x scripts/backup.sh
  ./scripts/backup.sh
  ```
- **Windows PowerShell:**
  ```powershell
  .\scripts\backup.ps1
  ```

### Phục hồi (Restore):
- **Linux / EC2 Server:**
  ```bash
  chmod +x scripts/restore.sh
  ./scripts/restore.sh backups/smart_restaurant_backup_YYYYMMDD_HHMMSS.sql.gz
  ```
- **Windows PowerShell:**
  ```powershell
  .\scripts\restore.ps1 -BackupFile backups\smart_restaurant_backup_YYYYMMDD_HHMMSS.sql
  ```

---

## 11. Kịch bản Diễn tập Demo Mẫu

Quy trình 10 bước phục vụ buổi báo cáo nghiệm thu và đánh giá tính năng:

1. **Bước 1 (Đăng nhập Phục vụ):** Truy cập `/login`, chọn tài khoản `waiter`. Xác minh nhân viên phục vụ không nhìn thấy các tab quản trị menu, tài khoản hay báo cáo của Quản lý.
2. **Bước 2 (Mở bàn & Gọi món):** Vào `/tables`, chọn Bàn 01 (Trống). Thêm các món ăn hảo hạng (Bò Wagyu, Súp bào ngư) và nhấn **"Gửi vào bếp ngay"**.
3. **Bước 3 (Kiểm tra Trừ kho & Batch):** Hệ thống tự động trừ tồn kho nguyên tử qua Sổ cái Kho (`inventory_ledger`) và sinh Batch #1.
4. **Bước 4 (Đầu bếp Tiếp nhận):** Đăng nhập tài khoản `kitchen`, vào `/kitchen/queue`. Batch mới xuất hiện tức thì, sắp xếp theo thứ tự thời gian gửi (`sent_at`).
5. **Bước 5 (Cảnh báo Trễ & Nấu món):** Quan sát cảnh báo quá 10 phút. Bếp bấm **"Bắt đầu làm"** (`IN_PROGRESS`), sau đó bấm **"Sẵn sàng phục vụ"** (`READY`).
6. **Bước 6 (Khách hàng Tra cứu Tiến độ):** Mở cửa sổ ẩn danh truy cập `/track/[orderCode]` hoặc quét mã QR Bàn. Khách hàng theo dõi thấy thanh tiến trình món ăn chuyển sang trạng thái sẵn sàng.
7. **Bước 7 (Hóa đơn & Quét mã VietQR):** Phục vụ mở `/orders/[id]/invoice`. Mã VietQR hiển thị sắc nét cùng số tiền server tính và nội dung chuyển khoản gắn mã đơn.
8. **Bước 8 (Xác nhận Chuyển khoản Thủ công):** Phục vụ kiểm tra biến động số dư và nhấn **"Đã kiểm tra và nhận chuyển khoản"**. Nhấn **"Xác nhận chốt đơn mô phỏng"** để đóng đơn (`CLOSED`) và giải phóng bàn ăn về `AVAILABLE`. Bấm **In hóa đơn** để xem bản in tối ưu.
9. **Bước 9 (Đa Kênh Bán Hàng Trực Tuyến):** Đăng nhập `manager`, vào `/admin/channels`. Kiểm tra kết nối GrabFood, ShopeeFood, BeFood. Nhấn **"Mô phỏng nhận đơn"** để tiếp nhận đơn từ GrabFood. Đơn hàng tự động đồng bộ đẩy vào Queue Bếp mượt mà.
10. **Bước 10 (Báo cáo Doanh thu & Kiểm toán Audit Log):** Vào `/reports` xem báo cáo tài chính cập nhật tức thì. Vào `/admin/audit-log` kiểm tra toàn bộ dấu vết lịch sử thao tác từ đầu đến cuối buổi diễn tập.

---

## 📄 Bản quyền & Tuyên bố Miễn trừ Trách nhiệm
- Dự án được xây dựng phục vụ mục đích nghiên cứu, học thuật và bảo vệ đồ án tốt nghiệp / chuyên đề kỹ thuật trên nền tảng Amazon Web Services (AWS).
- Mã QR thanh toán là định dạng chuyển khoản hiển thị thông tin thủ công theo chuẩn VietQR, không thay thế hợp đồng cổng thanh toán trung gian tài chính thương mại.
