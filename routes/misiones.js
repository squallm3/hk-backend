const express = require('express');
const router = express.Router();
const pool = require('../db/conexion');
const { verificarToken } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

// GET /api/misiones
router.get('/', verificarToken, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT m.*, s.nombre as sizigiaNombre, p.nombre as pleromiNombre
      FROM misiones m
      JOIN sizigias s ON m.sizigiaId = s.id
      JOIN pleromos p ON s.pleromiId = p.id
      WHERE m.usuarioId = ? AND m.deletedAt IS NULL
      ORDER BY m.orden
    `, [req.uid]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/misiones
router.post('/', verificarToken, async (req, res) => {
  try {
    const { sizigiaId, titulo, detalle, xpRecompensa, descripcion, tags, finalizacion, subtareas } = req.body;
    const uuid = uuidv4();
    const [result] = await pool.query(`
      INSERT INTO misiones (uuid, sizigiaId, usuarioId, titulo, detalle, xpRecompensa, descripcion, tags, finalizacion, subtareas)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      uuid, sizigiaId, req.uid, titulo, detalle || null, xpRecompensa || 0,
      descripcion || null,
      tags ? JSON.stringify(tags) : null,
      finalizacion || null,
      subtareas ? JSON.stringify(subtareas) : null,
    ]);
    const [rows] = await pool.query('SELECT * FROM misiones WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Error POST /api/misiones:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/misiones/:id
router.put('/:id', verificarToken, async (req, res) => {
  try {
    const { titulo, detalle, xpRecompensa, fechaLimite, hora, horaActivada, repeticion, descripcion, tags, finalizacion, subtareas, orden, ordenGlobal } = req.body;

    const fields = [];
    const values = [];
    const maybeSet = (col, val) => {
      if (val !== undefined) { fields.push(`${col} = ?`); values.push(val); }
    };

    maybeSet('titulo', titulo);
    maybeSet('detalle', detalle);
    maybeSet('xpRecompensa', xpRecompensa);
    maybeSet('fechaLimite', fechaLimite || null);
    maybeSet('hora', hora || null);
    maybeSet('horaActivada', horaActivada || false);
    maybeSet('repeticion', repeticion || null);
    maybeSet('descripcion', descripcion);
    maybeSet('tags', tags !== undefined ? (tags ? JSON.stringify(tags) : null) : undefined);
    maybeSet('finalizacion', finalizacion);
    maybeSet('subtareas', subtareas !== undefined ? (subtareas ? JSON.stringify(subtareas) : null) : undefined);
    maybeSet('orden', orden);
    maybeSet('ordenGlobal', ordenGlobal);

    if (fields.length === 0) {
      const [rows] = await pool.query('SELECT * FROM misiones WHERE id = ?', [req.params.id]);
      return res.json(rows[0]);
    }

    values.push(req.params.id, req.uid);
    await pool.query(
      `UPDATE misiones SET ${fields.join(', ')} WHERE id=? AND usuarioId=?`,
      values
    );
    const [rows] = await pool.query('SELECT * FROM misiones WHERE id = ?', [req.params.id]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/misiones/:id/completar
router.post('/:id/completar', verificarToken, async (req, res) => {
  try {
    const [misiones] = await pool.query(
      'SELECT * FROM misiones WHERE id = ? AND usuarioId = ?', [req.params.id, req.uid]);
    if (misiones.length === 0) return res.status(404).json({ error: 'Misión no encontrada' });
    const mision = misiones[0];
    if (mision.completada) return res.json({ mensaje: 'Ya estaba completada' });

    await pool.query(`
      UPDATE personajes SET xpAcumulada = xpAcumulada + ? WHERE usuarioId = ? AND activo = 1
    `, [mision.xpRecompensa, req.uid]);

    await pool.query(`
      UPDATE misiones SET completada = 1, fechaCompletada = NOW() WHERE id = ?
    `, [req.params.id]);

    const [personaje] = await pool.query(
      'SELECT * FROM personajes WHERE usuarioId = ? AND activo = 1', [req.uid]);

    res.json({ mensaje: 'Completada', xpSumada: mision.xpRecompensa, personaje: personaje[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/misiones/:id/desmarcar
router.post('/:id/desmarcar', verificarToken, async (req, res) => {
  try {
    const [misiones] = await pool.query(
      'SELECT * FROM misiones WHERE id = ? AND usuarioId = ?', [req.params.id, req.uid]);
    if (misiones.length === 0) return res.status(404).json({ error: 'Misión no encontrada' });
    const mision = misiones[0];
    if (!mision.completada) return res.json({ mensaje: 'No estaba completada' });

    await pool.query(`
      UPDATE personajes SET xpAcumulada = GREATEST(0, xpAcumulada - ?) 
      WHERE usuarioId = ? AND activo = 1
    `, [mision.xpRecompensa, req.uid]);

    await pool.query(`
      UPDATE misiones SET completada = 0, fechaCompletada = NULL WHERE id = ?
    `, [req.params.id]);

    const [personaje] = await pool.query(
      'SELECT * FROM personajes WHERE usuarioId = ? AND activo = 1', [req.uid]);

    res.json({ mensaje: 'Desmarcada', xpRestada: mision.xpRecompensa, personaje: personaje[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/misiones/:id
router.delete('/:id', verificarToken, async (req, res) => {
  try {
    await pool.query(
      'UPDATE misiones SET deletedAt = NOW() WHERE id = ? AND usuarioId = ?',
      [req.params.id, req.uid]);
    res.json({ mensaje: 'Eliminada' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;