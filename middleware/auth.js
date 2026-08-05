const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const serviceAccount = require('../firebase-service-account.json');
const pool = require('../db/conexion');

if (!getApps().length) {
  initializeApp({
    credential: cert(serviceAccount),
  });
}

async function verificarToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token requerido' });
  }
  const token = authHeader.split('Bearer ')[1];
  try {
    const decoded = await getAuth().verifyIdToken(token);
    req.uid = decoded.uid;
    req.email = decoded.email;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido' });
  }
}

// Verifica que el usuario ademas tenga rol de administrador
async function verificarAdmin(req, res, next) {
  verificarToken(req, res, async () => {
    try {
      const [rows] = await pool.query(
        'SELECT rol FROM usuarios WHERE id = ?',
        [req.uid]
      );

      if (rows.length === 0 || rows[0].rol !== 'admin') {
        return res.status(403).json({ error: 'Acceso restringido' });
      }

      req.rol = rows[0].rol;
      next();
    } catch (err) {
      console.error('Error al verificar admin:', err.message);
      return res.status(500).json({ error: err.message });
    }
  });
}

module.exports = { verificarToken, verificarAdmin };