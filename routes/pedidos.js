const express = require('express');
const router = express.Router();
const pool = require('../db/conexion');
const { verificarToken } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

// POST /api/pedidos - crea un pedido con sus items a partir del carrito
router.post('/', verificarToken, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { items, metodoPago, direccionEnvio, notas } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'El pedido necesita al menos un item' });
    }

    const total = items.reduce(
      (acc, item) => acc + Number(item.precioUnitario) * Number(item.cantidad),
      0
    );

    await connection.beginTransaction();

    const pedidoUuid = uuidv4();
    const [resultPedido] = await connection.query(
      `INSERT INTO pedidos (uuid, usuarioId, estado, total, metodoPago, direccionEnvio, notas)
       VALUES (?, ?, 'pendiente', ?, ?, ?, ?)`,
      [
        pedidoUuid,
        req.uid,
        total,
        metodoPago || null,
        direccionEnvio ? JSON.stringify(direccionEnvio) : null,
        notas || null,
      ]
    );

    const pedidoId = resultPedido.insertId;

    for (const item of items) {
      await connection.query(
        `INSERT INTO pedido_items (uuid, pedidoId, varianteId, personalizacion, cantidad, precioUnitario, nombreProducto)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          uuidv4(),
          pedidoId,
          item.varianteId,
          item.personalizacion ? JSON.stringify(item.personalizacion) : null,
          item.cantidad,
          item.precioUnitario,
          item.nombreProducto,
        ]
      );
    }

    await connection.commit();

    const [pedidos] = await connection.query(
      'SELECT * FROM pedidos WHERE id = ?',
      [pedidoId]
    );
    const [pedidoItems] = await connection.query(
      'SELECT * FROM pedido_items WHERE pedidoId = ?',
      [pedidoId]
    );

    res.status(201).json({ ...pedidos[0], items: pedidoItems });
  } catch (err) {
    await connection.rollback();
    console.error('Error POST /api/pedidos:', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    connection.release();
  }
});

// GET /api/pedidos - lista los pedidos del usuario logueado
router.get('/', verificarToken, async (req, res) => {
  try {
    const [pedidos] = await pool.query(
      `SELECT * FROM pedidos WHERE usuarioId = ? AND deletedAt IS NULL ORDER BY fechaPedido DESC`,
      [req.uid]
    );

    for (const pedido of pedidos) {
      const [items] = await pool.query(
        'SELECT * FROM pedido_items WHERE pedidoId = ?',
        [pedido.id]
      );
      pedido.items = items;
    }

    res.json(pedidos);
  } catch (err) {
    console.error('Error GET /api/pedidos:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;