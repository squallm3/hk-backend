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

    let [rows] = await pool.query(SELECT_PERSONAJE, [req.uid]);

    if (rows.length === 0) {
      await pool.query(
        'INSERT INTO personajes (uuid, usuarioId, nivelId, xpAcumulada) VALUES (?, ?, 1, 0)',
        [randomUUID(), req.uid]
      );
      [rows] = await pool.query(SELECT_PERSONAJE, [req.uid]);
    }

    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/personajes/mio  { xpAcumulada, nivelId }
// Actualiza el progreso del usuario logueado
router.put('/mio', verificarToken, async (req, res) => {
  try {
    const { xpAcumulada, nivelId } = req.body;

    if (typeof xpAcumulada !== 'number' || xpAcumulada < 0) {
      return res.status(400).json({ error: 'xpAcumulada invalida' });
    }
    if (typeof nivelId !== 'number' || nivelId < 1) {
      return res.status(400).json({ error: 'nivelId invalido' });
    }

    await asegurarUsuario(req.uid, req.email);

    const [rows] = await pool.query(
      'SELECT id FROM personajes WHERE usuarioId = ? AND activo = 1 LIMIT 1',
      [req.uid]
    );

    if (rows.length === 0) {
      await pool.query(
        'INSERT INTO personajes (uuid, usuarioId, nivelId, xpAcumulada) VALUES (?, ?, ?, ?)',
        [randomUUID(), req.uid, nivelId, xpAcumulada]
      );
    } else {
      await pool.query(
        'UPDATE personajes SET xpAcumulada = ?, nivelId = ? WHERE usuarioId = ? AND activo = 1',
        [xpAcumulada, nivelId, req.uid]
      );
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;