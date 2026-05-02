import uuid

from fastapi import APIRouter, HTTPException, Query, status, Depends
from typing import Annotated

from app.api.deps import DBDep, CurrentUser, require_roles
from app.models.object import ObjectStatus
from app.models.user import UserRole
from app.schemas.object import ObjectCreate, ObjectUpdate, ObjectRead, ObjectReadDetail, ObjectList
from app import crud

router = APIRouter(prefix="/objects", tags=["objects"])

AdminOrManager = Annotated[
    object,
    Depends(require_roles(UserRole.ADMIN, UserRole.MANAGER)),
]


@router.get("/search", response_model=list[dict])
async def search_objects(
    db: DBDep,
    current_user: CurrentUser,
    q: str = Query(..., min_length=1, description="Search query for address or name"),
    limit: int = Query(10, ge=1, le=50),
):
    """Fuzzy search objects by address or name."""
    try:
        from rapidfuzz import fuzz
    except ImportError:
        fuzz = None

    items, _ = await crud.object_crud.get_multi_filtered(db, skip=0, limit=500)

    if current_user.role == UserRole.CUSTOMER:
        items = [o for o in items if o.customer_id == current_user.id]
    elif current_user.role == UserRole.TECHNICIAN:
        items = [o for o in items if o.responsible_technician_id == current_user.id]

    results = []
    q_lower = q.lower()

    for obj in items:
        score = 0
        if fuzz:
            score = max(
                fuzz.token_sort_ratio(q_lower, (obj.address or "").lower()),
                fuzz.token_sort_ratio(q_lower, (obj.address_normalized or "").lower()),
                fuzz.token_sort_ratio(q_lower, (obj.name or "").lower()),
            )
        else:
            if q_lower in (obj.address or "").lower() or q_lower in (obj.name or "").lower():
                score = 50
        if score >= 75:
            results.append({"id": obj.id, "name": obj.name, "address": obj.address, "score": score})

    results.sort(key=lambda x: x["score"], reverse=True)
    return results[:limit]


@router.get("", response_model=ObjectList)
async def list_objects(
    db: DBDep,
    current_user: CurrentUser,
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=500),
    status: ObjectStatus | None = None,
    customer_id: str | None = None,
    technician_id: str | None = None,
):
    skip = (page - 1) * size

    if current_user.role == UserRole.CUSTOMER:
        customer_id = current_user.id
    elif current_user.role == UserRole.TECHNICIAN:
        technician_id = current_user.id

    items, total = await crud.object_crud.get_multi_filtered(
        db,
        skip=skip,
        limit=size,
        status=status,
        customer_id=customer_id,
        technician_id=technician_id,
    )
    return ObjectList(items=items, total=total, page=page, size=size)


@router.get("/{object_id}", response_model=ObjectReadDetail)
async def get_object(
    object_id: str,
    db: DBDep,
    current_user: CurrentUser,
):
    obj = await crud.object_crud.get_with_relations(db, id=object_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Object not found")

    if current_user.role == UserRole.CUSTOMER and obj.customer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    return obj


@router.post("", response_model=ObjectRead, status_code=status.HTTP_201_CREATED)
async def create_object(
    obj_in: ObjectCreate,
    db: DBDep,
    _: AdminOrManager,
):
    return await crud.object_crud.create(db, obj_in=obj_in)


@router.put("/{object_id}", response_model=ObjectRead)
async def update_object(
    object_id: str,
    obj_in: ObjectUpdate,
    db: DBDep,
    _: AdminOrManager,
):
    obj = await crud.object_crud.get(db, id=object_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Object not found")
    return await crud.object_crud.update(db, db_obj=obj, obj_in=obj_in)


@router.delete("/{object_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_object(
    object_id: str,
    db: DBDep,
    _: Annotated[object, Depends(require_roles(UserRole.ADMIN))],
):
    obj = await crud.object_crud.remove(db, id=object_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Object not found")
