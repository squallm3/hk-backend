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

// GET /api/niveles/con-productos - niveles con sus 3 imagenes (A, B y 3D)
// El nombre del endpoint se mantiene por compatibilidad, pero ya no
// agrupa productos: cada nivel muestra su artefacto en las 3 vistas.
router.get('/con-productos', async (req, res) => {
  try {
    const [niveles] = await pool.query(
      'SELECT id, uuid, titulo, artefacto, imagenA, imagenB, imagenA3d, xpAcumulada FROM niveles ORDER BY id'
    );

    res.json(niveles);
  } catch (err) {
    console.error('Error GET /api/niveles/con-productos:', err.message);
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