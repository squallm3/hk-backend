const express = require('express');
const router = express.Router();
const pool = require('../db/conexion');
const { verificarToken } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');
const {
  aCentavos,
  aDecimal,
  calcularPartes,
  calcularSaldos,
  simplificarDeudas,
} = require('../db/split-calculos');

/**
 * Modulo SPLIT — gastos compartidos.
 * Todo cuelga de /api/split y usa solo tablas con prefijo split_.
 * La unica tabla existente que toca es `usuarios`, y solo la lee.
 */

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/**
 * Verifica que el usuario logueado sea miembro activo del grupo.
 * Devuelve { grupo, miembro } o null si no tiene acceso.
 * Se llama en TODOS los endpoints: sin esto, cualquiera con un
 * uuid de grupo podria leer o escribir gastos ajenos.
 */
async function accesoAlGrupo(conn, grupoUuid, uid) {
  const [grupos] = await conn.query(
    'SELECT * FROM split_grupos WHERE uuid = ? AND deletedAt IS NULL',
    [grupoUuid]
  );
  if (grupos.length === 0) return null;

  const [miembros] = await conn.query(
    `SELECT * FROM split_grupo_miembros
     WHERE grupoId = ? AND usuarioId = ? AND deletedAt IS NULL AND activo = 1`,
    [grupos[0].id, uid]
  );
  if (miembros.length === 0) return null;

  return { grupo: grupos[0], miembro: miembros[0] };
}

/** Trae miembros, gastos con sus partes, y pagos de un grupo. */
async function cargarMovimientos(conn, grupoId) {
  const [miembros] = await conn.query(
    `SELECT id, uuid, usuarioId, nombre, rol FROM split_grupo_miembros
     WHERE grupoId = ? AND deletedAt IS NULL ORDER BY id`,
    [grupoId]
  );

  const [gastosRaw] = await conn.query(
    `SELECT g.*, m.nombre AS pagadoPorNombre
     FROM split_gastos g
     JOIN split_grupo_miembros m ON m.id = g.pagadoPorId
     WHERE g.grupoId = ? AND g.deletedAt IS NULL
     ORDER BY g.fecha DESC, g.id DESC`,
    [grupoId]
  );

  const [partesRaw] = await conn.query(
    `SELECT p.* FROM split_gasto_partes p
     JOIN split_gastos g ON g.id = p.gastoId
     WHERE g.grupoId = ? AND g.deletedAt IS NULL`,
    [grupoId]
  );

  const [pagosRaw] = await conn.query(
    `SELECT * FROM split_pagos
     WHERE grupoId = ? AND deletedAt IS NULL
     ORDER BY fecha DESC, id DESC`,
    [grupoId]
  );

  const partesPorGasto = new Map();
  for (const parte of partesRaw) {
    if (!partesPorGasto.has(parte.gastoId)) partesPorGasto.set(parte.gastoId, []);
    partesPorGasto.get(parte.gastoId).push({
      miembroId: parte.miembroId,
      monto: parte.monto,
      montoCentavos: aCentavos(parte.monto),
    });
  }

  const gastos = gastosRaw.map((g) => ({
    ...g,
    montoCentavos: aCentavos(g.monto),
    partes: partesPorGasto.get(g.id) || [],
  }));

  const pagos = pagosRaw.map((p) => ({
    ...p,
    montoCentavos: aCentavos(p.monto),
  }));

  return { miembros, gastos, pagos };
}

