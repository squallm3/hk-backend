const express = require('express');
const router = express.Router();
const pool = require('../db/conexion');
const { verificarAdmin } = require('../middleware/auth');

// GET /api/niveles
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM niveles ORDER BY id');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/niveles/con-productos - niveles con sus 3 imagenes (A, B y 3D)
// El nombre del endpoint se mantiene por compatibilidad, pero ya no
// agrupa productos: cada nivel muestra su artefacto en las 3 vistas.
router.get('/con-productos', async (req, res) => {
  try {
    const [niveles] = await pool.query(
      'SELECT id, uuid, titulo, artefacto, imagenA, imagenB, imagenA3d, xpAcumulada FROM niveles ORDER BY id'
    );

    res.json(niveles);
  } catch (err) {
    console.error('Error GET /api/niveles/con-productos:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/niveles/admin - listado completo para el panel de administracion
router.get('/admin', verificarAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM niveles ORDER BY id');
    res.json(rows);
  } catch (err) {
    console.error('Error GET /api/niveles/admin:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/niveles/:id - editar un nivel
router.put('/:id', verificarAdmin, async (req, res) => {
  try {
    const {
      titulo, artefacto, descripcionArtefacto, loreArtefacto,
      estiloPersonaje, estiloArtefacto, xpAcumulada,
      imagenA, imagenB, imagenA3d,
    } = req.body;

    await pool.query(
      `UPDATE niveles SET
        titulo = ?, artefacto = ?, descripcionArtefacto = ?, loreArtefacto = ?,
        estiloPersonaje = ?, estiloArtefacto = ?, xpAcumulada = ?,
        imagenA = ?, imagenB = ?, imagenA3d = ?
       WHERE id = ?`,
      [
        titulo || null, artefacto || null,
        descripcionArtefacto || null, loreArtefacto || null,
        estiloPersonaje || null, estiloArtefacto || null,
        xpAcumulada || 0,
        imagenA || null, imagenB || null, imagenA3d || null,
        req.params.id,
      ]
    );

    const [rows] = await pool.query('SELECT * FROM niveles WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Nivel no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Error PUT /api/niveles/:id:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/niveles/:id
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM niveles WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Nivel no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;