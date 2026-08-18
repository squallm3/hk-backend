const express = require('express');
const router = express.Router();
const pool = require('../db/conexion');
const { verificarAdmin } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

// GET /api/tipos-articulo-nivel - listado publico (solo activos)
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM tipos_articulo_nivel WHERE activo = 1 ORDER BY orden'
    );

    const tipos = rows.map((t) => ({
      ...t,
      tallesDisponibles: t.tallesDisponibles
        ? t.tallesDisponibles.split(',').map((s) => s.trim())
        : [],
    }));

    res.json(tipos);
  } catch (err) {
    console.error('Error GET /api/tipos-articulo-nivel:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tipos-articulo-nivel/admin - listado completo (incluye inactivos)
router.get('/admin', verificarAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM tipos_articulo_nivel ORDER BY orden'
    );

    const tipos = rows.map((t) => ({
      ...t,
      tallesDisponibles: t.tallesDisponibles
        ? t.tallesDisponibles.split(',').map((s) => s.trim())
        : [],
    }));

    res.json(tipos);
  } catch (err) {
    console.error('Error GET /api/tipos-articulo-nivel/admin:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/tipos-articulo-nivel - crear
router.post('/', verificarAdmin, async (req, res) => {
  try {
    const { nombre, requiereTalle, tallesDisponibles, requiereColor, activo } = req.body;

    if (!nombre) {
      return res.status(400).json({ error: 'Falta el nombre' });
    }

    const [maximo] = await pool.query(
      'SELECT COALESCE(MAX(orden), 0) AS maximo FROM tipos_articulo_nivel'
    );

    const talles = Array.isArray(tallesDisponibles)
      ? tallesDisponibles.join(',')
      : null;

    const [result] = await pool.query(
      `INSERT INTO tipos_articulo_nivel
       (uuid, nombre, requiereTalle, tallesDisponibles, requiereColor, orden, activo)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        uuidv4(), nombre,
        requiereTalle ? 1 : 0, talles,
        requiereColor ? 1 : 0,
        maximo[0].maximo + 1,
        activo === false ? 0 : 1,
      ]
    );

    const [rows] = await pool.query(
      'SELECT * FROM tipos_articulo_nivel WHERE id = ?', [result.insertId]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Error POST /api/tipos-articulo-nivel:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/tipos-articulo-nivel/:id - editar
router.put('/:id', verificarAdmin, async (req, res) => {
  try {
    const { nombre, requiereTalle, tallesDisponibles, requiereColor, activo } = req.body;

    const talles = Array.isArray(tallesDisponibles)
      ? tallesDisponibles.join(',')
      : null;

    await pool.query(
      `UPDATE tipos_articulo_nivel SET
        nombre = ?, requiereTalle = ?, tallesDisponibles = ?,
        requiereColor = ?, activo = ?
       WHERE id = ?`,
      [
        nombre, requiereTalle ? 1 : 0, talles,
        requiereColor ? 1 : 0,
        activo === false ? 0 : 1,
        req.params.id,
      ]
    );

    const [rows] = await pool.query(
      'SELECT * FROM tipos_articulo_nivel WHERE id = ?', [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Tipo no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Error PUT /api/tipos-articulo-nivel:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/tipos-articulo-nivel/:id - baja logica
router.delete('/:id', verificarAdmin, async (req, res) => {
  try {
    await pool.query(
      'UPDATE tipos_articulo_nivel SET activo = 0 WHERE id = ?',
      [req.params.id]
    );
    res.json({ mensaje: 'Tipo desactivado' });
  } catch (err) {
    console.error('Error DELETE /api/tipos-articulo-nivel:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/tipos-articulo-nivel/reordenar
router.put('/reordenar', verificarAdmin, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Falta la lista de ids' });
    }

    await connection.beginTransaction();

    for (let i = 0; i < ids.length; i++) {
      await connection.query(
        'UPDATE tipos_articulo_nivel SET orden = ? WHERE id = ?',
        [i + 1, ids[i]]
      );
    }

    await connection.commit();
    res.json({ mensaje: 'Orden actualizado' });
  } catch (err) {
    await connection.rollback();
    console.error('Error PUT /api/tipos-articulo-nivel/reordenar:', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    connection.release();
  }
});

module.exports = router;