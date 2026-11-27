# Base de datos

- Motor inicial: SQLite (`node:sqlite` en servidor, `sql.js` en el archivo único).
- Esquema: `backend/database/schema.sql`.
- Migraciones: `backend/database/migrations.js`.
- Todo el SQL vive en `backend/database/repositories.js`.

Escalabilidad futura: PostgreSQL (reescribir `db.js` y adaptar repositorios).