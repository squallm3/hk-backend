const express = require('express');
const router = express.Router();
const pool = require('../db/conexion');
const { verificarToken } = require('../middleware/auth');
const { randomUUID } = require('crypto');

// GET /api/transacciones - lista las transacciones del usuario logueado
router.get('/', verificarToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT t.*, c.nombre AS cuentaNombre, cg.nombre AS categoriaNombre
       FROM transacciones t
       JOIN cuentas c ON t.cuentaId = c.id
       LEFT JOIN categorias_gasto cg ON t.categoriaId = cg.id
       WHERE t.usuarioId = ? AND t.deletedAt IS NULL
       ORDER BY t.fecha DESC, t.id DESC`,
      [req.uid]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/transacciones - crea una transacción nueva
router.post('/', verificarToken, async (req, res) => {
  try {
    const { cuentaId, categoriaId, fecha, descripcion, monto, nota } = req.body;
    if (!cuentaId || typeof monto !== 'number') {
      return res.status(400).json({ error: 'cuentaId y monto son requeridos' });
    }
    const uuid = randomUUID();
    const [result] = await pool.query(
      `INSERT INTO transacciones (uuid, usuarioId, cuentaId, categoriaId, fecha, descripcion, monto, nota)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid,
        req.uid,
        cuentaId,
        categoriaId || null,
        fecha || new Date().toISOString().slice(0, 10),
        descripcion || null,
        monto,
        nota || null,
      ]
    );
    const [rows] = await pool.query('SELECT * FROM transacciones WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/transacciones/:id - edita una transacción existente
router.put('/:id', verificarToken, async (req, res) => {
  try {
    const { cuentaId, categoriaId, fecha, descripcion, monto, nota } = req.body;
    await pool.query(
      `UPDATE transacciones
       SET cuentaId = ?, categoriaId = ?, fecha = ?, descripcion = ?, monto = ?, nota = ?
       WHERE id = ? AND usuarioId = ?`,
      [cuentaId, categoriaId || null, fecha, descripcion || null, monto, nota || null, req.params.id, req.uid]
    );
    const [rows] = await pool.query(
      'SELECT * FROM transacciones WHERE id = ? AND usuarioId = ?',
      [req.params.id, req.uid]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Transacción no encontrada' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/transacciones/:id - borrado lógico
router.delete('/:id', verificarToken, async (req, res) => {
  try {
    await pool.query(
      'UPDATE transacciones SET deletedAt = NOW() WHERE id = ? AND usuarioId = ?',
      [req.params.id, req.uid]
    );
    res.json({ mensaje: 'Eliminada' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
