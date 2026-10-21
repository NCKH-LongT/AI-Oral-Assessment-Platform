"""Administrator-managed desktop rules, frozen for each exam sitting."""
from fastapi import APIRouter, Depends
from pydantic import StrictBool
from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import get_db
from .models import Audit, ExamSession, SystemSetting, User
from .permissions import role_filter
from .runtime_settings import settings
from .schemas import Input
from .security import admin, by_id, current_user, fail

router = APIRouter()


class DesktopPolicy(Input):
    require_screen: StrictBool = True
    require_camera: StrictBool = True
    single_display: StrictBool = True
    kiosk: StrictBool = True
    block_shortcuts: StrictBool = True
    block_clipboard: StrictBool = True
    block_navigation: StrictBool = True
    block_downloads: StrictBool = True
    pause_on_focus_loss: StrictBool = True
    block_devtools: StrictBool = True


def policy(db):
    row = db.get(SystemSetting, "desktop_policy")
    values = row.value if row else {"require_screen": settings().exam_screen_required}
    return DesktopPolicy.model_validate(values).model_dump()


def session_policy(session):
    # Pre-migration sittings preserve their original screen requirement.
    return DesktopPolicy.model_validate(session.desktop_policy or {"require_screen": session.screen_required}).model_dump()


@router.get("/desktop/policy")
def public_policy(db: Session = Depends(get_db)):
    return {"version": 1, "rules": policy(db)}


@router.get("/admin/settings/desktop")
def get_policy(db: Session = Depends(get_db), user=Depends(admin)):
    return public_policy(db)


@router.put("/admin/settings/desktop")
def save_policy(body: DesktopPolicy, db: Session = Depends(get_db), user=Depends(admin)):
    db.scalars(select(User).where(role_filter("ADMIN")).order_by(User.id).with_for_update()).all()
    before = policy(db)
    db.merge(SystemSetting(key="desktop_policy", value=body.model_dump()))
    db.add(Audit(user_id=user.id, event="DESKTOP_POLICY_UPDATED", details={"before": before, "after": body.model_dump()}))
    db.commit()
    return public_policy(db)


@router.get("/exam-sessions/{key}/desktop-policy")
def sitting_policy(key: str, db: Session = Depends(get_db), user=Depends(current_user)):
    row = by_id(db, ExamSession, key)
    if row.student_id != user.id or row.deleted_at is not None:
        fail(403, "FORBIDDEN", "Phiên thi không thuộc tài khoản")
    if row.status not in {"DEVICE_CHECK", "IN_PROGRESS"}:
        fail(409, "INVALID_STATE", "Lượt thi đã kết thúc")
    return {"version": 1, "rules": session_policy(row)}
