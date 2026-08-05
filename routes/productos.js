const express = require('express');
const router = express.Router();
const pool = require('../db/conexion');
const { verificarAdmin } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

// Guarda las imagenes de un producto (borra las anteriores y carga las nuevas)
async function guardarImagenes(productoId, imagenes) {
  if (!Array.isArray(imagenes)) return;

  await pool.query('DELETE FROM producto_imagenes WHERE productoId = ?', [productoId]);

  const limpias = imagenes.map((u) => String(u).trim()).filter(Boolean);

  for (let i = 0; i < limpias.length; i++) {
    await pool.query(
      `INSERT INTO producto_imagenes (uuid, productoId, url, tipo, orden)
       VALUES (?, ?, ?, 'producto', ?)`,
      [uuidv4(), productoId, limpias[i], i]
    );
  }
}

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

// GET /api/productos/admin - listado completo para el panel (incluye inactivos)
router.get('/admin', verificarAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        p.*,
        c.nombre AS categoriaNombre,
        GROUP_CONCAT(pi.url ORDER BY pi.orden) AS imagenes
      FROM productos p
      LEFT JOIN categorias c ON p.categoriaId = c.id
      LEFT JOIN producto_imagenes pi ON p.id = pi.productoId
      WHERE p.deletedAt IS NULL
      GROUP BY p.id
      ORDER BY p.id
    `);

    const productos = rows.map((producto) => ({
      ...producto,
      imagenes: producto.imagenes
        ? producto.imagenes.split(',').map((i) => i.trim()).filter(Boolean)
        : [],
    }));

    res.json(productos);
  } catch (err) {
    console.error('Error GET /api/productos/admin:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/productos - crear producto
router.post('/', verificarAdmin, async (req, res) => {
  try {
    const {
      categoriaId, nombre, slug, descripcionCorta, descripcionLarga, lore,
      precio, precioOferta, nivelRequerido, rareza, peso, stock, activo, imagenes,
    } = req.body;

    if (!nombre || !slug || !categoriaId) {
      return res.status(400).json({ error: 'Faltan nombre, slug o categoria' });
    }

    const [result] = await pool.query(
      `INSERT INTO productos
       (uuid, categoriaId, nombre, slug, descripcionCorta, descripcionLarga, lore,
        precio, precioOferta, nivelRequerido, rareza, peso, stock, activo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuidv4(), categoriaId, nombre, slug,
        descripcionCorta || null, descripcionLarga || null, lore || null,
        precio || 0, precioOferta || null, nivelRequerido || 1,
        rareza || 'comun', peso || null, stock || 0,
        activo === false ? 0 : 1,
      ]
    );

    await guardarImagenes(result.insertId, imagenes);

    const [rows] = await pool.query('SELECT * FROM productos WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Error POST /api/productos:', err.message);
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Ya existe un producto con ese slug' });
    }
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/productos/:id - editar producto
router.put('/:id', verificarAdmin, async (req, res) => {
  try {
    const {
      categoriaId, nombre, slug, descripcionCorta, descripcionLarga, lore,
      precio, precioOferta, nivelRequerido, rareza, peso, stock, activo, imagenes,
    } = req.body;

    await pool.query(
      `UPDATE productos SET
        categoriaId = ?, nombre = ?, slug = ?, descripcionCorta = ?,
        descripcionLarga = ?, lore = ?, precio = ?, precioOferta = ?,
        nivelRequerido = ?, rareza = ?, peso = ?, stock = ?, activo = ?
       WHERE id = ?`,
      [
        categoriaId, nombre, slug,
        descripcionCorta || null, descripcionLarga || null, lore || null,
        precio || 0, precioOferta || null, nivelRequerido || 1,
        rareza || 'comun', peso || null, stock || 0,
        activo === false ? 0 : 1,
        req.params.id,
      ]
    );

    await guardarImagenes(req.params.id, imagenes);

    const [rows] = await pool.query('SELECT * FROM productos WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Error PUT /api/productos:', err.message);
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Ya existe un producto con ese slug' });
    }
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/productos/:id - baja logica
router.delete('/:id', verificarAdmin, async (req, res) => {
  try {
    await pool.query(
      'UPDATE productos SET deletedAt = NOW(), activo = 0 WHERE id = ?',
      [req.params.id]
    );
    res.json({ mensaje: 'Producto eliminado' });
  } catch (err) {
    console.error('Error DELETE /api/productos:', err.message);
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