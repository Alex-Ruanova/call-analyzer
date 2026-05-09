# 10 — Auto-migrate al arrancar la API

- **Estado:** resuelto
- **Fecha:** 2026-05-09
- **Severidad:** media (UX de onboarding — ahorra un paso al primer setup y elimina la posibilidad de olvidarlo)

## Síntoma

Antes: `make up` levantaba los contenedores pero la BD quedaba vacía. El usuario debía recordar correr `make migrate` por separado o seguir el README al pie de la letra:

```bash
make up && make migrate && make seed
```

Si alguien ejecutaba sólo `make up` y abría la app, recibía errores de tablas inexistentes. Cualquier migración nueva (e.g. `0002_add_participants`) significaba que un upgrade del repo requería volver a correr `make migrate`, lo cual es fácil de olvidar.

## Solución aplicada

El `command` del contenedor `api` en `docker-compose.yml` ahora envuelve uvicorn con un `alembic upgrade head` previo:

```yaml
api:
  command: ["sh", "-c", "alembic -c /app/alembic/alembic.ini upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
```

Comportamiento:

- **BD nueva**: alembic encuentra que no hay `alembic_version`, corre 0001 + 0002 (y futuras) en orden. Después arranca uvicorn.
- **BD existente al día**: alembic confirma que ya está en `head`, no-op. Después arranca uvicorn.
- **BD existente con migraciones pendientes**: aplica las que faltan, después arranca.
- **Si la migración falla**: `&&` corta. Uvicorn no arranca, healthcheck falla, el frontend no puede conectar — el problema es visible inmediatamente en lugar de pasar inadvertido.

## Verificado contra DB virgen

Test ejecutado el día del cambio:

```bash
docker exec call-analyzer-db-1 psql -U postgres -c "CREATE DATABASE altur_freshtest;"
docker exec call-analyzer-api-1 sh -c \
  "DATABASE_URL=postgresql+asyncpg://postgres:postgres@db:5432/altur_freshtest \
   alembic -c /app/alembic/alembic.ini upgrade head"
```

Output:

```
INFO  [alembic.runtime.migration] Running upgrade  -> 0001, initial_schema
INFO  [alembic.runtime.migration] Running upgrade 0001 -> 0002, add_participants
```

11 tablas creadas, incluyendo `participants` con su unique constraint y FK a `calls`.

## README actualizado

La sección "2. Run" cambió de:

```bash
make up && make migrate && make seed
```

a:

```bash
make up && make seed
```

Con nota de que `make migrate` sigue disponible para casos manuales (e.g. correr migraciones contra una BD remota sin levantar la API).

## Deuda residual

- **Worker no migra**: solo el `api` contenedor corre alembic. Si por alguna razón el worker arranca antes que el api en una situación rara de orden (`depends_on` lo previene normalmente), podría intentar leer/escribir tablas que aún no existen. En la práctica `depends_on: db: service_healthy` cubre el caso, y el worker espera al api implícitamente porque ambos consumen del mismo schema. Si fuera problema, el patrón estándar es un init container o `worker.command` también con `alembic ... && celery`.
- **No hay rollback automático**: si una migración falla a la mitad (e.g. constraint violado en data existente), alembic deja la BD en un estado intermedio dependiendo de si la migración era transaccional. PostgreSQL soporta DDL transaccional, así que la migración se revierte sola, pero `alembic_version` no avanza. Es comportamiento correcto.
- **Lock de migración**: si dos contenedores `api` arrancan simultáneamente (e.g. `docker compose up --scale api=2`), ambos intentan correr `alembic upgrade head`. Alembic adquiere un advisory lock en PostgreSQL, así que el segundo espera al primero. No es problema, pero merece mencionarse si se evalúa scale-out.
