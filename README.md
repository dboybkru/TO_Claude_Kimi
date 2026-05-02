# SecureTO — Система ТО охранной сигнализации и СКУД

Веб-система технического обслуживания объектов охранно-пожарной сигнализации и СКУД Калининградской области.

## Стек

| Слой | Технологии |
|------|-----------|
| Backend | FastAPI 0.111, SQLAlchemy 2.0 async, PostgreSQL 16 |
| Frontend | React 18 + TypeScript + Vite + Ant Design 5 |
| Фоновые задачи | Celery + Redis + Celery Beat |
| Файлы | MinIO (S3-совместимое хранилище) |
| AI | VseGPT API (OpenAI-совместимый) — транскрипция, парсинг, резюме |
| Деплой | Docker Compose (dev) / nginx + docker-compose.prod.yml |

## Быстрый старт (разработка)

```bash
# 1. Клонировать репозиторий
git clone <repo>
cd SecureTO

# 2. Настроить окружение
cp backend/.env.example backend/.env
# Отредактировать backend/.env — заполнить SECRET_KEY и другие переменные

# 3. Поднять инфраструктуру
docker compose up db redis minio -d

# 4. Применить миграции
cd backend
pip install -r requirements.txt
alembic upgrade head

# 5. Запустить бэкенд
uvicorn app.main:app --reload --port 8000

# 6. Запустить фронтенд (другой терминал)
cd frontend-web
npm install
npm run dev

# 7. Загрузить тестовые данные (313 объектов)
# Войти как admin@example.com / changeme → POST /api/v1/seed/objects
```

Приложение: http://localhost:5173  
API docs: http://localhost:8000/docs

## Роли и доступ

| Роль | Что видит |
|------|-----------|
| `ADMIN` | Полный доступ, управление пользователями |
| `MANAGER` | Все объекты, заявки, журналы, планировщик |
| `DISPATCHER` | Заявки (все), перезвоны, расписание (просмотр) |
| `TECHNICIAN` | Только свои объекты, журналы, заявки |
| `CUSTOMER` | Свои объекты и заявки (read-only портал) |
| `AUDITOR` | Объекты и заявки (read-only) |

## AI функции (VseGPT)

Установить `VSEGPT_API_KEY` в `.env`. Без ключа все AI функции работают в режиме заглушки (не падают).

| Функция | Эндпоинт | Модель |
|---------|----------|--------|
| Парсинг звонка → JSON | `POST /api/v1/voice/webhook` | gpt-4o-mini |
| AI резюме журнала | `POST /api/v1/voice/summarize-journal/{id}` | claude-haiku-4-5 |
| AI отчёт по объекту | `POST /api/v1/voice/report/object/{id}` | claude-sonnet-4-6 |
| Транскрипция аудио | `POST /api/v1/voice/transcribe` | whisper-1 |

## Голосовой бот

1. Купить номер телефона: MangoOffice / Zadarma / Voximplant
2. Настроить webhook провайдера → `https://ВАШ_ДОМЕН/api/v1/voice/webhook`
3. В `backend/.env`:
```
VOICEBOT_PHONE_NUMBER=+7 (4012) XXX-XX-XX
VOICEBOT_WEBHOOK_SECRET=<случайная строка 32+ символа>
```
4. Тот же секрет указать в кабинете АТС-провайдера (заголовок `X-Webhook-Signature`)

## Деплой в production

```bash
# 1. Настроить .env (APP_ENV=production, сильный SECRET_KEY и т.д.)
# 2. Поместить SSL сертификаты в ./nginx/ssl/cert.pem и ./nginx/ssl/key.pem
# 3. Поднять всё
docker compose -f docker-compose.prod.yml up -d --build

# 4. Применить миграции
docker compose -f docker-compose.prod.yml exec backend alembic upgrade head

# 5. Загрузить объекты
curl -X POST https://ВАШ_ДОМЕН/api/v1/seed/objects \
  -H "Authorization: Bearer <admin_token>"
```

## Тесты

```bash
cd backend
pytest tests/ -v
```

## Переменные окружения

| Переменная | Обязательна | Описание |
|-----------|-------------|---------|
| `SECRET_KEY` | ✅ | JWT подписание (32+ символа) |
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `REDIS_URL` | ✅ | Redis для Celery |
| `VSEGPT_API_KEY` | — | AI функции (vsegpt.ru) |
| `SENTRY_DSN` | — | Мониторинг ошибок (sentry.io) |
| `VOICEBOT_PHONE_NUMBER` | — | Отображаемый номер бота |
| `VOICEBOT_WEBHOOK_SECRET` | — | HMAC-подпись вебхука |
| `MINIO_*` | ✅ prod | Файловое хранилище |

## Структура проекта

```
.
├── backend/
│   ├── app/
│   │   ├── api/v1/endpoints/   # FastAPI маршруты
│   │   ├── core/               # config, security, limiter
│   │   ├── crud/               # CRUD операции
│   │   ├── models/             # SQLAlchemy модели
│   │   ├── schemas/            # Pydantic схемы
│   │   ├── services/           # ai.py, storage.py
│   │   └── tasks.py            # Celery задачи
│   ├── alembic/                # Миграции БД
│   └── tests/                  # pytest тесты
├── frontend-web/
│   └── src/
│       ├── api/                # axios client, services, types
│       ├── layouts/            # AppLayout с сайдбаром
│       ├── pages/              # Dashboard, Objects, Tickets…
│       ├── store/              # Zustand (authStore)
│       └── utils/              # roles.ts, csvExport.ts
├── nginx/
│   └── nginx.conf              # Production reverse proxy
├── docker-compose.yml          # Dev окружение
└── docker-compose.prod.yml     # Production окружение
```
