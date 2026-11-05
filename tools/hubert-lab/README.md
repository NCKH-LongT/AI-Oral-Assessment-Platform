# HuBERT Lab

Bộ thử **đặc trưng audio HuBERT**, chạy CPU, không phụ thuộc Kaldi hay Docker. Model gốc không tự trả điểm phát âm hoặc transcript. Tool so sánh cosine của đặc trưng trung bình theo thời gian; chưa nối kết quả vào điểm thi.

## Cài và chạy

Cần Python 3.10+. Từ thư mục gốc dự án:

```powershell
python -m venv .venv-hubert-lab
./.venv-hubert-lab/Scripts/python.exe -m pip install "torch>=2.6,<3" --index-url https://download.pytorch.org/whl/cpu
./.venv-hubert-lab/Scripts/python.exe -m pip install -r tools/hubert-lab/requirements.txt
./.venv-hubert-lab/Scripts/python.exe tools/hubert-lab/compare.py tools/hubert-lab/example.json
```

`imageio-ffmpeg` đi kèm bộ giải mã, dùng khi máy chưa có ffmpeg trong PATH; không cần compile. Chuẩn bị audio theo `example.json`; đường dẫn tính từ vị trí manifest. Mỗi mẫu 0,2–30 giây, tối đa 24 MiB. Audio dài hơn bị từ chối, không trả kết quả cho phần cắt. Clip im lặng và file hỏng bị từ chối.

Mặc định model `facebook/hubert-base-ls960`, revision cố định `dba3bb02fda4248b6e082697eee756de8fe8aa8a`, hidden layer 6. Model chính thức chỉ có `pytorch_model.bin`: tool dùng PyTorch >=2.6 với `weights_only=True`, không chạy custom code từ Hub. Lần đầu tải khoảng 378 MB trọng số, cache trong `.data/hubert-cache`. Đừng commit model/audio.

Sau lần tải thành công:

```powershell
./.venv-hubert-lab/Scripts/python.exe tools/hubert-lab/compare.py tools/hubert-lab/example.json --offline --output tools/hubert-lab/results.json
```

Có thể chỉ định `--model`, `--revision` (commit SHA 40 ký tự), `--layer`, `--cache-dir`. Model khác phải có revision phù hợp. Lỗi model hoặc audio tham chiếu dừng với exit code 2; mẫu so sánh lỗi được lưu riêng và exit code 1. JSON được lưu sau từng mẫu, chứa model revision, hash audio thực tế đã giải mã, thời lượng, số frame và phiên bản thư viện. Không ghi đè file đầu vào.

## Thiết kế thử nghiệm

Chọn một câu ngắn. Ghi bản đúng tham chiếu, cùng người đọc lại đúng, cố tình sai một âm, người khác đọc đúng và một câu khác. Nhờ người có chuyên môn nghe xác minh lỗi và giữ mic/âm lượng tương tự.

- Cùng file phải gần 1: đây là đối chứng kỹ thuật.
- So sánh thứ tự bản đúng/sai cùng người và ảnh hưởng người nói khác. Nếu bản sai gần tham chiếu hơn bản đúng của người khác, metric chưa tách được yếu tố người nói.
- Mean pooling làm mất thứ tự âm thanh và có thể bỏ sót lỗi ngắn. Cosine [-1,1] là độ tương đồng đặc trưng, không phải xác suất hay điểm rubric; không nhân 10 để chấm thi.
- Chạy GOPT Lab trên cùng audio/transcript và đối chiếu điểm giảng viên. Hai metric khác thang đo, không so trực tiếp trị số lớn hơn để kết luận model tốt hơn.

## Kiểm chứng đã thực hiện

Đã chạy checkpoint thật trên CPU với audio nói mẫu từ tài liệu Transformers: https://huggingface.co/datasets/Narsil/asr_dummy/resolve/main/1.flac. Bản tham chiếu dài 10,435 giây; cùng file cho cosine 1,0. Bản giảm tốc độ bằng atempo=0.85 cho khoảng 0,99057. Đây là smoke test đường xử lý, không chứng minh khả năng chấm lỗi phát âm.

Môi trường đã chạy: torch 2.15.0+cpu, transformers 4.57.6, numpy 2.5.4; JSON của mỗi lần chạy ghi phiên bản thực tế. Đã thử `--offline` từ cache, clip ngắn/dài/im lặng và file đầu vào được bảo vệ.

```powershell
$env:RUN_HUBERT_MODEL="1"
./.venv-hubert-lab/Scripts/python.exe -m pytest tools/tests/test_audio_labs.py -q
```

Ca model thật cần checkpoint đã cache. Nếu không bật biến này, các ca kiểm tra đầu vào/HTTP/giải mã vẫn chạy và ca model được bỏ qua.

Muốn chấm phát âm thật cần dữ liệu có nhãn giáo viên, tách tập theo người nói, huấn luyện/chọn scoring head và hiệu chuẩn trên tập giữ riêng. CTC/alignment âm vị cũng cần model được fine-tune tương ứng. Tool này giữ đúng vai trò thử nghiệm, không tự thay GOPT.

Nguồn: https://huggingface.co/facebook/hubert-base-ls960 và https://huggingface.co/docs/transformers/model_doc/hubert
