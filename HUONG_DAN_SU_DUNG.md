# PHẦN MỀM QUẢN LÝ TÀI SẢN
### AssetPro — Hệ thống Quản lý Tài sản Đa loại
**Công ty TNHH Đồng Thuận Hà**

---

## MỤC LỤC

1. [Tổng quan hệ thống](#1-tổng-quan-hệ-thống)
2. [Đăng nhập & Phân quyền](#2-đăng-nhập--phân-quyền)
3. [Màn hình Tổng quan (Dashboard)](#3-màn-hình-tổng-quan-dashboard)
4. [Quản lý Tài sản](#4-quản-lý-tài-sản)
5. [Phiếu Điều chuyển Tài sản](#5-phiếu-điều-chuyển-tài-sản)
6. [Hồ sơ Bảo trì & Sửa chữa](#6-hồ-sơ-bảo-trì--sửa-chữa)
7. [Lịch sử Hoạt động (Lifecycle)](#7-lịch-sử-hoạt-động-lifecycle)
8. [Cấu hình hệ thống](#8-cấu-hình-hệ-thống)
9. [Câu hỏi thường gặp](#9-câu-hỏi-thường-gặp)

---

## 1. TỔNG QUAN HỆ THỐNG

**AssetPro** là phần mềm quản lý tài sản toàn diện được xây dựng dành riêng cho doanh nghiệp xây dựng, cơ giới hóa — nơi có nhiều loại tài sản khác nhau cần theo dõi tập trung.

### Tại sao cần phần mềm này?

| Vấn đề thực tế | Giải pháp AssetPro |
|---|---|
| Không biết tài sản đang ở công trường nào | Theo dõi vị trí thời gian thực qua phiếu điều chuyển |
| Quên hạn đăng kiểm xe, hạn hiệu chuẩn thiết bị | Cảnh báo tự động trước 30 ngày |
| Không có lịch sử bảo trì, sửa chữa | Hồ sơ bảo trì đầy đủ, có thể tìm kiếm |
| Giấy tờ tài sản thất lạc | Đính kèm file số hóa ngay trên tài sản |
| Không biết tổng giá trị tài sản | Dashboard tổng hợp tự động |
| Nhân viên giao nhận tài sản không có bằng chứng | Xác nhận bằng QR Code khi điều chuyển |

### Các loại tài sản được quản lý

- **Xe cơ giới** — xe tải, xe cẩu, xe ben, xe trộn bê tông...
- **Máy móc thiết bị** — máy xúc, máy lu, máy nén khí, trạm bơm...
- **Thiết bị đo lường** — máy toàn đạc, GPS, máy thử nghiệm vật liệu...
- **Thiết bị CNTT** — máy tính, máy in, thiết bị mạng...
- **Công cụ dụng cụ** — dụng cụ cơ khí, thiết bị an toàn...
- **Tài sản văn phòng** — nội thất, thiết bị văn phòng...

---

## 2. ĐĂNG NHẬP & PHÂN QUYỀN

### Đăng nhập hệ thống

Truy cập địa chỉ hệ thống → nhập tên đăng nhập và mật khẩu → nhấn **Đăng nhập**.

> Phiên đăng nhập có hiệu lực **8 giờ**. Sau đó hệ thống tự động yêu cầu đăng nhập lại.

### Cấp độ quyền hạn

| Vai trò | Mô tả | Quyền hạn |
|---|---|---|
| **Quản trị hệ thống** (Super Admin) | Người quản trị cao nhất | Toàn quyền — quản lý tài khoản, cấu hình hệ thống, xem/sửa/xóa mọi thứ |
| **Quản trị** (Admin) | Quản lý cấp công ty | Thêm/sửa tài sản, duyệt phiếu, quản lý nhân sự |
| **Quản lý** (Manager) | Quản lý cấp bộ phận | Xem toàn bộ, tạo phiếu điều chuyển, ghi nhận bảo trì |
| **Nhân viên** (Operator) | Nhân viên nghiệp vụ | Xem tài sản được phân công, ghi nhận thao tác |
| **Xem** (Viewer) | Khách/Kiểm toán | Chỉ xem, không thay đổi dữ liệu |

### Tài khoản demo

| Tài khoản | Mật khẩu | Vai trò |
|---|---|---|
| `admin` | `Admin@123` | Quản trị hệ thống |
| `manager` | `Manager@123` | Quản lý |

---

## 3. MÀN HÌNH TỔNG QUAN (DASHBOARD)

Màn hình đầu tiên sau khi đăng nhập. Cung cấp cái nhìn **tức thời** về toàn bộ tài sản của doanh nghiệp.

### Các chỉ số hiển thị

```
┌─────────────────┬─────────────────┬─────────────────┬─────────────────┐
│   📦 Tổng TS    │  💰 Tổng giá trị │  🔧 Bảo trì     │  📋 Phiếu hôm nay│
│      248        │   12.4 tỷ VNĐ   │     12 cái       │      5 phiếu     │
└─────────────────┴─────────────────┴─────────────────┴─────────────────┘
```

### Cảnh báo tự động

Hệ thống tự phát hiện và hiển thị nổi bật:

- 🚨 **Tài sản hết hạn đăng kiểm** — xe chưa đăng kiểm định kỳ
- ⚠️ **Thiết bị sắp hết hạn hiệu chuẩn** — trong vòng 30 ngày tới
- 🔧 **Tài sản bảo trì > 30 ngày** — thiết bị nằm xưởng quá lâu

### Biểu đồ phân tích

- **Biểu đồ tròn** — tỷ lệ tài sản theo trạng thái (Chờ cấp phát / Đang sử dụng / Đang bảo trì)
- **Biểu đồ cột** — phân bổ tài sản theo công trường/dự án
- **Danh sách phiếu điều chuyển gần nhất** — theo dõi hoạt động điều chuyển

---

## 4. QUẢN LÝ TÀI SẢN

Phần cốt lõi của hệ thống — nơi toàn bộ tài sản được lưu trữ và quản lý.

### 4.1 Xem danh sách tài sản

- **Tìm kiếm**: Theo tên, mã tài sản, số khung, số biển số, barcode
- **Lọc theo**: Nhóm tài sản · Trạng thái · Công trường · Phòng ban
- **Chọn cột hiển thị**: Tùy chỉnh các cột hiển thị trên bảng
- **Phân trang**: 20 bản ghi/trang (có thể thay đổi)

### Trạng thái tài sản

| Trạng thái | Ý nghĩa |
|---|---|
| 🟡 **Chờ cấp phát** | Tài sản nhập kho, chưa đưa vào sử dụng |
| 🟢 **Đang sử dụng** | Đang hoạt động tại công trường/phòng ban |
| 🔴 **Đang bảo trì** | Đang trong quá trình sửa chữa, bảo dưỡng |
| ⚫ **Thanh lý** | Đã loại khỏi danh sách sử dụng |
| 🔵 **Mất mát** | Được ghi nhận là thất lạc/mất |

### 4.2 Thêm tài sản mới

Nhấn **+ Thêm tài sản** → điền thông tin:

**Thông tin cơ bản:**
- Tên tài sản · Mã tài sản (tự động hoặc tự nhập)
- Nhóm tài sản (xe cơ giới, máy móc, thiết bị đo lường...)
- Công trường / Phòng ban đang sử dụng
- Người phụ trách / Lái xe / Vận hành

**Thông tin tài chính:**
- Nguyên giá (giá mua ban đầu)
- Ngày mua · Nhà cung cấp

**Thông tin kỹ thuật** (theo từng nhóm):
- Xe cơ giới: Biển số, số khung, số động cơ, hạn đăng kiểm
- Máy móc: Model, công suất, năm sản xuất, hạn hiệu chuẩn
- Thiết bị đo lường: Số serial, cấp chính xác, đơn vị hiệu chuẩn

**Đính kèm hồ sơ:**
- Ảnh tài sản
- Hóa đơn mua hàng
- Phiếu bảo hành
- Biên bản kiểm tra · Chứng chỉ hiệu chuẩn

### 4.3 QR Code tài sản

Mỗi tài sản có **mã QR riêng**. Chức năng:
- In tem dán lên tài sản
- Quét để xem nhanh thông tin
- Xác nhận khi điều chuyển

### 4.4 Xuất báo cáo Excel

Nhấn **Xuất Excel** → chọn cột cần xuất → tải về file `.xlsx`

Các cột có thể xuất: Mã TS · Tên · Nhóm · Trạng thái · Biển số · Số khung · Số động cơ · Giá trị · Công trường · Phòng ban · Ngày mua · Hạn đăng kiểm · Hạn hiệu chuẩn...

---

## 5. PHIẾU ĐIỀU CHUYỂN TÀI SẢN

Quản lý việc **di chuyển tài sản** giữa các công trường, phòng ban hoặc nhân sự.

### Quy trình điều chuyển

```
[Tạo phiếu] → [Chờ duyệt] → [Đã duyệt] → [Xác nhận QR] → [Hoàn thành]
```

**Bước 1 — Tạo phiếu điều chuyển:**
- Chọn tài sản cần điều chuyển
- Điền nơi đi → nơi đến
- Ghi lý do điều chuyển
- Đính kèm chứng từ nếu có

**Bước 2 — Phê duyệt:**
- Quản lý/Admin nhận thông báo
- Xem xét và phê duyệt hoặc từ chối

**Bước 3 — Xác nhận bằng QR Code:**
- Bên nhận quét mã QR trên phiếu
- Hệ thống ghi nhận xác nhận với thời gian thực
- Tài sản tự động cập nhật vị trí mới

### Lợi ích của xác nhận QR

- **Bằng chứng giao nhận** — không thể chối bỏ
- **Tức thời** — vị trí tài sản cập nhật ngay lập tức
- **Không cần giấy tờ** — toàn bộ số hóa

---

## 6. HỒ SƠ BẢO TRÌ & SỬA CHỮA

Ghi nhận toàn bộ lịch sử bảo trì, sửa chữa của từng tài sản.

### Các loại bảo trì

| Loại | Mô tả |
|---|---|
| **Bảo dưỡng định kỳ** | Theo lịch nhà sản xuất (km, giờ máy, tháng) |
| **Bảo dưỡng phòng ngừa** | Chủ động thay thế trước khi hỏng |
| **Sửa chữa hỏng hóc** | Xử lý sự cố phát sinh |
| **Sửa chữa khẩn cấp** | Hỏng đột xuất, cần xử lý ngay |
| **Đại tu / Phục hồi** | Sửa chữa toàn diện, phục hồi nguyên trạng |
| **Kiểm định / Đăng kiểm** | Đăng kiểm nhà nước định kỳ |
| **Hiệu chuẩn thiết bị** | Kiểm chuẩn độ chính xác thiết bị đo |
| **Tra dầu / Bảo dưỡng nhỏ** | Thao tác bảo dưỡng nhỏ thường xuyên |

### Thông tin ghi nhận

- **Tài sản** đang bảo trì · **Ngày bắt đầu** · **Ngày hoàn thành**
- **Đơn vị thực hiện** (nội bộ hoặc thuê ngoài)
- **Chi phí** (phụ tùng + nhân công)
- **Kết quả** và ghi chú kỹ thuật
- **Thông số kỹ thuật** theo loại thiết bị:
  - Xe: Số km hiện tại, tình trạng lốp, mức dầu nhớt
  - Máy móc: Số giờ máy, nhiệt độ, áp suất
  - Thiết bị đo: Số chứng chỉ hiệu chuẩn, sai số cho phép

---

## 7. LỊCH SỬ HOẠT ĐỘNG (LIFECYCLE)

**Audit trail** — toàn bộ sự kiện xảy ra với tài sản được ghi lại tự động.

### Các sự kiện được theo dõi

- ✅ Tạo mới tài sản (ai tạo, lúc nào)
- ✏️ Cập nhật thông tin (thay đổi gì, trước/sau)
- 🚛 Điều chuyển (từ đâu → đến đâu, ai xác nhận)
- 🔧 Bắt đầu / hoàn thành bảo trì
- 📎 Đính kèm tài liệu
- 🗑️ Thanh lý / xóa

### Xem lịch sử

- **Toàn hệ thống**: Trang Lịch sử → xem tất cả sự kiện
- **Từng tài sản**: Vào chi tiết tài sản → tab Lịch sử → xem timeline của riêng tài sản đó

---

## 8. CẤU HÌNH HỆ THỐNG

> Chỉ **Quản trị hệ thống** và **Quản trị** mới truy cập được.

### 8.1 Nhóm & Thuộc tính tài sản

Mỗi nhóm tài sản (xe cơ giới, máy móc...) có thể có **thuộc tính riêng** phù hợp:

- Xe cơ giới: Biển số, số khung, số động cơ, loại xe, tải trọng, hạn đăng kiểm...
- Thiết bị đo lường: Cấp chính xác, đơn vị đo, hạn hiệu chuẩn, tổ chức hiệu chuẩn...
- Thiết bị CNTT: CPU, RAM, ổ cứng, phiên bản OS...

**Thêm thuộc tính mới**: Vào Cấu hình → Nhóm tài sản → chọn nhóm → Thêm thuộc tính → đặt tên, kiểu dữ liệu (văn bản, số, ngày tháng, danh sách...).

### 8.2 Danh mục hệ thống

| Danh mục | Mô tả |
|---|---|
| **Công trường / Vị trí** | Các địa điểm, dự án đang hoạt động |
| **Phòng ban** | Cơ cấu tổ chức nội bộ |
| **Nhân sự** | Danh sách người phụ trách tài sản |

### 8.3 Quản lý tài khoản

- Xem danh sách tài khoản và vai trò
- Tạo tài khoản mới cho nhân viên
- Thay đổi vai trò · Đặt lại mật khẩu
- Xóa tài khoản (chỉ Quản trị hệ thống)

---

## 9. CÂU HỎI THƯỜNG GẶP

**Q: Có thể dùng trên điện thoại không?**
> Có. Giao diện responsive, hoạt động tốt trên điện thoại và máy tính bảng. Truy cập qua trình duyệt, không cần cài app.

**Q: Dữ liệu lưu ở đâu?**
> Dữ liệu lưu trên máy chủ của doanh nghiệp (on-premise). Không phụ thuộc dịch vụ cloud bên ngoài, bảo mật toàn bộ nội bộ.

**Q: Có thể thêm loại tài sản mới không?**
> Có. Quản trị viên vào Cấu hình → Nhóm tài sản → tạo nhóm mới và định nghĩa các thuộc tính đặc thù.

**Q: Xuất báo cáo được những định dạng nào?**
> Hiện tại xuất **Excel (.xlsx)**. Có thể tùy chọn cột muốn xuất.

**Q: Mất điện/mất mạng thì dữ liệu có bị ảnh hưởng không?**
> Dữ liệu được lưu vào cơ sở dữ liệu PostgreSQL ngay khi thực hiện thao tác. Mất mạng chỉ ảnh hưởng đến kết nối, không mất dữ liệu đã lưu.

**Q: Có giới hạn số lượng tài sản không?**
> Không có giới hạn trong phần mềm. Giới hạn phụ thuộc vào cấu hình máy chủ.

---

## THÔNG TIN KỸ THUẬT

| Thành phần | Công nghệ |
|---|---|
| Giao diện người dùng | React 18 + Vite |
| API Backend | FastAPI (Python) |
| Cơ sở dữ liệu | PostgreSQL 16 |
| Triển khai | Docker · Nginx |
| Bảo mật | JWT Token · HTTPS |
| Xuất dữ liệu | openpyxl (Excel) |
| QR Code | qrcode (Python) |

---

*Phiên bản 1.0 · Công ty TNHH Đồng Thuận Hà · 2025*
