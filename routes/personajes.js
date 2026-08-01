const express = require('express');
const router = express.Router();
const pool = require('../db/conexion');
const { verificarToken } = require('../middleware/auth');
const { randomUUID } = require('crypto');

// Asegura que exista una fila en usuarios para el uid actual de Firebase
async function asegurarUsuario(uid, email) {
  await pool.query(
    'INSERT INTO usuarios (id, uuid, email) VALUES (?, UUID(), ?) ON DUPLICATE KEY UPDATE email = VALUES(email)',
    [uid, email]
  );
}

// Asegura que exista una fila en personajes para el uid actual (Nivel 1 / 0 XP si no existe)
async function asegurarPersonaje(uid) {
  const [rows] = await pool.query(
    'SELECT id FROM personajes WHERE usuarioId = ? AND activo = 1 LIMIT 1',
    [uid]
  );
  if (rows.length === 0) {
    await pool.query(
      'INSERT INTO personajes (uuid, usuarioId, nivelId, xpAcumulada) VALUES (?, ?, 1, 0)',
      [randomUUID(), uid]
    );
  }
}

// Recalcula nivelId en base a la xpAcumulada actual, usando la tabla niveles como fuente de verdad
async function recalcularNivel(uid) {
  const [rows] = await pool.query(
    'SELECT xpAcumulada FROM personajes WHERE usuarioId = ? AND activo = 1 LIMIT 1',
    [uid]
  );
  const xpAcumulada = rows[0].xpAcumulada;

  const [nivelRows] = await pool.query(
    'SELECT id FROM niveles WHERE xpAcumulada <= ? ORDER BY xpAcumulada DESC LIMIT 1',
    [xpAcumulada]
  );
  const nivelId = nivelRows.length ? nivelRows[0].id : 1;

  await pool.query(
    'UPDATE personajes SET nivelId = ? WHERE usuarioId = ? AND activo = 1',
    [nivelId, uid]
  );

  return { xpAcumulada, nivelId };
}

const SELECT_PERSONAJE =
  'SELECT p.id, p.uuid, p.usuarioId, p.nivelId, p.xpAcumulada, ' +
  'n.titulo, n.artefacto, n.password, n.imagenA, n.imagenB ' +
  'FROM personajes p JOIN niveles n ON n.id = p.nivelId ' +
  'WHERE p.usuarioId = ? AND p.activo = 1 LIMIT 1';

// GET /api/personajes/mio
// Devuelve el personaje del usuario logueado (lo crea en Nivel 1 / 0 XP si no existe)
router.get('/mio', verificarToken, async (req, res) => {
  try {
    await asegurarUsuario(req.uid, req.email);
    await asegurarPersonaje(req.uid);

    const [rows] = await pool.query(SELECT_PERSONAJE, [req.uid]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/personajes/mio/sumar-xp  { delta }
// Suma (o resta, si delta es negativo) de forma ATOMICA sobre el valor ya guardado.
// Esto evita que un dispositivo con datos viejos en memoria pise el progreso de otro mas nuevo.
router.put('/mio/sumar-xp', verificarToken, async (req, res) => {
  try {
    const { delta } = req.body;
    if (typeof delta !== 'number') {
      return res.status(400).json({ error: 'delta invalido' });
    }

    await asegurarUsuario(req.uid, req.email);
    await asegurarPersonaje(req.uid);

    await pool.query(
      'UPDATE personajes SET xpAcumulada = GREATEST(0, xpAcumulada + ?) WHERE usuarioId = ? AND activo = 1',
      [delta, req.uid]
    );

    await recalcularNivel(req.uid);

    const [rows] = await pool.query(SELECT_PERSONAJE, [req.uid]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/personajes/mio/establecer-xp  { xpAcumulada }
// Fija un valor absoluto (usado para el salto por contraseña y para importar partida).
router.put('/mio/establecer-xp', verificarToken, async (req, res) => {
  try {
    const { xpAcumulada } = req.body;
    if (typeof xpAcumulada !== 'number' || xpAcumulada < 0) {
      return res.status(400).json({ error: 'xpAcumulada invalida' });
    }

    await asegurarUsuario(req.uid, req.email);
    await asegurarPersonaje(req.uid);

    await pool.query(
      'UPDATE personajes SET xpAcumulada = ? WHERE usuarioId = ? AND activo = 1',
      [xpAcumulada, req.uid]
    );

    await recalcularNivel(req.uid);

    const [rows] = await pool.query(SELECT_PERSONAJE, [req.uid]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;