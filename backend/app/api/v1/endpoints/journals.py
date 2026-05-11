import os
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, UploadFile, File, status, Depends

from app.api.deps import DBDep, CurrentUser, require_roles
from app.models.user import UserRole
from app.schemas.maintenance_journal import (
    MaintenanceJournalCreate, MaintenanceJournalUpdate, MaintenanceJournalRead,
    JournalPhotosPatch,
)
from app import crud

router = APIRouter(prefix="/journals", tags=["journals"])

TechPlus = Annotated[object, Depends(require_roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.TECHNICIAN))]


@router.get("", response_model=dict)
async def list_journals(
    db: DBDep,
    current_user: CurrentUser,
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    object_id: str | None = None,
    technician_id: str | None = None,
    system_status: str | None = None,
    date_from: datetime | None = Query(None),
    date_to: datetime | None = Query(None),
):
    if current_user.role == UserRole.TECHNICIAN:
        technician_id = current_user.id

    items, total = await crud.journal.get_multi_filtered(
        db,
        skip=(page - 1) * size,
        limit=size,
        object_id=object_id,
        technician_id=technician_id,
        system_status=system_status,
        date_from=date_from,
        date_to=date_to,
    )
    return {
        "items": [MaintenanceJournalRead.model_validate(j).model_dump(mode="json") for j in items],
        "total": total,
        "page": page,
        "size": size,
    }


@router.get("/summary", response_model=list[dict])
async def get_summary_journal(
    db: DBDep,
    _: CurrentUser,
    date_from: datetime | None = Query(None, description="Начало периода (ISO 8601)"),
    date_to: datetime | None = Query(None, description="Конец периода (ISO 8601)"),
    object_id: str | None = Query(None),
):
    """Сводный журнал технического обслуживания — Приложение №4 к ТЗ договора 10944505.

    Возвращает список завершённых записей с данными для формирования таблицы:
    №п/п | Дата ТО | Наименование и адрес объекта | Тип системы/неисправность |
    Результат | Дата и время выполнения заявки | Отметка исполнителя | Отметка заказчика
    """
    records = await crud.journal.get_summary_data(
        db, date_from=date_from, date_to=date_to, object_id=object_id
    )
    result = []
    for i, j in enumerate(records, start=1):
        obj = j.object
        tech = j.technician
        result.append({
            "num": i,
            "journal_number": j.journal_number,
            "completed_at": j.completed_at.isoformat() if j.completed_at else None,
            "arrived_at": j.arrived_at.isoformat() if j.arrived_at else None,
            "object_id": j.object_id,
            "object_name": obj.name if obj else "",
            "object_address": obj.address if obj else "",
            "system_type": j.system_type or "",
            "result_description": j.result_description or "",
            "final_statement": j.final_statement or "",
            "technician_name": (
                f"{tech.full_name or tech.email}" if tech else ""
            ),
            "technician_signature": j.technician_signature or "",
            "customer_rep_name": j.customer_rep_name or "",
            "customer_signature": j.customer_signature or "",
        })
    return result


@router.get("/{journal_id}", response_model=MaintenanceJournalRead)
async def get_journal(journal_id: str, db: DBDep, _: CurrentUser):
    j = await crud.journal.get_with_relations(db, id=journal_id)
    if not j:
        raise HTTPException(status_code=404, detail="Journal not found")
    return j


@router.post("", response_model=MaintenanceJournalRead, status_code=status.HTTP_201_CREATED)
async def create_journal(obj_in: MaintenanceJournalCreate, db: DBDep, _: TechPlus):
    j = await crud.journal.create(db, obj_in=obj_in)
    return j


