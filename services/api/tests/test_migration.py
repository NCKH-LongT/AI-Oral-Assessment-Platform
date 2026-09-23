"""Run the actual SQLite upgrade against populated MVP tables, outside test metadata."""

import json
import os
import sqlite3
import subprocess
import sys
from pathlib import Path


def test_sqlite_upgrade_preserves_mvp_data(tmp_path):
    root = Path(__file__).resolve().parents[1]
    database = tmp_path / "legacy.db"
    environment = os.environ | {
        "DATABASE_URL": f"sqlite:///{database}",
        "PYTHONPATH": str(root),
    }
    command = [sys.executable, "-m", "alembic", "-c", "alembic.ini", "upgrade"]
    subprocess.run(command + ["0001"], cwd=root, env=environment, check=True, capture_output=True)
    with sqlite3.connect(database) as db:
        db.execute(
            "INSERT INTO users VALUES (?, ?, ?, ?, ?, ?, ?)",
            ("legacy", "Legacy", "not-a-real-hash", "ADMIN", "ACTIVE", "u", 1),
        )
        # Explicit column names keep this regression independent of table ordering.
        db.execute(
            "INSERT INTO courses (id,created_at,code,name,description,owner_id,status) VALUES ('c',1,'OLD','Old course','','u','ACTIVE')"
        )
        db.execute(
            "INSERT INTO learning_outcomes (id,created_at,course_id,code,description,weight) VALUES ('lo',1,'c','LO1','Original LO',1)"
        )
        db.execute(
            "INSERT INTO topics (id,created_at,course_id,learning_outcome_id,name,description) VALUES ('t',1,'c','lo','Topic','')"
        )
        db.execute(
            "INSERT INTO documents (id,created_at,course_id,topic_id,filename,storage_key,status,version,embedding_model) VALUES ('d',1,'c','t','a.txt','original-key','READY',1,'demo-hash-768-v1')"
        )
        db.execute(
            "INSERT INTO document_chunks (id,created_at,document_id,course_id,topic_id,learning_outcome_id,page,content,embedding) VALUES ('ch',1,'d','c','t','lo',1,'Original knowledge',?)",
            (json.dumps([0.0] * 768),),
        )
        db.execute(
            "INSERT INTO rubrics (id,created_at,course_id,name,version,criteria) VALUES ('r',1,'c','Rubric',1,'[]')"
        )
        db.execute(
            "INSERT INTO exams (id,created_at,course_id,rubric_id,name,time_limit,blueprint,status,snapshot) VALUES ('e',1,'c','r','Legacy exam',900,'[]','PUBLISHED','{}')"
        )
        db.execute(
            "INSERT INTO exam_sessions (id,created_at,exam_id,student_id,status,started_at,completed_at,final_score) VALUES ('s',1,'e','u','COMPLETED',2,3,8)"
        )
        db.execute(
            "INSERT INTO question_attempts (id,created_at,session_id,sequence,question,status,transcript) VALUES ('a',1,'s',1,'{}','GRADED','Original answer')"
        )
    subprocess.run(command + ["head"], cwd=root, env=environment, check=True, capture_output=True)
    # A second upgrade must be a no-op.
    subprocess.run(command + ["head"], cwd=root, env=environment, check=True, capture_output=True)
    with sqlite3.connect(database) as db:
        assert db.execute("PRAGMA foreign_key_check").fetchall() == []
        assert db.execute("SELECT * FROM topic_outcomes").fetchall() == [("t", "lo")]
        assert db.execute("SELECT * FROM topic_documents").fetchall() == [("t", "d")]
        assert db.execute("SELECT kind,storage_key FROM documents").fetchone() == (
            "SUPPLEMENT",
            "original-key",
        )
        assert db.execute("SELECT content FROM document_chunks").fetchone() == ("Original knowledge",)
        assert db.execute("SELECT version_num FROM alembic_version").fetchone() == ("0004",)

        assert db.execute(
            "SELECT attempt_number,deleted_at,final_score FROM exam_sessions WHERE id='s'"
        ).fetchone() == (1, None, 8)
        assert db.execute("SELECT transcript FROM question_attempts WHERE id='a'").fetchone() == (
            "Original answer",
        )
        assert db.execute("SELECT max_attempts FROM exams WHERE id='e'").fetchone() == (1,)
        db.execute(
            "INSERT INTO exam_sessions (id,created_at,exam_id,student_id,status,attempt_number) VALUES ('s2',4,'e','u','DEVICE_CHECK',2)"
        )
        assert db.execute("SELECT COUNT(*) FROM exam_sessions").fetchone() == (2,)
        assert db.execute("PRAGMA foreign_key_check").fetchall() == []
