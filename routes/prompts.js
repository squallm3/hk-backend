const express = require('express');
const router = express.Router();
const pool = require('../db/conexion');
const { v4: uuidv4 } = require('uuid');
const { verificarToken } = require('../middleware/auth');

// Todas las rutas de prompts requieren autenticación Firebase.
// req.uid contiene el UID verificado del usuario.

// GET /api/prompts - listar los prompts del usuario autenticado
router.get('/', verificarToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM prompts
       WHERE usuario_id = ? AND deletedAt IS NULL
       ORDER BY docked DESC, dockedAt DESC, updatedAt DESC`,
      [req.uid]
    );
    res.json(rows);
  } catch (err) {
    console.error('Error GET /api/prompts:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/prompts - crear un prompt para el usuario autenticado
router.post('/', verificarToken, async (req, res) => {
  try {
    const { title, category, content } = req.body;

    if (!title || !content) {
      return res.status(400).json({ error: 'Faltan title o content' });
    }

    const [result] = await pool.query(
      `INSERT INTO prompts
       (uuid, usuario_id, title, category, content, favorite, docked)
       VALUES (?, ?, ?, ?, ?, 0, 0)`,
      [
        uuidv4(),
        req.uid,
        title,
        category || 'Sin categoría',
        content
      ]
    );

    const [rows] = await pool.query(
      `SELECT * FROM prompts
       WHERE id = ? AND usuario_id = ?`,
      [result.insertId, req.uid]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Error POST /api/prompts:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/prompts/bulk - importar varios prompts para el usuario autenticado
router.post('/bulk', verificarToken, async (req, res) => {
  const items = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Se espera un array de prompts' });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    let insertados = 0;

    for (const item of items) {
      const title = (item.title || '').trim();
      const content = item.content || '';

      if (!title || !content.trim()) continue;

      await connection.query(
        `INSERT INTO prompts
         (uuid, usuario_id, title, category, content, favorite, docked, dockedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          uuidv4(),
          req.uid,
          title,
          item.category || 'Sin categoría',
          content,
          item.favorite ? 1 : 0,
          item.docked ? 1 : 0,
          item.docked ? (item.dockedAt || Date.now()) : null
        ]
      );

      insertados++;
    }

    await connection.commit();
    res.status(201).json({ insertados });
  } catch (err) {
    await connection.rollback();
    console.error('Error POST /api/prompts/bulk:', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    connection.release();
  }
});

// PUT /api/prompts/:id - editar solamente prompts propios
router.put('/:id', verificarToken, async (req, res) => {
  try {
    const { title, category, content, favorite, docked } = req.body;
    const dockedAt = docked ? Date.now() : null;

    const [result] = await pool.query(
      `UPDATE prompts
       SET title = ?, category = ?, content = ?, favorite = ?, docked = ?, dockedAt = ?
       WHERE id = ? AND usuario_id = ? AND deletedAt IS NULL`,
      [
        title,
        category,
        content,
        favorite ? 1 : 0,
        docked ? 1 : 0,
        dockedAt,
        req.params.id,
        req.uid
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Prompt no encontrado' });
    }

    const [rows] = await pool.query(
      `SELECT * FROM prompts
       WHERE id = ? AND usuario_id = ? AND deletedAt IS NULL`,
      [req.params.id, req.uid]
    );

    res.json(rows[0]);
  } catch (err) {
    console.error('Error PUT /api/prompts:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/prompts/:id - soft delete solamente de prompts propios
router.delete('/:id', verificarToken, async (req, res) => {
  try {
    const [result] = await pool.query(
      `UPDATE prompts
       SET deletedAt = NOW()
       WHERE id = ? AND usuario_id = ? AND deletedAt IS NULL`,
      [req.params.id, req.uid]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Prompt no encontrado' });
    }

    res.json({ mensaje: 'Prompt eliminado' });
  } catch (err) {
    console.error('Error DELETE /api/prompts:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
