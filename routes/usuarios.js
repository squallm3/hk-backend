const express = require('express');
const router = express.Router();
const pool = require('../db/conexion');
const { verificarToken } = require('../middleware/auth');

// POST /api/usuarios/sync — crea o actualiza usuario al loguearse
router.post('/sync', verificarToken, async (req, res) => {
  try {
    await pool.query(`
      INSERT INTO usuarios (id, email) VALUES (?, ?)
      ON DUPLICATE KEY UPDATE email = VALUES(email)
    `, [req.uid, req.email]);

    const [rows] = await pool.query(
      'SELECT * FROM usuarios WHERE id = ?', [req.uid]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/usuarios/perfil
router.get('/perfil', verificarToken, async (req, res) => {
  try {
    const [usuarios] = await pool.query(
      'SELECT * FROM usuarios WHERE id = ?', [req.uid]);
    if (usuarios.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });

    const [personajes] = await pool.query(
      'SELECT p.*, n.titulo, n.artefacto, n.imagenA, n.imagenB FROM personajes p JOIN niveles n ON p.nivelId = n.id WHERE p.usuarioId = ? AND p.activo = 1',
      [req.uid]);

    res.json({ ...usuarios[0], personaje: personajes[0] || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;