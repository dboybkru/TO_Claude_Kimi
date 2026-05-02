"""Test configuration — uses SQLite in-memory DB, no external services required."""
import asyncio
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from unittest.mock import patch

from app.main import app
from app.database import Base, get_db
from app.core.config import settings

TEST_DB_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="session")
async def test_engine():
    engine = create_async_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()


@pytest_asyncio.fixture(scope="session")
async def session_factory(test_engine):
    return async_sessionmaker(test_engine, expire_on_commit=False, class_=AsyncSession)


@pytest_asyncio.fixture
async def db_session(session_factory):
    async with session_factory() as session:
        yield session
        await session.rollback()


async def _seed_superuser(session_factory):
    """Create the first superuser directly in the test database."""
    from app.crud.crud_user import user as user_crud
    from app.schemas.user import UserCreate
    from app.models.user import UserRole

    async with session_factory() as db:
        existing = await user_crud.get_by_email(db, email=settings.FIRST_SUPERUSER_EMAIL)
        if not existing:
            await user_crud.create(
                db,
                obj_in=UserCreate(
                    email=settings.FIRST_SUPERUSER_EMAIL,
                    password=settings.FIRST_SUPERUSER_PASSWORD,
                    full_name="Test Admin",
                    role=UserRole.ADMIN,
                ),
            )


@pytest_asyncio.fixture
async def client(db_session, session_factory):
    """HTTP test client with DB override and test superuser seeded."""
    async def override_db():
        yield db_session

    # Patch AsyncSessionLocal so lifespan also uses test DB
    with patch("app.main.AsyncSessionLocal", session_factory):
        app.dependency_overrides[get_db] = override_db

        # Seed superuser into test DB directly (bypass lifespan)
        await _seed_superuser(session_factory)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            yield ac

        app.dependency_overrides.clear()


# ── Helpers ───────────────────────────────────────────────────────────────────

async def auth_headers(client: AsyncClient) -> dict:
    """Login as admin and return Authorization headers."""
    resp = await client.post("/api/v1/auth/login", data={
        "username": settings.FIRST_SUPERUSER_EMAIL,
        "password": settings.FIRST_SUPERUSER_PASSWORD,
    })
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
