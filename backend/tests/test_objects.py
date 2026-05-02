"""Tests for objects CRUD API."""
import pytest
from httpx import AsyncClient
from .conftest import auth_headers


@pytest.mark.asyncio
async def test_objects_require_auth(client: AsyncClient):
    resp = await client.get("/api/v1/objects")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_objects_list_empty(client: AsyncClient):
    headers = await auth_headers(client)
    resp = await client.get("/api/v1/objects", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data
    assert "total" in data
    assert isinstance(data["items"], list)


@pytest.mark.asyncio
async def test_create_object(client: AsyncClient):
    headers = await auth_headers(client)
    resp = await client.post("/api/v1/objects", json={
        "name": "Тестовый объект АТС",
        "address": "г. Калининград, ул. Тестовая, д. 1",
        "type": "OS",
        "status": "active",
    }, headers=headers)
    assert resp.status_code == 201
    obj = resp.json()
    assert obj["name"] == "Тестовый объект АТС"
    assert obj["type"] == "OS"
    return obj["id"]


@pytest.mark.asyncio
async def test_get_object(client: AsyncClient):
    headers = await auth_headers(client)

    # Create first
    create_resp = await client.post("/api/v1/objects", json={
        "name": "Объект для получения",
        "address": "г. Калининград, ул. А, д. 1",
        "type": "SKUD",
        "status": "active",
    }, headers=headers)
    assert create_resp.status_code == 201
    obj_id = create_resp.json()["id"]

    # Get it
    resp = await client.get(f"/api/v1/objects/{obj_id}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["id"] == obj_id


@pytest.mark.asyncio
async def test_update_object(client: AsyncClient):
    headers = await auth_headers(client)
    create_resp = await client.post("/api/v1/objects", json={
        "name": "Объект до обновления",
        "address": "ул. А, 1",
        "type": "OS",
        "status": "active",
    }, headers=headers)
    obj_id = create_resp.json()["id"]

    upd_resp = await client.put(f"/api/v1/objects/{obj_id}", json={"status": "in_repair"}, headers=headers)
    assert upd_resp.status_code == 200
    assert upd_resp.json()["status"] == "in_repair"


@pytest.mark.asyncio
async def test_delete_object_admin_only(client: AsyncClient):
    headers = await auth_headers(client)
    create_resp = await client.post("/api/v1/objects", json={
        "name": "Объект для удаления",
        "address": "ул. А, 1",
        "type": "OS",
        "status": "active",
    }, headers=headers)
    obj_id = create_resp.json()["id"]

    del_resp = await client.delete(f"/api/v1/objects/{obj_id}", headers=headers)
    assert del_resp.status_code == 204

    get_resp = await client.get(f"/api/v1/objects/{obj_id}", headers=headers)
    assert get_resp.status_code == 404
