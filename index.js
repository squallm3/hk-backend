const path = require('path');
const express = require('express');
const cors = require('cors');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', async (req, res) => {
  const pool = require('./db/conexion');
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'conectada' });
  } catch (err) {
    res.status(500).json({ status: 'error', mensaje: err.message });
  }
});

const PORT = process.env.PORT || 3000;

const nivelesRouter = require('./routes/niveles');
app.use('/api/niveles', nivelesRouter);

const productosRouter = require('./routes/productos');
app.use('/api/productos', productosRouter);

const categoriasRouter = require('./routes/categorias');
app.use('/api/categorias', categoriasRouter);

const usuariosRouter = require('./routes/usuarios');
app.use('/api/usuarios', usuariosRouter);

const misionesRouter = require('./routes/misiones');
app.use('/api/misiones', misionesRouter);

const pleromosRouter = require('./routes/pleromos');
app.use('/api/pleromos', pleromosRouter);

const pedidosRouter = require('./routes/pedidos');
app.use('/api/pedidos', pedidosRouter);

const personajesRouter = require('./routes/personajes');
app.use('/api/personajes', personajesRouter);

app.listen(PORT, () => console.log(`HK Backend corriendo en puerto ${PORT}`));