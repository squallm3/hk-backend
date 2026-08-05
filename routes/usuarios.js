const express = require('express');
const router = express.Router();
const pool = require('../db/conexion');
const { verificarToken, verificarAdmin } = require('../middleware/auth');

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

// GET /api/usuarios/admin - listado completo para el panel
router.get('/admin', verificarAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, uuid, email, nombre, apellido, rol, activo, createdAt
       FROM usuarios
       ORDER BY createdAt DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error('Error GET /api/usuarios/admin:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/usuarios/:id/rol - cambia el rol (cliente/admin)
router.put('/:id/rol', verificarAdmin, async (req, res) => {
  try {
    const { rol } = req.body;

    if (!['cliente', 'admin'].includes(rol)) {
      return res.status(400).json({ error: 'Rol invalido' });
    }

    // Evitamos que un admin se quite el rol a si mismo por error
    if (req.params.id === req.uid && rol !== 'admin') {
      return res.status(400).json({
        error: 'No podés quitarte el rol de administrador a vos mismo.',
      });
    }

    await pool.query('UPDATE usuarios SET rol = ? WHERE id = ?', [rol, req.params.id]);

    const [rows] = await pool.query(
      'SELECT id, uuid, email, nombre, apellido, rol, activo, createdAt FROM usuarios WHERE id = ?',
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Error PUT /api/usuarios/:id/rol:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/usuarios/:id/activo - activa o desactiva la cuenta
router.put('/:id/activo', verificarAdmin, async (req, res) => {
  try {
    const { activo } = req.body;

    if (req.params.id === req.uid && activo === false) {
      return res.status(400).json({
        error: 'No podés desactivar tu propia cuenta.',
      });
    }

    await pool.query('UPDATE usuarios SET activo = ? WHERE id = ?', [
      activo ? 1 : 0,
      req.params.id,
    ]);

    const [rows] = await pool.query(
      'SELECT id, uuid, email, nombre, apellido, rol, activo, createdAt FROM usuarios WHERE id = ?',
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Error PUT /api/usuarios/:id/activo:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;