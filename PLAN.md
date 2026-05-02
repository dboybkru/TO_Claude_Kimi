# План работ по проекту SecureTO (TO_Claude)

## Статус на 02.05.2026
- **Backend:** ~70% (архитектура на месте, но есть пробелы)
- **Frontend Web:** ~50% (стек верный, не собирается, дизайн не соответствует макетам)
- **Мобильное приложение:** 0% (пустая папка)
- **Голосовой робот:** ~10% (backend endpoints есть, без Asterisk/STT)
- **Критичные блокеры:** TypeScript ошибки, отсутствие .gitignore, .env в git

---

## 🛡️ Политика внешних сервисов

**Принцип:** максимально не использовать сторонние сервисы, которые могут быть заблокированы. Все критичные функции — self-hosted или российские провайдеры.

### AI: VseGPT (единственный внешний сервис)
- **API:** `https://api.vsegpt.ru/v1/chat/completions` (OpenAI-совместимый)
- **Доступ:** Работает из России без VPN
- **Модели для задач проекта:**
  | Задача | Модель | ID | Цена (руб/1K) |
  |--------|--------|-----|---------------|
  | AI-чат, подсказки, summary | GPT-4o Mini | `openai/gpt-4o-mini` | 0.02 вх / 0.08 вых |
  | STT (транскрипция звонков) | Whisper V3 | `openai/whisper-3` | `v1/audio/transcriptions` |
  | TTS (голос робота) | TTS-1 | `openai/tts-1` / `tts-1-hd` | `v1/audio/speech` |
  | Классификация неисправностей | GPT-4o Mini | `openai/gpt-4o-mini` | — |
  | Генерация отчётов | GPT-4.1 Mini | `openai/gpt-4.1-mini` | 0.06 вх / 0.24 вых |
  | Распознавание адреса | GPT-4o Mini + function calling | `openai/gpt-4o-mini` | — |
- **Замена:** Yandex SpeechKit → VseGPT STT/TTS (единый провайдер)
- **Мониторинг:** `v1/balance` для контроля расходов
- **Fallback:** при недоступности VseGPT — локальные шаблоны

### ❌ НЕ используем (блокировочный риск)
| Сервис | Причина | Замена |
|--------|---------|--------|
| **Yandex SpeechKit** | Может быть заблокирован | VseGPT STT/TTS |
| **Firebase FCM** | Google-сервис, блокировка | Локальные уведомления + WebSocket |
| **SendGrid / Mailgun** | Внешние email-провайдеры | Корпоративный SMTP |
| **Twilio** | Международный SIP | Корпоративный SIP-транк |
| **Cloudflare** | Для критичных DNS-записей | Локальный DNS / корпоративный |

### ✅ Self-hosted / локальные решения
- **Push-уведомления:** Локальные (`expo-notifications`) + WebSocket backend + background sync. Push при закрытом приложении — MVP-отказ, можно добавить позже (ntfy.sh)
- **Email:** Корпоративный SMTP-сервер или postfix на том же сервере
- **Файлы:** MinIO (S3-совместимый, self-hosted)
- **БД:** PostgreSQL (self-hosted)
- **Кэш / очереди:** Redis (self-hosted)
- **SSL:** Let's Encrypt (certbot) — бесплатно, автоматизация, независимый CA

---

## Этап 0: Быстрые победы (1-2 дня) — СРОЧНО

### 0.1 Безопасность и инфраструктура
- [ ] Создать `.gitignore` (node_modules, dist, __pycache__, .env, *.db, .idea, .vscode)
- [ ] Удалить `.env` из индекса git (`git rm --cached .env`)
- [ ] Проверить, не утекли ли секреты в истории git
- [ ] Создать `.env.example` с плейсхолдерами
- [ ] Настроить pre-commit hooks (black, isort, ESLint)

### 0.2 Frontend — сборка
- [ ] Исправить TypeScript ошибки в `Journals.tsx`
- [ ] Исправить TypeScript ошибки в `Settings.tsx`
- [ ] Исправить TypeScript ошибки в `TicketDetail.tsx`
- [ ] Исправить TypeScript ошибки в `Tickets.tsx`
- [ ] Исправить TypeScript ошибки в `demoStore.ts`
- [ ] Проверить `npm run build` — должно собираться без ошибок
- [ ] Проверить `npm run dev` — dev-сервер должен запускаться

