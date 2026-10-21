"""Remove the three explicitly replaced Speaking courses, after live ENT verification.

Dry-run by default. --apply performs the course-tree deletions authorized on
2026-10-21. No accounts or departments are deleted. The allowlist uses exact IDs
and codes; future unrelated courses cannot be selected by a name search.
"""
import argparse
import json
import time
from datetime import datetime, timezone

import httpx
from dotenv import dotenv_values
from import_course import BASE_URL, ROOT, one, require

LEGACY = {
    "5107eb6d-d3ad-44bc-b0ae-37389c687b75": "IELTS4.0",
    "25c3d679-dc4e-4dec-862a-1acfea978b53": "SE102",
    "973610ab-47a6-49a8-807b-2b0d83905ae6": "ENGLISH-ORAL-03",
}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    bundle = json.loads((ROOT / "assessment.json").read_text())
    report = json.loads((ROOT / "import-report.json").read_text())
    require(report.get("structure") == "six_independent_courses", "First finish importing all six courses")
    require(len(report["courses"]) == 6, "Missing course reports")
    cfg = dotenv_values(ROOT.parents[1] / ".env")
    with httpx.Client(base_url=BASE_URL, timeout=90) as client:
        def request(method, path, **kwargs):
            r = client.request(method, path, **kwargs)
            require(not r.is_error, f"{method} {path}: HTTP {r.status_code}")
            return r.json()

        request("POST", "/auth/login", json={
            "username": cfg["BOOTSTRAP_ADMIN"], "password": cfg["BOOTSTRAP_PASSWORD"],
        })
        before = request("GET", "/admin/courses")
        verified_ids, rubric_ids, exam_ids, document_ids = set(), set(), set(), set()
        for spec in bundle["courses"]:
            imported = one([r["course"] for r in report["courses"]], "code", spec["code"])
            require(imported is not None, "Replacement missing from report")
            course = one(before, "id", imported["id"])
            require(course is not None and course["code"] == spec["code"] and course["name"] == spec["name"],
                    "Replacement course identity changed")
            require(course["status"] == "ACTIVE" and course["id"] not in LEGACY, "Invalid replacement course")
            w = request("GET", f"/admin/courses/{course['id']}/workspace")
            require(len(w["exams"]) == 1 and len(w["rubrics"]) == 1 and len(w["topics"]) == 1,
                    "Unexpected replacement exam/rubric/topic count")
            require(len(w["documents"]) == 3 and all(d["status"] == "READY" for d in w["documents"]),
                    "Replacement sources not READY")
            require(w["rubrics"][0]["criteria"] == bundle["rubric"]["criteria"], "Rubric differs from source")
            exam = w["exams"][0]
            require(exam["rubric_id"] == w["rubrics"][0]["id"], "Wrong rubric assignment")
            require(exam["category"] == spec["code"] and exam["status"] == "GENERATED", "Invalid replacement exam")
            sample = one(bundle["groups"], "code", spec["code"])
            require([q["text"] for q in exam["questions"]] == [q["text"] for q in sample["questions"]],
                    "Replacement question mismatch")
            draft = request("GET", f"/admin/exams/{exam['id']}/draft")["snapshot"]
            own_docs = {d["id"] for d in w["documents"]}
            require(set(draft["document_ids"]) == own_docs, "Replacement depends on another course's sources")
            require(not document_ids.intersection(own_docs), "Documents shared across courses")
            document_ids.update(own_docs)
            rubric_ids.add(exam["rubric_id"])
            exam_ids.add(exam["id"])
            verified_ids.add(course["id"])
        require(len(verified_ids) == len(rubric_ids) == len(exam_ids) == 6, "Replacements must be independent")
        classes = request("GET", "/admin/classes")
        selected = []
        for cid, code in LEGACY.items():
            old = one(before, "id", cid)
            if old is None:
                continue
            require(old["code"] == code, "Legacy identity changed; refusing deletion")
            w = request("GET", f"/admin/courses/{cid}/workspace")
            selected.append({
                "id": cid, "code": code, "name": old["name"],
                "counts": {k: len(w[k]) for k in ("exams", "rubrics", "topics", "documents")},
                "classes": [{k: x[k] for k in ("id", "code", "name", "student_count")}
                            for x in classes if x["course_id"] == cid],
            })
        print(json.dumps({"apply": args.apply, "verified_replacement_courses": len(verified_ids),
                          "legacy_courses": selected}, ensure_ascii=False, indent=2), flush=True)
        if not args.apply:
            return
        audit_path = ROOT / "migration-report.json"
        audit = {
            "started_at": datetime.now(timezone.utc).isoformat(), "backend": BASE_URL,
            "replacement_course_ids": sorted(verified_ids), "selected": selected, "deleted": [],
        }
        # A rerun retains the original audit entries for already deleted courses.
        if audit_path.exists():
            previous = json.loads(audit_path.read_text())
            audit["deleted"] = previous.get("deleted", [])
            audit["selected"] = previous.get("selected", selected)
        audit_path.write_text(json.dumps(audit, ensure_ascii=False, indent=2) + "\n")
        for old in selected:
            for attempt in range(4):
                response = client.request("DELETE", f"/admin/courses/{old['id']}",
                                          json={"confirm_code": old["code"]})
                if response.status_code == 409 and attempt < 3:
                    time.sleep(5)
                    continue
                require(response.status_code == 200, f"Delete {old['code']}: HTTP {response.status_code}")
                break
            require(one(request("GET", "/admin/courses"), "id", old["id"]) is None, "Deletion readback failed")
            audit["deleted"].append({"id": old["id"], "code": old["code"]})
            audit_path.write_text(json.dumps(audit, ensure_ascii=False, indent=2) + "\n")
            print(f"Deleted {old['code']} and its dependent classes/data", flush=True)
        after = request("GET", "/admin/courses")
        remaining = {c["id"] for c in after}
        require(not remaining.intersection(LEGACY), "Legacy course remains")
        require({c["id"] for c in before} - set(LEGACY) == remaining, "Unrelated course was changed")
        classes_after = request("GET", "/admin/classes")
        require(not any(c["course_id"] in LEGACY for c in classes_after), "Legacy class remains")
        require({c["id"] for c in classes if c["course_id"] not in LEGACY} == {c["id"] for c in classes_after},
                "Unrelated class was changed")
        audit["verified_at"] = datetime.now(timezone.utc).isoformat()
        audit["remaining_course_codes"] = sorted(c["code"] for c in after)
        audit["remaining_class_count"] = len(classes_after)
        audit_path.write_text(json.dumps(audit, ensure_ascii=False, indent=2) + "\n")
        print("Verified: all three legacy courses and their classes are absent; six ENT courses remain")


if __name__ == "__main__":
    main()
