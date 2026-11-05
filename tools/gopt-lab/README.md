# GOPT Lab

Bộ thử gửi **audio thật và transcript** tới service GOPT của dự án, tuần tự từng mẫu. Kết quả lưu JSON và tùy chọn CSV; không dùng điểm giả khi dịch vụ lỗi. Tool chỉ cần Python 3.10+ thư viện chuẩn.

## Chạy service local

Service GOPT bình thường chỉ ở mạng nội bộ Docker. Nếu thử trên máy phát triển, tạo file `gopt-lab.override.yml`:

```yaml
services:
  gopt:
    ports:
      - "127.0.0.1:8001:8000"
```

```powershell
docker compose -f docker-compose.yml -f docker-compose.gopt.yml -f gopt-lab.override.yml up -d --build gopt
```

Build Kaldi/model lần đầu có thể lâu. Hướng dẫn vận hành đầy đủ: `docs/architecture/gopt.md`. Không chạy lệnh phát triển này đè deployment Jenkins. Có service đang truy cập được thì chỉ dùng `--url`, không cần build lại. Port thử chỉ bind localhost vì service không có xác thực.

## Chuẩn bị và chạy

Ghi một câu như “I like coffee”. Lưu `sentence.wav` cạnh bản sao của `example.json`. Cắt từ chính bản ghi này thành `word-i.wav`, `word-like.wav`, `word-coffee.wav`, không cắt mất âm đầu/cuối. Mỗi clip phải dài ít nhất 0,2 giây. Sửa manifest theo tên file thực tế; đường dẫn audio tính từ vị trí JSON.

```powershell
python tools/gopt-lab/gopt_lab.py tools/gopt-lab/example.json --url http://localhost:8001 --csv tools/gopt-lab/results.csv
```

Mặc định JSON ghi cạnh manifest thành `gopt-results.json`. Dùng `--output` để đổi. Có thể dùng WAV/WebM/MP3 và định dạng ffmpeg của server đọc được. Mỗi audio tối đa 24 MiB; server mặc định tối đa 120 giây. Viết số bằng chữ và dùng từ có trong từ điển tiếng Anh. Tối đa 100 case, tên không trùng, transcript tối đa 6000 ký tự.

Tool kiểm tra model/status, phiên bản, thang điểm 0–10 và số âm vị/đoạn. JSON ghi SHA-256 của audio và transcript thực tế gửi đi để tái lập. Lưu tiến độ sau mỗi mẫu; mẫu lỗi không có điểm. Exit code 1 nếu có mẫu lỗi, 2 nếu đầu vào/cấu hình sai. CSV không chứa transcript; JSON có transcript và đường dẫn audio nên cần quản lý như dữ liệu bài nói.

## Đọc kết quả

- Cùng audio nhưng transcript thay đổi giúp khảo sát ảnh hưởng của forced alignment. Transcript sai không chứng minh GOPT tự nhận ra từ đã nói.
- Cả câu và các từ cắt rời có ngữ cảnh, độ dài và ranh giới âm khác nhau. Điểm câu không phải điểm riêng của từng từ trong câu; không suy ngược điểm từng từ hoặc lấy trung bình đơn giản làm kết luận.
- Pipeline hiện tại: Kaldi căn chỉnh audio với transcript, trích GOP từng âm vị; GOPT xử lý các đoạn tối đa 50 âm vị. Giới hạn đó thuộc model GOPT trong ứng dụng.
- Lặp lại nhiều câu/người nói và đối chiếu giáo viên. Đây chưa phải benchmark độ chính xác.
- Không tự retry khi timeout/429: request trước có thể còn chạy. Đợi service rảnh trước khi chạy lại; `--timeout` mặc định 960 giây. Mỗi case chạy một lần, có lỗi vẫn thử các case tiếp theo tuần tự.

## Kiểm chứng

`python -m pytest tools/tests/test_audio_labs.py` kiểm tra multipart, lỗi từng mẫu, phản hồi không hợp lệ và bảo vệ file đầu vào bằng HTTP service giả lập. `services/gopt/tests` kiểm tra engine/HTTP không cần model. Các test này không chứng minh chất lượng acoustic của model Kaldi/GOPT. Smoke test với container thật vẫn cần service đã build.