---

## Этап 1: MVP — Backend доработка (1-2 недели)

### 1.1 Модели данных — привести к промпту
- [ ] Добавить в `Object`:
  - `address_normalized` (string, индекс)
  - `address_aliases` (JSON/array)
  - `equipment` (JSON с типом, моделью, кол-вом, расположением)
  - `contact_person` (JSON: ФИО + телефон)
  - `monthly_maintenance_required` (boolean)
- [ ] Добавить в `MaintenanceJournal`:
  - `checklist` (JSON с отметками)
  - `final_statement` (auto-generate если status=operational)
  - `journal_number` (порядковый номер по объекту)
  - `customer_rep_name` (ФИО подписанта)
  - `customer_signature` (base64 или ссылка)
  - `technician_signature` (base64 или ссылка)
- [ ] Добавить в `RepairTicket`:
  - `source` enum: voice_bot, manual, journal_auto
  - `caller_phone`
  - `call_recording_url`
  - `called_at`
  - `fault_type` enum
  - `diagnosis_act_url`
- [ ] Создать `MaintenanceSchedule` (планировщик ТО)
- [ ] Создать `AuditLog` (user_id, action, resource, timestamp, ip)
- [ ] Добавить роль `ROBOT_API` с API-ключом
- [ ] Написать Alembic миграцию для всех изменений

### 1.2 API endpoints
- [ ] `/api/v1/objects` — fuzzy search по `address_normalized` + `address_aliases`
- [ ] `/api/v1/journals` — авто-обновление `last_maintenance_at` объекта
- [ ] `/api/v1/journals` — авто-создание заявки при `system_status=needs_repair`
- [ ] `/api/v1/tickets` — формат номера `REQ-YYYY-NNNN`
- [ ] `/api/v1/scheduler` — CRUD плана ТО
- [ ] `/api/v1/seed` — расширенный seed с оборудованием

### 1.3 Фоновые задачи (Celery)
- [ ] Исправить Celery beat: `86400` → cron `0 1 1 * *` (1-е число 01:00)
- [ ] Добавить `check_overdue_maintenance` (ежедневно 08:00)
- [ ] Добавить `send_monthly_report_email` (25-е число)
- [ ] Добавить `generate_monthly_plan` (1-е число месяца)

### 1.4 Безопасность
- [ ] Rate limit на `/api/v1/auth/login`: 10 попыток / 15 мин / IP
- [ ] Presigned URL для MinIO с TTL 1 час
- [ ] API-ключ робота с ротацией (90 дней)
- [ ] Audit log middleware

### 1.5 Email (SMTP)
- [ ] Настроить корпоративный SMTP в `.env` (не SendGrid/Mailgun)
- [ ] Шаблон email-отчёта для заказчика
- [ ] Интеграция с Celery beat

### 1.6 AI-сервис (VseGPT)
- [ ] Добавить STT endpoint — `v1/audio/transcriptions` (Whisper V3)
- [ ] Добавить TTS endpoint — `v1/audio/speech` (TTS-1)
- [ ] Добавить fuzzy matching для адресов (rapidfuzz + VseGPT function calling)
- [ ] Добавить endpoint для классификации неисправностей (GPT-4o Mini)
- [ ] Добавить endpoint для AI-summary журналов и отчётов
- [ ] Настроить мониторинг баланса через `v1/balance`

---

## Этап 2: MVP — Frontend Web (2-3 недели)

### 2.1 Привести UI к дизайн-макетам
- [ ] Переработать Dashboard — metric cards, AI-chat panel, districts progress, technicians status
- [ ] Переработать Objects — split view (таблица + карта + detail panel)
- [ ] Переработать Tickets — feed + detail panel, tabs (Заявки + Перезвоны)
- [ ] Переработать Journals — форма с чеклистом, фото, подписями, статусами
- [ ] Добавить AI-чат панель в sidebar (по макету dashboard.html)
- [ ] Добавить glassmorphism эффекты, тёмную тему как в макетах
- [ ] Добавить кастомные scrollbar, hover-эффекты

