# TOEIC Speaking — Bộ luyện 01

Mã môn `TOEIC-SPEAKING-01`. Bộ luyện tự biên soạn có 11 câu, 5 chuẩn đầu ra, 11 chủ đề gắn từng câu, 11 tài liệu RAG, đáp án tham khảo, checklist và lỗi thường gặp. Rubric gồm hoàn thành yêu cầu, chính xác nội dung, ngữ pháp, từ vựng, liên kết/rõ ý; mỗi tiêu chí tối đa 2 điểm thô. Hai tiêu chí nội dung có trọng số 3, ba tiêu chí ngôn ngữ có trọng số 1; tổng quy đổi có trọng số về thang 10. Đề đã công bố có thời lượng **30 phút, làm lại không giới hạn**.

Cấu trúc tham chiếu [ETS TOEIC Speaking and Writing Examinee Handbook](https://www.ets.org/content/dam/ets-org/pt_pt/pdfs/toeic/toeic-speaking-writing-examinee-handbook.pdf) (truy cập 07/10/2026):

| Câu | Dạng luyện | Dữ liệu kèm theo |
| --- | --- | --- |
| 1–2 | Đọc thành tiếng | Thông báo trung tâm và xe đưa đón |
| 3–4 | Mô tả tranh | Hai tranh SVG tự vẽ: họp văn phòng, quán cà phê |
| 5–7 | Trả lời câu hỏi | Thói quen, công cụ, phương pháp luyện tiếng Anh |
| 8–10 | Dùng thông tin cho sẵn | Lịch ngày hội nghề nghiệp, thời gian, phí và diễn giả |
| 11 | Trình bày quan điểm | Làm việc ở nhà hai ngày mỗi tuần |

Các tranh, tình huống, đáp án và rubric do dự án tự biên soạn, không phải câu hỏi ETS. Tranh minh họa thay ảnh chụp; câu hỏi hiện bằng văn bản. Thời gian ghi trong từng câu là gợi ý, ứng dụng chỉ áp dụng giới hạn tổng 30 phút. Đây là bộ luyện, chưa mô phỏng đầy đủ giao diện và cách tổ chức thi TOEIC.

## Giới hạn điểm

AI chấm **nội dung transcript 0–10**, chưa chấm phát âm/ngữ điệu/độ lưu loát từ âm thanh; riêng hai câu đọc chỉ kiểm tra nội dung được nhận dạng so với đoạn cho sẵn. Không quy đổi sang điểm TOEIC 0–200. Điểm từng câu = `10 × Σ(điểm tiêu chí / 2 × trọng số) / 9`. Điểm toàn bài là trung bình 11 câu theo cơ chế ứng dụng. Giảng viên cần nghe bản ghi khi STT nhận sai. Gemini STT không cung cấp độ tin cậy âm học nên kết quả có thể chuyển sang trạng thái cần giảng viên duyệt.

Mỗi tiêu chí có 4 mục checklist: đạt 0,5; đạt một phần 0,25; chưa đạt 0. Đáp án mở chấp nhận lựa chọn, trải nghiệm và lập luận hợp lý khác mẫu. Không chấm theo việc thuộc nguyên văn đáp án mẫu, trừ nhiệm vụ đọc đoạn cho sẵn.

## Nhập môn và giao bài

Cần stack đã chạy, một ADMIN hoạt động, cấu hình LLM/embedding thật có thể gọi được (không dùng `demo`). Import gọi dịch vụ embedding theo cấu hình hiện tại.

```bash
docker compose cp data/toeic-speaking api:/tmp/toeic-speaking
docker compose exec -T api python /tmp/toeic-speaking/import_course.py
```

Script thêm tất cả tài khoản **STUDENT / ACTIVE** vào môn và giao đề; không tạo tài khoản giả, không đổi mật khẩu/quyền, không thêm tài khoản ngừng hoạt động. Chạy lại giữ nguyên dữ liệu đã nhập, đồng thời bổ sung sinh viên mới. Nếu nội dung hoặc cấu hình AI đổi, tạo phiên bản đề và tài liệu mới, giữ lịch sử cũ. Môn trùng mã nhưng không thuộc bộ import sẽ bị từ chối.

Snapshot đóng băng rubric, tài liệu/chunk, cấu hình AI, ngôn ngữ `en` và hotword riêng của môn. Không đặt `practice: true` vì cờ đó dành cho bài thử thiết bị không chấm điểm. Tài liệu đáp án chỉ dành cho quản trị/giảng viên; API phiên thi sinh viên chỉ trả câu hỏi và đường dẫn tranh được cho phép.

## Làm bài

Đăng nhập sinh viên → mở **TOEIC Speaking — Bộ luyện 01**. Trên desktop chọn **English + Whisper-small**; lựa chọn ngôn ngữ/model của người dùng vẫn được giữ. Trên web, đề tự đặt ngôn ngữ STT là tiếng Anh, nhà cung cấp theo cấu hình máy chủ. Desktop luôn dùng **bản ghi gốc**, không có thu thử trước thi, gain hoặc RNNoise. Trình duyệt web mặc định dùng bản gốc và vẫn có thể bật RNNoise khi cần. Kiểm tra transcript rồi nộp để server chấm rubric/RAG.

## Kiểm tra chấm

`assessment.json` là dữ liệu gốc; `Q01.txt`–`Q11.txt` là evidence tương ứng; `calibration.json` có câu trả lời đầy đủ, thông tin sai và quan điểm có phát triển. Kiểm tra bằng LLM đang cấu hình (có gọi API):

```bash
docker compose exec -T api python /tmp/toeic-speaking/check_grading.py
```

Script gọi đúng đường `grade_answer` nhưng không tạo lượt thi hay lưu điểm sinh viên. Khoảng điểm chỉ dùng kiểm tra lỗi rõ ràng, không phải nghiên cứu xác lập độ tin cậy hoặc chứng nhận TOEIC.
