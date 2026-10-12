# Whose Studio UI Kit — v1.0.0

**Trạng thái:** Bộ giao diện chuẩn dùng cho toàn bộ Whose Studio từ phiên bản triển khai này.
**Phạm vi:** Whose Studio, GitHub `Alfaeradmin/Whose-Studio`. ALFAER WMS chỉ là nguồn tham khảo nguyên tắc UX; không sao chép code hoặc can thiệp dự án đó.

## 1. Điểm nguồn chuẩn (single source of truth)

Trang Whose và trang khôi phục mật khẩu bắt buộc tải CSS theo đúng thứ tự:

1. `app.css` — legacy compatibility; tránh thêm code mới vào đây.
2. `ui-foundation.css?v=1.0.0` — token nền tảng bất biến theo phiên bản.
3. `ui-enterprise-v2.css?v=20261012` — giao diện Whose hiện hành, nhất quán 10 phân hệ.
4. `ui-components.css?v=1.0.0` — hợp đồng cho controls, cuộn, responsive, layering, accessibility.
5. `ui-icons.js?v=1.0.0` — bộ biểu tượng SVG duy nhất cho các nút; markup dùng `data-ws-icon="menu|search|refresh|plus|log-out|..."`. Script nạp trước `app.js`.

Mọi module mới dùng **`--ws-*`**; không gõ mã màu/spacing/z-index tùy ý. Khi đổi token phá vỡ tương thích, tăng phiên bản UI Kit và cập nhật cả hai trang đồng thời. Không sao chép từng phần của UI Kit vào từng file nghiệp vụ.

## 2. Nhận diện

- Nền `--ws-bg` #f4f6fb, bề mặt `--ws-surface` #ffffff, sidebar #171e31.
- Chủ đạo violet dịu `--ws-brand` #6259c5; chỉ dùng cho hành động chính, lựa chọn hiện tại và điểm nhấn.
- Xanh `--ws-success`: thành công **có bằng chứng**. Vàng `--ws-warning`: cảnh báo/cần chú ý. Đỏ `--ws-danger`: hành động nguy hiểm/lỗi. Xanh thông tin `--ws-info`: trạng thái trung tính.
- Không dùng màu trang trí thay cho trạng thái nghiệp vụ; phối những màu này với bề mặt trắng và gradient rất nhẹ để tránh đơn sắc.
- Không bịa số liệu, ngày, tồn kho, đơn hàng, trạng thái kiểm kê hay kết nối để trang nhìn đầy.

## 3. Typography và nhịp thiết kế

- Font Inter khi đã có trong thiết bị, fallback `ui-sans-serif` hoặc hệ thống. Không yêu cầu tải font bên thứ ba.
- `--ws-font-xs` 11px cho chú thích, `--ws-font-sm` 12px cho metadata/bảng, `--ws-font-body` 14px cho nội dung, `--ws-font-lg` 16px cho tên thẻ, `--ws-font-heading` 22px.
- Khoảng cách lấy từ `--ws-space-1/2/3/4/5/6/8/10` (4, 8, 12, 16, 20, 24, 32, 40px). Bán kính `--ws-radius-*`.
- Input mobile tối thiểu **16px** tránh zoom ngoài ý muốn. Vùng chạm tối thiểu **44px**; text phải xuống dòng/cắt có dấu khi cần, không chồng lên biểu tượng.
- Icons SVG stroke đồng bộ viewBox 24, kích cỡ `--ws-icon-md` 20px; dùng registry `ui-icons.js`, `data-ws-icon` và API `window.WhoseUIIcons.mount(root)` cho nội dung mới được thêm sau. Icon trang trí có `aria-hidden`; nút chỉ có icon bắt buộc có `aria-label`. Không dùng phông emoji lẫn lộn. Không cho nhập SVG tùy ý từ người dùng.

## 4. Grid, cuộn chuột, lớp nổi

