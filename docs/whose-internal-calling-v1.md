# Whose Studio — Gọi hàng nội bộ theo chi nhánh (tái thiết kế)
## Nguyên tắc
- Một **Kho thao tác** trong sidebar là một chi nhánh, gồm LVS hoặc NVT.
- Trong mỗi chi nhánh có **hai bộ phận**: Cửa hàng và Kho. Đây là *role/góc nhìn*, KHÔNG phải hai chi nhánh hoặc hai giá trị `origin_branch_id`/`destination_branch_id`.
- Gọi hàng không đồng nghĩa với xuất kho, chuyển chi nhánh hoặc đã bán.
- Không hiển thị phiếu legacy chuyển giữa chi nhánh như một hội thoại nội bộ.
- Ngữ cảnh chi nhánh được kiểm tra lại ở backend theo membership và role. Admin có thể dùng cả hai góc nhìn nhưng quyền thực hiện là quyền server.
## Giao diện được chốt
- Sidebar chọn LVS/NVT, khi đổi kho mọi danh sách nghiệp vụ phải đổi chi nhánh.
- Dưới tiêu đề Gọi hàng hiện chip `Cửa hàng ↔ Kho · [LVS/NVT]`.
- Danh sách bên trái là yêu cầu trong chi nhánh đang chọn, dùng thẻ trạng thái, tìm kiếm theo SKU/người/bill; cuộn riêng.
- Hội thoại chính hiển thị lần lượt các **thẻ SKU**, note mượn, trạng thái soạn/bàn giao/nhận/trả; event timeline; không mở chat tự do gây mất kiểm soát.
- Cột phải: người đang xử lý, số dòng và số lượng, SKU đang thiếu, bill đối chiếu, thời hạn hoàn trả, ghi chú.
- Form cửa hàng thêm một hoặc nhiều SKU từ catalog có ảnh, số lượng, lý do; cho phép gửi thêm khi yêu cầu mở.
- Kho thấy cùng nội dung nhưng điều khiển theo trạng thái: nhận việc, soạn, bàn giao, nhận trả.
- Admin có thể chuyển *Góc nhìn Cửa hàng / Kho* trong cùng chi nhánh để kiểm thử và vận hành, không đổi kho.
## Dữ liệu cần migration
- Thiết kế bảng riêng (gợi ý `whose_department_requests`, `whose_department_request_lines`, `whose_department_events`) với `branch_id` DUY NHẤT.
- Cột trách nhiệm `requester_id`, `warehouse_assignee_id`, `runner_id` tùy luồng; `department` không được giả mạo từ client.
- Lưu các lượng requested/picked/handed_over/received/returned/sold per SKU với kiểm tra bất biến và log từng sự kiện.
- FK sản phẩm KiotViet và bill (đối chiếu **từng dòng**), giao dịch nhận/soạn chỉ được ghi tồn kho nếu có quy trình custody được triển khai.
- Unique idempotency theo user + operation; chính sách RLS `branch_id` cộng phân quyền bộ phận. Không mở write qua bảng trực tiếp.
- Khi chưa có migration, UI phải **fail closed**, không gửi vào `whose_submit_request` legacy.
## Quy trình
1. Cửa hàng `Gọi hàng` → tạo request với >=1 SKU.
2. Kho `Tiếp nhận` → `Soạn` → `Bàn giao` (qua nhân viên vận chuyển).
3. Cửa hàng `Nhận` → khách xem/thử → `Đã bán` (match bill xác minh) hoặc `Trả kho`.
4. Kho `Nhận hàng trả` → đóng dòng; chỉ đóng phiếu khi các SKU đã bán hoặc hoàn trả/ghi ngoại lệ đúng thẩm quyền.
5. Mỗi thay đổi có timestamp, actor, source, qty; hoạt động trong cùng một branch.
## Kiểm thử
- Store LVS không thấy nội bộ NVT; Warehouse LVS chỉ xử lý yêu cầu LVS; admin thấy cả hai theo kho thao tác chọn.
- Giao diện không thể tạo yêu cầu khi backend chưa được migrate.
- Sau migration: các vai trò chỉ làm thao tác đúng bộ phận; số lượng luôn bảo toàn; không giả lập hàng bán/tồn.
- Giao diện nhiều yêu cầu đồng thời, từng request nhiều SKU; mở nhanh, danh sách box cuộn, form không chồng chữ.
