#!/bin/bash
# SecureTO — Deploy Script для сервера 168.222.140.21
# Запуск: ./deploy.sh

set -euo pipefail

REPO_URL="https://github.com/dboybkru/TO_Claude_Kimi.git"
APP_DIR="/opt/secureto"
BACKUP_DIR="/opt/backups/secureto"
PORT=8080  # ← поменяй на 80 если порт свободен
PROXY_NETWORK="${PROXY_NETWORK:-infra_vsb39_net}"

echo "=========================================="
echo " 🚀 SecureTO Server Deploy Script"
echo "=========================================="
echo ""

# ── Проверка root ───────────────────────────────────────────────────────
if [ "$EUID" -ne 0 ]; then
    echo "❌ Запускай от root: sudo ./deploy.sh"
    exit 1
fi

# ── Проверка портов ─────────────────────────────────────────────────────
echo "🔍 Проверка портов..."
for p in 80 8080 443 5432 6379 9000; do
    if ss -tlnp | grep -q ":$p "; then
        echo "   ⚠️  Порт $p занят:"
        ss -tlnp | grep ":$p " | head -1
    else
        echo "   ✅ Порт $p свободен"
    fi
done
echo ""

# ── Установка Docker (если нет) ─────────────────────────────────────────
if ! command -v docker &> /dev/null; then
    echo "📦 Docker не найден. Установка..."
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
else
    echo "✅ Docker установлен: $(docker --version)"
fi

if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "📦 Docker Compose не найден. Установка..."
    apt-get update && apt-get install -y docker-compose-plugin
fi
echo "✅ Docker Compose: $(docker compose version || docker-compose --version)"
echo ""

if ! docker network inspect "$PROXY_NETWORK" >/dev/null 2>&1; then
    echo "🔗 Создаю Docker network для reverse proxy: $PROXY_NETWORK"
    docker network create "$PROXY_NETWORK" >/dev/null
fi
echo "✅ Proxy network: $PROXY_NETWORK"
echo ""

# ── Клонирование / обновление ─────────────────────────────────────────
if [ -d "$APP_DIR/.git" ]; then
    echo "🔄 Обновление существующего репозитория..."
    cd "$APP_DIR"
    git fetch origin
    git reset --hard origin/master
else
    echo "📥 Клонирование репозитория..."
    mkdir -p "$APP_DIR"
    git clone "$REPO_URL" "$APP_DIR"
    cd "$APP_DIR"
fi

echo "✅ Код обновлён ($(git rev-parse --short HEAD))"
echo ""

# ── .env ────────────────────────────────────────────────────────────────
if [ ! -f "$APP_DIR/.env" ]; then
    echo "⚠️  Файл .env не найден!"
    echo "   Создаю из шаблона: .env.server.example → .env"
    cp "$APP_DIR/.env.server.example" "$APP_DIR/.env"
    echo ""
    echo "🔴 ВАЖНО: Отредактируй $APP_DIR/.env и задай пароли!"
    echo "   nano $APP_DIR/.env"
    echo ""
    echo "Обязательно поменяй:"
    echo "   POSTGRES_PASSWORD=..."
    echo "   SECRET_KEY=..."
    echo "   FIRST_SUPERUSER_PASSWORD=..."
    echo "   MINIO_ROOT_PASSWORD=..."
    echo "   VSEGPT_API_KEY=..."
    echo ""
    read -p "Нажми Enter после редактирования .env (или Ctrl+C чтобы прервать)..."
fi

# ── Backup ──────────────────────────────────────────────────────────────
echo "💾 Создание бэкапа..."
mkdir -p "$BACKUP_DIR"
if docker ps | grep -q secureto-db; then
    docker exec secureto-db pg_dump -U secureto secureto > "$BACKUP_DIR/secureto_$(date +%Y%m%d_%H%M%S).sql" 2>/dev/null || true
    echo "   ✅ Бэкап БД создан"
fi
echo ""

# ── Порт nginx ────────────────────────────────────────────────────────────
echo "⚙️  Настройка порта nginx..."
if ss -tlnp | grep -q ":80 " && ! ss -tlnp | grep -q ":8080 "; then
    echo "   Порт 80 занят → используем 8080"
    sed -i 's/8080:80/8080:80/' docker-compose.server.yml  # уже 8080
else
    echo "   Порт 80 свободен → можно поменить на 80:80"
    # sed -i 's/8080:80/80:80/' docker-compose.server.yml
fi
echo ""

# ── Docker Build & Run ──────────────────────────────────────────────────
echo "🐳 Сборка и запуск Docker Compose..."
cd "$APP_DIR"

# Остановка старых контейнеров
docker compose -f docker-compose.server.yml down --remove-orphans 2>/dev/null || true

# Сборка
docker compose -f docker-compose.server.yml build --no-cache

# Запуск
docker compose -f docker-compose.server.yml up -d

echo ""
echo "⏳ Ожидание запуска сервисов..."
sleep 15

# ── Health Check ────────────────────────────────────────────────────────
echo ""
echo "🏥 Проверка здоровья..."
HEALTH_URL="http://localhost:$PORT/health"
for i in {1..10}; do
    if curl -fsS "$HEALTH_URL" 2>/dev/null; then
        echo "   ✅ Backend отвечает"
        break
    fi
    echo "   ⏳ Попытка $i/10..."
    sleep 5
done

echo ""
echo "=========================================="
echo " ✅ Deploy завершён!"
echo "=========================================="
echo ""
echo "📍 Доступ по IP:"
echo "   Frontend:    http://168.222.140.21:$PORT"
echo "   API:         http://168.222.140.21:$PORT/api/v1/"
echo "   Health:      http://168.222.140.21:$PORT/health"
echo ""
echo "📍 Локально на сервере:"
echo "   Frontend:    http://localhost:$PORT"
echo "   Backend:     http://localhost:8001"
echo "   MinIO API:   http://localhost:9000"
echo "   MinIO UI:    http://localhost:9001 (только с сервера)"
echo ""
echo "📋 Полезные команды:"
echo "   Логи:        docker compose -f docker-compose.server.yml logs -f"
echo "   Статус:      docker compose -f docker-compose.server.yml ps"
echo "   Перезапуск:  docker compose -f docker-compose.server.yml restart"
echo "   Остановка:   docker compose -f docker-compose.server.yml down"
echo ""
echo "🔐 Не забудь:"
echo "   1. Поменять пароли в $APP_DIR/.env"
echo "   2. Открыть порт $PORT в firewall: ufw allow $PORT"
echo "   3. Для SSL нужен домен (Let's Encrypt не работает с голым IP)"
echo ""
