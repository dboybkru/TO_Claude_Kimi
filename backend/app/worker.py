from celery import Celery
from app.core.config import settings
from celery.schedules import crontab

celery_app = Celery(
    "secureto",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["app.tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Europe/Kaliningrad",
    enable_utc=True,
    task_track_started=True,
    worker_prefetch_multiplier=1,
    beat_schedule={
        # Every day at 08:00 Kaliningrad time — mark overdue schedules
        "mark-overdue-schedules-daily": {
            "task": "app.tasks.mark_overdue_schedules",
            "schedule": crontab(hour=8, minute=0),
        },
        # Every day at 08:30 — notify technicians about overdue items
        "notify-overdue-daily": {
            "task": "app.tasks.send_overdue_notification",
            "schedule": crontab(hour=8, minute=30),
        },
        # Every day at 20:00 — send AI daily digest to managers/dispatchers
        "daily-digest-2000": {
            "task": "app.tasks.generate_daily_digest",
            "schedule": crontab(hour=20, minute=0),
        },
        # 1st day of every month at 01:00 — generate monthly maintenance plan
        "generate-monthly-plan": {
            "task": "app.tasks.generate_monthly_plan",
            "schedule": crontab(hour=1, minute=0, day_of_month=1),
        },
        # 25th day of every month at 09:00 — send monthly report emails to customers
        "send-monthly-reports": {
            "task": "app.tasks.send_monthly_report_emails",
            "schedule": crontab(hour=9, minute=0, day_of_month=25),
        },
    },
)
