const express = require('express');
const router = express.Router();
const pool = require('../db/conexion');

// GET /api/categorias
router.get('/categorias', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM categorias WHERE activa = 1 ORDER BY orden'
    );

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/productos
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        p.*,
        c.nombre AS categoriaNombre,
        GROUP_CONCAT(pi.url ORDER BY pi.orden) AS imagenes
      FROM productos p
      LEFT JOIN categorias c
        ON p.categoriaId = c.id
      LEFT JOIN producto_imagenes pi
        ON p.id = pi.productoId
      WHERE p.activo = 1
      GROUP BY p.id
      ORDER BY p.id
    `);

    const productos = rows.map((producto) => ({
      ...producto,
      imagenes: producto.imagenes
        ? producto.imagenes
            .split(',')
            .map((img) => img.trim())
            .filter(Boolean)
        : [],
    }));

    res.json(productos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/productos/mas-vendidos - top de productos por cantidad real vendida
router.get('/mas-vendidos', async (req, res) => {
  try {
    const limite = Number(req.query.limite) || 8;

    const [rows] = await pool.query(
      `
      SELECT
        p.*,
        c.nombre AS categoriaNombre,
        GROUP_CONCAT(DISTINCT pi.url ORDER BY pi.orden) AS imagenes,
        COALESCE(ventas.totalVendido, 0) AS totalVendido
      FROM productos p
      LEFT JOIN categorias c
        ON p.categoriaId = c.id
      LEFT JOIN producto_imagenes pi
        ON p.id = pi.productoId
      INNER JOIN (
        SELECT pv.productoId, SUM(pdi.cantidad) AS totalVendido
        FROM pedido_items pdi
        INNER JOIN producto_variantes pv
          ON pv.id = pdi.varianteId
        INNER JOIN pedidos pe
          ON pe.id = pdi.pedidoId
        WHERE pe.deletedAt IS NULL
        GROUP BY pv.productoId
      ) ventas
        ON ventas.productoId = p.id
      WHERE p.activo = 1
      GROUP BY p.id
      ORDER BY ventas.totalVendido DESC
      LIMIT ?
      `,
      [limite]
    );

    const productos = rows.map((producto) => ({
      ...producto,
      imagenes: producto.imagenes
        ? producto.imagenes
            .split(',')
            .map((img) => img.trim())
            .filter(Boolean)
        : [],
    }));

    res.json(productos);
  } catch (err) {
    console.error('Error GET /api/productos/mas-vendidos:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/productos/:slug
router.get('/:slug', async (req, res) => {
  try {
    const [productos] = await pool.query(
      'SELECT * FROM productos WHERE slug = ? AND activo = 1',
      [req.params.slug]
    );

    if (productos.length === 0) {
      return res.status(404).json({
        error: 'Producto no encontrado',
      });
    }

    const producto = productos[0];

    const [variantes] = await pool.query(
      'SELECT * FROM producto_variantes WHERE productoId = ?',
      [producto.id]
    );

    const [imagenes] = await pool.query(
      'SELECT * FROM producto_imagenes WHERE productoId = ? ORDER BY orden',
      [producto.id]
    );

    res.json({
      ...producto,
      variantes,
      imagenes,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;