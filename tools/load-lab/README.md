# Thử 30 người đăng nhập và vào phiên đồng thời

Chỉ chạy trên deployment test có tài khoản riêng. Script thật sự tạo/resume phiên, không chỉ đọc healthcheck. Chuẩn bị JSON không commit: `{"accounts":[{"username":"test01","password":"...","exam_id":"..."}, ...]}` đủ 30 tài khoản khác nhau đã có quyền vào đề.

`python tools/load-lab/probe.py accounts.private.json --url http://localhost:8000 --confirm-test-environment --output load-results.json`

Dùng URL API trực tiếp. Script giữ cookie riêng từng người, không ghi mật khẩu/cookie vào báo cáo. Báo cáo tỷ lệ thành công và p50/p95 cho login, danh sách đề, tạo phiên, đọc phiên. Đây chưa phải kiểm thử upload, STT/GOPT hoặc 30 job AI chạy đồng thời. Đo CPU/RAM/queue của deployment trong lúc chạy, giữ cấu hình phần cứng cùng báo cáo. Chưa chạy benchmark thực tế vì chưa chuẩn bị deployment test và 30 tài khoản.