@router.put("/{journal_id}", response_model=MaintenanceJournalRead)
async def update_journal(journal_id: str, obj_in: MaintenanceJournalUpdate, db: DBDep, current_user: CurrentUser):
    j = await crud.journal.get(db, id=journal_id)
    if not j:
        raise HTTPException(status_code=404, detail="Journal not found")
    if current_user.role == UserRole.TECHNICIAN and j.technician_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your journal")

    # Auto-create repair ticket when system needs repair
    needs_repair_before = j.system_status != "needs_repair"
    updated = await crud.journal.update(db, db_obj=j, obj_in=obj_in.model_dump(exclude_unset=True))
    if needs_repair_before and updated.system_status == "needs_repair":
        from app.schemas.repair_ticket import RepairTicketCreate
        from app.models.repair_ticket import TicketSource, TicketPriority
        await crud.ticket.create(
            db,
            obj_in=RepairTicketCreate(
                object_id=updated.object_id,
                title=f"Требуется ремонт — журнал № {updated.journal_number}",
                description=updated.result_description,
                source=TicketSource.JOURNAL_AUTO,
                priority=TicketPriority.HIGH,
            ),
            reporter_id=updated.technician_id,
        )

    # Update object.last_maintenance_at when completed
    if updated.completed_at and updated.object_id:
        obj = await crud.object_crud.get(db, id=updated.object_id)
        if obj:
            await crud.object_crud.update(db, db_obj=obj, obj_in={"last_maintenance_at": updated.completed_at})

    # Auto-generate AI summary when journal is completed and has results
    if updated.completed_at and updated.result_description and not updated.final_statement:
        from app.tasks import ai_summarize_journal
        ai_summarize_journal.delay(str(updated.id))

    return updated


_MAX_PHOTO_SIZE = 10 * 1024 * 1024  # 10 MB
_ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}


def _safe_filename(name: str) -> str:
    """Strip directory components and keep only the base filename."""
    return os.path.basename(name).replace("..", "")


@router.post("/{journal_id}/photos", response_model=MaintenanceJournalRead)
async def upload_photos(
    journal_id: str,
    files: list[UploadFile] = File(...),
    db: DBDep = ...,
    current_user: CurrentUser = ...,
):
    j = await crud.journal.get(db, id=journal_id)
    if not j:
        raise HTTPException(status_code=404, detail="Journal not found")
    if current_user.role == UserRole.TECHNICIAN and j.technician_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your journal")

    from app.services.storage import storage_service
    urls: list[str] = []
    for f in files:
        if f.content_type not in _ALLOWED_CONTENT_TYPES:
            raise HTTPException(status_code=415, detail=f"Unsupported file type: {f.content_type}")
        content = await f.read()
        if len(content) > _MAX_PHOTO_SIZE:
            raise HTTPException(status_code=413, detail="File too large (max 10 MB)")
        safe_name = _safe_filename(f.filename or "photo.jpg")
        url = await storage_service.upload_photo(
            data=content,
            filename=safe_name,
            journal_id=str(journal_id),
        )
        urls.append(url)

    return await crud.journal.add_photos(db, db_obj=j, urls=urls)


@router.patch("/{journal_id}/photos", response_model=MaintenanceJournalRead)
async def patch_journal_photos(
    journal_id: str,
    body: JournalPhotosPatch,
    db: DBDep,
    current_user: CurrentUser,
):
    """Attach existing photo URLs to a journal (e.g. after direct MinIO upload)."""
    j = await crud.journal.get(db, id=journal_id)
    if not j:
        raise HTTPException(status_code=404, detail="Journal not found")
    if current_user.role == UserRole.TECHNICIAN and j.technician_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your journal")

    return await crud.journal.add_photos(db, db_obj=j, urls=body.photo_urls)


@router.delete("/{journal_id}/photos/{photo_url:path}", response_model=MaintenanceJournalRead)
async def delete_photo(journal_id: str, photo_url: str, db: DBDep, current_user: CurrentUser):
    j = await crud.journal.get(db, id=journal_id)
    if not j:
        raise HTTPException(status_code=404, detail="Journal not found")
    if current_user.role == UserRole.TECHNICIAN and j.technician_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your journal")
    # Exact URL match — prevents suffix-based deletion of unrelated photos
    photos = [p for p in (j.photos or []) if p != photo_url]
    return await crud.journal.update(db, db_obj=j, obj_in={"photos": photos})