// ─────────────────────────────────────────────────────────────
// GET /api/split/grupos — grupos del usuario, con su saldo
// ─────────────────────────────────────────────────────────────
router.get('/grupos', verificarToken, async (req, res) => {
  try {
    const [grupos] = await pool.query(
      `SELECT g.*, m.id AS miMiembroId
       FROM split_grupos g
       JOIN split_grupo_miembros m ON m.grupoId = g.id
       WHERE m.usuarioId = ? AND m.deletedAt IS NULL AND m.activo = 1
         AND g.deletedAt IS NULL
       ORDER BY g.updatedAt DESC`,
      [req.uid]
    );

    const salida = [];
    for (const grupo of grupos) {
      const { miembros, gastos, pagos } = await cargarMovimientos(pool, grupo.id);
      const saldos = calcularSaldos(miembros.map((m) => m.id), gastos, pagos);
      const totalGastado = gastos.reduce((a, g) => a + g.montoCentavos, 0);

      salida.push({
        uuid: grupo.uuid,
        nombre: grupo.nombre,
        emoji: grupo.emoji,
        moneda: grupo.moneda,
        cantidadMiembros: miembros.length,
        totalGastado: aDecimal(totalGastado),
        miSaldo: aDecimal(saldos[grupo.miMiembroId] || 0),
      });
    }

    res.json(salida);
  } catch (err) {
    console.error('Error GET /api/split/grupos:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/split/grupos — crear grupo
// body: { nombre, emoji?, moneda?, miembros: [{ nombre, email? }] }
// El usuario logueado queda siempre como admin.
// ─────────────────────────────────────────────────────────────
router.post('/grupos', verificarToken, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { nombre, emoji, moneda, miembros } = req.body;

    if (typeof nombre !== 'string' || !nombre.trim()) {
      return res.status(400).json({ error: 'El grupo necesita un nombre' });
    }

    await connection.beginTransaction();

    const grupoUuid = uuidv4();
    const [resultGrupo] = await connection.query(
      `INSERT INTO split_grupos (uuid, nombre, emoji, moneda, creadorId)
       VALUES (?, ?, ?, ?, ?)`,
      [grupoUuid, nombre.trim(), emoji || null, (moneda || 'ARS').toUpperCase(), req.uid]
    );
    const grupoId = resultGrupo.insertId;

    // El creador entra como admin
    const [usuarios] = await connection.query(
      'SELECT nombre, email FROM usuarios WHERE id = ?',
      [req.uid]
    );
    const nombreCreador =
      (usuarios[0] && (usuarios[0].nombre || usuarios[0].email)) || 'Yo';

    await connection.query(
      `INSERT INTO split_grupo_miembros (uuid, grupoId, usuarioId, nombre, rol)
       VALUES (?, ?, ?, ?, 'admin')`,
      [uuidv4(), grupoId, req.uid, nombreCreador]
    );

    // Resto de miembros. Si el email coincide con un usuario existente
    // se vincula la cuenta; si no, queda como invitado sin cuenta.
    for (const m of Array.isArray(miembros) ? miembros : []) {
      if (!m || typeof m.nombre !== 'string' || !m.nombre.trim()) continue;

      let usuarioId = null;
      if (m.email) {
        const [encontrado] = await connection.query(
          'SELECT id FROM usuarios WHERE email = ? AND deletedAt IS NULL',
          [m.email.trim().toLowerCase()]
        );
        if (encontrado.length > 0 && encontrado[0].id !== req.uid) {
          usuarioId = encontrado[0].id;
        }
      }

      await connection.query(
        `INSERT INTO split_grupo_miembros (uuid, grupoId, usuarioId, nombre)
         VALUES (?, ?, ?, ?)`,
        [uuidv4(), grupoId, usuarioId, m.nombre.trim()]
      );
    }

    await connection.commit();

    const [grupos] = await connection.query(
      'SELECT * FROM split_grupos WHERE id = ?',
      [grupoId]
    );
    const [miembrosCreados] = await connection.query(
      'SELECT id, uuid, usuarioId, nombre, rol FROM split_grupo_miembros WHERE grupoId = ?',
      [grupoId]
    );

    res.status(201).json({ ...grupos[0], miembros: miembrosCreados });
  } catch (err) {
    await connection.rollback();
    console.error('Error POST /api/split/grupos:', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    connection.release();
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/split/grupos/:uuid — detalle completo
// Devuelve miembros, gastos, pagos, saldos y como saldar.
// ─────────────────────────────────────────────────────────────
router.get('/grupos/:uuid', verificarToken, async (req, res) => {
  try {
    const acceso = await accesoAlGrupo(pool, req.params.uuid, req.uid);
    if (!acceso) return res.status(404).json({ error: 'Grupo no encontrado' });

    const { grupo, miembro } = acceso;
    const { miembros, gastos, pagos } = await cargarMovimientos(pool, grupo.id);
    const saldos = calcularSaldos(miembros.map((m) => m.id), gastos, pagos);
    const liquidacion = simplificarDeudas(saldos);

    const nombrePorId = Object.fromEntries(miembros.map((m) => [m.id, m.nombre]));

    res.json({
      uuid: grupo.uuid,
      nombre: grupo.nombre,
      emoji: grupo.emoji,
      moneda: grupo.moneda,
      miMiembroId: miembro.id,
      miembros: miembros.map((m) => ({
        id: m.id,
        uuid: m.uuid,
        nombre: m.nombre,
        rol: m.rol,
        tieneCuenta: Boolean(m.usuarioId),
        saldo: aDecimal(saldos[m.id] || 0),
      })),
      gastos: gastos.map((g) => ({
        uuid: g.uuid,
        descripcion: g.descripcion,
        categoria: g.categoria,
        monto: g.monto,
        fecha: g.fecha,
        tipoReparto: g.tipoReparto,
        pagadoPorId: g.pagadoPorId,
        pagadoPorNombre: g.pagadoPorNombre,
        partes: g.partes.map((p) => ({
          miembroId: p.miembroId,
          nombre: nombrePorId[p.miembroId],
          monto: p.monto,
        })),
      })),
      pagos: pagos.map((p) => ({
        uuid: p.uuid,
        deMiembroId: p.deMiembroId,
        deNombre: nombrePorId[p.deMiembroId],
        aMiembroId: p.aMiembroId,
        aNombre: nombrePorId[p.aMiembroId],
        monto: p.monto,
        fecha: p.fecha,
        notas: p.notas,
      })),
      liquidacion: liquidacion.map((t) => ({
        deMiembroId: t.deMiembroId,
        deNombre: nombrePorId[t.deMiembroId],
        aMiembroId: t.aMiembroId,
        aNombre: nombrePorId[t.aMiembroId],
        monto: t.monto,
      })),
    });
  } catch (err) {
    console.error('Error GET /api/split/grupos/:uuid:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/split/grupos/:uuid/miembros — sumar a alguien
// body: { nombre, email? }
// ─────────────────────────────────────────────────────────────
router.post('/grupos/:uuid/miembros', verificarToken, async (req, res) => {
  try {
    const acceso = await accesoAlGrupo(pool, req.params.uuid, req.uid);
    if (!acceso) return res.status(404).json({ error: 'Grupo no encontrado' });

    const { nombre, email } = req.body;
    if (typeof nombre !== 'string' || !nombre.trim()) {
      return res.status(400).json({ error: 'El miembro necesita un nombre' });
    }

    let usuarioId = null;
    if (email) {
      const [encontrado] = await pool.query(
        'SELECT id FROM usuarios WHERE email = ? AND deletedAt IS NULL',
        [email.trim().toLowerCase()]
      );
      if (encontrado.length > 0) usuarioId = encontrado[0].id;
    }

    if (usuarioId) {
      const [yaEsta] = await pool.query(
        `SELECT id FROM split_grupo_miembros
         WHERE grupoId = ? AND usuarioId = ? AND deletedAt IS NULL`,
        [acceso.grupo.id, usuarioId]
      );
      if (yaEsta.length > 0) {
        return res.status(409).json({ error: 'Esa persona ya esta en el grupo' });
      }
    }

    const miembroUuid = uuidv4();
    await pool.query(
      `INSERT INTO split_grupo_miembros (uuid, grupoId, usuarioId, nombre)
       VALUES (?, ?, ?, ?)`,
      [miembroUuid, acceso.grupo.id, usuarioId, nombre.trim()]
    );

    const [creado] = await pool.query(
      'SELECT id, uuid, usuarioId, nombre, rol FROM split_grupo_miembros WHERE uuid = ?',
      [miembroUuid]
    );
    res.status(201).json(creado[0]);
  } catch (err) {
    console.error('Error POST /api/split/grupos/:uuid/miembros:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/split/grupos/:uuid/gastos — cargar un gasto
// body: {
//   descripcion, monto, categoria?, fecha?,
//   pagadoPorId, tipoReparto, participantes: [miembroId],
//   valores?: { miembroId: valor }   // solo si no es 'igual'
// }
// ─────────────────────────────────────────────────────────────
router.post('/grupos/:uuid/gastos', verificarToken, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const acceso = await accesoAlGrupo(connection, req.params.uuid, req.uid);
    if (!acceso) return res.status(404).json({ error: 'Grupo no encontrado' });

    const {
      descripcion,
      monto,
      categoria,
      fecha,
      pagadoPorId,
      tipoReparto,
      participantes,
      valores,
    } = req.body;

    if (typeof descripcion !== 'string' || !descripcion.trim()) {
      return res.status(400).json({ error: 'El gasto necesita una descripcion' });
    }

    const totalCentavos = aCentavos(monto);
    if (!Number.isFinite(totalCentavos) || totalCentavos <= 0) {
      return res.status(400).json({ error: 'El monto tiene que ser mayor a cero' });
    }

    // Todos los miembros referenciados tienen que pertenecer a este grupo.
    const [miembrosGrupo] = await connection.query(
      `SELECT id FROM split_grupo_miembros
       WHERE grupoId = ? AND deletedAt IS NULL`,
      [acceso.grupo.id]
    );
    const idsValidos = new Set(miembrosGrupo.map((m) => m.id));

    if (!idsValidos.has(Number(pagadoPorId))) {
      return res.status(400).json({ error: 'Quien pago no es miembro del grupo' });
    }

    const ids = (Array.isArray(participantes) ? participantes : []).map(Number);
    if (ids.some((id) => !idsValidos.has(id))) {
      return res
        .status(400)
        .json({ error: 'Hay participantes que no son miembros del grupo' });
    }

    const resultado = calcularPartes(
      tipoReparto || 'igual',
      totalCentavos,
      ids,
      valores || {}
    );
    if (resultado.error) {
      return res.status(400).json({ error: resultado.error });
    }

    await connection.beginTransaction();

    const gastoUuid = uuidv4();
    const [resultGasto] = await connection.query(
      `INSERT INTO split_gastos
         (uuid, grupoId, descripcion, categoria, monto, pagadoPorId, tipoReparto, fecha, creadoPorId)
       VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURDATE()), ?)`,
      [
        gastoUuid,
        acceso.grupo.id,
        descripcion.trim(),
        categoria || 'otros',
        aDecimal(totalCentavos),
        Number(pagadoPorId),
        tipoReparto || 'igual',
        fecha || null,
        req.uid,
      ]
    );
    const gastoId = resultGasto.insertId;

    for (const [miembroId, centavos] of Object.entries(resultado.partes)) {
      await connection.query(
        `INSERT INTO split_gasto_partes (gastoId, miembroId, monto) VALUES (?, ?, ?)`,
        [gastoId, Number(miembroId), aDecimal(centavos)]
      );
    }

    await connection.commit();

    const [gastos] = await connection.query(
      'SELECT * FROM split_gastos WHERE id = ?',
      [gastoId]
    );
    const [partes] = await connection.query(
      'SELECT miembroId, monto FROM split_gasto_partes WHERE gastoId = ?',
      [gastoId]
    );

    res.status(201).json({ ...gastos[0], partes });
  } catch (err) {
    await connection.rollback();
    console.error('Error POST /api/split/grupos/:uuid/gastos:', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    connection.release();
  }
});

// ─────────────────────────────────────────────────────────────
// DELETE /api/split/gastos/:uuid — borrado logico
// ─────────────────────────────────────────────────────────────
router.delete('/gastos/:uuid', verificarToken, async (req, res) => {
  try {
    const [gastos] = await pool.query(
      `SELECT g.id, g.grupoId FROM split_gastos g
       WHERE g.uuid = ? AND g.deletedAt IS NULL`,
      [req.params.uuid]
    );
    if (gastos.length === 0) {
      return res.status(404).json({ error: 'Gasto no encontrado' });
    }

    const [miembros] = await pool.query(
      `SELECT id FROM split_grupo_miembros
       WHERE grupoId = ? AND usuarioId = ? AND deletedAt IS NULL AND activo = 1`,
      [gastos[0].grupoId, req.uid]
    );
    if (miembros.length === 0) {
      return res.status(404).json({ error: 'Gasto no encontrado' });
    }

    await pool.query('UPDATE split_gastos SET deletedAt = NOW() WHERE id = ?', [
      gastos[0].id,
    ]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Error DELETE /api/split/gastos/:uuid:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/split/grupos/:uuid/pagos — registrar un pago
// body: { deMiembroId, aMiembroId, monto, fecha?, notas? }
// ─────────────────────────────────────────────────────────────
router.post('/grupos/:uuid/pagos', verificarToken, async (req, res) => {
  try {
    const acceso = await accesoAlGrupo(pool, req.params.uuid, req.uid);
    if (!acceso) return res.status(404).json({ error: 'Grupo no encontrado' });

    const { deMiembroId, aMiembroId, monto, fecha, notas } = req.body;

    const de = Number(deMiembroId);
    const a = Number(aMiembroId);
    if (de === a) {
      return res.status(400).json({ error: 'El pago tiene que ser entre dos personas distintas' });
    }

    const centavos = aCentavos(monto);
    if (!Number.isFinite(centavos) || centavos <= 0) {
      return res.status(400).json({ error: 'El monto tiene que ser mayor a cero' });
    }

    const [miembrosGrupo] = await pool.query(
      'SELECT id FROM split_grupo_miembros WHERE grupoId = ? AND deletedAt IS NULL',
      [acceso.grupo.id]
    );
    const idsValidos = new Set(miembrosGrupo.map((m) => m.id));
    if (!idsValidos.has(de) || !idsValidos.has(a)) {
      return res.status(400).json({ error: 'Alguna de las dos personas no es miembro del grupo' });
    }

    const pagoUuid = uuidv4();
    await pool.query(
      `INSERT INTO split_pagos
         (uuid, grupoId, deMiembroId, aMiembroId, monto, fecha, notas, creadoPorId)
       VALUES (?, ?, ?, ?, ?, COALESCE(?, CURDATE()), ?, ?)`,
      [pagoUuid, acceso.grupo.id, de, a, aDecimal(centavos), fecha || null, notas || null, req.uid]
    );

    const [creado] = await pool.query('SELECT * FROM split_pagos WHERE uuid = ?', [pagoUuid]);
    res.status(201).json(creado[0]);
  } catch (err) {
    console.error('Error POST /api/split/grupos/:uuid/pagos:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// DELETE /api/split/pagos/:uuid — borrado logico
// ─────────────────────────────────────────────────────────────
router.delete('/pagos/:uuid', verificarToken, async (req, res) => {
  try {
    const [pagos] = await pool.query(
      'SELECT id, grupoId FROM split_pagos WHERE uuid = ? AND deletedAt IS NULL',
      [req.params.uuid]
    );
    if (pagos.length === 0) return res.status(404).json({ error: 'Pago no encontrado' });

    const [miembros] = await pool.query(
      `SELECT id FROM split_grupo_miembros
       WHERE grupoId = ? AND usuarioId = ? AND deletedAt IS NULL AND activo = 1`,
      [pagos[0].grupoId, req.uid]
    );
    if (miembros.length === 0) return res.status(404).json({ error: 'Pago no encontrado' });

    await pool.query('UPDATE split_pagos SET deletedAt = NOW() WHERE id = ?', [pagos[0].id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Error DELETE /api/split/pagos/:uuid:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// PUT /api/split/gastos/:uuid — editar un gasto ya cargado
// Mismo body que el POST de creación. Reemplaza descripcion,
// categoria, monto, quien pago, tipo de reparto y las partes.
// Se borran las partes viejas y se insertan las nuevas dentro de
// la misma transaccion: no queda un estado intermedio inconsistente
// si algo falla a mitad de camino.
// ─────────────────────────────────────────────────────────────
router.put('/gastos/:uuid', verificarToken, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const [gastosExistentes] = await connection.query(
      `SELECT g.id, g.grupoId FROM split_gastos g
       WHERE g.uuid = ? AND g.deletedAt IS NULL`,
      [req.params.uuid]
    );
    if (gastosExistentes.length === 0) {
      return res.status(404).json({ error: 'Gasto no encontrado' });
    }
    const gastoId = gastosExistentes[0].id;
    const grupoId = gastosExistentes[0].grupoId;

    // Mismo chequeo de acceso que en el resto de las rutas: el
    // usuario tiene que ser miembro activo del grupo dueño del gasto.
    const [miembrosAcceso] = await connection.query(
      `SELECT id FROM split_grupo_miembros
       WHERE grupoId = ? AND usuarioId = ? AND deletedAt IS NULL AND activo = 1`,
      [grupoId, req.uid]
    );
    if (miembrosAcceso.length === 0) {
      return res.status(404).json({ error: 'Gasto no encontrado' });
    }

    const {
      descripcion,
      monto,
      categoria,
      fecha,
      pagadoPorId,
      tipoReparto,
      participantes,
      valores,
    } = req.body;

    if (typeof descripcion !== 'string' || !descripcion.trim()) {
      return res.status(400).json({ error: 'El gasto necesita una descripcion' });
    }

    const totalCentavos = aCentavos(monto);
    if (!Number.isFinite(totalCentavos) || totalCentavos <= 0) {
      return res.status(400).json({ error: 'El monto tiene que ser mayor a cero' });
    }

    const [miembrosGrupo] = await connection.query(
      `SELECT id FROM split_grupo_miembros
       WHERE grupoId = ? AND deletedAt IS NULL`,
      [grupoId]
    );
    const idsValidos = new Set(miembrosGrupo.map((m) => m.id));

    if (!idsValidos.has(Number(pagadoPorId))) {
      return res.status(400).json({ error: 'Quien pago no es miembro del grupo' });
    }

    const ids = (Array.isArray(participantes) ? participantes : []).map(Number);
    if (ids.some((id) => !idsValidos.has(id))) {
      return res
        .status(400)
        .json({ error: 'Hay participantes que no son miembros del grupo' });
    }

    const resultado = calcularPartes(
      tipoReparto || 'igual',
      totalCentavos,
      ids,
      valores || {}
    );
    if (resultado.error) {
      return res.status(400).json({ error: resultado.error });
    }

    await connection.beginTransaction();

    await connection.query(
      `UPDATE split_gastos
         SET descripcion = ?, categoria = ?, monto = ?, pagadoPorId = ?,
             tipoReparto = ?, fecha = COALESCE(?, fecha)
       WHERE id = ?`,
      [
        descripcion.trim(),
        categoria || 'otros',
        aDecimal(totalCentavos),
        Number(pagadoPorId),
        tipoReparto || 'igual',
        fecha || null,
        gastoId,
      ]
    );

    // Se reemplazan todas las partes: es mas simple y menos propenso
    // a errores que calcular un diff entre las partes viejas y las
    // nuevas, y el volumen de filas por gasto es chico.
    await connection.query('DELETE FROM split_gasto_partes WHERE gastoId = ?', [
      gastoId,
    ]);

    for (const [miembroId, centavos] of Object.entries(resultado.partes)) {
      await connection.query(
        `INSERT INTO split_gasto_partes (gastoId, miembroId, monto) VALUES (?, ?, ?)`,
        [gastoId, Number(miembroId), aDecimal(centavos)]
      );
    }

    await connection.commit();

    const [gastos] = await connection.query(
      'SELECT * FROM split_gastos WHERE id = ?',
      [gastoId]
    );
    const [partes] = await connection.query(
      'SELECT miembroId, monto FROM split_gasto_partes WHERE gastoId = ?',
      [gastoId]
    );

    res.json({ ...gastos[0], partes });
  } catch (err) {
    await connection.rollback();
    console.error('Error PUT /api/split/gastos/:uuid:', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    connection.release();
  }
});

// ─────────────────────────────────────────────────────────────
// PUT /api/split/pagos/:uuid — editar un pago ya registrado
// body: { deMiembroId, aMiembroId, monto, fecha?, notas? }
// ─────────────────────────────────────────────────────────────
router.put('/pagos/:uuid', verificarToken, async (req, res) => {
  try {
    const [pagosExistentes] = await pool.query(
      'SELECT id, grupoId FROM split_pagos WHERE uuid = ? AND deletedAt IS NULL',
      [req.params.uuid]
    );
    if (pagosExistentes.length === 0) {
      return res.status(404).json({ error: 'Pago no encontrado' });
    }
    const pagoId = pagosExistentes[0].id;
    const grupoId = pagosExistentes[0].grupoId;

    const [miembrosAcceso] = await pool.query(
      `SELECT id FROM split_grupo_miembros
       WHERE grupoId = ? AND usuarioId = ? AND deletedAt IS NULL AND activo = 1`,
      [grupoId, req.uid]
    );
    if (miembrosAcceso.length === 0) {
      return res.status(404).json({ error: 'Pago no encontrado' });
    }

    const { deMiembroId, aMiembroId, monto, fecha, notas } = req.body;

    const de = Number(deMiembroId);
    const a = Number(aMiembroId);
    if (de === a) {
      return res.status(400).json({ error: 'El pago tiene que ser entre dos personas distintas' });
    }

    const centavos = aCentavos(monto);
    if (!Number.isFinite(centavos) || centavos <= 0) {
      return res.status(400).json({ error: 'El monto tiene que ser mayor a cero' });
    }

    const [miembrosGrupo] = await pool.query(
      'SELECT id FROM split_grupo_miembros WHERE grupoId = ? AND deletedAt IS NULL',
      [grupoId]
    );
    const idsValidos = new Set(miembrosGrupo.map((m) => m.id));
    if (!idsValidos.has(de) || !idsValidos.has(a)) {
      return res.status(400).json({ error: 'Alguna de las dos personas no es miembro del grupo' });
    }

    await pool.query(
      `UPDATE split_pagos
         SET deMiembroId = ?, aMiembroId = ?, monto = ?,
             fecha = COALESCE(?, fecha), notas = ?
       WHERE id = ?`,
      [de, a, aDecimal(centavos), fecha || null, notas || null, pagoId]
    );

    const [actualizado] = await pool.query('SELECT * FROM split_pagos WHERE id = ?', [pagoId]);
    res.json(actualizado[0]);
  } catch (err) {
    console.error('Error PUT /api/split/pagos/:uuid:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
