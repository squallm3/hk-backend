const express = require('express');
const router = express.Router();
const pool = require('../db/conexion');

// GET /api/alimentos/buscar?q=texto
// Busca en la tabla local de alimentos (sin tocar Gemini para nada).
router.get('/buscar', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.json([]);

    const [rows] = await pool.query(
      `SELECT uuid, nombre, porcion, calorias, proteinas_g, carbohidratos_g, grasas_g, vecesUsado
       FROM alimentos
       WHERE deletedAt IS NULL AND nombre LIKE ?
       ORDER BY vecesUsado DESC, nombre ASC
       LIMIT 8`,
      [`%${q}%`]
    );

    res.json(rows);
  } catch (err) {
    console.error('Error GET /api/alimentos/buscar:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/alimentos/:uuid/usar
// Suma un uso, para que los alimentos más elegidos aparezcan primero.
router.post('/:uuid/usar', async (req, res) => {
  try {
    await pool.query(
      `UPDATE alimentos SET vecesUsado = vecesUsado + 1 WHERE uuid = ? AND deletedAt IS NULL`,
      [req.params.uuid]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('Error POST /api/alimentos/:uuid/usar:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;