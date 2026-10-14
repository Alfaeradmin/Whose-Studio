# Whose Studio — Giao tiếp cửa hàng ↔ kho, danh mục và khớp hóa đơn (Preview P2)

**Trạng thái:** Thiết kế và code Preview, chưa phát hành sản xuất, chưa chạy migration Whose.
**Ranh giới:** LVS gồm **Kho bán hàng** và **Kho tồn**; NVT có một kho thao tác. Đây là **3 nguồn kho vật lý trong 2 chi nhánh KiotViet**; không được tự tạo một chi nhánh KiotViet thứ ba.
Dữ liệu Whose đã quan sát: 1.967 sản phẩm, 1.317 có ảnh (tại thời điểm tra soát). Hai chi nhánh Whose mapping tới KiotViet: LVS `1263919`, NVT `1280205`. **Kiot warehouse IDs chưa được xác minh**.

## 1. Các góc nhìn

| Vị trí ca | Được thấy | Thao tác |
|---|---|---|
| Cửa hàng (seller) | Hội thoại yêu cầu cùng chi nhánh | Tìm tên/SKU, xem ảnh, chọn SL, lý do mượn, ghi chú, gửi |
| Kho (picker) | Chỉ đơn của kho/zone được phân | Nhận nhóm tối đa 8 giỏ, scan đúng giỏ, báo thiếu |
| Vận chuyển (runner) | Giỏ đã soạn và các giỏ đang giao của mình | Nhận – giao theo giỏ, ghi sự kiện |
| Quầy nhận (receiver) | Hàng giao về quầy | Kiểm nhận đủ/thiếu; thiếu bắt buộc lý do |
| Trưởng ca | Ca cùng chi nhánh/khu vực | Phân người, theo dõi ngoại lệ, không được tự tạo quyền admin |
| Global admin | Hai góc nhìn, không giả danh nhân viên | Chuyển Cửa hàng/Kho, giám sát đối soát |

Không có hộp chat tự do. Mỗi thông điệp do cửa hàng gửi là một **yêu cầu có cấu trúc**. Phản hồi kho là sự kiện trạng thái từ thao tác thật; không giả mạo thời gian, nhân viên hoặc tồn.

## 2. Hai kho tại LVS

- **LVS · Kho bán hàng** và **LVS · Kho tồn** có mã phân biệt; yêu cầu phải chọn kho nguồn, kho nhận theo ca tương ứng.
- **NVT · Kho Nguyễn Văn Tráng** là một kho thao tác.
- `whose_ops_stock_pools.kiot_warehouse_id` **để NULL** cho đến khi global admin đối chiếu mã kho KiotViet. `kiot_mapping_verified=false` phải được hiển thị là "chưa xác minh".
- Tồn theo `branchId` từ Public API KiotViet **không được chia ra thành hai kho nội bộ LVS**. Phải đọc một endpoint trả tồn theo warehouse hoặc phương pháp đáng tin cậy khác, kiểm tra thử bằng giao diện KiotViet gốc trước khi gắn số.
- KiotViet chọn kho bán khi phát hành bill; hai bill cùng chi nhánh không đảm bảo xuất cùng kho.

## 3. Đề xuất sản phẩm

- Tìm theo SKU, tên tiếng Việt có dấu / không dấu nếu dữ liệu hỗ trợ, và barcode khi kho dữ liệu đã ghi nhận.
- Khởi đầu `Whose product catalog` (Kiot sync) để tránh mỗi phím tạo API call Kiot. Debounce, giới hạn 12 kết quả, tìm trên server, ảnh thumbnail Kiot dùng HTTPS/CDN xác minh.
- Mỗi đề xuất gồm **ảnh thực, tên đầy đủ, mã SKU, màu/size nếu thuộc tính có**, nhãn kho nếu đã xác minh. Ảnh thiếu thì hiển thị "Chưa có ảnh".
- Danh mục đang đồng bộ cần trạng thái freshness: timestamp và cảnh báo ảnh/tên cũ.
- Preview demo không tiết lộ khách hàng và không nhúng token hay bí mật của KiotViet trong client.

## 4. Quy tắc khớp bill ↔ yêu cầu (theo DÒNG)

Một yêu cầu có thể khớp **nhiều bill**, một bill có thể phân bổ cho **nhiều yêu cầu**. Chỉ xác nhận khi:

