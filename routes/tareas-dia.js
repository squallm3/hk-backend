const express = require('express');
const router = express.Router();
const pool = require('../db/conexion');
const { verificarToken } = require('../middleware/auth');

// GET /api/tareas-dia/hoy
// Devuelve las tareas de HOY (fecha del servidor) del usuario logueado
router.get('/hoy', verificarToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, descripcion, xp, createdAt FROM tareas_dia WHERE usuarioId = ? AND fecha = CURDATE() ORDER BY createdAt ASC',
      [req.uid]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/tareas-dia  { descripcion, xp }
// Registra una tarea nueva con la fecha de HOY (fecha del servidor)
router.post('/', verificarToken, async (req, res) => {
  try {
    const { descripcion, xp } = req.body;
    if (typeof descripcion !== 'string' || !descripcion.trim()) {
      return res.status(400).json({ error: 'descripcion invalida' });
    }
    if (typeof xp !== 'number') {
      return res.status(400).json({ error: 'xp invalido' });
    }

    const [result] = await pool.query(
      'INSERT INTO tareas_dia (usuarioId, fecha, descripcion, xp) VALUES (?, CURDATE(), ?, ?)',
      [req.uid, descripcion.trim(), xp]
    );

    res.json({ id: result.insertId, descripcion: descripcion.trim(), xp });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/tareas-dia/:id
// Elimina una tarea del dia (solo si pertenece al usuario logueado)
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