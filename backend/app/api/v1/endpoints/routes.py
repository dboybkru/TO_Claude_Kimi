import math

from fastapi import APIRouter
from sqlalchemy import select

from app.api.deps import CurrentUser, DBDep
from app.models.object import Object, ObjectStatus
from app.models.user import UserRole
from app.schemas.route_planner import RoutePlanRequest, RoutePlanResponse, RouteStop

router = APIRouter(prefix="/routes", tags=["routes"])


def _distance_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    radius_km = 6371.0
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lng = math.radians(lng2 - lng1)
    a = (
        math.sin(delta_lat / 2) ** 2
        + math.cos(p1) * math.cos(p2) * math.sin(delta_lng / 2) ** 2
    )
    return radius_km * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _travel_minutes(distance_km: float, speed_kmh: float) -> int:
    return max(1, math.ceil(distance_km / speed_kmh * 60))


@router.post("/plan", response_model=RoutePlanResponse)
async def plan_route(
    payload: RoutePlanRequest,
    db: DBDep,
    current_user: CurrentUser,
):
    query = (
        select(Object)
        .where(Object.status == ObjectStatus.ACTIVE)
        .where(Object.monthly_maintenance_required.is_(True))
        .where(Object.lat.isnot(None), Object.lng.isnot(None))
    )

    if payload.object_ids:
        query = query.where(Object.id.in_(payload.object_ids))
    if payload.region:
        query = query.where(Object.region == payload.region)
    if payload.object_type:
        query = query.where(Object.type == payload.object_type)

    if current_user.role == UserRole.CUSTOMER:
        query = query.where(Object.customer_id == current_user.id)
    elif current_user.role == UserRole.TECHNICIAN:
        query = query.where(Object.responsible_technician_id == current_user.id)

    result = await db.execute(query.limit(payload.limit))
    candidates = list(result.scalars().all())

    available_minutes = max(0, payload.workday_minutes - payload.reserve_minutes)
    current_lat = payload.start_lat
    current_lng = payload.start_lng
    used_minutes = 0
    total_distance = 0.0
    total_travel = 0
    total_service = 0
    stops: list[RouteStop] = []

    while candidates:
        ranked = sorted(
            candidates,
            key=lambda item: _distance_km(
                current_lat,
                current_lng,
                float(item.lat),
                float(item.lng),
            ),
        )
        selected = None
        selected_distance = 0.0
        selected_travel = 0

        for item in ranked:
            item_lat = float(item.lat)
            item_lng = float(item.lng)
            distance = _distance_km(current_lat, current_lng, item_lat, item_lng)
            travel = _travel_minutes(distance, payload.average_speed_kmh)
            next_minutes = used_minutes + travel + payload.service_minutes

            if payload.end_lat is not None and payload.end_lng is not None:
                back_distance = _distance_km(item_lat, item_lng, payload.end_lat, payload.end_lng)
                next_minutes += _travel_minutes(back_distance, payload.average_speed_kmh)

            if next_minutes <= available_minutes:
                selected = item
                selected_distance = distance
                selected_travel = travel
                break

        if selected is None:
            break

        used_minutes += selected_travel + payload.service_minutes
        total_distance += selected_distance
        total_travel += selected_travel
        total_service += payload.service_minutes
        stops.append(
            RouteStop(
                order=len(stops) + 1,
                object_id=selected.id,
                name=selected.name,
                address=selected.address,
                region=selected.region,
                type=selected.type,
                lat=float(selected.lat),
                lng=float(selected.lng),
                distance_km=round(selected_distance, 2),
                travel_minutes=selected_travel,
                service_minutes=payload.service_minutes,
                cumulative_minutes=used_minutes,
            )
        )
        current_lat = float(selected.lat)
        current_lng = float(selected.lng)
        candidates.remove(selected)

    if stops and payload.end_lat is not None and payload.end_lng is not None:
        last = stops[-1]
        end_distance = _distance_km(last.lat, last.lng, payload.end_lat, payload.end_lng)
        end_travel = _travel_minutes(end_distance, payload.average_speed_kmh)
        total_distance += end_distance
        total_travel += end_travel
        used_minutes += end_travel

    return RoutePlanResponse(
        stops=stops,
        skipped=len(candidates),
        total_distance_km=round(total_distance, 2),
        total_travel_minutes=total_travel,
        total_service_minutes=total_service,
        total_minutes=used_minutes,
        available_minutes=available_minutes,
        reserve_minutes=payload.reserve_minutes,
        start_lat=payload.start_lat,
        start_lng=payload.start_lng,
        end_lat=payload.end_lat,
        end_lng=payload.end_lng,
    )
