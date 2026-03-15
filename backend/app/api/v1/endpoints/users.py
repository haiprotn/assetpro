import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.db.session import get_db
from app.core.auth import get_current_user
from app.models.assets import User

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    username: str
    email: Optional[str] = None
    full_name: Optional[str] = None
    password: str
    role: str = "OPERATOR"
    is_active: bool = True
    personnel_id: Optional[uuid.UUID] = None

class UserUpdate(BaseModel):
    email: Optional[str] = None
    full_name: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None
    personnel_id: Optional[uuid.UUID] = None
    permissions: Optional[dict] = None  # custom per-user overrides: {module: [action,...]}

class PasswordReset(BaseModel):
    new_password: str


async def _hash_password_sql(db, password: str) -> str:
    """Hash password using PostgreSQL pgcrypto — consistent with login verification."""
    row = (await db.execute(
        text("SELECT crypt(:pw, gen_salt('bf', 12)) AS hash"),
        {"pw": password}
    )).first()
    return row.hash


_LIST_SQL = """
    SELECT u.id, u.username, u.email, u.role, u.is_active,
           u.last_login, u.created_at, u.personnel_id,
           u.permissions,
           p.full_name AS personnel_name,
           p.position  AS personnel_position
    FROM users u
    LEFT JOIN personnel p ON p.id = u.personnel_id
    {where}
    ORDER BY u.created_at DESC
"""


# ── GET /auth/me  (current user) ──────────────────────────────────────────────

@router.get("/me")
async def get_me(current_user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    row = (await db.execute(text("""
        SELECT u.id, u.username, u.email, u.role, u.is_active,
               u.last_login, u.created_at, u.permissions,
               p.full_name AS personnel_name
        FROM users u
        LEFT JOIN personnel p ON p.id = u.personnel_id
        WHERE u.id = :id
    """), {"id": str(current_user.id)})).mappings().first()
    return dict(row) if row else None


# ── GET /users ────────────────────────────────────────────────────────────────

@router.get("")
async def list_users(
    q: Optional[str] = Query(None),
    role: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if current_user.role not in ("SUPER_ADMIN", "ADMIN", "MANAGER"):
        raise HTTPException(status_code=403, detail="Không có quyền xem danh sách tài khoản")

    where_parts = ["1=1"]
    params = {}
    if q:
        where_parts.append("(u.username ILIKE :q OR u.email ILIKE :q OR p.full_name ILIKE :q)")
        params["q"] = f"%{q}%"
    if role:
        where_parts.append("u.role = :role")
        params["role"] = role

    sql = _LIST_SQL.format(where="WHERE " + " AND ".join(where_parts))
    rows = (await db.execute(text(sql), params)).mappings().all()
    return [dict(r) for r in rows]


# ── POST /users ───────────────────────────────────────────────────────────────

@router.post("", status_code=201)
async def create_user(
    data: UserCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if current_user.role not in ("SUPER_ADMIN", "ADMIN"):
        raise HTTPException(status_code=403, detail="Chỉ Admin mới được tạo tài khoản")

    # Use placeholder email if not provided
    email = data.email or f"{data.username}@local"

    # Check duplicate
    existing = (await db.execute(
        select(User).where((User.username == data.username) | (User.email == email))
    )).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="Tên đăng nhập hoặc email đã tồn tại")

    user = User(
        id=uuid.uuid4(),
        username=data.username,
        email=email,
        password_hash=await _hash_password_sql(db, data.password),
        role=data.role,
        personnel_id=data.personnel_id,
        is_active=data.is_active,
    )
    db.add(user)
    await db.commit()

    row = (await db.execute(text("""
        SELECT u.*, p.full_name AS personnel_name
        FROM users u LEFT JOIN personnel p ON p.id = u.personnel_id
        WHERE u.id = :id
    """), {"id": str(user.id)})).mappings().first()
    return dict(row)


# ── PUT /users/{id} ───────────────────────────────────────────────────────────

@router.put("/{user_id}")
async def update_user(
    user_id: uuid.UUID,
    data: UserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if current_user.role not in ("SUPER_ADMIN", "ADMIN"):
        raise HTTPException(status_code=403, detail="Chỉ Admin mới được cập nhật tài khoản")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy tài khoản")

    allowed = {'email', 'role', 'is_active', 'personnel_id', 'permissions'}
    for k, v in data.model_dump(exclude_unset=True).items():
        if k in allowed:
            setattr(user, k, v)

    await db.commit()
    row = (await db.execute(text("""
        SELECT u.*, p.full_name AS personnel_name
        FROM users u LEFT JOIN personnel p ON p.id = u.personnel_id
        WHERE u.id = :id
    """), {"id": str(user.id)})).mappings().first()
    return dict(row)


# ── POST /users/{id}/reset-password ──────────────────────────────────────────

@router.post("/{user_id}/reset-password")
async def reset_password(
    user_id: uuid.UUID,
    data: PasswordReset,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    # Admin can reset anyone; user can reset their own
    if current_user.role not in ("SUPER_ADMIN", "ADMIN") and current_user.id != user_id:
        raise HTTPException(status_code=403, detail="Không có quyền đổi mật khẩu tài khoản này")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy tài khoản")

    if len(data.new_password) < 6:
        raise HTTPException(status_code=422, detail="Mật khẩu phải có ít nhất 6 ký tự")

    user.password_hash = await _hash_password_sql(db, data.new_password)
    await db.commit()
    return {"ok": True}


# ── DELETE /users/{id} ────────────────────────────────────────────────

@router.delete("/{user_id}", status_code=200)
async def delete_user(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if current_user.role != "SUPER_ADMIN":
        raise HTTPException(status_code=403, detail="Chỉ Quản trị hệ thống mới được xóa tài khoản")

    if current_user.id == user_id:
        raise HTTPException(status_code=400, detail="Không thể xóa tài khoản của chính mình")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy tài khoản")

    if user.role == "SUPER_ADMIN":
        raise HTTPException(status_code=400, detail="Không thể xóa tài khoản Quản trị hệ thống khác")

    await db.delete(user)
    await db.commit()
    return {"ok": True}
