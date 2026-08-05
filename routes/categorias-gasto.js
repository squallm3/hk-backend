const express = require('express');
const router = express.Router();
const pool = require('../db/conexion');
const { verificarToken } = require('../middleware/auth');
const { randomUUID } = require('crypto');

// GET /api/categorias-gasto - lista las categorías del usuario logueado
router.get('/', verificarToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM categorias_gasto WHERE usuarioId = ? AND deletedAt IS NULL ORDER BY id',
      [req.uid]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/categorias-gasto - crea una categoría nueva
router.post('/', verificarToken, async (req, res) => {
  try {
    const { nombre } = req.body;
    if (!nombre || !nombre.trim()) {
      return res.status(400).json({ error: 'El nombre es requerido' });
    }
    const uuid = randomUUID();
    const [result] = await pool.query(
      'INSERT INTO categorias_gasto (uuid, usuarioId, nombre) VALUES (?, ?, ?)',
      [uuid, req.uid, nombre.trim()]
    );
    const [rows] = await pool.query('SELECT * FROM categorias_gasto WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/categorias-gasto/:id - edita una categoría existente
router.put('/:id', verificarToken, async (req, res) => {
  try {
    const { nombre } = req.body;
    await pool.query(
      'UPDATE categorias_gasto SET nombre = ? WHERE id = ? AND usuarioId = ?',
      [nombre, req.params.id, req.uid]
    );
    const [rows] = await pool.query(
      'SELECT * FROM categorias_gasto WHERE id = ? AND usuarioId = ?',
      [req.params.id, req.uid]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Categoría no encontrada' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/categorias-gasto/:id - borrado lógico (las transacciones asociadas quedan sin categoría)
router.delete('/:id', verificarToken, async (req, res) => {
  try {
    await pool.query(
      'UPDATE categorias_gasto SET deletedAt = NOW() WHERE id = ? AND usuarioId = ?',
      [req.params.id, req.uid]
    );
    await pool.query(
      'UPDATE transacciones SET categoriaId = NULL WHERE categoriaId = ? AND usuarioId = ?',
      [req.params.id, req.uid]
    );
    res.json({ mensaje: 'Eliminada' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
