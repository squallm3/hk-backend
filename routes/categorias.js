const express = require('express');
const router = express.Router();
const pool = require('../db/conexion');

// GET /api/categorias
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM categorias WHERE activa = 1 ORDER BY orden'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/categorias/:slug
router.get('/:slug', async (req, res) => {
  try {
    const [categorias] = await pool.query(
      'SELECT * FROM categorias WHERE slug = ? AND activa = 1',
      [req.params.slug]
    );
    if (categorias.length === 0)
      return res.status(404).json({ error: 'Categoría no encontrada' });

    const categoria = categorias[0];
    const [productos] = await pool.query(`
      SELECT p.*, GROUP_CONCAT(pi.url ORDER BY pi.orden) as imagenes
      FROM productos p
      LEFT JOIN producto_imagenes pi ON p.id = pi.productoId
      WHERE p.categoriaId = ? AND p.activo = 1
      GROUP BY p.id
      ORDER BY p.id
    `, [categoria.id]);

    res.json({ ...categoria, productos });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
