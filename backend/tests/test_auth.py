"""Tests for authentication endpoints."""
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_health(client: AsyncClient):
    resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_login_wrong_password(client: AsyncClient):
    resp = await client.post("/api/v1/auth/login", data={
        "username": "admin@example.com",
        "password": "wrongpassword",
    })
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_login_success(client: AsyncClient):
    from app.core.config import settings
    resp = await client.post("/api/v1/auth/login", data={
        "username": settings.FIRST_SUPERUSER_EMAIL,
        "password": settings.FIRST_SUPERUSER_PASSWORD,
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_me_requires_auth(client: AsyncClient):
    resp = await client.get("/api/v1/auth/me")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_me_with_token(client: AsyncClient):
    from app.core.config import settings
    login = await client.post("/api/v1/auth/login", data={
        "username": settings.FIRST_SUPERUSER_EMAIL,
        "password": settings.FIRST_SUPERUSER_PASSWORD,
    })
    token = login.json()["access_token"]
    resp = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json()["email"] == settings.FIRST_SUPERUSER_EMAIL


@pytest.mark.asyncio
async def test_refresh_token(client: AsyncClient):
    from app.core.config import settings
    login = await client.post("/api/v1/auth/login", data={
        "username": settings.FIRST_SUPERUSER_EMAIL,
        "password": settings.FIRST_SUPERUSER_PASSWORD,
    })
    refresh_token = login.json()["refresh_token"]
    resp = await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
    assert resp.status_code == 200
    assert "access_token" in resp.json()


@pytest.mark.asyncio
async def test_register_admin_blocked(client: AsyncClient):
    """Self-registration as ADMIN must be rejected."""
    resp = await client.post("/api/v1/auth/register", json={
        "email": "hacker@example.com",
        "full_name": "Hacker",
        "password": "password123",
        "role": "ADMIN",
    })
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_register_technician_ok(client: AsyncClient):
    resp = await client.post("/api/v1/auth/register", json={
        "email": "tech@example.com",
        "full_name": "Иванов Иван",
        "password": "password123",
        "role": "TECHNICIAN",
    })
    assert resp.status_code == 201
    assert resp.json()["role"] == "TECHNICIAN"


@pytest.mark.asyncio
async def test_register_duplicate_email(client: AsyncClient):
    data = {
        "email": "dup@example.com",
        "full_name": "Test",
        "password": "password123",
        "role": "CUSTOMER",
    }
    r1 = await client.post("/api/v1/auth/register", json=data)
    assert r1.status_code == 201
    r2 = await client.post("/api/v1/auth/register", json=data)
    assert r2.status_code == 400
