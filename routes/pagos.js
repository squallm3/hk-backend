const express = require('express');
const router = express.Router();
const pool = require('../db/conexion');
const { verificarToken } = require('../middleware/auth');
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
});

const URL_TIENDA =
  process.env.URL_TIENDA || 'https://haikusgnosticos.duckdns.org';

// POST /api/pagos/preferencia - crea la preferencia de pago de un pedido
router.post('/preferencia', verificarToken, async (req, res) => {
  try {
    const { pedidoId } = req.body;

    if (!pedidoId) {
      return res.status(400).json({ error: 'Falta el pedidoId' });
    }

    // Traemos el pedido, verificando que sea del usuario logueado
    const [pedidos] = await pool.query(
      'SELECT * FROM pedidos WHERE id = ? AND usuarioId = ?',
      [pedidoId, req.uid]
    );

    if (pedidos.length === 0) {
      return res.status(404).json({ error: 'Pedido no encontrado' });
    }

    const pedido = pedidos[0];

    const [items] = await pool.query(
      'SELECT * FROM pedido_items WHERE pedidoId = ?',
      [pedido.id]
    );

    const preference = new Preference(client);

    const resultado = await preference.create({
      body: {
        items: items.map((item) => ({
          id: String(item.varianteId),
          title: item.nombreProducto,
          quantity: Number(item.cantidad),
          unit_price: Number(item.precioUnitario),
          currency_id: 'ARS',
        })),
        external_reference: pedido.uuid,
        back_urls: {
          success: `${URL_TIENDA}/tienda/pago/exito`,
          failure: `${URL_TIENDA}/tienda/pago/error`,
          pending: `${URL_TIENDA}/tienda/pago/pendiente`,
        },
        auto_return: 'approved',
      },
    });

    // Guardamos la referencia de la preferencia en el pedido
    await pool.query(
      'UPDATE pedidos SET referenciaPago = ? WHERE id = ?',
      [resultado.id, pedido.id]
    );

    res.json({
      preferenceId: resultado.id,
      initPoint: resultado.init_point,
    });
  } catch (err) {
    console.error('Error POST /api/pagos/preferencia:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/pagos/webhook - Mercado Pago avisa cuando cambia un pago
router.post('/webhook', async (req, res) => {
  try {
    const tipo = req.body?.type || req.query?.type;
    const pagoId = req.body?.data?.id || req.query?.['data.id'];

    // Respondemos rapido para que MP no reintente
    res.sendStatus(200);

    if (tipo !== 'payment' || !pagoId) return;

    const payment = new Payment(client);
    const info = await payment.get({ id: pagoId });

    const referencia = info.external_reference;
    const estado = info.status;

    if (!referencia) return;

    if (estado === 'approved') {
      await pool.query(
        "UPDATE pedidos SET estado = 'pagado', referenciaPago = ? WHERE uuid = ?",
        [String(pagoId), referencia]
      );
      console.log('Pedido pagado:', referencia);
    } else if (estado === 'rejected' || estado === 'cancelled') {
      await pool.query(
        "UPDATE pedidos SET estado = 'cancelado' WHERE uuid = ?",
        [referencia]
      );
      console.log('Pago rechazado o cancelado:', referencia);
    }
  } catch (err) {
    console.error('Error en webhook de Mercado Pago:', err.message);
  }
});

module.exports = router;