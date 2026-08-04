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

// GET /api/niveles/con-productos - niveles con sus productos agrupados
router.get('/con-productos', async (req, res) => {
  try {
    const [niveles] = await pool.query(
      'SELECT id, uuid, titulo, artefacto, imagenA, imagenB, xpAcumulada FROM niveles ORDER BY id'
    );

    const [productos] = await pool.query(`
      SELECT
        p.id, p.uuid, p.nombre, p.slug, p.descripcionCorta,
        p.precio, p.precioOferta,
        p.nivelRequerido, p.rareza, p.stock,
        c.nombre AS categoriaNombre,
        GROUP_CONCAT(pi.url ORDER BY pi.orden) AS imagenes
      FROM productos p
      LEFT JOIN categorias c ON p.categoriaId = c.id
      LEFT JOIN producto_imagenes pi ON p.id = pi.productoId
      WHERE p.activo = 1
      GROUP BY p.id
      ORDER BY p.id
    `);

    const productosNormalizados = productos.map((producto) => ({
      ...producto,
      imagenes: producto.imagenes
        ? producto.imagenes
            .split(',')
            .map((img) => img.trim())
            .filter(Boolean)
        : [],
    }));

    const resultado = niveles.map((nivel) => ({
      ...nivel,
      productos: productosNormalizados.filter(
        (producto) => (producto.nivelRequerido || 1) === nivel.id
      ),
    }));

    res.json(resultado);
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