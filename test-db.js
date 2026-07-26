const mysql = require('/home/mmarra/hk-backend/node_modules/mysql2/promise');

async function test() {
  const conn = await mysql.createConnection({
    host: '127.0.0.1',
    port: 3306,
    user: 'haikus',
    password: 'kaos2026',
    database: 'haiku_gnostico',
  });
  const [rows] = await conn.query('SELECT COUNT(*) as total FROM niveles');
  console.log('Resultado:', rows[0]);
  await conn.end();
}

test().catch(console.error);