### 2.2 Интеграция с API
- [ ] Подключить все новые endpoints (scheduler, audit, fuzzy search)
- [ ] Добавить загрузку фото в MinIO (сжатие до JPEG 80%, max 1200px на клиенте)
- [ ] Добавить canvas-подписи (техник + заказчик)
- [ ] WebSocket для real-time обновлений заявок (диспетчер)

### 2.3 Карта (Leaflet)
- [ ] Тёмная тема карты (CSS filter invert)
- [ ] Кастомные маркеры по статусу (цвета: ok/warn/overdue)
- [ ] Клик на маркер → открыть detail panel
- [ ] Попапы с информацией об объекте

### 2.4 Компоненты
- [ ] Audio player для записей звонков
- [ ] Transcript viewer (AI-транскрипция)
- [ ] Callback queue panel (перезвоны робота)
- [ ] Address autocomplete (fuzzy search)
- [ ] QR-code scanner (для мобильного/веб)

---

## Этап 3: MVP — Мобильное приложение (3-4 недели)

### 3.1 Expo + React Native setup
- [ ] Инициализировать Expo проект в `mobile/`
- [ ] Настроить navigation (React Navigation)
- [ ] Подключить Zustand (shared store с вебом)
- [ ] Настроить Axios client с JWT refresh

### 3.2 Офлайн-режим
- [ ] Cache списка объектов на день (AsyncStorage / SQLite)
- [ ] Очередь синхронизации при восстановлении сети
- [ ] Conflict resolution (server wins / manual merge)

### 3.3 Функционал монтажника
- [ ] Список объектов на сегодня
- [ ] Авто-фиксация времени прибытия при открытии формы
- [ ] Форма журнала ТО (чеклист, описание, фото, подписи)
- [ ] Сжатие фото: JPEG 80%, max 1200px по длинной стороне
- [ ] Canvas-подписи (react-native-signature-canvas или expo-canvas)
- [ ] QR-code scanner (expo-barcode-scanner)

### 3.4 Push-уведомления (без Firebase FCM)
- [ ] `expo-notifications` — локальные уведомления (не требуют интернет)
- [ ] WebSocket — real-time обновления при открытом приложении
- [ ] Background sync — pull новых данных при открытии
- [ ] Типы уведомлений: new_ticket, callback_required, ticket_assigned, maintenance_due, maintenance_overdue
- [ ] ⚠️ Push при закрытом приложении — MVP-отказ. Добавить позже через self-hosted ntfy.sh при необходимости

### 3.5 Build
- [x] Expo проект инициализирован (blank-typescript)
- [ ] EAS Build для Android (APK / AAB)
- [ ] EAS Build для iOS (если нужно)
- [ ] OTA updates (Expo Updates) — или отказ в пользу ручного обновления через APK

---

## Этап 4: Фаза 2 — Голосовой робот (2-3 недели)

### 4.1 Инфраструктура
- [ ] Docker-контейнер с Asterisk
- [ ] AGI-скрипты Python для обработки звонков
- [ ] **STT:** VseGPT `v1/audio/transcriptions` (Whisper V3) — транскрипция в реальном времени
- [ ] **TTS:** VseGPT `v1/audio/speech` (TTS-1 / TTS-1-HD) — голос робота
- [ ] Сохранение записей звонков в MinIO

### 4.2 Логика звонка
- [ ] Фиксация caller_phone, called_at
- [ ] Запись разговора в MinIO
- [ ] STT (VseGPT) → распознавание текста → извлечение адреса
- [ ] Fuzzy matching объектов (rapidfuzz + VseGPT function calling, порог 0.75)
- [ ] Подтверждение объекта ("да/нет") — TTS робота
- [ ] Создание заявки с source=voice_bot, номер REQ-YYYY-NNNN
- [ ] Уведомление диспетчера через WebSocket

### 4.3 Callback queue (нераспознанные вызовы)
- [ ] Панель в web: список вызовов без распознанного адреса
- [ ] Аудио-плеер для прослушивания записей (MinIO presigned URL)
- [ ] AI-транскрипция разговора (VseGPT STT)
- [ ] Ручное уточнение адреса → создание заявки / отклонение
- [ ] Click-to-call через Asterisk

---

## Этап 5: Фаза 2 — Планировщик + Уведомления (1-2 недели)

