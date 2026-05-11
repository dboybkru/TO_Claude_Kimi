import asyncio
import uuid
from io import BytesIO

from app.core.config import settings


class StorageService:
    """MinIO S3-compatible storage. Falls back to no-op in dev if MinIO is unavailable."""

    def __init__(self):
        self._client = None

    def _get_client(self):
        if self._client is None:
            try:
                from minio import Minio
                self._client = Minio(
                    settings.MINIO_ENDPOINT,
                    access_key=settings.MINIO_ROOT_USER,
                    secret_key=settings.MINIO_ROOT_PASSWORD,
                    secure=settings.MINIO_SECURE,
                )
                self._ensure_bucket()
            except Exception:
                return None
        return self._client

    def _ensure_bucket(self):
        try:
            client = self._client
            if not client.bucket_exists(settings.MINIO_BUCKET_ATTACHMENTS):
                client.make_bucket(settings.MINIO_BUCKET_ATTACHMENTS)
        except Exception:
            pass

    def _put_object_sync(self, client, object_name: str, data: bytes, content_type: str) -> None:
        client.put_object(
            settings.MINIO_BUCKET_ATTACHMENTS,
            object_name,
            BytesIO(data),
            length=len(data),
            content_type=content_type,
        )

    async def upload_photo(self, data: bytes, filename: str, journal_id: str) -> str:
        object_name = f"journals/{journal_id}/{uuid.uuid4()}_{filename}"
        client = self._get_client()
        if client is None:
            return f"/dev/photos/{object_name}"

        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "jpg"
        content_type_map = {"jpg": "image/jpeg", "jpeg": "image/jpeg",
                            "png": "image/png", "webp": "image/webp", "gif": "image/gif"}
        content_type = content_type_map.get(ext, "image/jpeg")

        try:
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                None, self._put_object_sync, client, object_name, data, content_type
            )
            return f"minio://{settings.MINIO_BUCKET_ATTACHMENTS}/{object_name}"
        except Exception:
            return f"/dev/photos/{object_name}"

    def presigned_url(self, object_path: str, expires_seconds: int = 3600) -> str:
        if object_path.startswith("/dev/"):
            return object_path
        client = self._get_client()
        if client is None:
            return object_path
        try:
            from datetime import timedelta
            without_scheme = object_path.replace("minio://", "")
            bucket, obj_path = without_scheme.split("/", 1)
            return client.presigned_get_object(bucket, obj_path, expires=timedelta(seconds=expires_seconds))
        except Exception:
            return object_path

    def presigned_put_url(self, object_key: str, content_type: str, expires_seconds: int = 3600) -> str:
        """Generate a presigned PUT URL for uploading an object directly to MinIO."""
        client = self._get_client()
        if client is None:
            return f"/dev/upload/{object_key}"
        try:
            from datetime import timedelta
            return client.presigned_put_object(
                settings.MINIO_BUCKET_ATTACHMENTS,
                object_key,
                expires=timedelta(seconds=expires_seconds),
            )
        except Exception:
            return f"/dev/upload/{object_key}"


storage_service = StorageService()
