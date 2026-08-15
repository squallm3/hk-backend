# HK Backend — HK-ICHING Beta 2

Se agregó:
- `db/migraciones/003_iching_tiradas.sql`
- Persistencia autenticada en `routes/iching.js`
- `POST /api/iching/tiradas`
- `GET /api/iching/tiradas`
- `PATCH /api/iching/tiradas/:id/interpretacion`

Aplicar la migración en la base `haiku_gnostico` antes de probar el guardado de tiradas.
