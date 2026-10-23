"""Role membership and union-of-permissions shared by every authorization path."""
from sqlalchemy import or_, select

from .models import User, UserRole

ROLE_ORDER = ("ADMIN", "EXAM_OFFICER", "TEACHER", "STUDENT")


def user_roles(user):
    # The original role remains readable by older clients and existing accounts.
    values = {user.role, *(entry.role for entry in user.role_grants)}
    return [role for role in ROLE_ORDER if role in values]


def has_role(user, *allowed):
    granted = set(user_roles(user))
    return "ADMIN" in granted or bool(granted.intersection(allowed))


def role_filter(*allowed, include_admin=True):
    values = set(allowed) | ({"ADMIN"} if include_admin else set())
    return or_(User.role.in_(values), User.id.in_(select(UserRole.user_id).where(UserRole.role.in_(values))))


def teacher_scope(user):
    return has_role(user, "TEACHER") and not has_role(user, "ADMIN", "EXAM_OFFICER")


def set_user_roles(user, values):
    ordered = [role for role in ROLE_ORDER if role in values]
    if not ordered:
        raise ValueError("Chọn ít nhất một vai trò")
    user.role = ordered[0]
    existing = {grant.role: grant for grant in user.role_grants}
    # Keep existing rows to avoid duplicate inserts before orphan deletions flush.
    user.role_grants = [existing.get(role) or UserRole(role=role) for role in ordered]
