import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

class TestStoragePresigned:
    """Tests for presigned URL endpoints."""

    def test_presigned_get_requires_auth(self):
        response = client.get("/api/v1/storage/presigned?object_key=test.jpg")
        assert response.status_code == 401

    def test_presigned_put_requires_auth(self):
        response = client.post("/api/v1/storage/upload", json={
            "filename": "test.jpg",
            "content_type": "image/jpeg",
            "object_id": "123e4567-e89b-12d3-a456-426614174000"
        })
        assert response.status_code == 401

    def test_presigned_put_invalid_content_type(self, normal_user_headers):
        response = client.post("/api/v1/storage/upload", json={
            "filename": "test.exe",
            "content_type": "application/x-msdownload",
            "object_id": "123e4567-e89b-12d3-a456-426614174000"
        }, headers=normal_user_headers)
        assert response.status_code == 422

class TestJournalPhotos:
    """Tests for journal photo patch endpoint."""

    def test_patch_photos_requires_auth(self):
        response = client.patch("/api/v1/journals/123/photos", json={"photo_urls": ["url1"]})
        assert response.status_code == 401

    def test_patch_photos_invalid_journal(self, normal_user_headers):
        response = client.patch("/api/v1/journals/nonexistent/photos", json={
            "photo_urls": ["https://minio.example.com/journals/test.jpg"]
        }, headers=normal_user_headers)
        assert response.status_code == 404
