import shutil
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncIterator


class LocalAudioStorage:
    def __init__(self, base_dir: str) -> None:
        self._base = Path(base_dir)
        self._base.mkdir(parents=True, exist_ok=True)

    def staging_path(self, filename: str) -> Path:
        """Return the final destination path — no temp copy needed."""
        return self._base / filename

    async def save(self, filename: str, source: Path) -> None:
        # source is already at staging_path(), nothing to move
        pass

    async def delete(self, filename: str) -> None:
        (self._base / filename).unlink(missing_ok=True)

    @asynccontextmanager
    async def local_path(self, filename: str) -> AsyncIterator[Path]:
        yield self._base / filename


class AzureBlobAudioStorage:
    def __init__(self, account: str, key: str, container: str) -> None:
        from azure.storage.blob.aio import BlobServiceClient

        self._client = BlobServiceClient(
            account_url=f"https://{account}.blob.core.windows.net",
            credential=key,
        )
        self._container = container

    def staging_path(self, filename: str) -> Path:
        """Return a temp path — file will be uploaded to blob on save()."""
        suffix = Path(filename).suffix
        tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
        tmp.close()
        return Path(tmp.name)

    async def save(self, filename: str, source: Path) -> None:
        async with self._client.get_blob_client(self._container, filename) as blob:
            with source.open("rb") as f:
                await blob.upload_blob(f, overwrite=True)
        source.unlink(missing_ok=True)

    async def delete(self, filename: str) -> None:
        async with self._client.get_blob_client(self._container, filename) as blob:
            await blob.delete_blob(delete_snapshots="include")

    @asynccontextmanager
    async def local_path(self, filename: str) -> AsyncIterator[Path]:
        async with self._client.get_blob_client(self._container, filename) as blob:
            data = await (await blob.download_blob()).readall()

        suffix = Path(filename).suffix
        tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
        tmp_path = Path(tmp.name)
        try:
            tmp.write(data)
            tmp.close()
            yield tmp_path
        finally:
            tmp_path.unlink(missing_ok=True)


def get_audio_storage() -> LocalAudioStorage | AzureBlobAudioStorage:
    from app.core.config import settings

    if settings.AZURE_STORAGE_ACCOUNT:
        return AzureBlobAudioStorage(
            account=settings.AZURE_STORAGE_ACCOUNT,
            key=settings.AZURE_STORAGE_KEY,
            container=settings.AZURE_STORAGE_CONTAINER,
        )
    return LocalAudioStorage(settings.AUDIO_STORAGE_DIR)
