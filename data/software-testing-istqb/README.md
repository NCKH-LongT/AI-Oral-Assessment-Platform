# Software Testing — bộ dữ liệu vấn đáp

[README / danh mục tài liệu](../../README.md#hướng-dẫn-theo-nhu-cầu)

Mã môn: **SWT-ISTQB-01**. Ngôn ngữ: tiếng Việt. Đề gồm **2 câu, 20 phút**, mỗi câu thang 10; điểm bài là trung bình hai câu. Mỗi sinh viên có 1 lượt theo cấu hình ban đầu.

Tham chiếu [ISTQB CTFL syllabus v4.0.1](https://istqb.org/wp-content/uploads/2024/11/ISTQB_CTFL_Syllabus_v4.0.1.pdf), mục 4.2.1–4.2.3, trang 39–41, mục tiêu K3. © ISTQB và các tác giả được ghi trong syllabus. Các tình huống, rubric và bài trả lời mẫu là nội dung tự biên soạn; đây không phải đề chứng chỉ hoặc tài liệu được ISTQB công nhận. Bộ này chỉ bao phủ ba mục tiêu học tập nêu trên, không phải toàn bộ CTFL.

## Hai câu hỏi

1. **SWT-Q01 — EP và BVA:** API chấp nhận tuổi nguyên 18–65. Xác định phân vùng, chọn test EP tối thiểu, thiết kế BVA 2 giá trị và kết quả mong đợi, tính bao phủ của bộ 18/65, phân tích sai toán tử tại hai cận và giới hạn của kết luận bao phủ.
2. **SWT-Q02 — Bảng quyết định:** thành viên giảm 10%; khách khác có mã hợp lệ giảm 5%; còn lại 0%, không cộng dồn. Lập bốn cột đầy đủ, tính tiền phải trả cho đơn 500.000đ, đo bao phủ của TT/FF, bổ sung test còn thiếu và phát hiện lỗi cộng dồn.

Nguyên văn câu hỏi, đáp án và dữ liệu đầu vào/đầu ra nằm trong [assessment.json](assessment.json). Hai tài liệu [SWT-Q01.txt](SWT-Q01.txt), [SWT-Q02.txt](SWT-Q02.txt) chứa căn cứ để RAG truy xuất.

## Rubric và dữ liệu chấm

| Tiêu chí | Điểm tối đa |
|---|---:|
| Hiểu yêu cầu và khái niệm | 2 |
| Áp dụng kỹ thuật kiểm thử | 2 |
| Dữ liệu và kết quả mong đợi | 2 |
| Độ bao phủ và tính đầy đủ | 2 |
| Lập luận và giới hạn kết luận | 2 |

Mỗi tiêu chí có 4 ý kiểm tra riêng cho từng câu; mỗi ý đúng được 0,5 điểm. Không cho điểm âm, không yêu cầu thuộc nguyên văn. Dữ liệu chấm gồm đáp án, checklist 20 ý/câu, test cases, lỗi thường gặp và quy tắc chấp nhận cách diễn đạt khác. Không chấm accent hoặc độ trôi chảy từ transcript.

[calibration.json](calibration.json) có **8 bài trả lời với nhãn điểm tham chiếu**: đầy đủ, một phần, không liên quan và chỉ dẫn yêu cầu bỏ rubric cho mỗi câu. Các nhãn do người soạn xác định, chưa phải kết quả đo LLM. Khi đánh giá LLM, gọi `app.ai.grade` với câu hỏi từ snapshot, 5 tiêu chí và chunk thật đã truy xuất; so điểm từng tiêu chí với nhãn, kiểm tra dẫn chứng, rồi để giảng viên duyệt sai lệch. Không dùng các mẫu để tuyên bố mô hình đã được kiểm định.

## Nạp vào server đang chạy

Từ thư mục gốc repository trong PowerShell:

```powershell
docker compose cp data/software-testing-istqb api:/tmp/software-testing-istqb
docker compose exec -T api python /tmp/software-testing-istqb/import_course.py
```

Importer tạo môn, 3 LO, 2 chủ đề, 2 tài liệu bổ sung, rubric và đề có đúng hai câu cố định. Đề được lưu trạng thái `PUBLISHED` với snapshot theo cấu trúc ứng dụng; câu hỏi do người soạn, không gọi LLM sinh câu mới. Đáp án/checklist chỉ ở dữ liệu phía server; API phiên thi chỉ trả phần câu hỏi cho sinh viên. Không tạo sinh viên, không ghi danh và không giao bài tự động.

Lần chạy lại với cùng dữ liệu/cấu hình AI không tạo bản trùng. Nếu dữ liệu hoặc provider/model thay đổi, importer tạo tài liệu/rubric/đề phiên bản mới trong cùng môn, giữ nguyên snapshot và lịch sử bản cũ. Không ghi đè môn trùng mã được tạo ngoài importer.

## Trạng thái AI và cách sử dụng

Lần nạp đầu ngày 20/09/2026 dùng `AI_PROVIDER=demo`: tài liệu READY, có 4 chunk, chưa chấm điểm LLM thật. Sau khi cấu hình Gemini, đã nạp thêm phiên bản `[gemini]` với embedding thật; giữ nguyên đề demo và lịch sử. Phiên bản đề mới không tự thay thế các bài thi đã nộp.

Để chấm thật, cấu hình Gemini hoặc Ollama theo README gốc; sau khi áp dụng cấu hình cho API/worker, chạy lại hai lệnh import trên để embedding và snapshot mới cùng dùng cấu hình AI thực. Nếu đổi cấu hình mà dùng đề cũ, worker sẽ từ chối vì snapshot không còn khớp. Không sửa thủ công snapshot đề cũ.

Mở http://localhost:3000 bằng tài khoản admin → **Môn học & đề thi → Software Testing**. Tài liệu và rubric hiện trong môn. Chỉ thêm sinh viên/giao đề đúng phiên bản khi muốn tổ chức thi. Giao diện công bố bản sao theo luồng thông thường có thể sinh câu mới; muốn giữ đúng hai câu tự soạn thì dùng đề do importer tạo.

Đối với bài cũ bị lỗi cấu hình, vào **Kết quả & xem lại → Chấm lại transcript đã nộp**, chọn phiên bản Gemini tương thích và nhập lý do. Luồng giữ nguyên transcript, câu hỏi, rubric và lịch sử; kết quả cần giảng viên xem lại. Xem [thiết kế](../../docs/architecture/grading-confidence.md).
