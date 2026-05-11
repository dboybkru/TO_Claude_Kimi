from pydantic import BaseModel, Field

from app.models.object import ObjectType


class RoutePlanRequest(BaseModel):
    object_ids: list[str] | None = None
    region: str | None = None
    object_type: ObjectType | None = None
    start_lat: float = 54.7104
    start_lng: float = 20.4522
    end_lat: float | None = None
    end_lng: float | None = None
    workday_minutes: int = Field(default=480, ge=60, le=960)
    service_minutes: int = Field(default=45, ge=5, le=240)
    reserve_minutes: int = Field(default=45, ge=0, le=240)
    average_speed_kmh: float = Field(default=45, ge=10, le=120)
    limit: int = Field(default=80, ge=1, le=500)


class RouteStop(BaseModel):
    order: int
    object_id: str
    name: str
    address: str
    region: str | None
    type: ObjectType
    lat: float
    lng: float
    distance_km: float
    travel_minutes: int
    service_minutes: int
    cumulative_minutes: int


class RoutePlanResponse(BaseModel):
    stops: list[RouteStop]
    skipped: int
    total_distance_km: float
    total_travel_minutes: int
    total_service_minutes: int
    total_minutes: int
    available_minutes: int
    reserve_minutes: int
    start_lat: float
    start_lng: float
    end_lat: float | None
    end_lng: float | None
