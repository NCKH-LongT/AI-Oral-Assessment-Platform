from sqlalchemy import select

from .config import settings
from .db import SessionLocal
from .models import User
from .practice import ensure_practice
from .security import hasher


def bootstrap():
    cfg = settings()
    with SessionLocal() as db:
        if db.scalar(select(User).where(User.role == "ADMIN")):
            ensure_practice(db)
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
        ensure_practice(db)


if __name__ == "__main__":
    bootstrap()
