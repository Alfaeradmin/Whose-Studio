# Whose Studio — giao diện vận hành v2 (preview)
### Mục tiêu
Giao diện tập trung vào tác vụ của cửa hàng và kho: thông tin có phân cấp, thao tác rõ ngay sau khi bấm, danh sách dài nằm trong vùng cuộn riêng, không có hiệu ứng nảy, spinner trang trí hoặc số liệu giả.
### Design tokens
- **Nền ứng dụng:** `#f7f9f8`; **surface:** `#ffffff`; **line/border:** `#e2e9e3`.
- **Chữ chính:** `#1a2b23`; **chữ thứ cấp:** `#72847a`; **primary green:** `#247b50`.
- **Sidebar:** `#151d1a`; active `#244130`, nét chỉ thị `#78dca1`.
- Spacing: 4 / 8 / 12 / 16 / 20 / 24 / 32; radius buttons 8–9px, cards 10–12px, modal 15–18px.
- Typography: nội dung 12–14px, label 10–11px, tiêu đề pane 18–20px, tiêu đề trang 26–34px. Ưu tiên hệ thống chữ dễ đọc, không dùng size 9px cho nghiệp vụ chính.
### Điều hướng
- Một sidebar duy nhất `ws-shell.css`: header (nhận diện), workspace identity (chỉ thông tin), nhóm chức năng, footer.
- Chức năng đang có mới là nút điều hướng. Chức năng chưa mở là chữ/nhãn rõ, không tạo cảm giác nút có thể bấm.
- Nav active: nền xanh thẫm và indicator mảnh; hover thay đổi background/border **không di chuyển vị trí**; focus keyboard rõ.
- Desktop: thu gọn icon rail 72px, có title/aria-label; mobile: drawer dùng overlay, Esc/backdrop để đóng.
- Đường dẫn `#products` và `#calling` có thể chia sẻ/khôi phục sau đăng nhập.
### Motion
- Interaction nhỏ 130–180ms; drawer mobile tối đa ~190ms; giảm motion theo `prefers-reduced-motion`.
- Không dùng scale bounce, card nhảy, skeleton chớp, animation lặp khi tải. Thao tác trả về trạng thái ngay.
### Gọi hàng
- 3 vùng công việc: hộp thư/lọc, hội thoại nghiệp vụ, bộ lọc phạm vi/chi tiết.
- Mỗi yêu cầu là một conversation item; nội dung SKU và số lượng là thẻ riêng có phân cấp. Không mô phỏng message chưa có.
- Ghi chú/yêu cầu được trình bày như nội dung nghiệp vụ, không như chat tự do không giới hạn.
- Hộp thư 25 giây đọc lại khi đang mở, chỉ render nếu phiên bản dữ liệu thay đổi; tránh reset scroll khi nhận dữ liệu.
- Chọn sản phẩm dựa trên danh mục xác minh từ Whose; gửi yêu cầu theo hợp đồng API Whose hiện có, không tự sửa tồn kho KiotViet.
### Tiêu chí kiểm thử trước khi merge
1. Sidebar: 2 mục hoạt động, trạng thái selected/hover/focus; collapse desktop; mobile drawer; Escape và click backdrop.
2. Gọi hàng: không có yêu cầu / một yêu cầu / nhiều yêu cầu / API lỗi; giữ vị trí scroll, lọc, đổi phạm vi.
3. Form: chưa đăng nhập, thiếu chi nhánh, cùng chi nhánh, SKU không có ảnh, nhập tên tìm đề xuất, gửi thành công/thất bại.
4. Bảng sản phẩm và hồ sơ: chuyển trang không làm thay đổi dữ liệu, popup không bị sidebar đè, ảnh giữ trong area.
5. Desktop 1440px, 1024px, mobile 390px; focus keyboard và reduced motion.
6. Chỉ sau khi xác minh dữ liệu thực tế và quyền các vai trò mới cân nhắc merge production.
### Ranh giới triển khai
- `ws-shell.css` là source of truth cho sidebar & page chrome, `calling-chat.css` là source of truth cho Gọi hàng.
- Không tạo thêm patch CSS chồng lên các lớp này; sửa trực tiếp chúng.
- Các màn hình chưa được triển khai không được gắn dữ liệu/nút giả để trông có vẻ đã hoàn tất.
