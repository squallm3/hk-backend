const express = require('express');
const router = express.Router();
const pool = require('../db/conexion');
const { verificarToken } = require('../middleware/auth');

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
    res.status(500).json({ error: err.message });
  }
});

// POST /api/pleromos
router.post('/', verificarToken, async (req, res) => {
  try {
    const { nombre } = req.body;
    const [result] = await pool.query(
      'INSERT INTO pleromos (usuarioId, nombre) VALUES (?, ?)',
      [req.uid, nombre]
    );
    const [rows] = await pool.query('SELECT * FROM pleromos WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/pleromos/:id/sizigias
router.post('/:id/sizigias', verificarToken, async (req, res) => {
  try {
    const { nombre } = req.body;
    const [result] = await pool.query(
      'INSERT INTO sizigias (pleromiId, nombre) VALUES (?, ?)',
      [req.params.id, nombre]
    );
    const [rows] = await pool.query('SELECT * FROM sizigias WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
