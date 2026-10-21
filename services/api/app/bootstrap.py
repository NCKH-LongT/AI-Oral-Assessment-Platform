from sqlalchemy import select

from .config import settings
from .db import SessionLocal
from .models import User
from .permissions import role_filter
from .security import hasher


def bootstrap():
    cfg = settings()
    with SessionLocal() as db:
        if db.scalar(select(User).where(role_filter("ADMIN"))):
            return
        if len(cfg.bootstrap_password) < 12:
            raise ValueError("BOOTSTRAP_PASSWORD must be at least 12 characters")
        db.add(
            User(
                username=cfg.bootstrap_admin,
                name="Quản trị viên",
                role="ADMIN",
                password_hash=hasher.hash(cfg.bootstrap_password),
            )
        )
        db.commit()


if __name__ == "__main__":
    bootstrap()
