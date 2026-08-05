const express = require('express');
const router = express.Router();
const pool = require('../db/conexion');
const { verificarAdmin } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

// GET /api/variantes/producto/:productoId - variantes de un producto
router.get('/producto/:productoId', verificarAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM producto_variantes
       WHERE productoId = ? AND deletedAt IS NULL
       ORDER BY id`,
      [req.params.productoId]
    );
    res.json(rows);
  } catch (err) {
    console.error('Error GET /api/variantes/producto:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/variantes - crear variante
router.post('/', verificarAdmin, async (req, res) => {
  try {
    const { productoId, talle, color, stock, precioExtra, sku } = req.body;

    if (!productoId) {
      return res.status(400).json({ error: 'Falta el productoId' });
    }

    const [result] = await pool.query(
      `INSERT INTO producto_variantes
       (uuid, productoId, talle, color, stock, precioExtra, sku)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        uuidv4(), productoId,
        talle || null, color || null,
        stock || 0, precioExtra || 0,
        sku || null,
      ]
    );

    const [rows] = await pool.query(
      'SELECT * FROM producto_variantes WHERE id = ?',
      [result.insertId]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Error POST /api/variantes:', err.message);
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Ya existe una variante con ese SKU' });
    }
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/variantes/:id - editar variante
router.put('/:id', verificarAdmin, async (req, res) => {
  try {
    const { talle, color, stock, precioExtra, sku } = req.body;

    await pool.query(
      `UPDATE producto_variantes SET
        talle = ?, color = ?, stock = ?, precioExtra = ?, sku = ?
       WHERE id = ?`,
      [
        talle || null, color || null,
        stock || 0, precioExtra || 0,
        sku || null,
        req.params.id,
      ]
    );

    const [rows] = await pool.query(
      'SELECT * FROM producto_variantes WHERE id = ?',
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Variante no encontrada' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Error PUT /api/variantes:', err.message);
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Ya existe una variante con ese SKU' });
    }
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/variantes/:id - baja logica
// No borramos fisicamente porque los pedidos apuntan a varianteId
router.delete('/:id', verificarAdmin, async (req, res) => {
  try {
    await pool.query(
      'UPDATE producto_variantes SET deletedAt = NOW() WHERE id = ?',
      [req.params.id]
    );
    res.json({ mensaje: 'Variante eliminada' });
  } catch (err) {
    console.error('Error DELETE /api/variantes:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;