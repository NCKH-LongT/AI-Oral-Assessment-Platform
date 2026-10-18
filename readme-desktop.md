# OralAI Desktop

[README / danh mục tài liệu](README.md#hướng-dẫn-theo-nhu-cầu)

OralAI Desktop dành cho sinh viên làm bài vấn đáp. App ghi audio/camera và tải minh chứng lên server. Sau khi sinh viên nộp toàn bài, server đưa từng câu vào hàng đợi **STT → chấm điểm**, theo cấu hình **STT & giọng nói**. Sinh viên không cần chờ Whisper chạy trên máy trước khi nộp. Đã bỏ chức năng Học & thi thử; desktop chỉ liệt kê các bài thi được giao.

## Bắt đầu nhanh

Từ thư mục gốc repository:

```bash
npm ci
npm run desktop
```

Lệnh mở Electron và giao diện source tại `http://localhost:3001`. Chạy riêng `npm run dev` để mở giao diện trong trình duyệt. Các hướng dẫn bundle STT bên dưới dành cho đóng gói và tương thích client cũ.

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

Bộ cài gồm helper STT, FFmpeg và Whisper-small. Máy sinh viên cần mạng để đăng nhập, lấy đề, tải minh chứng và nhận xác nhận nộp bài. Bài thi được nhận dạng trên server.

## Kết nối mic và camera trước khi thi

1. Bấm **Cho phép camera & mic**, chọn đúng **Microphone** và **Camera**.
2. Trong **Nhận dạng giọng nói trên desktop**, chọn **Ngôn ngữ nói: Tiếng Việt / Tiếng Anh**.
3. Kiểm tra preview camera, thanh tín hiệu microphone và mức đỉnh dBFS. Nếu âm nhỏ hoặc rè, điều chỉnh vị trí mic và mức đầu vào của hệ điều hành.
4. Chuẩn bị một màn hình, đồng ý ghi màn hình và cấp quyền chia sẻ khi bắt đầu bài thi.

Rút thiết bị đang dùng sẽ chặn ghi tiếp; chọn lại thiết bị rồi bấm **Kết nối lại thiết bị**. Lựa chọn bị khóa trong lúc ghi, nhận dạng hoặc nộp câu trả lời. Chi tiết: [microphone và thoát app](docs/microphone-desktop.md).

## Khi làm bài

1. Bấm **Bắt đầu thi** khi thiết bị và điều kiện phiên thi đã sẵn sàng.
2. Mỗi câu xuất hiện với đếm ngược **N giây chuẩn bị**, mặc định **10 giây**; hết thời gian, app tự ghi audio/camera.
3. Đồng hồ ghi âm giới hạn **M giây**, mặc định **60 giây**. Có thể bấm **Kết thúc trả lời** sớm; hết M giây app tự dừng.
4. App tự nộp câu trả lời và tải audio/video. Khi tải xong sẽ chuyển câu tiếp theo; câu cuối tự nộp toàn bài sau khi tải đủ cả minh chứng màn hình.
5. Nếu mạng/storage lỗi, bản ghi còn trong app và có **Tải lại** / **Nộp bài thi** để hoàn tất. Không đóng app trước xác nhận đã nộp.

Giáo viên/admin chỉnh N và M riêng cho từng câu trong **Review câu hỏi & rubric** trước khi duyệt đề: **Thời gian chuẩn bị (giây)** (0–600), **Thời gian trả lời tối đa (giây)** (1–1800). Đề đã công bố cần sao chép thành bản nháp để đổi; câu cũ thiếu cấu hình dùng 10/60 giây. Thời lượng toàn bài vẫn là giới hạn trên. Đồng hồ chuẩn bị/bắt đầu ghi được lưu trên server để mở lại app không được cấp lại toàn bộ thời gian.

Desktop chỉ hiển thị **Đã nộp bài thi** khi server đã nhận đủ câu trả lời và minh chứng. Sinh viên có thể đóng app sau xác nhận này; không cần chờ STT/chấm điểm. Lịch sử trên desktop chỉ hiển thị lần thi, thời gian và xác nhận nộp, không có điểm hoặc tiến độ chấm. **Admin, khảo thí và giáo viên có quyền xem trạng thái xử lý và điểm trên web**. Không đóng app khi còn bản ghi chưa tải xong.

## Cấu hình STT và xử lý lỗi hàng đợi

Admin chọn nhà cung cấp ở **Cấu hình hệ thống → STT & giọng nói**: Whisper server, Gemini hoặc Google. Nếu cấu hình cũ chọn Whisper desktop (`local`), hàng đợi dùng Whisper trên server (`local_server`). Ngôn ngữ được lấy từ đề nếu có, nếu không dùng cấu hình STT của hệ thống; hotword lấy từ đúng môn/đề. Cấu hình được lưu cùng từng yêu cầu nộp câu.

Worker lưu trạng thái trong database. Nếu worker dừng giữa chừng, tác vụ được nhận lại sau khi lease hết hạn (5 phút), không xử lý song song cùng một câu. Nếu STT hoặc chấm thất bại, câu bị đánh dấu lỗi và giữ bản ghi để kiểm tra; không tạo điểm 0 giả. Giảng viên phụ trách/admin mở chi tiết và bấm **Thử xử lý lại** sau khi kiểm tra cấu hình. Lỗi chấm thử lại từ transcript đã nhận dạng; lỗi STT nhận dạng lại audio với cấu hình STT hiện tại. Nhiều lần worker bị ngắt liên tiếp sẽ chuyển tác vụ sang lỗi cần xử lý.

Whisper server cần model `STT_MODEL` và bộ nhớ/CPU phù hợp; lần đầu có thể phải tải model. Gemini dùng API key; Google dùng service-account JSON. Không phụ thuộc model Whisper trên máy sinh viên cho bài thi mới. Client cũ vẫn giữ luồng transcript cục bộ để tương thích; các hướng dẫn build/helper bên dưới áp dụng cho luồng đó.

## Làm lại bài thi

Sinh viên xem **Xem lần N** để mở kết quả cũ, hoặc **Làm lại bài thi** khi còn lượt. Số lượt do chính sách đề và lượt cấp thêm quyết định. [Hướng dẫn lượt thi](docs/architecture/exam-retakes.md).

## Transcript và đối chiếu bản ghi

Trên web, admin/khảo thí/giáo viên có quyền mở **Kết quả & xem lại → chọn môn**, có thể lọc thêm đề hoặc ngày thi (giờ Việt Nam). Chỉ chọn môn là có danh sách. Danh sách gồm sinh viên được giao bài/ghi danh chưa thi và người đã thi, trạng thái xử lý, điểm chính thức khi đã hoàn tất. Mỗi sinh viên hiển thị lần gần nhất trong bộ lọc; không có bộ lọc số lần làm bài; **Xem bài** mở chi tiết đúng sinh viên/lần thi, quay lại giữ bộ lọc. Transcript từ server được đối chiếu với audio/video gốc. Admin có thể yêu cầu nhận dạng lại hoặc chấm lại, có lý do và lịch sử. [Chi tiết review](docs/transcript-correction.md).

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

**Cấu hình hệ thống → STT & giọng nói** điều khiển STT cho hàng đợi bài thi và yêu cầu nhận dạng lại của nhân sự. Khi review bài, admin có thể chọn Gemini hoặc Google để nhận dạng lại audio gốc. Gemini dùng `GEMINI_API_KEY` / `GEMINI_STT_MODEL`; Google dùng JSON service account lưu trên server. Chức năng Học & thi thử đã được gỡ khỏi web/desktop.

## Xử lý lỗi

| Hiện tượng | Cách xử lý |
| --- | --- |
| Chưa có model Whisper-small trên desktop | Bài thi mới vẫn nộp bản ghi để server xử lý; model desktop chỉ cần cho bài thử/luồng cũ |
| Khôi phục chế độ thi chờ mãi hoặc báo lỗi | Bấm Hủy khôi phục, đóng hộp chia sẻ nếu còn mở; kiểm tra một màn hình/quyền ghi/mạng rồi thử lại. App tự dừng lần khôi phục sau 30 giây; không cho trả lời khi giám sát chưa sẵn sàng |
| Không nhận được camera/mic | Kiểm tra quyền hệ điều hành, chọn thiết bị và kết nối lại |
| STT bài thi báo lỗi | Giảng viên kiểm tra bản ghi/cấu hình ở chi tiết bài và bấm Thử xử lý lại |
| STT bài thử thiết bị quá thời gian | Đóng tác vụ đang dùng nhiều CPU, thử câu trả lời ngắn hơn |
| Có nhiều màn hình | Dùng Chuẩn bị màn hình hoặc Settings → Displays như hướng dẫn bên dưới |
| Upload chưa xong | Giữ app mở, kiểm tra mạng và thử tải lại minh chứng |
| Không kết nối được backend Online / kết nối bị gián đoạn khi nộp | App thử lại tối đa 3 lần cho request nộp/upload an toàn, giữ nguyên mã chống trùng. Nếu vẫn lỗi, giữ app mở và bấm Nộp câu trả lời & tiếp tục hoặc Tải lại. Gửi kèm đường dẫn request, HTTP và mã tra cứu trong thông báo để kiểm tra log |
| Đề không xuất hiện | Kiểm tra backend, email, danh sách được giao và lịch thi |

Lỗi `BACKEND_UNREACHABLE`/`BACKEND_TIMEOUT` phát sinh tại lớp proxy của desktop khi không nhận được phản hồi từ server. Log terminal chạy app hoặc web local có dòng `oral_backend_request_failed`, mã tra cứu và loại lỗi mạng; không ghi token hay nội dung câu trả lời. Bản ghi được giữ trong phiên app để thử lại nếu lấy trạng thái sau upload thất bại. Đóng cưỡng bức hoặc tải lại app có thể làm mất bản ghi chưa tải lên.

## Môn luyện nói TOEIC

Bộ `TOEIC-SPEAKING-01` có 11 câu, 2 tranh minh họa, tài liệu RAG và rubric chấm nội dung thang 10. Đặt ngôn ngữ đề là **Tiếng Anh** để hàng đợi nhận dạng đúng ngôn ngữ. Điểm chưa đánh giá phát âm/ngữ điệu hoặc quy đổi thành TOEIC chính thức. [Nhập dữ liệu và giao bài](data/toeic-speaking/README.md).

## Truy cập và ghi màn hình bắt buộc

Nếu báo còn hai màn hình dù đã tắt màn hình phụ: nút nguồn không nhất thiết ngắt đầu ra của hệ điều hành. Trên **Ubuntu/GNOME**, dùng **Chuẩn bị màn hình → Màn hình cần giữ → Tắt màn hình phụ** ngay trong app. Chọn màn hình bạn đang nhìn (ví dụ HDMI-3); app tạm vô hiệu hóa các đầu ra còn lại, kiểm tra hệ điều hành và Electron chỉ còn một màn hình, rồi bạn bấm **Bắt đầu thi** hoặc **Khôi phục chế độ thi**. Bước tắt màn hình tách khỏi bắt đầu ghi để vẫn có thao tác người dùng cấp quyền chia sẻ màn hình.

App lưu cấu hình cũ trước khi thay đổi và tự khôi phục sau khi kết thúc, rời trang thi hoặc thoát app bình thường. Trước khi bắt đầu có nút **Khôi phục các màn hình**. Nếu app bị dừng đột ngột hoặc màn hình bị rút, cấu hình vẫn được giữ trong `exam-display-backup.json` ở thư mục dữ liệu desktop để thử khôi phục khi mở lại. App không tự ghi đè nếu phát hiện bạn đã thay đổi cấu hình bên ngoài; khi đó khôi phục bằng Settings → Displays. Các thay đổi dùng chế độ tạm thời của [GNOME Mutter DisplayConfig](https://gitlab.gnome.org/GNOME/mutter/-/blob/main/data/dbus-interfaces/org.gnome.Mutter.DisplayConfig.xml).

Tính năng tự tắt hiện cần GNOME cùng `/usr/bin/python3` và `python3-gi` (Ubuntu Desktop thông thường đã có); bản đóng gói có kèm helper nhưng dùng thư viện hệ thống này. Windows/macOS và Linux không có dịch vụ GNOME DisplayConfig vẫn hướng dẫn tắt trong cài đặt hệ điều hành hoặc rút cáp; không tự động tắt trên các hệ đó. Trên Windows chọn chế độ chỉ một màn hình bằng **Win+P**. Cần đóng/mở desktop sau khi cập nhật source để nạp IPC/helper mới. Khi khôi phục bị chặn vì nhiều màn hình, app thoát kiosk để bạn sửa cài đặt; bài đang thi vẫn tiếp tục tính giờ. Nếu khôi phục lỗi, quá thời gian hoặc bị hủy, app cũng thoát kiosk, giữ cấu hình một màn hình đã chuẩn bị và giữ các đoạn ghi có sẵn để tải minh chứng. Có thể bấm **Khôi phục chế độ thi** lần nữa; chỉ bật trả lời khi chế độ thi, ghi màn hình bắt buộc và đồng bộ sự kiện đã thành công. Kết quả chia sẻ đến muộn sau khi hủy không bật lại chế độ thi. **Hủy khôi phục** chỉ hủy thao tác kết nối lại, không hủy bài hay dừng đồng hồ.

Web dành cho **ADMIN, EXAM_OFFICER (khảo thí), TEACHER**. Sinh viên đăng nhập và làm bài bằng **OralAI Desktop**. Đổi server tại nút **Cấu hình máy chủ** trước khi đăng nhập.

Với mỗi lần thi mới, sinh viên phải đồng ý ghi toàn màn hình rồi cấp quyền chia sẻ trước khi bắt đầu. Đóng thông tin riêng tư, dùng một màn hình và cấp quyền ghi màn hình trong hệ điều hành nếu được yêu cầu. App ghi màn hình từ lúc bắt đầu đến khi bấm nộp, hiện trạng thái ghi rõ ràng, không thu âm hệ thống; microphone/camera câu trả lời vẫn được lưu riêng. Giao diện chia bản ghi thành các đoạn khoảng 60 giây, tải lên server khi thi và tải đoạn cuối trước khi hoàn tất nộp bài. Giữ app mở đến khi báo đã nộp; lỗi upload có nút thử lại.

Trong lúc thi, app bật kiosk toàn màn hình, chặn menu chuột phải, DevTools, tải file, sao chép/dán, reload và một số phím tắt điều hướng. Không đổi server hoặc đăng xuất được khi đang thi. Khi rời cửa sổ, thu nhỏ, thoát toàn màn hình, đổi màn hình hoặc ngắt ghi, app dừng câu trả lời đang ghi và yêu cầu **Khôi phục chế độ thi**. Đồng hồ thi vẫn chạy. Sự kiện giám sát được lưu và bài chuyển sang cần giảng viên xem lại; sự kiện không phải kết luận gian lận.

Đây là hạn chế ở cấp ứng dụng, không khóa hoàn toàn hệ điều hành và không ngăn được thiết bị phụ hay client đã sửa. Header `X-Oral-Client: desktop` phân biệt kênh truy cập được hỗ trợ, không phải chứng thực bộ cài; một client tự viết có thể giả mạo header. Server kiểm tra quyền, đồng ý ghi và có bản ghi hoàn tất, nhưng không thể chứng minh video bao phủ toàn bộ thời gian thi. Nếu triển khai kỳ thi cần bảo đảm cao, cần máy được quản lý bằng chính sách kiosk của hệ điều hành và giám thị. Nút thoát khẩn cấp vẫn xác nhận rời ứng dụng; đoạn chưa tải lên có thể mất khi đóng cưỡng bức. Khi mở lại phiên đang thi, sự kiện khởi động lại được ghi nhận và phải khôi phục ghi màn hình.

Server cần chạy đầy đủ migration đến `0009`, cập nhật đồng bộ API/worker/web. `EXAM_SCREEN_REQUIRED` mặc định `true`. Chính sách ghi màn hình được lưu theo phiên thi. Người dùng bộ cài cần phiên bản Electron tương ứng; người chạy source đóng rồi mở lại app sau khi cập nhật.

### Cập nhật cho chế độ thiếu model và khôi phục có thể hủy

Cần cập nhật đồng bộ web/API và chạy lại Electron source mới (hoặc cài desktop mới) để dùng đầy đủ hai luồng này. Luồng hàng đợi mới cần migration `0009`; cập nhật đồng bộ API/worker/web. Với bài thử/client cũ, thiếu model được ghi rõ trong lịch sử nộp. Bài thi mới nhận dạng trên server theo cấu hình hệ thống; yêu cầu audio/video và màn hình theo chính sách vẫn giữ nguyên. Bộ cài phát hành vẫn yêu cầu tài nguyên STT đầy đủ khi build.

### Quyền xem điểm

API dành cho người làm bài (`/exams/available`, `/exam-sessions` và các phản hồi mở lại/nộp bài) chỉ trả xác nhận nộp, không trả điểm tổng, điểm từng câu, nhận xét chấm hoặc trạng thái worker. Điểm được cung cấp qua API quản lý có kiểm tra vai trò và quyền theo môn. Cần cập nhật đồng bộ API và web để áp dụng; cần migration `0009` để lưu đồng hồ chuẩn bị câu hỏi.

### Dọn bản ghi của lần thi cũ

Worker tự xóa audio/video/các đoạn màn hình của những lần cũ khi đã có lần nộp mới hơn của **cùng sinh viên và cùng đề**. Chỉ dọn khi bài cũ đã kết thúc và không còn tác vụ STT/chấm/chấm lại; bài mới đang làm chưa kích hoạt dọn. Điểm, transcript, số lượt và lịch sử đối chiếu vẫn giữ. File được xóa qua hàng đợi có thử lại khi storage lỗi. Quy tắc áp dụng cả các lần cũ đang có sau khi triển khai; bản ghi đã dọn không xem hoặc nhận dạng lại được.

## Đợt thi theo lớp

Từ bản cập nhật bộ môn/lớp (`0010`), admin/khảo thí phân sinh viên vào lớp và tạo đợt từ ngân hàng đề. Sinh viên chỉ thấy đợt được giao và chỉ mở bài trong lịch của đợt; đề nguồn trong ngân hàng không phải bài thi được giao. Mỗi đợt có lượt thi riêng, kể cả dùng cùng bộ câu hỏi. Thêm vào lớp sau khi đã tạo đợt không tự thêm vào danh sách đợt cũ; liên hệ khảo thí kiểm tra danh sách/lịch. Desktop tiếp tục gửi bài cho server xử lý và không hiển thị điểm. [Hướng dẫn lớp học](docs/user-guide.md#bộ-môn-lớp-học-và-đợt-thi).
