const express = require('express');
const router = express.Router();
const pool = require('../db/conexion');
const { verificarToken } = require('../middleware/auth');
const { randomUUID } = require('crypto');

// GET /api/presupuesto?mes=YYYY-MM
// Devuelve, para cada categoría, cuánto se asignó y cuánto se gastó ese mes
router.get('/', verificarToken, async (req, res) => {
  try {
    const mes = req.query.mes;
    if (!mes || !/^\d{4}-\d{2}$/.test(mes)) {
      return res.status(400).json({ error: 'Parámetro mes requerido, formato YYYY-MM' });
    }
    const [rows] = await pool.query(
      `SELECT
         cg.id AS categoriaId,
         cg.nombre AS categoriaNombre,
         COALESCE(pc.id, NULL) AS presupuestoId,
         COALESCE(pc.montoAsignado, 0) AS montoAsignado,
         COALESCE((
           SELECT SUM(-t.monto) FROM transacciones t
           WHERE t.categoriaId = cg.id
             AND t.usuarioId = ?
             AND t.deletedAt IS NULL
             AND t.monto < 0
             AND DATE_FORMAT(t.fecha, '%Y-%m') = ?
         ), 0) AS gastado
       FROM categorias_gasto cg
       LEFT JOIN presupuestos_categoria pc
         ON pc.categoriaId = cg.id AND pc.usuarioId = ? AND pc.mes = ?
       WHERE cg.usuarioId = ? AND cg.deletedAt IS NULL
       ORDER BY cg.nombre`,
      [req.uid, mes, req.uid, mes, req.uid]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/presupuesto - asigna (o actualiza) el monto de una categoría para un mes
router.post('/', verificarToken, async (req, res) => {
  try {
    const { categoriaId, mes, montoAsignado } = req.body;
    if (!categoriaId || !mes || !/^\d{4}-\d{2}$/.test(mes)) {
      return res.status(400).json({ error: 'categoriaId y mes (YYYY-MM) son requeridos' });
    }
    const uuid = randomUUID();
    await pool.query(
      `INSERT INTO presupuestos_categoria (uuid, usuarioId, categoriaId, mes, montoAsignado)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE montoAsignado = VALUES(montoAsignado)`,
      [uuid, req.uid, categoriaId, mes, Number(montoAsignado) || 0]
    );
    const [rows] = await pool.query(
      'SELECT * FROM presupuestos_categoria WHERE usuarioId = ? AND categoriaId = ? AND mes = ?',
      [req.uid, categoriaId, mes]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;