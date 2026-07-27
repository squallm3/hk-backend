const express = require('express');
const router = express.Router();
const pool = require('../db/conexion');
const { verificarToken } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

// GET /api/pleromos
router.get('/', verificarToken, async (req, res) => {
  try {
    const [pleromos] = await pool.query(
      'SELECT * FROM pleromos WHERE usuarioId = ? AND deletedAt IS NULL ORDER BY id',
      [req.uid]
    );
    for (const pleromo of pleromos) {
      const [sizigias] = await pool.query(
        'SELECT * FROM sizigias WHERE pleromiId = ? AND deletedAt IS NULL ORDER BY orden',
        [pleromo.id]
      );
      for (const sizigia of sizigias) {
        const [misiones] = await pool.query(
          'SELECT * FROM misiones WHERE sizigiaId = ? AND deletedAt IS NULL ORDER BY orden',
          [sizigia.id]
        );
        sizigia.misiones = misiones;
      }
      pleromo.sizigias = sizigias;
    }
    res.json(pleromos);
  } catch (err) {
    console.error('Error GET /api/pleromos:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/pleromos
router.post('/', verificarToken, async (req, res) => {
  try {
    const { nombre } = req.body;
    if (!nombre) return res.status(400).json({ error: 'El nombre es requerido' });
    const uuid = uuidv4();
    const [result] = await pool.query(
      'INSERT INTO pleromos (uuid, usuarioId, nombre) VALUES (?, ?, ?)',
      [uuid, req.uid, nombre]
    );
    const [rows] = await pool.query('SELECT * FROM pleromos WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Error POST /api/pleromos:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/pleromos/:id/sizigias
router.post('/:id/sizigias', verificarToken, async (req, res) => {
  try {
    const { nombre } = req.body;
    if (!nombre) return res.status(400).json({ error: 'El nombre es requerido' });
    const uuid = uuidv4();
    const [result] = await pool.query(
      'INSERT INTO sizigias (uuid, pleromiId, nombre) VALUES (?, ?, ?)',
      [uuid, req.params.id, nombre]
    );
    const [rows] = await pool.query('SELECT * FROM sizigias WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Error POST /api/pleromos/:id/sizigias:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;