### 5.1 Планировщик ТО
- [ ] Авто-генерация плана 1-го числа месяца
- [ ] Распределение объектов между монтажниками
- [ ] Группировка по районам (география)
- [ ] Приоритет просроченных объектов
- [ ] UI: календарь, назначение, перенос

### 5.2 Уведомления (без внешних сервисов)
- [ ] **WebSocket:** real-time обновления в веб-панели диспетчера
- [ ] **Email:** ежемесячные фотоотчёты заказчику (корпоративный SMTP)
- [ ] **Локальные push:** `expo-notifications` для монтажников (только когда приложение открыто/фон)
- [ ] **Background sync:** мобильное приложение тянет новые данные при открытии
- [ ] Типы уведомлений: new_ticket, callback_required, ticket_assigned, maintenance_due, overdue, report_ready
- [ ] ⚠️ Push при закрытом приложении — MVP-отказ (см. Этап 3.4)

---

## Этап 6: Фаза 3 — Аналитика и отчёты (2-3 недели)

### 6.1 Отчёты
- [ ] PDF экспорт актов ТО (pdfkit / weasyprint / Playwright)
- [ ] PDF экспорт актов диагностики
- [ ] Email-рассылка заказчику (авто + ручная)
- [ ] Дашборд аналитики (Chart.js / Recharts)

### 6.2 Аналитика
- [ ] Статистика по районам
- [ ] Загрузка монтажников
- [ ] Просроченные ТО (тренды)
- [ ] Неисправности по типам оборудования
- [ ] Стоимость обслуживания (если нужно)

---

## Этап 7: Production-ready (1-2 недели)

### 7.1 CI/CD
- [ ] GitHub Actions: lint, test, build
- [ ] Docker multi-stage builds optimization
- [ ] Dependabot / Renovate

### 7.2 Тестирование
- [ ] Backend: pytest coverage > 80%
- [ ] Frontend: Playwright e2e тесты
- [ ] Mobile: Detox / Maestro тесты
- [ ] Load testing (locust / k6)

### 7.3 Мониторинг
- [ ] Sentry (уже частично есть)
- [ ] Prometheus + Grafana
- [ ] Логирование (structured logging)

### 7.4 SSL / Production
- [ ] Let's Encrypt автоматизация (certbot / Caddy)
- [ ] Health checks для всех сервисов
- [ ] Backup strategy (PostgreSQL, MinIO)

---

## Приоритеты по времени

| Срок | Этапы | Ключевые результаты |
|------|-------|---------------------|
| **День 1-2** | Этап 0 | .gitignore, .env вне git, frontend собирается |
| **Неделя 1-2** | Этап 1 | Backend модели приведены к промпту, API работает |
| **Неделя 3-5** | Этап 2 | Web UI соответствует дизайн-макетам, карта работает |
| **Неделя 6-9** | Этап 3 | Мобильное приложение (Expo), офлайн, QR, подписи |
| **Неделя 10-12** | Этап 4 | Asterisk + STT + TTS, голосовой робот работает |
| **Неделя 13-14** | Этап 5 | Планировщик, уведомления, WebSocket |
| **Неделя 15-17** | Этап 6 | PDF, аналитика, отчёты |
| **Неделя 18-19** | Этап 7 | CI/CD, тесты, мониторинг, production |

**Общий срок: ~4-5 месяцев** (при 1 разработчике full-time)

---

## Что нужно от заказчика / владельца

1. **VseGPT API key** — для AI (STT, TTS, чат, классификация, отчёты)
2. **Корпоративный SMTP-сервер** — для email-рассылки отчётов (или postfix на том же сервере)
3. **SSL сертификаты** — или согласие на Let's Encrypt (автоматизация)
4. **Тестовые данные** — реальные адреса, оборудование, контакты 300 объектов
5. **Asterisk инфраструктура** — корпоративный SIP-транк, номера, сервер
6. **Решение по мобильному** — только Android? iOS тоже? Distribution (Play Store / APK / корпоративный MDM)?
7. **Сервер** — specs для PostgreSQL + Redis + MinIO + Asterisk + backend + nginx (или VPS/ dedicated)
8. **Бюджет на API** — VseGPT расходуется по трафику (~1000-5000 руб/мес для 300 объектов при активном использовании AI)

---

*План составлен 02.05.2026. Обновляется по мере выполнения этапов.*
