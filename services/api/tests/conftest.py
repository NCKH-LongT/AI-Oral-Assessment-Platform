import os
import tempfile

os.environ["JWT_SECRET"] = "test-only-secret-never-use-in-deployment-12345"
os.environ["DATA_DIR"] = tempfile.mkdtemp(prefix="oral-tests-")
os.environ["DATABASE_URL"] = os.environ.get("TEST_DATABASE_URL", "sqlite://")
os.environ["AI_PROVIDER"] = "demo"
os.environ["REDIS_URL"] = ""
os.environ["STORAGE_BACKEND"] = "local"
os.environ["GOOGLE_STT_CREDENTIALS_FILE"] = ""

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine, event  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from app import worker  # noqa: E402
from app.db import Base, get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models import User  # noqa: E402
from app.security import hasher  # noqa: E402


@pytest.fixture
def env(monkeypatch):
    url = os.environ["DATABASE_URL"]
    engine = create_engine(
        url,
        **(
            {"connect_args": {"check_same_thread": False}, "poolclass": StaticPool}
            if url == "sqlite://"
            else {}
        ),
    )
    if engine.dialect.name == "sqlite":

        @event.listens_for(engine, "connect")
        def foreign_keys(connection, _):
            connection.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)

    def db_override():
        with factory() as db:
            yield db

    app.dependency_overrides[get_db] = db_override
    monkeypatch.setattr(worker, "SessionLocal", factory)
    with factory() as db:
        for role in ("ADMIN", "TEACHER", "STUDENT", "REVIEWER"):
            db.add(
                User(
                    username=role.lower(),
                    name=role,
                    role=role,
                    password_hash=hasher.hash("test-password-123"),
                )
            )
        db.add(
            User(
                username="outsider",
                name="Other student",
                role="STUDENT",
                password_hash=hasher.hash("test-password-123"),
            )
        )
        db.commit()
    clients = {}
    for name in ("admin", "teacher", "student", "reviewer", "outsider"):
        client = TestClient(app)
        response = client.post("/auth/login", json={"username": name, "password": "test-password-123"})
        assert response.status_code == 200
        clients[name] = client
    yield clients, factory
    for client in clients.values():
        client.close()
    app.dependency_overrides.clear()
    Base.metadata.drop_all(engine)
    engine.dispose()
