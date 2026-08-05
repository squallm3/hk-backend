const express = require('express');
const router = express.Router();
const pool = require('../db/conexion');
const { verificarAdmin } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

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

// GET /api/categorias/admin - listado completo para el panel (incluye inactivas)
router.get('/admin', verificarAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT c.*, COUNT(p.id) AS cantidadProductos
       FROM categorias c
       LEFT JOIN productos p ON p.categoriaId = c.id AND p.deletedAt IS NULL
       WHERE c.deletedAt IS NULL
       GROUP BY c.id
       ORDER BY c.orden`
    );
    res.json(rows);
  } catch (err) {
    console.error('Error GET /api/categorias/admin:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/categorias - crear categoria
router.post('/', verificarAdmin, async (req, res) => {
  try {
    const { nombre, slug, descripcion, icono, orden, activa } = req.body;

    if (!nombre || !slug) {
      return res.status(400).json({ error: 'Faltan nombre o slug' });
    }

    const [result] = await pool.query(
      `INSERT INTO categorias (uuid, nombre, slug, descripcion, icono, orden, activa)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        uuidv4(), nombre, slug,
        descripcion || null, icono || null,
        orden || 0,
        activa === false ? 0 : 1,
      ]
    );

    const [rows] = await pool.query('SELECT * FROM categorias WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Error POST /api/categorias:', err.message);
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Ya existe una categoría con ese slug' });
    }
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/categorias/:id - editar categoria
router.put('/:id', verificarAdmin, async (req, res) => {
  try {
    const { nombre, slug, descripcion, icono, orden, activa } = req.body;

    if (!nombre || !slug) {
      return res.status(400).json({ error: 'Faltan nombre o slug' });
    }

    await pool.query(
      `UPDATE categorias SET
        nombre = ?, slug = ?, descripcion = ?, icono = ?, orden = ?, activa = ?
       WHERE id = ?`,
      [
        nombre, slug,
        descripcion || null, icono || null,
        orden || 0,
        activa === false ? 0 : 1,
        req.params.id,
      ]
    );

    const [rows] = await pool.query('SELECT * FROM categorias WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Categoría no encontrada' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Error PUT /api/categorias:', err.message);
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Ya existe una categoría con ese slug' });
    }
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/categorias/:id - baja logica (solo si no tiene productos activos)
router.delete('/:id', verificarAdmin, async (req, res) => {
  try {
    const [productos] = await pool.query(
      'SELECT COUNT(*) AS total FROM productos WHERE categoriaId = ? AND deletedAt IS NULL',
      [req.params.id]
    );

    if (productos[0].total > 0) {
      return res.status(400).json({
        error: `No se puede eliminar: la categoría tiene ${productos[0].total} producto(s). Movelos o eliminalos primero.`,
      });
    }

    await pool.query(
      'UPDATE categorias SET deletedAt = NOW(), activa = 0 WHERE id = ?',
      [req.params.id]
    );
    res.json({ mensaje: 'Categoría eliminada' });
  } catch (err) {
    console.error('Error DELETE /api/categorias:', err.message);
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

    // Normalizamos las imagenes a array, igual que en el resto de los endpoints
    const productosNormalizados = productos.map((producto) => ({
      ...producto,
      imagenes: producto.imagenes
        ? producto.imagenes
            .split(',')
            .map((img) => img.trim())
            .filter(Boolean)
        : [],
    }));

    res.json({ ...categoria, productos: productosNormalizados });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;