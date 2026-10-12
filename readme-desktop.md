# OralAI Desktop

[README / danh mục tài liệu](README.md#hướng-dẫn-theo-nhu-cầu)

OralAI Desktop dành cho sinh viên làm bài vấn đáp. App nhận dạng audio gốc bằng **Whisper-small** trên máy, dùng CPU INT8. Sinh viên chọn tiếng Việt hoặc tiếng Anh; câu hỏi và hướng dẫn hiển thị trong suốt lượt trả lời. Transcript được gửi lên server để chấm và cho giảng viên đối chiếu bản ghi.

## Bắt đầu nhanh

Từ thư mục gốc repository:

```bash
npm ci
npm run desktop
```

Lệnh mở Electron và giao diện source tại `http://localhost:3001`. Chạy riêng `npm run dev` để mở giao diện trong trình duyệt. Cần chuẩn bị STT theo [Chạy từ source](#chạy-từ-source) trước khi nhận dạng câu trả lời.

Thanh **Backend** có hai lựa chọn:

| Chế độ | Máy chủ mặc định |
| --- | --- |
| Online | `https://oral-test.paperlens.uk` |
| Local | `http://localhost:3000` |

Online dùng dữ liệu của máy chủ đã triển khai. Local cần backend hoạt động, ví dụ `docker compose up -d --build --wait`. Lựa chọn được nhớ theo profile, phiên đăng nhập tách riêng cho từng backend. Hoàn tất nộp bài trước khi đổi máy chủ.

Đăng nhập Google trên desktop mở trình duyệt hệ thống; khi thành công app tự khôi phục cửa sổ và đưa lên trước. Web local dùng cửa sổ đăng nhập và quay về tab ứng dụng theo quyền của trình duyệt.

## Đổi URL máy chủ khi chạy hoặc build

Các giá trị của launcher source có thể đặt trong `.env` rồi khởi động lại:

```dotenv
ORAL_BACKEND_MODE=online
ORAL_LOCAL_BACKEND_URL=http://localhost:3000
ORAL_ONLINE_BACKEND_URL=https://oral-test.paperlens.uk
ORAL_CLIENT_PORT=3001
```

`ORAL_BACKEND_MODE` áp dụng khi profile chưa lưu lựa chọn. `AI_PROVIDER` cấu hình LLM trên backend, độc lập với bộ chọn máy chủ này.

Để mở trực tiếp giao diện do server phục vụ:

```bash
env -u ELECTRON_RUN_AS_NODE ORAL_WEB_URL=https://oral-test.paperlens.uk npm run desktop:server
```

Windows PowerShell:

```powershell
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
$env:ORAL_WEB_URL = "https://oral-test.paperlens.uk"
npm run desktop:server
```

URL phải là web gốc có `/api`, dùng HTTPS hoặc HTTP localhost; ví dụ `http://localhost:3000`. Trên máy sinh viên, localhost trỏ về chính máy đó. Bộ cài chọn URL qua **Cấu hình máy chủ** tại màn hình đăng nhập. URL không nhúng vào bộ cài lúc build; `ORAL_WEB_URL` có thể dùng khi chạy để chỉ định máy chủ.

## Một lệnh mở app từ code mới — Linux/macOS

Launcher Python/Bash hỗ trợ giao diện source với một backend cố định:

```bash
./run-desktop.sh --server http://localhost:3000
```

Backend cần chạy sẵn. Script mở UI dev và Electron, dùng bundle STT đã chuẩn bị. Xem `./run-desktop.sh --help` để chọn cổng. Với bộ chọn Local/Online trên giao diện, dùng `npm run desktop`.

## Cài và kết nối

1. Tải bộ OralAI đúng hệ điều hành từ artifact **Desktop installers**, cài đặt và mở app.
2. Chọn **Cấu hình máy chủ**, lưu URL web do đơn vị cung cấp.
3. Đăng nhập bằng tài khoản được cấp hoặc Google đúng email trong danh sách thi.
4. Mở **Bài thi của tôi**, chọn bài được giao theo lịch.

Bộ cài gồm helper STT, FFmpeg và Whisper-small. Máy sinh viên cần mạng để đăng nhập, lấy đề, tải minh chứng và nhận điểm; nhận dạng giọng nói chạy cục bộ.

## Kết nối mic và camera trước khi thi

1. Bấm **Cho phép camera & mic**, chọn đúng **Microphone** và **Camera**.
2. Trong **Nhận dạng giọng nói trên desktop**, chọn **Ngôn ngữ nói: Tiếng Việt / Tiếng Anh**.
3. Kiểm tra preview camera, thanh tín hiệu microphone và mức đỉnh dBFS. Nếu âm nhỏ hoặc rè, điều chỉnh vị trí mic và mức đầu vào của hệ điều hành.
4. Chuẩn bị một màn hình, đồng ý ghi màn hình và cấp quyền chia sẻ khi bắt đầu bài thi.

Rút thiết bị đang dùng sẽ chặn ghi tiếp; chọn lại thiết bị rồi bấm **Kết nối lại thiết bị**. Lựa chọn bị khóa trong lúc ghi, nhận dạng hoặc nộp câu trả lời. Chi tiết: [microphone và thoát app](docs/microphone-desktop.md).

## Khi làm bài

1. Bấm **Bắt đầu thi** khi thiết bị và điều kiện phiên thi đã sẵn sàng.
2. Đọc câu hỏi và hướng dẫn, bấm **Bắt đầu trả lời**. App ghi audio và camera của câu trả lời.
3. Bấm **Kết thúc trả lời**, chờ Whisper-small nhận dạng bản ghi gốc. App hiển thị trạng thái xử lý và trạng thái sẵn sàng để nộp.
4. Bấm **Nộp câu trả lời & tiếp tục**, hoặc **Thử STT lại** / **Ghi lại** nếu cần. Nếu máy chưa có model Whisper-small, app bỏ qua STT và vẫn cho nộp audio/video gốc để tiếp tục thi. Câu trả lời này không có transcript, độ tin cậy STT hoặc điểm AI; cần giảng viên xem lại hoặc admin yêu cầu nhận dạng lại từ audio. Các lỗi nhận dạng khác vẫn cần thử lại hoặc ghi lại trước khi nộp.
5. Sau câu cuối, chờ minh chứng tải xong rồi bấm **Nộp bài thi**.

Transcript tự động cùng độ tin cậy được gửi lên server; giảng viên xem trong **Kết quả & xem lại**. Desktop chỉ hiển thị trạng thái nhận dạng cho sinh viên. Audio/video gốc luôn được giữ làm minh chứng. Server chấm bất đồng bộ theo rubric và RAG, trả điểm hoặc trạng thái cần xem lại.

## Ngôn ngữ nhận dạng

Whisper-small là model cố định của desktop. Chọn ngôn ngữ chính của câu trả lời, mặc định **Tiếng Việt**. Lựa chọn được nhớ trên thiết bị cho origin máy chủ hiện tại. Có thể đổi ngôn ngữ trước khi bấm **Thử STT lại**; bản ghi vẫn giữ nguyên. Lỗi nhận dạng lại hoặc model bị gỡ sau lần nhận dạng thành công giữ kết quả thành công gần nhất. App kiểm tra lại model mỗi lần nhận dạng; cài model khi app đang mở rồi bấm **Thử STT lại** để dùng bản ghi đang giữ.

Hotword lấy từ đúng môn/phiên thi: tối đa 500 mục, 100 ký tự/mục và 10.000 ký tự tổng cộng. Hotword gợi ý thuật ngữ cho STT, không bảo đảm mọi từ đều nhận đúng. Chất lượng nhận dạng cần đối chiếu bằng audio thực tế.

## Làm lại bài thi

Sinh viên xem **Xem lần N** để mở kết quả cũ, hoặc **Làm lại bài thi** khi còn lượt. Số lượt do chính sách đề và lượt cấp thêm quyết định. [Hướng dẫn lượt thi](docs/architecture/exam-retakes.md).

## Transcript và đối chiếu bản ghi

Giảng viên mở **Kết quả & xem lại → Xem bài** để đối chiếu transcript với audio/video. Admin có thể yêu cầu nhận dạng lại hoặc chấm lại, có lý do và lịch sử. [Chi tiết review](docs/transcript-correction.md).

Mỗi câu trả lời có một audio và một video camera. Gửi lại đúng file tiếp tục upload cũ; server từ chối file khác cùng loại cho câu đó. Các đoạn ghi màn hình được xem riêng tại **Giám sát màn hình toàn bài thi**, chọn từng đoạn trong một khung phát. Bản ghi màn hình không phải video trả lời của câu đầu. Dữ liệu cũ có nhiều camera/audio vẫn xem được bằng bộ chọn bản ghi.

## Chạy từ source

Cần Node 22.12+, Python 3.12 và backend hoạt động. Tạo môi trường build STT riêng:

```bash
npm ci
python3.12 -m venv .venv-stt
.venv-stt/bin/pip install -r scripts/requirements-desktop-stt.txt
.venv-stt/bin/python scripts/build_desktop_stt.py
npm run desktop
```

Windows dùng `py -3.12 -m venv .venv-stt`, sau đó `.venv-stt\Scripts\pip` và `.venv-stt\Scripts\python`. Build cần mạng để tải dependency/model; helper chạy nhận dạng offline. Model được ghim revision và dùng lại nếu tài nguyên đã đầy đủ.

`ORAL_PYTHON` chỉ định Python ngoài khi debug; launcher tự dùng `.venv-stt` nếu có. `ORAL_WHISPER_MODEL` có thể chỉ định thư mục Whisper-small cho Electron. Khi chạy helper trực tiếp, dùng `ORAL_STT_MODEL` cho đường dẫn model và `STT_LANGUAGE=vi|en` cho ngôn ngữ. `STT_MODEL` trên server cấu hình riêng cho Whisper server.

## Build bộ cài và chạy lại

Sau khi chuẩn bị bundle STT trên đúng OS/architecture:

```bash
npm run check -w apps/desktop
npm run test:desktop
npm run dist -w apps/desktop
```

Output tại `apps/desktop/dist`: Windows `.exe`, Linux `.deb`/AppImage, macOS `.dmg`/`.zip`. `npm run pack -w apps/desktop` tạo thư mục unpacked để kiểm tra. Có thể chạy workflow GitHub Actions **Desktop installers** và tải artifact đúng máy đích.

- UI/API/worker: triển khai server theo [Jenkins](docs/jenkins.md) hoặc Docker Compose rồi mở lại app.
- Electron/preload: chạy source mới hoặc cài bộ desktop mới.
- Helper STT: chạy script build, đóng gói lại rồi cài bản mới.

Bộ cài chưa có auto-update, code signing hoặc notarization. Chi tiết build, license và kiểm thử: [desktop-build.md](docs/desktop-build.md).

## STT trên server do admin chọn

**Cấu hình hệ thống → STT & giọng nói** điều khiển STT cho bài thử trên web. Khi review bài, admin có thể chọn Gemini hoặc Google để nhận dạng lại audio gốc. Gemini dùng `GEMINI_API_KEY` / `GEMINI_STT_MODEL`; Google dùng JSON service account lưu trên server. Model nhận dạng trên desktop vẫn là Whisper-small.

## Xử lý lỗi

| Hiện tượng | Cách xử lý |
| --- | --- |
| Chưa có model Whisper-small | Vẫn thi và nộp bản ghi được; câu cần xem lại, chưa có điểm AI. Cài model rồi Thử STT lại trước khi nộp, hoặc admin nhận dạng lại sau đó |
| Khôi phục chế độ thi chờ mãi hoặc báo lỗi | Bấm Hủy khôi phục, đóng hộp chia sẻ nếu còn mở; kiểm tra một màn hình/quyền ghi/mạng rồi thử lại. App tự dừng lần khôi phục sau 30 giây; không cho trả lời khi giám sát chưa sẵn sàng |
| Không nhận được camera/mic | Kiểm tra quyền hệ điều hành, chọn thiết bị và kết nối lại |
| STT lỗi hoặc không có tiếng nói | Kiểm tra mic, thử STT lại hoặc ghi lại câu trả lời |
| STT quá thời gian | Đóng tác vụ đang dùng nhiều CPU, thử câu trả lời ngắn hơn |
| Có nhiều màn hình | Dùng Chuẩn bị màn hình hoặc Settings → Displays như hướng dẫn bên dưới |
| Upload chưa xong | Giữ app mở, kiểm tra mạng và thử tải lại minh chứng |
| Đề không xuất hiện | Kiểm tra backend, email, danh sách được giao và lịch thi |

## Môn luyện nói TOEIC

Bộ `TOEIC-SPEAKING-01` có 11 câu, 2 tranh minh họa, tài liệu RAG và rubric chấm nội dung thang 10. Chọn **Tiếng Anh** trước khi ghi. Điểm chưa đánh giá phát âm/ngữ điệu hoặc quy đổi thành TOEIC chính thức. [Nhập dữ liệu và giao bài](data/toeic-speaking/README.md).

## Truy cập và ghi màn hình bắt buộc

Nếu báo còn hai màn hình dù đã tắt màn hình phụ: nút nguồn không nhất thiết ngắt đầu ra của hệ điều hành. Trên **Ubuntu/GNOME**, dùng **Chuẩn bị màn hình → Màn hình cần giữ → Tắt màn hình phụ** ngay trong app. Chọn màn hình bạn đang nhìn (ví dụ HDMI-3); app tạm vô hiệu hóa các đầu ra còn lại, kiểm tra hệ điều hành và Electron chỉ còn một màn hình, rồi bạn bấm **Bắt đầu thi** hoặc **Khôi phục chế độ thi**. Bước tắt màn hình tách khỏi bắt đầu ghi để vẫn có thao tác người dùng cấp quyền chia sẻ màn hình.

App lưu cấu hình cũ trước khi thay đổi và tự khôi phục sau khi kết thúc, rời trang thi hoặc thoát app bình thường. Trước khi bắt đầu có nút **Khôi phục các màn hình**. Nếu app bị dừng đột ngột hoặc màn hình bị rút, cấu hình vẫn được giữ trong `exam-display-backup.json` ở thư mục dữ liệu desktop để thử khôi phục khi mở lại. App không tự ghi đè nếu phát hiện bạn đã thay đổi cấu hình bên ngoài; khi đó khôi phục bằng Settings → Displays. Các thay đổi dùng chế độ tạm thời của [GNOME Mutter DisplayConfig](https://gitlab.gnome.org/GNOME/mutter/-/blob/main/data/dbus-interfaces/org.gnome.Mutter.DisplayConfig.xml).

Tính năng tự tắt hiện cần GNOME cùng `/usr/bin/python3` và `python3-gi` (Ubuntu Desktop thông thường đã có); bản đóng gói có kèm helper nhưng dùng thư viện hệ thống này. Windows/macOS và Linux không có dịch vụ GNOME DisplayConfig vẫn hướng dẫn tắt trong cài đặt hệ điều hành hoặc rút cáp; không tự động tắt trên các hệ đó. Trên Windows chọn chế độ chỉ một màn hình bằng **Win+P**. Cần đóng/mở desktop sau khi cập nhật source để nạp IPC/helper mới. Khi khôi phục bị chặn vì nhiều màn hình, app thoát kiosk để bạn sửa cài đặt; bài đang thi vẫn tiếp tục tính giờ. Nếu khôi phục lỗi, quá thời gian hoặc bị hủy, app cũng thoát kiosk, giữ cấu hình một màn hình đã chuẩn bị và giữ các đoạn ghi có sẵn để tải minh chứng. Có thể bấm **Khôi phục chế độ thi** lần nữa; chỉ bật trả lời khi chế độ thi, ghi màn hình bắt buộc và đồng bộ sự kiện đã thành công. Kết quả chia sẻ đến muộn sau khi hủy không bật lại chế độ thi. **Hủy khôi phục** chỉ hủy thao tác kết nối lại, không hủy bài hay dừng đồng hồ.

Web dành cho **ADMIN, EXAM_OFFICER (khảo thí), TEACHER**. Sinh viên đăng nhập và làm bài bằng **OralAI Desktop**. Đổi server tại nút **Cấu hình máy chủ** trước khi đăng nhập.

Với mỗi lần thi mới (trừ bài thử thiết bị), sinh viên phải đồng ý ghi toàn màn hình rồi cấp quyền chia sẻ trước khi bắt đầu. Đóng thông tin riêng tư, dùng một màn hình và cấp quyền ghi màn hình trong hệ điều hành nếu được yêu cầu. App ghi màn hình từ lúc bắt đầu đến khi bấm nộp, hiện trạng thái ghi rõ ràng, không thu âm hệ thống; microphone/camera câu trả lời vẫn được lưu riêng. Giao diện chia bản ghi thành các đoạn khoảng 60 giây, tải lên server khi thi và tải đoạn cuối trước khi hoàn tất nộp bài. Giữ app mở đến khi báo đã nộp; lỗi upload có nút thử lại.

Trong lúc thi, app bật kiosk toàn màn hình, chặn menu chuột phải, DevTools, tải file, sao chép/dán, reload và một số phím tắt điều hướng. Không đổi server hoặc đăng xuất được khi đang thi. Khi rời cửa sổ, thu nhỏ, thoát toàn màn hình, đổi màn hình hoặc ngắt ghi, app dừng câu trả lời đang ghi và yêu cầu **Khôi phục chế độ thi**. Đồng hồ thi vẫn chạy. Sự kiện giám sát được lưu và bài chuyển sang cần giảng viên xem lại; sự kiện không phải kết luận gian lận.

Đây là hạn chế ở cấp ứng dụng, không khóa hoàn toàn hệ điều hành và không ngăn được thiết bị phụ hay client đã sửa. Header `X-Oral-Client: desktop` phân biệt kênh truy cập được hỗ trợ, không phải chứng thực bộ cài; một client tự viết có thể giả mạo header. Server kiểm tra quyền, đồng ý ghi và có bản ghi hoàn tất, nhưng không thể chứng minh video bao phủ toàn bộ thời gian thi. Nếu triển khai kỳ thi cần bảo đảm cao, cần máy được quản lý bằng chính sách kiosk của hệ điều hành và giám thị. Nút thoát khẩn cấp vẫn xác nhận rời ứng dụng; đoạn chưa tải lên có thể mất khi đóng cưỡng bức. Khi mở lại phiên đang thi, sự kiện khởi động lại được ghi nhận và phải khôi phục ghi màn hình.

Server cần chạy đầy đủ migration đến `0007`, cập nhật đồng bộ API/worker/web. `EXAM_SCREEN_REQUIRED` mặc định `true`. Chính sách ghi màn hình được lưu theo phiên thi. Người dùng bộ cài cần phiên bản Electron tương ứng; người chạy source đóng rồi mở lại app sau khi cập nhật.

### Cập nhật cho chế độ thiếu model và khôi phục có thể hủy

Cần cập nhật đồng bộ web/API và chạy lại Electron source mới (hoặc cài desktop mới) để dùng đầy đủ hai luồng này. Không cần migration database mới. Thiếu model được ghi rõ trong lịch sử nộp, không tự gửi audio sang STT ngoài; yêu cầu audio/video và màn hình theo chính sách vẫn giữ nguyên. Bộ cài phát hành vẫn yêu cầu tài nguyên STT đầy đủ khi build.
