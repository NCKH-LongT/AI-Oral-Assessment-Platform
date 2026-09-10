from alembic import context
from app import models  # noqa: F401
from app.db import Base, engine

with engine.connect() as connection:
    # SQLite batch table rebuilds require FK enforcement disabled on this connection only.
    if connection.dialect.name == "sqlite":
        connection.exec_driver_sql("PRAGMA foreign_keys=OFF")
        connection.commit()
    context.configure(connection=connection, target_metadata=Base.metadata)
    with context.begin_transaction():
        context.run_migrations()
    if connection.dialect.name == "sqlite":
        violations = connection.exec_driver_sql("PRAGMA foreign_key_check").all()
        if violations:
            raise RuntimeError("Migration produced foreign key violations")
        connection.commit()
        connection.exec_driver_sql("PRAGMA foreign_keys=ON")
