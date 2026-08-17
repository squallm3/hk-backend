const express = require('express');
const router = express.Router();
const pool = require('../db/conexion');
const { verificarToken } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

// GET /api/pleromos
router.get('/', verificarToken, async (req, res) => {
  try {
    const [pleromos] = await pool.query(
      'SELECT * FROM pleromos WHERE usuarioId = ? AND deletedAt IS NULL ORDER BY id',
      [req.uid]
    );
    for (const pleromo of pleromos) {
      const [sizigias] = await pool.query(
        'SELECT * FROM sizigias WHERE pleromiId = ? AND deletedAt IS NULL ORDER BY orden',
        [pleromo.id]
      );
      for (const sizigia of sizigias) {
        const [misiones] = await pool.query(
          'SELECT * FROM misiones WHERE sizigiaId = ? AND deletedAt IS NULL ORDER BY orden',
          [sizigia.id]
        );
        sizigia.misiones = misiones;
      }
      pleromo.sizigias = sizigias;
    }
    res.json(pleromos);
  } catch (err) {
    console.error('Error GET /api/pleromos:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/pleromos
router.post('/', verificarToken, async (req, res) => {
  try {
    const { nombre } = req.body;
    if (!nombre) return res.status(400).json({ error: 'El nombre es requerido' });
    const uuid = uuidv4();
    const [result] = await pool.query(
      'INSERT INTO pleromos (uuid, usuarioId, nombre) VALUES (?, ?, ?)',
      [uuid, req.uid, nombre]
    );
    const [rows] = await pool.query('SELECT * FROM pleromos WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Error POST /api/pleromos:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/pleromos/:id/sizigias
router.post('/:id/sizigias', verificarToken, async (req, res) => {
  try {
    const { nombre } = req.body;
    if (!nombre) return res.status(400).json({ error: 'El nombre es requerido' });
    const uuid = uuidv4();
    const [result] = await pool.query(
      'INSERT INTO sizigias (uuid, pleromiId, nombre) VALUES (?, ?, ?)',
      [uuid, req.params.id, nombre]
    );
    const [rows] = await pool.query('SELECT * FROM sizigias WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Error POST /api/pleromos/:id/sizigias:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/pleromos/sizigias/:id — renombrar una sizigia
router.put('/sizigias/:id', verificarToken, async (req, res) => {
  try {
    const { nombre } = req.body;
    if (!nombre) return res.status(400).json({ error: 'El nombre es requerido' });
    await pool.query(
      `UPDATE sizigias s
       JOIN pleromos p ON s.pleromiId = p.id
       SET s.nombre = ?
       WHERE s.id = ? AND p.usuarioId = ?`,
      [nombre, req.params.id, req.uid]
    );
    const [rows] = await pool.query('SELECT * FROM sizigias WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Sizigia no encontrada' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Error PUT /api/pleromos/sizigias/:id:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/pleromos/sizigias/:id — elimina la sizigia y sus misiones (soft delete)
router.delete('/sizigias/:id', verificarToken, async (req, res) => {
  try {
    // Verificar que la sizigia pertenezca a un pleromo del usuario
    const [check] = await pool.query(
      `SELECT s.id FROM sizigias s
       JOIN pleromos p ON s.pleromiId = p.id
       WHERE s.id = ? AND p.usuarioId = ?`,
      [req.params.id, req.uid]
    );
    if (check.length === 0) return res.status(404).json({ error: 'Sizigia no encontrada' });

    await pool.query('UPDATE misiones SET deletedAt = NOW() WHERE sizigiaId = ?', [req.params.id]);
    await pool.query('UPDATE sizigias SET deletedAt = NOW() WHERE id = ?', [req.params.id]);

    res.json({ mensaje: 'Eliminada' });
  } catch (err) {
    console.error('Error DELETE /api/pleromos/sizigias/:id:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/misiones/completadas/:sizigiaId — borra todas las misiones completadas de una sizigia
router.delete('/misiones-completadas/:sizigiaId', verificarToken, async (req, res) => {
  try {
    await pool.query(
      `UPDATE misiones m
       JOIN sizigias s ON m.sizigiaId = s.id
       JOIN pleromos p ON s.pleromiId = p.id
       SET m.deletedAt = NOW()
       WHERE m.sizigiaId = ? AND m.completada = 1 AND p.usuarioId = ?`,
      [req.params.sizigiaId, req.uid]
    );
    res.json({ mensaje: 'Completadas eliminadas' });
  } catch (err) {
    console.error('Error DELETE misiones-completadas:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;