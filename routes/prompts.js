const express = require('express');
const router = express.Router();
const pool = require('../db/conexion');
const { v4: uuidv4 } = require('uuid');

// GET /api/prompts - listar todos
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM prompts WHERE deletedAt IS NULL ORDER BY docked DESC, dockedAt DESC, updatedAt DESC'
    );
    res.json(rows);
  } catch (err) {
    console.error('Error GET /api/prompts:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/prompts - crear
router.post('/', async (req, res) => {
  try {
    const { title, category, content } = req.body;
    if (!title || !content) {
      return res.status(400).json({ error: 'Faltan title o content' });
    }
    const [result] = await pool.query(
      `INSERT INTO prompts (uuid, title, category, content, favorite, docked)
       VALUES (?, ?, ?, ?, 0, 0)`,
      [uuidv4(), title, category || 'Sin categoría', content]
    );
    const [rows] = await pool.query('SELECT * FROM prompts WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Error POST /api/prompts:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/prompts/bulk - importar varios de una
router.post('/bulk', async (req, res) => {
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
        `INSERT INTO prompts (uuid, title, category, content, favorite, docked, dockedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          uuidv4(),
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

// PUT /api/prompts/:id - editar
router.put('/:id', async (req, res) => {
  try {
    const { title, category, content, favorite, docked } = req.body;
    const dockedAt = docked ? Date.now() : null;
    await pool.query(
      `UPDATE prompts SET title = ?, category = ?, content = ?, favorite = ?, docked = ?, dockedAt = ?
       WHERE id = ? AND deletedAt IS NULL`,
      [title, category, content, favorite ? 1 : 0, docked ? 1 : 0, dockedAt, req.params.id]
    );
    const [rows] = await pool.query('SELECT * FROM prompts WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Prompt no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Error PUT /api/prompts:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/prompts/:id - soft delete
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('UPDATE prompts SET deletedAt = NOW() WHERE id = ?', [req.params.id]);
    res.json({ mensaje: 'Prompt eliminado' });
  } catch (err) {
    console.error('Error DELETE /api/prompts:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;