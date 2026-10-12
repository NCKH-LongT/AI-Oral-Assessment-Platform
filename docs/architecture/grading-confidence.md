# Độ tin cậy và chấm lại theo phiên bản đề

[README / danh mục tài liệu](../../README.md#hướng-dẫn-theo-nhu-cầu)

## Ý nghĩa kết quả

`assessment.status` tách kết quả chấm khỏi trạng thái xử lý hàng đợi:

| Trạng thái đánh giá | confidence | Ý nghĩa |
|---|---|---|
| COMPLETED | 0–1 | LLM đã trả kết quả hợp lệ; đây là độ tin cậy tự báo, chưa được hiệu chuẩn |
| FAILED | null | Chấm thất bại, không có ước lượng độ tin cậy |
| NOT_GRADED | null | Demo, luyện tập hoặc không có câu trả lời |

`Attempt.status=GRADED` có nghĩa đã xử lý lần đầu; giao diện dùng nhãn “Đã xử lý”. `assessment.status` xác định kết quả chấm thành công, thất bại hoặc không chấm. Điểm 0 và confidence 0 chỉ được hiển thị khi thuộc một kết quả LLM hợp lệ.

UI chỉ hiện phần trăm khi có điểm hợp lệ và không có lỗi. STT là một chỉ số riêng; STT thấp hoặc transcript đã sửa có thể yêu cầu giảng viên xem lại, trong khi confidence của LLM giữ giá trị từ kết quả chấm.

## Cấu hình đề và tài liệu

Snapshot cố định provider, model, embedding và prompt version tại thời điểm công bố. Cấu hình `.env` phải khớp phiên bản đề đang dùng. Sai khác trả mã `AI_CONFIG_MISMATCH`, có thông báo tạo phiên bản đề/tài liệu phù hợp. Kiểm tra trước khi tạo lượt mới, bắt đầu thi và trước khi gửi audio đi nhận dạng lại; worker kiểm tra lại vì cấu hình có thể thay đổi giữa các bước.

Việc chấm dùng snapshot và tập vector thuộc cùng cấu hình embedding. `CONFIDENCE_THRESHOLD` quyết định ngưỡng cần xem lại, độc lập với kiểm tra cấu hình AI. Các lỗi provider khác có mã `GRADING_FAILED`; log chỉ ghi mã lỗi và loại ngoại lệ, giữ URL chứa token và nội dung lỗi thô của provider ngoài log.

`AI_TIMEOUT` chỉ lỗi chờ phản hồi; `AI_OUTPUT_INVALID` chỉ kết quả sai schema/thang điểm/dẫn chứng. `GEMINI_TIMEOUT` mặc định 180 giây, giới hạn 10–900 giây; không tự thử lại vô hạn.

Prompt `rubric-bounded-v2` yêu cầu điểm thô trong thang điểm từng tiêu chí. Schema gửi provider giới hạn tên tiêu chí, số tiêu chí, ID dẫn chứng và điểm tối đa theo rubric; backend kiểm tra riêng trần điểm từng tiêu chí khi rubric có nhiều mức trần. Các ràng buộc numeric/enum theo [Gemini structured outputs](https://ai.google.dev/gemini-api/docs/structured-output). Điểm ngoài thang được coi là kết quả không hợp lệ. Thay đổi prompt version yêu cầu phiên bản đề mới.

## Chấm lại transcript đã nộp

Admin vào **Kết quả & xem lại → chọn lượt thi → Chấm lại transcript đã nộp**. Chọn phiên bản đề và nhập lý do. Luồng này chỉ gửi transcript và dữ liệu chấm tới LLM, không gọi STT hay gửi lại audio.

Endpoint `POST /admin/attempts/{id}/grade-review` nhận `target_exam_id` và `reason`. Chỉ ADMIN được gọi. Phiên thi phải đã nộp, chưa xóa, câu đã xử lý và có transcript. Đề đích phải được công bố trong cùng môn, dùng LLM thật, cùng rubric/thời lượng và giữ nguyên nội dung câu hỏi, đáp án tham chiếu, độ khó; chỉ ID ánh xạ/tài liệu được phép khác. Giao diện chỉ liệt kê các phiên bản tương thích.

ReviewJob lưu đánh giá trước khi chấm lại, transcript gốc, người yêu cầu, lý do và ID đề đích. Worker kiểm tra lại tính tương thích khi chạy, dùng chunk cố định của đề đích, giữ nguyên snapshot, câu hỏi, transcript và STT gốc. Lỗi giữ nguyên đánh giá trước; thành công ghi kết quả mới cùng `grading_exam_id`, `source_exam_id`, phiên bản kiến thức/rubric. Luồng này đặt `review_required=true` để giảng viên xem lại. Giảng viên nhập điểm chính thức và nhận xét theo [quy trình khảo thí](examination-workflow.md#tổ-chức-một-kỳ-thi).

Mỗi câu chỉ có một yêu cầu review đang chờ. Bấm lại cùng phiên bản đang chờ trả lại job đó; yêu cầu khác bị từ chối. Nhận dạng lại STT lưu lịch sử và kiểm tra cấu hình trước khi gọi dịch vụ.

## Bộ dữ liệu Software Testing

Dùng [bộ dữ liệu Software Testing](../../data/software-testing-istqb/README.md) để tạo embedding và phiên bản đề đúng cấu hình hiện tại:

```powershell
docker compose cp data/software-testing-istqb api:/tmp/software-testing-istqb
docker compose exec -T api python /tmp/software-testing-istqb/import_course.py
```

Lệnh tạo tài liệu và phiên bản đề theo cấu hình AI đang dùng, giữ nguyên các phiên bản và lịch sử kết quả đã có. Việc giao bài được thực hiện riêng. Có thể chọn phiên bản phù hợp khi chấm lại transcript hoặc giao cho lần thi tiếp theo.

## Kiểm định confidence

Rubric tính điểm theo tiêu chí; confidence do mô hình sinh trong JSON, không phải xác suất chấm đúng đã được kiểm chứng. Dùng các bài chuẩn có điểm giảng viên, kiểm tra sai lệch từng tiêu chí, độ ổn định giữa các lần chạy và tỷ lệ lỗi theo khoảng confidence trước khi sử dụng nó như tín hiệu tin cậy. Tám mẫu trong bộ dữ liệu chỉ là bộ kiểm tra ban đầu, chưa đủ cho kết luận hiệu chuẩn.
