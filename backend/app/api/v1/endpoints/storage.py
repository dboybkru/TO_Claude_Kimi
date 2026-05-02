from fastapi import APIRouter, HTTPException, Query, Depends, status
from typing import Annotated
from datetime import datetime, timezone, timedelta
from uuid import uuid4

from pydantic import BaseModel, field_validator

from app.api.deps import DBDep, CurrentUser, require_roles
from app.models.user import UserRole
from app.core.config import settings
from app.services.storage import storage_service
from app import crud

router = APIRouter(prefix="/storage", tags=["storage"])

_MAX_UPLOAD_SIZE = 5 * 1024 * 1024  # 5 MB
_ALLOWED_UPLOAD_TYPES = {"image/jpeg", "image/png"}


class UploadRequest(BaseModel):
    filename: str
    content_type: str
    object_id: str

    @field_validator("content_type")
    @classmethod
    def check_content_type(cls, v: str) -> str:
        if v not in _ALLOWED_UPLOAD_TYPES:
            raise ValueError(f"content_type must be one of: {', '.join(_ALLOWED_UPLOAD_TYPES)}")
        return v


@router.post("/upload")
async def create_upload_url(
    db: DBDep,
    current_user: CurrentUser,
    body: UploadRequest,
):
    """Generate a presigned PUT URL for direct upload to MinIO.

    Permission checks:
    - ADMIN/MANAGER/DISPATCHER: any object
    - CUSTOMER: only their own objects
    - TECHNICIAN: only assigned objects
    """
    obj = await crud.object_crud.get(db, id=body.object_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Object not found")

    if current_user.role not in (UserRole.ADMIN, UserRole.MANAGER, UserRole.DISPATCHER, UserRole.AUDITOR):
        if current_user.role == UserRole.CUSTOMER and obj.customer_id != current_user.id:
            raise HTTPException(status_code=403, detail="Access denied")
        if current_user.role == UserRole.TECHNICIAN and obj.responsible_technician_id != current_user.id:
            raise HTTPException(status_code=403, detail="Access denied")

    safe_name = body.filename.strip().replace("..", "_").replace("/", "_")
    object_key = f"uploads/{body.object_id}/{uuid4()}_{safe_name}"

    try:
        presigned_url = storage_service.presigned_put_url(
            object_key,
            content_type=body.content_type,
            expires_seconds=3600,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate presigned URL: {str(e)}")

    expires_at = (datetime.now(timezone.utc) + timedelta(seconds=3600)).isoformat()
    return {
        "presigned_url": presigned_url,
        "object_key": object_key,
        "expires_at": expires_at,
    }


@router.get("/presigned")
async def get_presigned_url(
    db: DBDep,
    current_user: CurrentUser,
    object_key: str = Query(..., description="Path to file in MinIO (e.g. journals/{id}/photo.jpg)"),
    expires: int = Query(3600, ge=60, le=86400, description="URL expiry in seconds"),
):
    """Generate a presigned URL for accessing a MinIO file.

    Permission checks:
    - ADMIN/MANAGER: any file
    - CUSTOMER: only files linked to their objects
    - TECHNICIAN: only files linked to assigned objects
    """
    # Parse path to extract journal/object id
    parts = object_key.strip("/").split("/")
    if len(parts) < 2:
        raise HTTPException(status_code=400, detail="Invalid object_key format")

    resource_id = parts[1] if parts[0] in ("journals", "objects") else None

    if current_user.role not in (UserRole.ADMIN, UserRole.MANAGER, UserRole.AUDITOR):
        # Check ownership
        if parts[0] == "journals":
            journal = await crud.journal.get(db, id=resource_id)
            if not journal:
                raise HTTPException(status_code=404, detail="Journal not found")
            obj = await crud.object_crud.get(db, id=journal.object_id)
        elif parts[0] == "objects":
            obj = await crud.object_crud.get(db, id=resource_id)
        else:
            raise HTTPException(status_code=403, detail="Access denied")

        if not obj:
            raise HTTPException(status_code=404, detail="Object not found")

        if current_user.role == UserRole.CUSTOMER and obj.customer_id != current_user.id:
            raise HTTPException(status_code=403, detail="Access denied")
        if current_user.role == UserRole.TECHNICIAN and obj.responsible_technician_id != current_user.id:
            raise HTTPException(status_code=403, detail="Access denied")

    try:
        url = storage_service.presigned_url(object_key, expires)
        from datetime import datetime, timezone, timedelta
        expires_at = (datetime.now(timezone.utc) + timedelta(seconds=expires)).isoformat()
        return {"presigned_url": url, "expires_at": expires_at}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate presigned URL: {str(e)}")
