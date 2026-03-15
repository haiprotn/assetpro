from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text

from app.db.session import get_db
from app.models.assets import User
from app.core.auth import create_access_token

router = APIRouter()


@router.post("/login")
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
):
    # Tìm user theo username
    result = await db.execute(
        select(User).where(User.username == form_data.username)
    )
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sai tên đăng nhập hoặc mật khẩu"
        )

    # Verify password - dùng pgcrypto crypt() để check
    # Vì password được hash bởi pgcrypto crypt(), ta verify lại bằng SQL
    verify_result = await db.execute(
        text("SELECT (password_hash = crypt(:password, password_hash)) AS ok FROM users WHERE id = :uid"),
        {"password": form_data.password, "uid": str(user.id)}
    )
    row = verify_result.fetchone()
    password_ok = row.ok if row else False

    # Fallback: thử bcrypt trực tiếp nếu hash không phải pgcrypto format
    if not password_ok:
        try:
            import bcrypt
            password_ok = bcrypt.checkpw(
                form_data.password.encode('utf-8'),
                user.password_hash.encode('utf-8'),
            )
        except Exception:
            pass

    if not password_ok:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sai tên đăng nhập hoặc mật khẩu"
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tài khoản đã bị khóa"
        )

    token = create_access_token(subject=str(user.id))
    return {
        "access_token": token,
        "token_type": "bearer",
        "role": user.role,
        "username": user.username,
    }
