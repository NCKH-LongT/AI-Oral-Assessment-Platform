# Chấm phát âm GOPT trên CPU

## Khởi chạy

```sh
docker compose -f docker-compose.yml -f docker-compose.gopt.yml build gopt
docker compose -f docker-compose.yml -f docker-compose.gopt.yml up -d --build
docker compose -f docker-compose.yml -f docker-compose.gopt.yml ps
docker compose -f docker-compose.yml -f docker-compose.gopt.yml logs --tail=100 gopt worker
```

Luôn dùng cả hai file khi cập nhật deployment này. Overlay bật GOPT cho API/worker,
thêm container nội bộ `gopt` và chờ healthcheck trước khi worker khởi động.
Không cần GPU, API key hay port public mới. Chọn ngôn ngữ tiếng Anh cho môn/đề;
đề đã công bố giữ `speech_language` trong snapshot. Bài tiếng Việt và bài luyện tập
không gọi GOPT. Code local mặc định `GOPT_ENABLED=false`.

Build đầu cần mạng để tải mã nguồn Kaldi/GOPT, PyTorch CPU, model LibriSpeech m13,
từ điển. Ánh xạ âm vị huấn luyện được đóng sẵn trong source. Kaldi được compile với `BUILD_JOBS=1`, không CUDA;
build có thể mất nhiều thời gian và dung lượng đĩa. Nên build image trên máy build
rồi chuyển image sang server ít tài nguyên. Model được đóng sẵn trong image, không
tải lại mỗi lần restart hoặc mỗi câu trả lời. Không cần tải bộ audio SpeechOcean762.

## Luồng xử lý và điểm

Worker xử lý lần lượt **STT → chấm nội dung theo rubric → GOPT → lưu kết quả**.
GOPT nhận bản ghi AUDIO gốc đã kiểm tra kích thước/SHA-256 và transcript, chuyển
PCM mono 16 kHz, trích MFCC/i-vector, chạy acoustic model Kaldi trên CPU, forced
alignment và trích đặc trưng GOP 84 chiều. Model GOPT dùng checkpoint LibriSpeech
chính thức, đúng ánh xạ 39 âm vị từ nhãn huấn luyện và chuẩn hóa `(feature - 3.203) / 4.045`.
Không thay đặc trưng Kaldi bằng wav2vec2 hoặc điểm giả định.

GOPT có context 50 âm vị. Chuỗi dài được chia theo ranh giới từ, mỗi đoạn tối đa
50 âm vị, chấm batch size 1; tổng hợp các đoạn theo số âm vị. Đây là cách mở rộng
cho bài nói dài của ứng dụng, chưa được hiệu chuẩn như benchmark câu ngắn gốc.
Điểm accuracy/completeness/fluency/prosody/total được quy về 0–10 từ đầu ra model
0–2, giới hạn trong thang điểm. `completeness` đối chiếu transcript, không đo độ
đầy đủ nội dung câu trả lời so với đáp án. ASR có thể chuẩn hóa lỗi phát âm;
transcript sai cần được sửa/chấm lại bằng luồng review hiện có.

Kết quả nằm trong `assessment.pronunciation`, bao gồm model revision, hash audio,
hash transcript, số đoạn, số âm vị và điểm. Màn hình xem bài hiển thị điểm phát âm
riêng. Chưa thay tiêu chí rubric hoặc cộng vào điểm tổng; GOPT thành công giữ
nguyên điều kiện review của phần chấm nội dung. Cần hiệu chuẩn với bài nói và điểm
giảng viên thực tế trước khi sử dụng để quyết định điểm thi.

Chỉ chấm từ có trong từ điển tiếng Anh; số cần viết thành chữ trong transcript.
Từ ngoài từ điển, không align đủ âm vị, audio hỏng/dài quá giới hạn, timeout hoặc
dịch vụ lỗi đều trả trạng thái lỗi, không chấm phần bị cắt và không trả điểm 0 giả.
Điểm nội dung đã tính được giữ lại, yêu cầu review. Với hàng đợi server audio,
tác vụ chuyển FAILED và nút thử lại hiện có sẽ chạy lại bước grading, không chạy
lại STT. Với bài desktop cũ, dùng yêu cầu chấm lại/nhận dạng lại audio hiện có.

## Giới hạn tải

| Cấu hình | Mặc định |
| --- | --- |
| Số bài đang xử lý | 1 trên toàn bộ worker dùng cùng PostgreSQL |
| Số request GOPT đang chấm | 1; request đồng thời trả 429, không xếp hàng trong RAM |
| CPU GOPT / worker | Mỗi container tối đa 1 CPU |
| RAM GOPT / worker | Mỗi container tối đa 2 GiB, không swap vượt giới hạn |
| Luồng PyTorch, BLAS, Whisper | 1 |
| Kaldi `nj` / GPU | 1 / tắt |
| Audio | Tối đa 24 MiB và 120 giây mỗi câu |
| Timeout GOPT / HTTP worker | 900 / 960 giây |
| File tạm GOPT | `/tmp` tối đa 512 MiB, dọn sau mỗi request |

