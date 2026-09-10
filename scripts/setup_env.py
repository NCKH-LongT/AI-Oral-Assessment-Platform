"""Create a local .env without displaying secrets or replacing an existing file."""

import secrets
from pathlib import Path

root = Path(__file__).resolve().parents[1]
output = root / ".env"
if output.exists():
    raise SystemExit(".env đã tồn tại; giữ nguyên cấu hình hiện có.")
text = (root / ".env.example").read_text()
for placeholder in (
    "replace-with-random-at-least-32-characters",
    "replace-with-a-strong-password",
    "replace-with-random-database-password",
    "replace-with-random-storage-password",
):
    text = text.replace(placeholder, secrets.token_urlsafe(36))
output.write_text(text)
output.chmod(0o600)
print("Đã tạo .env. Xem BOOTSTRAP_ADMIN và BOOTSTRAP_PASSWORD trong file để đăng nhập.")
