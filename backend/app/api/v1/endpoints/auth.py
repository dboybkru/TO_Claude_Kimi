from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from jose import JWTError
from typing import Annotated
from pydantic import BaseModel

from app.api.deps import DBDep, CurrentUser
from app.core.limiter import limiter
from app.core.security import create_access_token, create_refresh_token, decode_token
from app.schemas.token import Token
from app.schemas.user import UserCreate, UserRead
from app.models.user import UserRole
from app import crud

router = APIRouter(prefix="/auth", tags=["auth"])

# Roles that can self-register without admin approval
_SELF_REGISTER_ROLES = {UserRole.TECHNICIAN, UserRole.CUSTOMER, UserRole.AUDITOR}


class RefreshRequest(BaseModel):
    refresh_token: str


@router.post("/login", response_model=Token)
@limiter.limit("10/15minute")
async def login(
    request: Request,
    db: DBDep,
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
):
    """Rate limited: 10 login attempts per 15 minutes per IP."""
    user = await crud.user.authenticate(db, email=form_data.username, password=form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    return Token(
        access_token=create_access_token(str(user.id)),
        refresh_token=create_refresh_token(str(user.id)),
    )


@router.post("/refresh", response_model=Token)
@limiter.limit("30/minute")
async def refresh(request: Request, body: RefreshRequest, db: DBDep):
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid refresh token",
    )
    try:
        payload = decode_token(body.refresh_token)
        if payload.get("type") != "refresh":
            raise credentials_exc
        user_id: str = payload.get("sub")
    except JWTError:
        raise credentials_exc

    user = await crud.user.get(db, id=user_id)
    if not user or not user.is_active:
        raise credentials_exc

    return Token(
        access_token=create_access_token(str(user.id)),
        refresh_token=create_refresh_token(str(user.id)),
    )


@router.get("/me", response_model=UserRead)
async def read_me(current_user: CurrentUser):
    return current_user


@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
async def register(request: Request, user_in: UserCreate, db: DBDep):
    """Public self-registration. Rate limited: 5 per minute per IP."""
    if user_in.role not in _SELF_REGISTER_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Самостоятельная регистрация недоступна для роли {user_in.role}. Обратитесь к администратору.",
        )
    existing = await crud.user.get_by_email(db, email=user_in.email)
    if existing:
        raise HTTPException(status_code=400, detail="Email уже зарегистрирован")
    return await crud.user.create(db, obj_in=user_in)
