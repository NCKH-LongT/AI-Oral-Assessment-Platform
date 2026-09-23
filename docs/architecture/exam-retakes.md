# Số lần làm bài và lịch sử kết quả

[README / danh mục tài liệu](../../README.md#hướng-dẫn-theo-nhu-cầu)

## Admin cấu hình đề

Mở **Môn học & đề thi → chọn môn → Bài thi & giao bài → Cấu hình số lần làm lại**, chọn một trong ba chế độ rồi lưu:

| Chế độ | Số lượt cho mỗi sinh viên |
| --- | --- |
| Không cho làm lại | 1 lượt ban đầu |
| Giới hạn số lần làm lại: N | 1 lượt ban đầu + N lượt làm lại (N từ 1 đến 1000) |
| Không giới hạn | Không giới hạn số lần làm |

Có thể chọn ngay khi tạo đề hoặc chỉnh cả đề đã công bố. Chỉ ADMIN được thay đổi chính sách, cấp lượt và xóa lần thi. Đề cũ mặc định không cho làm lại, giữ hành vi trước đây. Đổi số lượt không thay câu hỏi/rubric/model trong snapshot, không xóa điểm và không dừng phiên đang làm.

## Xem kết quả, cấp lượt và xóa

Trong **Kết quả & xem lại**, mỗi hàng là một lần làm bài, có số lần, thời gian, trạng thái và điểm. Mở bài để xem transcript/media/đánh giá; dùng danh sách lịch sử để chuyển giữa các lần của cùng sinh viên và đề.

Mở **Quản lý lượt thi** trên hàng kết quả hoặc trong màn hình xem bài:

- **Cấp thêm lượt:** nhập số lượt, bấm cấp. Chỉ sinh viên đó được tăng lượt; kết quả cũ giữ nguyên. Nếu admin vừa giảm giới hạn xuống thấp hơn số lần đã làm, thao tác vẫn bảo đảm sinh viên còn ít nhất số lượt vừa cấp. Đề không giới hạn không cần cấp thêm.
- **Xóa lần thi này:** xác nhận đúng sinh viên, đề và số lần. Xóa transcript, điểm, lịch sử chấm lại và media của lần đó; không thể khôi phục qua ứng dụng. Các lần khác giữ nguyên. Lần bị xóa không còn tính vào số lượt đã dùng; nếu tổng số lần còn lại vẫn vượt giới hạn vừa giảm, cần cấp thêm lượt để sinh viên làm tiếp.

Khi lần thi đang được worker chấm hoặc đang xử lý upload, ứng dụng có thể yêu cầu đợi hoàn tất rồi xóa lại. Xóa phiên đang làm khiến phiên đó không thể tiếp tục; sinh viên tải lại danh sách bài thi để mở lần mới.

## Sinh viên làm lại

Danh sách bài thi hiển thị số lượt còn lại và lịch sử từng lần. **Làm lại bài thi** tạo phiên mới khi còn lượt; **Xem lần thi gần nhất** hoặc **Xem lần N** chỉ mở phiên cũ. Nếu đang có phiên ở bước kiểm tra thiết bị hoặc đang trả lời, ứng dụng tiếp tục phiên đó. Bấm nhiều lần hay mở nhiều cửa sổ không tạo thêm phiên đang làm đồng thời.

Một lượt được tính từ khi mở phiên mới, kể cả chưa bắt đầu ghi âm. Bài đã nộp nhưng còn chờ chấm vẫn được giữ riêng; nếu còn lượt có thể làm lần tiếp theo. Mỗi lần mới sử dụng bộ câu hỏi đã công bố, có thời gian làm bài riêng, và yêu cầu kết nối thiết bị lại. Điểm không tự gộp thành điểm cao nhất hoặc trung bình.

## Lưu trữ và API

- `exams.max_attempts`: tổng số lượt, bao gồm lần đầu; `1` là không cho làm lại, `null` là không giới hạn. `assignments.extra_attempts` lưu lượt cấp thêm riêng.
- `exam_sessions.attempt_number` tăng theo từng cặp đề/sinh viên. Số lần đã xóa không được dùng lại. Một phiên tối thiểu có `deleted_at` và bản ghi audit được giữ để truy vết; câu trả lời và kết quả đã xóa không còn được API trả về.
- Thay đổi lượt và tạo phiên cùng khóa đề trong PostgreSQL; chỉ mục duy nhất chặn nhiều phiên đang làm. Khóa khi xóa tránh xung đột với worker/upload.
- Media mất quyền truy cập ngay khi xóa. Bảng `media_cleanup` giữ công việc xóa object storage và phần upload tạm; worker thực hiện và thử lại khi storage lỗi. Worker phải chạy để hoàn tất xóa file vật lý.

| API (qua web thêm tiền tố `/api`) | Nội dung |
| --- | --- |
| `PUT /admin/exams/{id}/attempt-policy` | `{ "max_attempts": 2 }` hoặc `null` |
| `POST /admin/results/{session_id}/retake` | `{ "additional_attempts": 1 }` |
| `DELETE /admin/results/{session_id}` | Xóa đúng một lần thi |
| `POST /exam-sessions` | `{ "exam_id": "…", "new_attempt": true }` để xin lần mới; luôn tiếp tục phiên đang làm nếu có |

API danh sách bài thi và xem kết quả có `history`; mỗi phần tử chứa số lần, trạng thái, thời gian và điểm được xác nhận. Lịch sử của sinh viên chỉ thuộc chính tài khoản đó.

## Cập nhật server và desktop

Sao lưu database theo quy trình triển khai trước khi nâng cấp. Tại thư mục repository:

```bash
git pull --ff-only
docker compose up -d --build --wait
docker compose exec api alembic current
```

Compose chạy dịch vụ `migrate` trước API/worker; phiên bản cần đạt là `0004 (head)`. Migration giữ các bài cũ ở lần 1 và giữ điểm/transcript. Không xóa volume và không thêm biến môi trường. Nếu chạy API native, chạy `alembic -c services/api/alembic.ini upgrade head` bằng môi trường Python của backend trước khi mở API/worker mới.

Đóng/mở lại desktop để tải UI mới từ server; chạy source bằng `./run-desktop.sh` sau khi backend được cập nhật. Không cần build lại PhoWhisper. Launcher không chạy Docker. Không hạ migration khi đã có nhiều lần thi, lần đã xóa hoặc công việc xóa media đang chờ.
