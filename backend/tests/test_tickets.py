"""Tests for repair tickets API."""
import pytest
from httpx import AsyncClient
from .conftest import auth_headers


@pytest.mark.asyncio
async def test_tickets_list(client: AsyncClient):
    headers = await auth_headers(client)
    resp = await client.get("/api/v1/tickets", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data
    assert "total" in data


@pytest.mark.asyncio
async def test_create_ticket(client: AsyncClient):
    headers = await auth_headers(client)
    resp = await client.post("/api/v1/tickets", json={
        "title": "Тестовая заявка — датчик не работает",
        "priority": "high",
        "source": "manual",
        "fault_type": "sensor",
    }, headers=headers)
    assert resp.status_code == 201
    t = resp.json()
    assert t["priority"] == "high"
    assert t["status"] == "new"
    assert t["ticket_number"].startswith("REQ-")
    return t["id"]


@pytest.mark.asyncio
async def test_ticket_number_unique(client: AsyncClient):
    headers = await auth_headers(client)
    nums = set()
    for i in range(3):
        r = await client.post("/api/v1/tickets", json={
            "title": f"Заявка {i}",
            "priority": "low",
            "source": "manual",
        }, headers=headers)
        assert r.status_code == 201
        nums.add(r.json()["ticket_number"])
    assert len(nums) == 3  # All unique


@pytest.mark.asyncio
async def test_resolve_ticket(client: AsyncClient):
    headers = await auth_headers(client)
    create = await client.post("/api/v1/tickets", json={
        "title": "Заявка к закрытию",
        "priority": "normal",
        "source": "manual",
    }, headers=headers)
    tid = create.json()["id"]

    resolve = await client.post(f"/api/v1/tickets/{tid}/resolve", json={
        "resolution_notes": "Проблема устранена, заменён датчик.",
    }, headers=headers)
    assert resolve.status_code == 200
    assert resolve.json()["status"] == "resolved"
    assert resolve.json()["resolved_at"] is not None


@pytest.mark.asyncio
async def test_get_ticket_not_found(client: AsyncClient):
    headers = await auth_headers(client)
    resp = await client.get("/api/v1/tickets/00000000-0000-0000-0000-000000000000", headers=headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_callback_queue_requires_dispatcher(client: AsyncClient):
    """Callback queue should be accessible to admin (who has dispatcher perms)."""
    headers = await auth_headers(client)
    resp = await client.get("/api/v1/tickets/callback-queue", headers=headers)
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)
