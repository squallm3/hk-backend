const express = require('express');
const router = express.Router();
const pool = require('../db/conexion');
const { verificarToken } = require('../middleware/auth');
const { randomUUID } = require('crypto');

// GET /api/cuentas - lista las cuentas del usuario logueado
router.get('/', verificarToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM cuentas WHERE usuarioId = ? AND deletedAt IS NULL ORDER BY id',
      [req.uid]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/cuentas - crea una cuenta nueva
router.post('/', verificarToken, async (req, res) => {
  try {
    const { nombre, tipo, saldoInicial } = req.body;
    if (!nombre || !nombre.trim()) {
      return res.status(400).json({ error: 'El nombre es requerido' });
    }
    const uuid = randomUUID();
    const [result] = await pool.query(
      'INSERT INTO cuentas (uuid, usuarioId, nombre, tipo, saldoInicial) VALUES (?, ?, ?, ?, ?)',
      [uuid, req.uid, nombre.trim(), tipo || 'checking', Number(saldoInicial) || 0]
    );
    const [rows] = await pool.query('SELECT * FROM cuentas WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/cuentas/:id - edita una cuenta existente
router.put('/:id', verificarToken, async (req, res) => {
  try {
    const { nombre, tipo, saldoInicial } = req.body;
    await pool.query(
      'UPDATE cuentas SET nombre = ?, tipo = ?, saldoInicial = ? WHERE id = ? AND usuarioId = ?',
      [nombre, tipo, Number(saldoInicial) || 0, req.params.id, req.uid]
    );
    const [rows] = await pool.query('SELECT * FROM cuentas WHERE id = ? AND usuarioId = ?', [
      req.params.id,
      req.uid,
    ]);
    if (rows.length === 0) return res.status(404).json({ error: 'Cuenta no encontrada' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/cuentas/:id - borrado lógico de la cuenta (y sus transacciones asociadas)
router.delete('/:id', verificarToken, async (req, res) => {
  try {
    await pool.query(
      'UPDATE cuentas SET deletedAt = NOW() WHERE id = ? AND usuarioId = ?',
      [req.params.id, req.uid]
    );
    await pool.query(
      'UPDATE transacciones SET deletedAt = NOW() WHERE cuentaId = ? AND usuarioId = ?',
      [req.params.id, req.uid]
    );
    res.json({ mensaje: 'Eliminada' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
