const express = require('express');
const router = express.Router();
const pool = require('../db/conexion');

// GET /api/niveles
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM niveles ORDER BY id');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/niveles/:id
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM niveles WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Nivel no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;