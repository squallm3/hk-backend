const path = require('path');
const express = require('express');
const cors = require('cors');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();
app.use(cors());
app.use(express.json());

// Archivos subidos (imagenes de productos, etc)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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

const tareasDiaRouter = require('./routes/tareas-dia');
app.use('/api/tareas-dia', tareasDiaRouter);

const splitRouter = require('./routes/split');
app.use('/api/split', splitRouter);

const pagosRouter = require('./routes/pagos');
app.use('/api/pagos', pagosRouter);

const uploadsRouter = require('./routes/uploads');
app.use('/api/uploads', uploadsRouter);

const variantesRouter = require('./routes/variantes');
app.use('/api/variantes', variantesRouter);

const cuentasRouter = require('./routes/cuentas');
app.use('/api/cuentas', cuentasRouter);

const categoriasGastoRouter = require('./routes/categorias-gasto');
app.use('/api/categorias-gasto', categoriasGastoRouter);

const transaccionesRouter = require('./routes/transacciones');
app.use('/api/transacciones', transaccionesRouter);

const transferenciasRouter = require('./routes/transferencias');
app.use('/api/transferencias', transferenciasRouter);

const promptsRouter = require('./routes/prompts');
app.use('/api/prompts', promptsRouter);

const dietaRouter = require('./routes/dieta');
app.use('/api/dieta', dietaRouter);

const alimentosRouter = require('./routes/alimentos');
app.use('/api/alimentos', alimentosRouter);

const registroRouter = require('./routes/registro');
app.use('/api/registro', registroRouter);

const presupuestoRouter = require('./routes/presupuesto');
app.use('/api/presupuesto', presupuestoRouter);

const ichingRouter = require('./routes/iching');
app.use('/api/iching', ichingRouter);

const tiposArticuloNivelRouter = require('./routes/tipos-articulo-nivel');
app.use('/api/tipos-articulo-nivel', tiposArticuloNivelRouter);

app.listen(PORT, () => console.log(`HK Backend corriendo en puerto ${PORT}`));