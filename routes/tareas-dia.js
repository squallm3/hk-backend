const express = require('express');
const router = express.Router();
const pool = require('../db/conexion');
const { verificarToken } = require('../middleware/auth');

const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// GET /api/tareas-dia/hoy?fecha=YYYY-MM-DD
// La fecha la manda el navegador (su hora local real), NUNCA el reloj del servidor,
// para evitar que el huso horario de MySQL/Docker (por defecto UTC) desalinee "hoy".
router.get('/hoy', verificarToken, async (req, res) => {
  try {
    const fecha = req.query.fecha;
    if (!fecha || !FECHA_REGEX.test(fecha)) {
      return res.status(400).json({ error: 'fecha invalida (formato YYYY-MM-DD)' });
    }

    const [rows] = await pool.query(
      'SELECT id, descripcion, xp, createdAt FROM tareas_dia WHERE usuarioId = ? AND fecha = ? ORDER BY createdAt ASC',
      [req.uid, fecha]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/tareas-dia  { descripcion, xp, fecha }
// La fecha tambien la manda el navegador, por la misma razon.
router.post('/', verificarToken, async (req, res) => {
  try {
    const { descripcion, xp, fecha } = req.body;
    if (typeof descripcion !== 'string' || !descripcion.trim()) {
      return res.status(400).json({ error: 'descripcion invalida' });
    }
    if (typeof xp !== 'number') {
      return res.status(400).json({ error: 'xp invalido' });
    }
    if (!fecha || !FECHA_REGEX.test(fecha)) {
      return res.status(400).json({ error: 'fecha invalida (formato YYYY-MM-DD)' });
    }

    const [result] = await pool.query(
      'INSERT INTO tareas_dia (usuarioId, fecha, descripcion, xp) VALUES (?, ?, ?, ?)',
      [req.uid, fecha, descripcion.trim(), xp]
    );

    res.json({ id: result.insertId, descripcion: descripcion.trim(), xp });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/tareas-dia/:id
// Elimina una tarea del dia (solo si pertenece al usuario logueado). No depende de fechas.
router.delete('/:id', verificarToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, xp FROM tareas_dia WHERE id = ? AND usuarioId = ? LIMIT 1',
      [req.params.id, req.uid]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Tarea no encontrada' });
    }

    await pool.query('DELETE FROM tareas_dia WHERE id = ? AND usuarioId = ?', [req.params.id, req.uid]);

    res.json({ ok: true, xp: rows[0].xp });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;