- Desktop: sidebar 248px; vùng nội dung co giãn, max 1500px. Dashboard 4/2/1 cột tùy breakpoint. Mobile bottom navigation 5 mục; các chức năng còn lại trong drawer.
- Chiều rộng layout co tối đa trong viewport; `min-width:0` cho flex/grid; không cố tràn để chứa tên sản phẩm/SKU.
- Danh sách có vùng cuộn riêng (`thread-list`, `chat-body`, `content`, `table-wrap`); native mouse wheel/trackpad/touch. Bảng ngang cuộn riêng, header sticky, không chặn wheel dọc theo trang, không làm mất số dòng để có cảm giác nhanh.
- Dùng layer token: sticky **20**, header **30**, bottom nav **40**, popover **60**, backdrop **80**, drawer **90**, dialog **100**, toast **120**. Không dùng `z-index:9999`.
- Popover có giới hạn kích cỡ, nếu điện thoại bàn phím mở thì gợi ý sản phẩm **nằm trong luồng scroll composer**, không che input/nút. Popup modal phải max-height theo `100dvh`, có vùng cuộn và khoảng cách an toàn.
- Trạng thái đóng/mở drawer phải giữ aria-expanded, overlay nhấn để đóng; trên mobile vẫn phải có nút Đăng xuất trong drawer.

## 5. Motion và feedback

- Hover/pressed **110ms**, chuyển trạng thái **170ms**, drawer/page entrance **210ms**, ease `cubic-bezier(.2,.72,.2,1)`. Chỉ chuyển các thuộc tính nhẹ (màu, opacity, shadow, transform drawer), không rung/lắc, không bounce.
- Trong `prefers-reduced-motion: reduce`, tắt transition và animation.
- Click thao tác phản hồi trạng thái thật tức thì; **không thêm delay giả, spinner giả hoặc animation che thời gian xử lý**. Loading/empty/error/success phải đúng trạng thái dữ liệu.
- Toàn bộ chức năng xác thực, lưu phiếu, đổi mật khẩu, đồng bộ KiotViet phải giữ nguyên hành vi. UI Kit không yêu cầu thêm API, không ghi KiotViet hoặc tồn kho.

## 6. Quy tắc phát triển cho mọi màn về sau

Trước khi merge một màn mới:
1. Dùng token `--ws-*`, component `.card`, `.btn`, `.status`, `.table-wrap`, `.ws-popover` / `.ws-dialog` khi phù hợp.
2. Không duplicate DOM `id`; không lặp trạng thái riêng làm sai `aria-current` / `aria-expanded`.
3. Kiểm tra desktop 1440, 1280, 1024, tablet 820, mobile 430/390/360/320, phone landscape, bàn phím mở và zoom 200%.
4. Kiểm tra ngón tay, wheel, trackpad, cuộn ngang bảng, sticky header, drawer, dropdown, toast, modal, sign-out, và focus bằng keyboard.
5. Hiển thị dữ liệu đầy đủ và trạng thái lỗi thật, không cắt bớt query hay giả mạo thời gian phản hồi để nhìn nhanh.
6. Chạy `npm run check` và xem Vercel Preview trước khi đưa lên Production; rollout nhỏ, có thể quay về deployment trước.

## 7. Phạm vi bản UI Kit đầu tiên

Đã áp dụng vào tổng quan, điều phối, tồn kho, chuyển kho, kiểm kho, đổi/trả, sản phẩm, nhân viên, KiotViet, cài đặt, đăng nhập và đặt lại mật khẩu. UI Kit chỉ tạo **shell và các component trực quan chung**, không ngụ ý tất cả nghiệp vụ chưa hoàn thiện đều đã được triển khai.

**Không sửa** Supabase schema, danh mục chi nhánh vận hành, quyền nhân viên, KiotViet OAuth/token, số liệu tồn kho hoặc code ALFAER WMS trong đợt UI Kit.
