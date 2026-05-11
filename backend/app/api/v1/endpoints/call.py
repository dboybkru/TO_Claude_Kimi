from fastapi import APIRouter, HTTPException, Depends, status
from typing import Annotated

from app.api.deps import DBDep, CurrentUser, require_roles
from app.models.user import UserRole
from app.services.ai import ai_service

router = APIRouter(prefix="/call", tags=["call"])

@router.post("/click-to-call", status_code=status.HTTP_202_ACCEPTED)
async def click_to_call(
    db: DBDep,
    current_user: CurrentUser,
    phone: str,
    object_id: str | None = None,
):
    """Initiate an outgoing call via Asterisk AMI.
    
    Requires: ADMIN, MANAGER, DISPATCHER
    """
    if current_user.role not in (UserRole.ADMIN, UserRole.MANAGER, UserRole.DISPATCHER):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    # TODO: Integrate with Asterisk AMI to originate call
    # For now, return accepted with call_id
    import uuid
    call_id = str(uuid.uuid4())
    
    return {
        "call_id": call_id,
        "phone": phone,
        "object_id": object_id,
        "status": "queued",
        "message": "Call queued for Asterisk processing"
    }
