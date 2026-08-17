const express = require('express');
const router = express.Router();
const pool = require('../db/conexion');
const { verificarToken } = require('../middleware/auth');
const { randomUUID } = require('crypto');

// POST /api/transferencias - mueve plata entre dos cuentas del mismo usuario, de forma atómica.
// Crea dos filas en `transacciones` (salida y entrada) unidas por el mismo transferenciaId.
// O se crean las dos juntas, o no se crea ninguna.
router.post('/', verificarToken, async (req, res) => {
  const { cuentaOrigenId, cuentaDestinoId, monto, fecha, nota } = req.body;

  if (!cuentaOrigenId || !cuentaDestinoId || !monto || Number(monto) <= 0) {
    return res.status(400).json({ error: 'cuentaOrigenId, cuentaDestinoId y monto (mayor a 0) son requeridos' });
  }
  if (Number(cuentaOrigenId) === Number(cuentaDestinoId)) {
    return res.status(400).json({ error: 'La cuenta de origen y destino no pueden ser la misma' });
  }

  const conexion = await pool.getConnection();
  try {
    await conexion.beginTransaction();

    // Confirmar que ambas cuentas son del usuario logueado (evita transferir a/desde cuentas ajenas)
    const [cuentas] = await conexion.query(
      'SELECT id, nombre FROM cuentas WHERE id IN (?, ?) AND usuarioId = ? AND deletedAt IS NULL',
      [cuentaOrigenId, cuentaDestinoId, req.uid]
    );
    if (cuentas.length !== 2) {
      await conexion.rollback();
      return res.status(404).json({ error: 'Una o ambas cuentas no existen o no te pertenecen' });
    }
    const nombreOrigen = cuentas.find((c) => c.id === Number(cuentaOrigenId))?.nombre || 'Cuenta';
    const nombreDestino = cuentas.find((c) => c.id === Number(cuentaDestinoId))?.nombre || 'Cuenta';

    const transferenciaId = randomUUID();
    const fechaFinal = fecha || new Date().toISOString().slice(0, 10);
    const uuidSalida = randomUUID();
    const uuidEntrada = randomUUID();

    await conexion.query(
      `INSERT INTO transacciones (uuid, usuarioId, cuentaId, categoriaId, transferenciaId, fecha, descripcion, monto, nota)
       VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?)`,
      [uuidSalida, req.uid, cuentaOrigenId, transferenciaId, fechaFinal, `Transferencia a ${nombreDestino}`, -Math.abs(monto), nota || null]
    );
    await conexion.query(
      `INSERT INTO transacciones (uuid, usuarioId, cuentaId, categoriaId, transferenciaId, fecha, descripcion, monto, nota)
       VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?)`,
      [uuidEntrada, req.uid, cuentaDestinoId, transferenciaId, fechaFinal, `Transferencia desde ${nombreOrigen}`, Math.abs(monto), nota || null]
    );

    await conexion.commit();

    const [filas] = await pool.query(
      `SELECT t.*, c.nombre AS cuentaNombre, cg.nombre AS categoriaNombre
       FROM transacciones t
       JOIN cuentas c ON t.cuentaId = c.id
       LEFT JOIN categorias_gasto cg ON t.categoriaId = cg.id
       WHERE t.transferenciaId = ?`,
      [transferenciaId]
    );
    const salida = filas.find((f) => Number(f.monto) < 0);
    const entrada = filas.find((f) => Number(f.monto) > 0);

    res.status(201).json({ salida, entrada });
  } catch (err) {
    await conexion.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    conexion.release();
  }
});

// DELETE /api/transferencias/:transferenciaId - borra las dos puntas de una transferencia juntas.
router.delete('/:transferenciaId', verificarToken, async (req, res) => {
  try {
    await pool.query(
      'UPDATE transacciones SET deletedAt = NOW() WHERE transferenciaId = ? AND usuarioId = ?',
      [req.params.transferenciaId, req.uid]
    );
    res.json({ mensaje: 'Transferencia eliminada' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;