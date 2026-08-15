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

// GET /api/usuarios/whoami — verificacion liviana de identidad para otras apps del ecosistema
router.get('/whoami', verificarToken, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT rol FROM usuarios WHERE id = ?', [req.uid]);
    res.json({ uid: req.uid, email: req.email, rol: rows[0]?.rol || 'cliente' });
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
      'SELECT * FROM personajes WHERE usuarioId = ? AND activo = 1',
      [req.uid]);

    let personaje = null;

    if (personajes.length > 0) {
      personaje = personajes[0];

      // El nivel guardado en personajes.nivelId puede no reflejar la XP
      // real (otras apps solo suman XP sin actualizarlo). Calculamos el
      // nivel real de la tienda comparando la XP acumulada contra los
      // umbrales de la tabla niveles, sin tocar ni depender de nivelId.
      const [nivelReal] = await pool.query(
        `SELECT * FROM niveles
         WHERE xpAcumulada <= ?
         ORDER BY xpAcumulada DESC
         LIMIT 1`,
        [personaje.xpAcumulada || 0]
      );

      if (nivelReal.length > 0) {
        personaje = {
          ...personaje,
          titulo: nivelReal[0].titulo,
          artefacto: nivelReal[0].artefacto,
          imagenA: nivelReal[0].imagenA,
          imagenB: nivelReal[0].imagenB,
          nivelId: nivelReal[0].id,
        };
      }
    }

    res.json({ ...usuarios[0], personaje });
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