# Módulo Split — gastos compartidos

Integración aditiva sobre `hk-backend`. Nada existente cambia de comportamiento.

## Qué cambió

**Archivos nuevos (3)**

| Archivo | Qué hace |
|---|---|
| `db/split-schema.sql` | Crea las 5 tablas `split_*`. No toca ninguna tabla existente. Incluye rollback comentado al final. |
| `db/split-calculos.js` | Reparto de gastos, saldos y simplificación de deudas. No toca la base ni Express. |
| `routes/split.js` | Los endpoints, todos bajo `/api/split`. |

**Archivos modificados (2)**

| Archivo | Cambio |
|---|---|
| `index.js` | +3 líneas al final: monta el router de split. |
| `package.json` | +1 dependencia: `uuid`. |

Sobre `uuid`: no era una dependencia declarada, pero `routes/pedidos.js` ya hacía
`require('uuid')`. Venía funcionando solo porque quedaba instalado como dependencia
transitiva de `firebase-admin`. Si esa cadena cambiaba, el contenedor no arrancaba.
Ahora está declarada explícitamente.

## Cómo aplicarlo

**1. Instalar la dependencia**

```bash
npm install
```

**2. Crear las tablas** (probar primero en una copia de la base)

```bash
docker exec -i mysql-tienda mysql -u haikus -p haiku_gnostico < db/split-schema.sql
```

**3. Levantar**

```bash
docker compose up -d --build
curl http://localhost:3001/health
```

## Verificar que no se rompió nada

Las rutas existentes tienen que responder igual que antes:

```bash
curl http://localhost:3001/api/niveles
curl http://localhost:3001/api/categorias
curl http://localhost:3001/api/productos
```

Y después probar punta a punta `hk-store-web` (3000), `hk-tasks-web` (3002)
y `hk-real-life-jrpg` (8112).

## Endpoints nuevos

Todos requieren `Authorization: Bearer <token de Firebase>`.

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/api/split/grupos` | Grupos del usuario con su saldo en cada uno |
| POST | `/api/split/grupos` | Crear grupo con sus miembros |
| GET | `/api/split/grupos/:uuid` | Detalle: miembros, gastos, pagos, saldos y liquidación sugerida |
| POST | `/api/split/grupos/:uuid/miembros` | Sumar a alguien al grupo |
| POST | `/api/split/grupos/:uuid/gastos` | Cargar un gasto |
| DELETE | `/api/split/gastos/:uuid` | Borrar un gasto (lógico) |
| POST | `/api/split/grupos/:uuid/pagos` | Registrar un pago para saldar |
| DELETE | `/api/split/pagos/:uuid` | Borrar un pago (lógico) |

## Decisiones que conviene conocer

**Montos en `decimal(12,2)`, cálculos en centavos enteros.** El esquema sigue tu
convención (`pedidos.total` usa `decimal(10,2)`), pero toda división se hace en
enteros. Si se dividiera en punto flotante, repartir $100 entre 3 pierde un centavo
y los saldos del grupo nunca cierran en cero.

**Miembros sin cuenta.** `split_grupo_miembros.usuarioId` puede ser `NULL`. Así se
puede dividir con alguien que no usa la app. Si después se registra, se vincula sin
perder el historial.

**Autorización en cada endpoint.** Todos verifican que el usuario sea miembro activo
del grupo antes de leer o escribir. Sin eso, conocer un uuid alcanzaría para ver
gastos ajenos.

**Borrado lógico.** Se usa `deletedAt`, igual que en `pedidos`.

## Revertir

Para sacar el módulo sin dejar rastro: borrar `routes/split.js`,
`db/split-calculos.js`, las 3 líneas de `index.js`, y correr el bloque de `DROP TABLE`
comentado al final de `db/split-schema.sql`.
