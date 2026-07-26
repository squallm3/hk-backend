const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const serviceAccount = require('../firebase-service-account.json');

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

module.exports = { verificarToken };
