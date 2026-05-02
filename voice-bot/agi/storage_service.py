"""Synchronous MinIO storage service for voice-bot AGI."""
import os
from io import BytesIO

from minio import Minio


MINIO_ENDPOINT = os.environ.get("MINIO_ENDPOINT", "minio:9000")
MINIO_ROOT_USER = os.environ.get("MINIO_ROOT_USER", "minioadmin")
MINIO_ROOT_PASSWORD = os.environ.get("MINIO_ROOT_PASSWORD", "minioadmin")
MINIO_BUCKET = os.environ.get("MINIO_BUCKET_ATTACHMENTS", "attachments")
MINIO_SECURE = os.environ.get("MINIO_SECURE", "false").lower() == "true"


class StorageService:
    """Simple synchronous MinIO wrapper for AGI usage."""

    def __init__(self):
        self._client: Minio | None = None

    def _get_client(self) -> Minio:
        if self._client is None:
            self._client = Minio(
                MINIO_ENDPOINT,
                access_key=MINIO_ROOT_USER,
                secret_key=MINIO_ROOT_PASSWORD,
                secure=MINIO_SECURE,
            )
            self._ensure_bucket()
        return self._client

    def _ensure_bucket(self) -> None:
        try:
            client = self._get_client()
            if not client.bucket_exists(MINIO_BUCKET):
                client.make_bucket(MINIO_BUCKET)
        except Exception:
            pass

    def upload(self, object_name: str, data: bytes, content_type: str = "application/octet-stream") -> str:
        """Upload bytes to MinIO. Returns minio:// URL or fallback /dev path."""
        try:
            client = self._get_client()
            client.put_object(
                MINIO_BUCKET,
                object_name,
                BytesIO(data),
                length=len(data),
                content_type=content_type,
            )
            return f"minio://{MINIO_BUCKET}/{object_name}"
        except Exception as e:
            print(f"MinIO upload error: {e}", file=__import__("sys").stderr)
            return f"/dev/recordings/{object_name}"


storage_service = StorageService()
