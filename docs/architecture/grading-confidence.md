# Độ tin cậy và chấm lại theo phiên bản đề — 20/09/2026

[README / danh mục tài liệu](../../README.md#hướng-dẫn-theo-nhu-cầu)

## Ý nghĩa kết quả

`assessment.status` tách kết quả chấm khỏi trạng thái xử lý hàng đợi:

| Trạng thái đánh giá | confidence | Ý nghĩa |
|---|---|---|
| COMPLETED | 0–1 | LLM đã trả kết quả hợp lệ; đây là độ tin cậy tự báo, chưa được hiệu chuẩn |
| FAILED | null | Chấm thất bại, không có ước lượng độ tin cậy |
| NOT_GRADED | null | Demo, luyện tập hoặc không có câu trả lời |

`Attempt.status=GRADED` vẫn có nghĩa đã xử lý lần đầu để tương thích luồng cũ; giao diện đã dùng nhãn “Đã xử lý”. Kết quả lỗi không được biến thành điểm 0 hoặc confidence 0. Điểm 0 và confidence 0 từ một kết quả LLM hợp lệ vẫn được giữ nguyên.

API admin chuẩn hóa cách đọc kết quả cũ có placeholder `confidence=0`, không ghi đè dữ liệu/lịch sử. UI chỉ hiện phần trăm khi có điểm hợp lệ và không có lỗi. STT là một chỉ số riêng; STT thấp hoặc transcript đã sửa có thể yêu cầu giảng viên xem lại nhưng không ép confidence của LLM về 0.

## Cấu hình đề và tài liệu

Snapshot cố định provider, model, embedding và prompt version tại thời điểm công bố. Đổi `.env` không nâng cấp đề cũ. Sai khác trả mã `AI_CONFIG_MISMATCH`, có thông báo tạo phiên bản đề/tài liệu phù hợp. Kiểm tra trước khi tạo lượt mới, bắt đầu thi và trước khi gửi audio đi nhận dạng lại; worker kiểm tra lại vì cấu hình có thể thay đổi giữa các bước.

Không bỏ kiểm tra snapshot hoặc trộn vector từ các embedding khác nhau. Không tự sửa đề cũ và không giảm `CONFIDENCE_THRESHOLD` để che lỗi cấu hình. Các lỗi provider khác có mã `GRADING_FAILED`; log chỉ ghi mã lỗi và loại ngoại lệ, không ghi URL chứa token hoặc nội dung lỗi thô của provider.

`AI_TIMEOUT` chỉ lỗi chờ phản hồi; `AI_OUTPUT_INVALID` chỉ kết quả sai schema/thang điểm/dẫn chứng. `GEMINI_TIMEOUT` mặc định 180 giây, giới hạn 10–900 giây; không tự thử lại vô hạn.

Trong kiểm tra thực tế, Gemini từng trả điểm 75 cho tiêu chí tối đa 2. Prompt `rubric-bounded-v2` nói rõ dùng điểm thô, không dùng phần trăm. Schema gửi provider giới hạn tên tiêu chí, số tiêu chí, ID dẫn chứng và điểm tối đa theo rubric; backend vẫn kiểm tra riêng trần điểm từng tiêu chí khi rubric có nhiều mức trần. Các ràng buộc numeric/enum theo [Gemini structured outputs](https://ai.google.dev/gemini-api/docs/structured-output). Không tự chia 75 cho 100 hoặc cắt về điểm tối đa vì như vậy sẽ biến kết quả không hợp lệ thành điểm thi. Thay đổi prompt version yêu cầu phiên bản đề mới.

## Chấm lại transcript đã nộp

Admin vào **Kết quả & xem lại → chọn lượt thi → Chấm lại transcript đã nộp**. Chọn phiên bản đề và nhập lý do. Luồng này chỉ gửi transcript và dữ liệu chấm tới LLM, không gọi STT hay gửi lại audio.

Endpoint `POST /admin/attempts/{id}/grade-review` nhận `target_exam_id` và `reason`. Chỉ ADMIN được gọi. Phiên thi phải đã nộp, chưa xóa, câu đã xử lý và có transcript. Đề đích phải được công bố trong cùng môn, dùng LLM thật, cùng rubric/thời lượng và giữ nguyên nội dung câu hỏi, đáp án tham chiếu, độ khó; chỉ ID ánh xạ/tài liệu được phép khác. Giao diện chỉ liệt kê các phiên bản tương thích.

ReviewJob lưu đánh giá cũ, transcript gốc, người yêu cầu, lý do và ID đề đích. Worker kiểm tra lại tính tương thích khi chạy, dùng chunk cố định của đề đích, không sửa snapshot, câu hỏi, transcript hoặc STT gốc. Lỗi giữ nguyên đánh giá trước; thành công ghi kết quả mới cùng `grading_exam_id`, `source_exam_id`, phiên bản kiến thức/rubric. Luôn để `review_required=true` khi chấm qua luồng này; không tự công bố điểm chính thức. Chức năng nhập điểm duyệt thủ công vẫn là phạm vi phát triển riêng.

Mỗi câu chỉ có một yêu cầu review đang chờ. Bấm lại cùng phiên bản đang chờ trả lại job đó; yêu cầu khác bị từ chối. Review STT cũ vẫn có lịch sử và kiểm tra cấu hình trước khi gọi dịch vụ.

## Software Testing trên môi trường hiện tại

Đề gốc được tạo trong chế độ demo; sau khi đổi sang Gemini, hai câu bị chặn trước khi gọi LLM. Đây là lỗi cấu hình phiên bản, không phải LLM chấm rubric với độ tin cậy thấp.

Dùng [bộ dữ liệu Software Testing](../../data/software-testing-istqb/README.md) để tạo embedding và phiên bản đề đúng cấu hình hiện tại:

```powershell
docker compose cp data/software-testing-istqb api:/tmp/software-testing-istqb
docker compose exec -T api python /tmp/software-testing-istqb/import_course.py
```

Lệnh giữ nguyên đề/lịch sử cũ, không giao bài tự động; có thể phát sinh phí embedding khi provider là Gemini. Sau đó chọn phiên bản mới khi chấm lại bài cũ hoặc giao đề mới cho lần thi sau.

## Kiểm định confidence

Rubric tính điểm theo tiêu chí; confidence do mô hình sinh trong JSON, không phải xác suất chấm đúng đã được kiểm chứng. Dùng các bài chuẩn có điểm giảng viên, kiểm tra sai lệch từng tiêu chí, độ ổn định giữa các lần chạy và tỷ lệ lỗi theo khoảng confidence trước khi sử dụng nó như tín hiệu tin cậy. Tám mẫu trong bộ dữ liệu chỉ là bộ kiểm tra ban đầu, chưa đủ cho kết luận hiệu chuẩn.
