"""Import the supplied ENT samples through the main backend's authenticated API.

Default: validate sources and show the plan, without writing to the backend.
--apply creates missing content; --verify checks imported content read-only.
Credentials stay in memory. This importer never approves, publishes or assigns exams.
"""

import argparse
import hashlib
import io
import json
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx
from dotenv import dotenv_values
from openpyxl import Workbook

ROOT = Path(__file__).resolve().parent
BASE_URL = "https://oral-test.paperlens.uk/api"
HEADERS = [
    "course_code", "exam_name", "rubric_name", "time_minutes",
    "question_number", "topic_name", "difficulty", "question_text",
    "expected_concepts", "english_terms",
]


def digest(content):
    return hashlib.sha256(content).hexdigest()


def one(rows, field, value):
    matches = [r for r in rows if r[field] == value]
    if len(matches) > 1:
        raise RuntimeError(f"Ambiguous {field}: {value}")
    return matches[0] if matches else None


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def workbook(pack, groups):
    book = Workbook()
    sheet = book.active
    sheet.title = "Data"
    sheet.append(HEADERS)
    for group in groups:
        for index, question in enumerate(group["questions"], 1):
            sheet.append([
                pack["course"]["code"], group["exam_name"], pack["rubric"]["name"],
                group["time_minutes"], index, group["topic_name"],
                group["difficulty"], question["text"],
                "; ".join(question["expected_concepts"]), "",
            ])
    result = io.BytesIO()
    book.save(result)
    return result.getvalue()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-root", required=True, type=Path)
    parser.add_argument("--env-file", type=Path, default=ROOT.parents[1] / ".env")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--apply", action="store_true")
    mode.add_argument("--verify", action="store_true")
    args = parser.parse_args()
    pack = json.loads((ROOT / "assessment.json").read_text())
    sources = {}
    for group in pack["groups"]:
        source = group["source"]
        content = (args.source_root / source["relative_path"]).read_bytes()
        require(digest(content) == source["sha256"], f"Changed source: {source['filename']}")
        sources[source["filename"]] = content
        for question in group["questions"]:
            require(10 <= len(question["text"]) <= 4000, "Invalid question length")
        require(sum(q["preparation_seconds"] + q["recording_seconds"]
                    for q in group["questions"]) <= group["time_minutes"] * 60,
                f"Invalid timing: {group['code']}")
        sources[group["code"] + "-source.txt"] = (ROOT / (group["code"] + "-source.txt")).read_bytes()
    rubric_source = pack["rubric_source"]
    require(digest((args.source_root / rubric_source["filename"]).read_bytes()) == rubric_source["sha256"],
            "Changed rubric workbook")
    sources["Speaking-Rubric-source.txt"] = (ROOT / "Speaking-Rubric-source.txt").read_bytes()
    require(len(pack["groups"]) == 6, "Expected six groups")
    require(len(pack["rubric"]["criteria"]) == 5, "Expected five criteria")
    require(sum(c["max_score"] for c in pack["rubric"]["criteria"]) == 10, "Expected total 10")
    if not args.apply and not args.verify:
        print(json.dumps({
            "backend": BASE_URL, "course": pack["course"], "source_documents": len(sources),
            "categories": [g["code"] for g in pack["groups"]],
            "exams": len(pack["groups"]), "parts": 12, "target_status": "GENERATED",
            "rubric_total": 10, "writes": False,
        }, ensure_ascii=False, indent=2))
        return

    cfg = dotenv_values(args.env_file)
    with httpx.Client(base_url=BASE_URL, timeout=120) as client:
        def request(method, path, **kwargs):
            attempts = 3 if method in {"GET", "PUT"} else 1
            for attempt in range(attempts):
                try:
                    response = client.request(method, path, **kwargs)
                except httpx.TransportError:
                    if attempt + 1 == attempts:
                        raise
                    time.sleep(2 ** (attempt + 1))
                    continue
                if response.status_code in {429, 500, 502, 503, 504} and attempt + 1 < attempts:
                    time.sleep(2 ** (attempt + 1))
                    continue
                break
            # Never print request bodies, authentication responses or cookies.
            if response.is_error:
                raise RuntimeError(f"{method} {path}: HTTP {response.status_code}")
            return response

        request("POST", "/auth/login", json={
            "username": cfg["BOOTSTRAP_ADMIN"], "password": cfg["BOOTSTRAP_PASSWORD"],
        })
        cid = pack["course"]["id"]
        course_path = f"/admin/courses/{cid}"

        def workspace():
            return request("GET", course_path + "/workspace").json()

        def get_document(filename):
            return one(workspace()["documents"], "filename", filename)

        course = one(request("GET", "/admin/courses").json(), "id", cid)
        require(course is not None, "Expected existing Speaking Test course")
        require(all(course[k] == pack["course"][k] for k in ("id", "code", "name")),
                "Target course identity changed")
        require(course.get("status", "ACTIVE") == "ACTIVE", "Course is archived")

        # Fail on conflicting existing content before the first write.
        initial = workspace()
        for filename, content in sources.items():
            doc = one(initial["documents"], "filename", filename)
            if doc:
                remote = request("GET", f"/admin/documents/{doc['id']}/content").content
                require(digest(remote) == digest(content), f"Existing document differs: {filename}")
        existing_rubric = one(initial["rubrics"], "name", pack["rubric"]["name"])
        if existing_rubric:
            require(existing_rubric["criteria"] == pack["rubric"]["criteria"], "Existing rubric differs")
        for group in pack["groups"]:
            lo = one(initial["outcomes"], "code", group["outcome"]["code"])
            if lo:
                require(all(lo[k] == v for k, v in group["outcome"].items()), "Existing outcome differs")
            topic = one(initial["topics"], "name", group["topic_name"])
            if topic:
                require(topic["description"] == group["notes"], "Existing topic differs")
            exam = one(initial["exams"], "name", group["exam_name"])
            if exam:
                require(exam["status"] in {"DRAFT", "GENERATED"}, "Exam has entered approval; refusing edits")
                require(exam["imported"], "Existing exam was not imported")
                require([q["text"] for q in exam["questions"]] == [q["text"] for q in group["questions"]],
                        "Existing exam questions differ")

        def ensure_document(filename, topic_id=None, kind="SUPPLEMENT"):
            doc = get_document(filename)
            if doc:
                return doc
            require(args.apply, f"Missing document: {filename}")
            data = {"kind": kind}
            if topic_id:
                data["topic_id"] = topic_id
            mime = "application/pdf" if filename.endswith(".pdf") else "text/plain"
            doc = request("POST", course_path + "/documents", data=data,
                          files={"file": (filename, sources[filename], mime)}).json()
            print(f"Uploaded {filename}", flush=True)
            return get_document(filename)

        rubric = existing_rubric
        if not rubric:
            require(args.apply, "Missing rubric")
            rubric = request("POST", course_path + "/rubrics", json=pack["rubric"]).json()
        rubric_doc = ensure_document("Speaking-Rubric-source.txt")
        topic_ids = {}
        for group in pack["groups"]:
            current = workspace()
            lo = one(current["outcomes"], "code", group["outcome"]["code"])
            if not lo:
                require(args.apply, f"Missing outcome: {group['code']}")
                lo = request("POST", course_path + "/outcomes", json=group["outcome"]).json()
            topic = one(current["topics"], "name", group["topic_name"])
            body = {
                "name": group["topic_name"], "description": group["notes"],
                "learning_outcome_id": lo["id"], "learning_outcome_ids": [lo["id"]],
                "chapter_ids": [], "document_ids": [],
            }
            if not topic:
                require(args.apply, f"Missing topic: {group['code']}")
                topic = request("POST", course_path + "/topics", json=body).json()
            tid = topic["id"]
            topic_ids[group["code"]] = tid
            filename = group["source"]["filename"]
            original = get_document(filename)
            if not original:
                # Reuse the existing ENT001 textbook; never replace the course textbook.
                original = ensure_document(filename, tid)
            companion = ensure_document(group["code"] + "-source.txt", tid)
            body["document_ids"] = [rubric_doc["id"], companion["id"]]
            if original["kind"] == "TEXTBOOK":
                body["chapter_ids"] = [c["id"] for c in workspace()["chapters"]
                                       if c["document_id"] == original["id"]]
                require(body["chapter_ids"], "Textbook chapters are required")
            else:
                body["document_ids"].append(original["id"])
            actual_topic = one(workspace()["topics"], "id", tid)
            equal = all(
                set(actual_topic[k]) == set(v) if isinstance(v, list) else actual_topic[k] == v
                for k, v in body.items()
            )
            if not equal:
                require(args.apply, f"Topic mapping differs: {group['code']}")
                request("PUT", f"/admin/topics/{tid}", json=body)
            print(f"Sources mapped: {group['code']}", flush=True)

        # Worker ingestion is asynchronous. Only use all successfully indexed sources.
        deadline = time.monotonic() + 600
        retries = {}
        while True:
            docs = [d for d in workspace()["documents"] if d["filename"] in sources]
            pending = [d for d in docs if d["status"] != "READY"]
            if not pending:
                break
            require(args.apply, "Some documents are not READY")
            require(time.monotonic() < deadline, "Timed out waiting for document ingestion")
            for doc in pending:
                count, last = retries.get(doc["id"], (0, 0))
                if doc["status"] == "FAILED" and count < 3 and time.monotonic() - last >= 30:
                    request("POST", f"/admin/documents/{doc['id']}/retry")
                    retries[doc["id"]] = (count + 1, time.monotonic())
            print("Indexing: " + ", ".join(f"{d['filename']}={d['status']}" for d in pending), flush=True)
            time.sleep(5)

        current = workspace()
        missing = [g for g in pack["groups"] if not one(current["exams"], "name", g["exam_name"])]
        if missing:
            require(args.apply, "Missing exams")
            content = workbook(pack, missing)
            upload = {"file": ("ENT-speaking-samples.xlsx", content,
                              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
            preview = request("POST", "/admin/imports/exams/preview", files=upload).json()
            require(preview["valid"] and preview["create"] == len(missing), f"Invalid preview: {preview}")
            result = request("POST", "/admin/imports/exams", files=upload).json()
            require(result["valid"] and result["create"] == len(missing), "Import count mismatch")
            print(f"Imported {result['create']} exams", flush=True)

        verified = []
        for group in pack["groups"]:
            exam = one(workspace()["exams"], "name", group["exam_name"])
            eid = exam["id"]
            path = f"/admin/exams/{eid}"
            if exam["category"] != group["code"]:
                require(args.apply, "Category mismatch")
                request("PUT", path + "/category", json={"category": group["code"]})
            draft = request("GET", path + "/draft").json()
            if draft["status"] == "DRAFT":
                require(args.apply, "Exam snapshot missing")
                draft = request("POST", path + "/generate").json()
            require(draft["status"] == "GENERATED", "Expected unapproved generated draft")
            snapshot = draft["snapshot"]
            require(len(snapshot["questions"]) == len(group["questions"]), "Wrong question count")
            questions = []
            for old, expected in zip(snapshot["questions"], group["questions"]):
                require(old["text"] == expected["text"], "Question changed unexpectedly")
                require(old["topic_id"] == topic_ids[group["code"]], "Wrong topic")
                require(old["reference_chunk_ids"], "Missing source references")
                questions.append({
                    k: expected[k] for k in (
                        "text", "expected_concepts", "english_terms",
                        "preparation_seconds", "recording_seconds",
                    )
                } | {"reference_chunk_ids": old["reference_chunk_ids"]})
            body = {"questions": questions, "criteria": pack["rubric"]["criteria"]}
            differs = snapshot["criteria"] != body["criteria"] or any(
                any(old[k] != value for k, value in expected.items())
                for old, expected in zip(snapshot["questions"], questions)
            )
            if differs:
                require(args.apply, "Draft differs from source/timing")
                request("PUT", path + "/draft", json=body)
            final = request("GET", path + "/draft").json()
            require(final["status"] == "GENERATED", "Unexpected exam status")
            require(final["snapshot"]["criteria"] == pack["rubric"]["criteria"], "Rubric mismatch")
            for actual, expected in zip(final["snapshot"]["questions"], questions):
                require(all(actual[k] == value for k, value in expected.items()), "Draft verification failed")
                require(set(actual["reference_chunk_ids"]) <= set(final["snapshot"]["topic_chunk_ids"][actual["topic_id"]]),
                        "Invalid source scope")
            readback = one(workspace()["exams"], "id", eid)
            require(readback["category"] == group["code"], "Category readback failed")
            require(readback["time_limit"] == group["time_minutes"] * 60, "Time limit mismatch")
            require(readback["rubric_id"] == rubric["id"], "Rubric ID mismatch")
            require(all(b["topic_id"] == topic_ids[group["code"]] for b in readback["blueprint"]),
                    "Blueprint mapping mismatch")
            verified.append({
                "category": group["code"], "exam_id": eid, "name": group["exam_name"],
                "topic_id": topic_ids[group["code"]], "mode": group["mode"],
                "status": final["status"], "parts": len(questions),
                "time_limit_seconds": readback["time_limit"],
                "timing": [{"preparation_seconds": q["preparation_seconds"],
                            "recording_seconds": q["recording_seconds"]} for q in questions],
            })
            print(f"Verified {group['code']}: {eid}", flush=True)

        checked_documents = []
        for filename, content in sources.items():
            doc = get_document(filename)
            remote = request("GET", f"/admin/documents/{doc['id']}/content").content
            require(digest(remote) == digest(content), f"Checksum readback failed: {filename}")
            require(doc["status"] == "READY", f"Document not READY: {filename}")
            checked_documents.append({"id": doc["id"], "filename": filename,
                                      "sha256": digest(remote), "status": doc["status"]})
        report = {
            "verified_at": datetime.now(timezone.utc).isoformat(),
            "backend": BASE_URL, "course": pack["course"],
            "assessment_sha256": digest((ROOT / "assessment.json").read_bytes()),
            "rubric_id": rubric["id"], "criteria_count": 5, "rubric_total": 10,
            "exams": verified, "documents": checked_documents,
            "published": False, "assigned": False, "policy": pack["policy"],
        }
        (ROOT / "import-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
        print(json.dumps({"verified_exams": len(verified), "verified_documents": len(checked_documents),
                          "report": str(ROOT / "import-report.json")}, ensure_ascii=False))


if __name__ == "__main__":
    main()
