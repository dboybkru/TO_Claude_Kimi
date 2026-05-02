from fastapi import APIRouter, HTTPException, status, Depends
from typing import Annotated

from app.api.deps import DBDep, CurrentUser, require_roles
from app.models.user import UserRole
from app.schemas.user import UserCreate, UserRead, UserUpdate
from app import crud

router = APIRouter(prefix="/users", tags=["users"])

AdminOnly = Annotated[object, Depends(require_roles(UserRole.ADMIN))]
AdminOrManager = Annotated[object, Depends(require_roles(UserRole.ADMIN, UserRole.MANAGER))]


@router.post("", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def create_user(user_in: UserCreate, db: DBDep, current_user: AdminOrManager):
    existing = await crud.user.get_by_email(db, email=user_in.email)
    if existing:
        raise HTTPException(status_code=400, detail="Email уже зарегистрирован")
    # Non-admins cannot create admins
    if current_user.role != UserRole.ADMIN and user_in.role == UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Только администратор может создавать администраторов")
    return await crud.user.create(db, obj_in=user_in)


@router.get("", response_model=list[UserRead])
async def list_users(db: DBDep, _: AdminOnly):
    items, _ = await crud.user.get_multi(db, skip=0, limit=200)
    return items


@router.get("/{user_id}", response_model=UserRead)
async def get_user(user_id: str, db: DBDep, current_user: CurrentUser):
    if current_user.role != UserRole.ADMIN and current_user.id != user_id:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    user = await crud.user.get(db, id=user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.put("/{user_id}", response_model=UserRead)
async def update_user(user_id: str, obj_in: UserUpdate, db: DBDep, current_user: CurrentUser):
    if current_user.role != UserRole.ADMIN and current_user.id != user_id:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    # Only admin can change role or active status
    if current_user.role != UserRole.ADMIN:
        obj_in = UserUpdate(full_name=obj_in.full_name, phone=obj_in.phone, password=obj_in.password)
    user = await crud.user.get(db, id=user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return await crud.user.update(db, db_obj=user, obj_in=obj_in)


@router.put("/{user_id}/role", response_model=UserRead)
async def update_role(user_id: str, role: UserRole, db: DBDep, _: AdminOnly):
    user = await crud.user.get(db, id=user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    from app.schemas.user import UserUpdate
    return await crud.user.update(db, db_obj=user, obj_in=UserUpdate(role=role))
