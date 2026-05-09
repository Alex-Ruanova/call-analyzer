from celery import Celery
from app.core.config import settings

celery_app = Celery("altur", broker=settings.REDIS_URL, backend=settings.REDIS_URL)
celery_app.config_from_object({
    "task_serializer": "json",
    "result_serializer": "json",
    "accept_content": ["json"],
    "task_track_started": True,
    "worker_concurrency": 4,
    "worker_pool": "prefork",
    "worker_max_tasks_per_child": 50,
})
celery_app.autodiscover_tasks(["app"])

# Explicit import so the task registers even if autodiscover misses it
import app.tasks.process_call  # noqa: E402, F401
