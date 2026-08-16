# Dockerized Fastify API

Невеликий Fastify API на TypeScript із PostgreSQL, упакований у Docker.

## Вимоги

- Docker Engine або Docker Desktop
- Docker Compose v2 (`docker compose`)
- `curl` для перевірки HTTP endpoints

## Запуск

У корені проєкту виконайте:

```bash
docker compose up -d
```

Compose збере API, дочекається готовності PostgreSQL і опублікує API за адресою
`http://localhost:3000`.

## Endpoints

```bash
curl http://localhost:3000/health
# {"status":"ok"}

curl http://localhost:3000/users
# [{"id":1,"name":"Ada"}]

curl http://localhost:3000/db
# {"time":"...","who":"app"}
```

## Production та naive images

Збірка production image:

```bash
docker build -t docker-node-api:prod .
```

Збірка naive image:

```bash
docker build -f Dockerfile.naive -t docker-node-api:naive .
```

Перевірка розмірів образів:

```bash
docker images docker-node-api
```

Фактичні розміри:

- `docker-node-api:prod` — 258 MB
- `docker-node-api:naive` — 1.21 GB

Production image менший, оскільки multi-stage збірка переносить у slim runtime
лише скомпільований застосунок і production-залежності, без вихідного коду,
dev-залежностей та інструментів збірки.

## Перевірка non-root

```bash
docker run --rm docker-node-api:prod id -u
# 1000
```

## Перевірка persistence PostgreSQL

Створіть таблицю та додайте тестовий рядок:

```bash
docker compose exec db psql -U app -d app -c \
  "CREATE TABLE IF NOT EXISTS persistence_test (
    id integer PRIMARY KEY,
    note text
  );"

docker compose exec db psql -U app -d app -c \
  "INSERT INTO persistence_test (id, note)
  VALUES (1, 'survives compose down')
  ON CONFLICT (id)
  DO UPDATE SET note = EXCLUDED.note;"
```

Видаліть контейнери та створіть їх знову, не видаляючи іменований volume:

```bash
docker compose down
docker compose up -d
```

Переконайтеся, що таблиця та дані збереглися:

```bash
docker compose exec db psql -U app -d app -c \
  "SELECT * FROM persistence_test;"
```

Очікуваний результат:

```text
 id |         note
----+-----------------------
  1 | survives compose down
(1 row)
```

## Зупинка

Зупинити стек, зберігши дані PostgreSQL:

```bash
docker compose down
```

Зупинити стек і видалити volumes разом із даними PostgreSQL:

```bash
docker compose down -v
```
