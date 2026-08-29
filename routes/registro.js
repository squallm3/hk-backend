const express = require('express');
const router = express.Router();
const pool = require('../db/conexion');
const { verificarToken } = require('../middleware/auth');
const { randomUUID } = require('crypto');

// Todo lo de este router requiere estar logueado: no hay modo invitado.
router.use(verificarToken);

function hoy() {
  return new Date().toISOString().slice(0, 10);
}

// GET /api/registro?fecha=YYYY-MM-DD
router.get('/', async (req, res) => {
  try {
    const fecha = req.query.fecha || hoy();
    const [rows] = await pool.query(
      `SELECT uuid, nombre, porcion, calorias, proteinas_g, carbohidratos_g, grasas_g, alimentoUuid
       FROM registro_diario
       WHERE usuarioId = ? AND fecha = ? AND deletedAt IS NULL
       ORDER BY createdAt ASC`,
      [req.uid, fecha]
    );
    res.json(rows);
  } catch (err) {
    console.error('Error GET /api/registro:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/registro  { nombre, porcion, calorias, proteinas_g, carbohidratos_g, grasas_g, alimentoUuid?, fecha? }
router.post('/', async (req, res) => {
  try {
    const { nombre, porcion, calorias, proteinas_g, carbohidratos_g, grasas_g, alimentoUuid, fecha } = req.body;
    if (!nombre || calorias == null) {
      return res.status(400).json({ error: 'faltan datos del alimento' });
    }
    const uuid = randomUUID();
    await pool.query(
      `INSERT INTO registro_diario
        (uuid, usuarioId, fecha, nombre, porcion, calorias, proteinas_g, carbohidratos_g, grasas_g, alimentoUuid)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [uuid, req.uid, fecha || hoy(), nombre, porcion || '', calorias, proteinas_g || 0, carbohidratos_g || 0, grasas_g || 0, alimentoUuid || null]
    );
    res.json({ uuid });
  } catch (err) {
    console.error('Error POST /api/registro:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/registro/:uuid
router.delete('/:uuid', async (req, res) => {
  try {
    await pool.query(
      `UPDATE registro_diario SET deletedAt = NOW() WHERE uuid = ? AND usuarioId = ?`,
      [req.params.uuid, req.uid]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('Error DELETE /api/registro/:uuid:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/registro/meta/actual
router.get('/meta/actual', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT metaCalorias FROM dieta_preferencias WHERE usuarioId = ?`,
      [req.uid]
    );
    res.json({ metaCalorias: rows.length ? rows[0].metaCalorias : 2000 });
  } catch (err) {
    console.error('Error GET /api/registro/meta/actual:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/registro/meta/actual  { metaCalorias }
router.put('/meta/actual', async (req, res) => {
  try {
    const metaCalorias = Number(req.body.metaCalorias) || 2000;
    await pool.query(
      `INSERT INTO dieta_preferencias (usuarioId, metaCalorias) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE metaCalorias = VALUES(metaCalorias)`,
      [req.uid, metaCalorias]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('Error PUT /api/registro/meta/actual:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;