1. Invoice ID/code và từng invoiceDetail SKU, quantity lấy từ KiotViet và verified.
2. Hóa đơn đúng chi nhánh, đúng thời gian phát sinh hợp lệ, trạng thái đã xác minh hợp lệ, kho xuất đúng nếu mã kho có trên chứng từ.
3. Dòng SKU trong yêu cầu đã được kho giao và quầy nhận, chưa bán hết hoặc hoàn hết.
4. Tổng `confirmed_sale + warehouse_return <= physically_received`; tổng allocations trên invoice SKU `<= invoice_quantity`. Khóa hàng/đồng thời trên server chống double-claim.
5. **Nếu 2 yêu cầu cùng SKU đều phù hợp**, UI hiển thị "Nhiều yêu cầu có thể khớp", người có quyền chọn một hoặc chia số lượng có lý do. Không auto-match theo FIFO một cách mù quáng.
6. Bill trước yêu cầu, khác kho, đổi/trả, combo nhiều SKU, trạng thái nguồn không rõ, hoặc chưa quét đủ lịch sử đều đi qua kiểm tra ngoại lệ, không tự xác nhận.

Ví dụ: mượn 3 chiếc; bill chứng thực 1 chiếc, nhận trả 2 chiếc → 0 còn treo. Mượn 3, bill 1, trả 0 → 2 phải tra soát/nhận trả. **Không có bill trong 10 bản ghi vừa dò** không có nghĩa là chắc chắn không có bill trong toàn bộ lịch sử.

## 5. Ghi nhận bán và nhập trả

- Kho trả: nhận và kiểm đếm hàng thực tế trước khi ghi nhận số trả; người nhận, SKU, SL, nguồn, lý do, timestamp.
- Trả hàng mượn nội bộ **không phải KiotViet return invoice**, cũng không mặc định tăng tồn Kiot. Xử lý tồn cần hợp đồng mapping kho và nghiệp vụ điều chỉnh riêng, có duyệt.
- Invoice bị sửa/hủy sau match: vô hiệu hóa chứng cứ đã bán, đưa phân bổ về trạng thái cần kiểm tra; không tự sửa tồn, không âm thầm giữ "đã bán".
- Hóa đơn đổi/trả cần lịch sử lineage riêng, tránh tính hai lần trên một mã.

## 6. Đồng bộ hóa đơn liên tục (chưa hoàn thiện production)

- Đọc đầu nguồn: KiotViet invoices + invoiceDetails. Webhook nếu thực tế được cấp phép và có chữ ký phù hợp; **webhook + polling** để bổ sung sự kiện bị lỡ.
- Worker riêng: cursor `lastModifiedFrom` + pagination, overlap an toàn, idempotency `retailer + invoice_id + source_revision`, transaction-upsert invoice + lines.
- Trạng thái `unknown` là unknown, không được coi là `finalized`. Cập nhật sau sửa/hủy phải tái đối soát các allocations.
- Monitor: receipt latency, worker lag, số SKU chưa xác định, số bill chưa có yêu cầu, số yêu cầu chưa có bill, số tiền/tồn KHÔNG được suy ra khi thiếu dữ liệu.
- Trước khi áp migration: môi trường Supabase staging độc lập, kiểm thử migrations/RLS và giả lập 100 yêu cầu đồng thời, 2 picker cùng claim, 2 bill cùng SKU, duplicate provider updates.

## 7. Trạng thái các phần code

| Thành phần | Đã xây dựng ở PR #22 | Chưa xác minh |
|---|---|---|
| Preview messenger, chọn kho, nhấn yêu cầu mở lịch sử | Có, dữ liệu demo | Người dùng duyệt UX |
| Tìm SKU/tên với ảnh Whose-Kiot | API read-only + client | Phiên đăng nhập Preview, dữ liệu Kiot mới nhất |
| Truy bill Kiot theo SKU và chi nhánh | Probe GET 10 bill/trang, PII-free | Đọc API đầu-cuối, trạng thái bill thực |
| Gợi ý match và phát hiện mơ hồ | Matching engine có tests | Kết nối realtime/ledger chính thức |
| Dòng phân bổ bill và hàng trả | SQL migration + RPC đang ở nhánh | Supabase staging + import worker |
| Xác định warehouse ID Kiot tại LVS | Không đoán mã | Cần đối chiếu trực tiếp từ KiotViet |
| Main/production | Không đổi | User acceptance + release gates |

**Không được khẳng định tự động khớp hoàn chỉnh hoặc không có bill khi backfill chưa phủ đủ dữ liệu.**