`WORKER_SERIAL=true` dùng PostgreSQL transaction advisory lock trên kết nối riêng,
giữ suốt một lượt xử lý, bao gồm STT, review và tài liệu. Worker khác không claim
việc khi khóa bận. Khóa tự nhả khi transaction/kết nối kết thúc hoặc process chết;
hàng đợi và cơ chế lease/recovery hiện tại vẫn hoạt động. SQLite development chỉ
có khóa trong process; deployment nhiều worker phải dùng PostgreSQL như Compose.
Không tắt `WORKER_SERIAL` trên server ít CPU. Service GOPT chỉ chạy **một uvicorn
worker**, không scale replica vì mỗi replica có model và khóa riêng.
Deadline kết thúc cả nhóm tiến trình Kaldi; `init: true` thu hồi tiến trình con
để tránh tích lũy zombie sau timeout.

Các biến có trong `.env.example`: `GOPT_CPUS`, `GOPT_MEMORY`, `WORKER_CPUS`,
`WORKER_MEMORY`, `GOPT_MAX_AUDIO_MB`, `GOPT_MAX_AUDIO_SECONDS`, `GOPT_JOB_TIMEOUT`,
`GOPT_TIMEOUT`. Giữ HTTP timeout lớn hơn job timeout ít nhất 60 giây. Các giới hạn
container không phải cam kết tổng RAM server: PostgreSQL/web/STT và Ollama (nếu
chạy bên ngoài Compose) vẫn cần RAM riêng. Bắt đầu với Whisper `base`/`tiny` và
đo bằng `docker stats` trên phần cứng thật trước khi tăng thời lượng.

## Kiểm tra

```sh
cd services/api
python -m pytest tests/test_pronunciation.py tests/test_worker_serial.py tests/test_server_processing.py
cd ../gopt
python -m pytest tests
```

Test service cần `requirements.txt`, `pytest`, `httpx`; test thuật toán/HTTP không
cần tải model. Smoke test thực tế sau build: tạo bài tiếng Anh ngắn có audio,
nộp bài, chờ worker, kiểm tra `assessment.pronunciation.status=COMPLETED` và điểm
hiển thị trong phần xem bài. Thử thêm một bản ghi phát âm khác cùng câu và xác
nhận điểm thay đổi. Unit test có mock không xác nhận chất lượng chấm acoustic.

Smoke test trên Docker CPU đã kiểm tra HTTP, đổi tốc độ audio, chia 124 âm vị
thành ba đoạn, healthcheck khi bận và từ chối request đồng thời bằng 429.
Audio tổng hợp ngắn mất khoảng 6 giây kể cả nạp model; RAM đỉnh nhóm thử nghiệm
khoảng 387 MiB với giới hạn 1 CPU/2 GiB. Đây không phải benchmark phần cứng server
hoặc bằng chứng độ chính xác với người học thực tế.

## Nguồn và khả năng tái lập

- [GOPT chính thức](https://github.com/YuanGongND/gopt), revision
  `bed909daf8eca035095871e51642525acc5b9b55`; checkpoint `gopt_librispeech`.
- [Kaldi GOP recipe](https://github.com/kaldi-asr/kaldi/tree/e02e35f0254bb033fab73d1df99fc34123e31d56/egs/gop_speechocean762),
  revision `e02e35f0254bb033fab73d1df99fc34123e31d56`.
  Build dùng OpenFst/OpenBLAS của Debian 12. `patch_kaldi.py` chuyển tám lời gọi
  LAPACK có tham số ký tự sang wrapper `LAPACK_*` của header Debian để truyền
  đúng độ dài chuỗi Fortran và điều chỉnh wrapper in FST cho OpenFst 1.7.9
  của Debian; không thay thuật toán hay checkpoint. BuildKit cache giữ bản tải
  model và kết quả compiler giữa các lần build.
- [Acoustic model và i-vector LibriSpeech m13](https://kaldi-asr.org/models/m13).
- [Lỗi ánh xạ âm vị upstream](https://github.com/YuanGongND/gopt/issues/15):
  dùng thứ tự nhãn huấn luyện, không tạo ánh xạ mới từ bài đang chấm.
- `services/gopt/training_phones.json` được đối chiếu bằng cách lấy thứ tự xuất hiện
  đầu tiên trong 47.076 nhãn của [bản sao tr_labels_phn.csv](https://github.com/hf49w/custom-gopt/blob/3f2df988d6915d340acc774977b561dc445a9062/tr_labels_phn.csv).
  Link Dropbox của dữ liệu GOP gốc hiện trả HTML; build không phụ thuộc link này.

`prepare_assets.py` kiểm tra các file cần thiết và ghi SHA-256 vào
`/opt/gopt-assets/manifest.json`. Mã nguồn/checkpoint được pin theo revision;
archive model/dữ liệu bên ngoài dùng URL upstream và ghi hash sau tải, chưa có
checksum upstream cố định để xác thực trước tải. Giữ image đã kiểm chứng và
manifest của deployment để so sánh khi rebuild.
