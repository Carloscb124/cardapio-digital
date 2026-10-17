require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

(async () => {
  const name = process.env.DB_NAME;
  if (!/^[A-Za-z0-9_]+$/.test(name || '')) throw new Error('DB_NAME inválido no .env');
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER, password: process.env.DB_PASSWORD, multipleStatements: true,
  });
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await conn.query(`USE \`${name}\``);
  await conn.query(fs.readFileSync(path.join(__dirname, '..', 'database', 'schema.sql'), 'utf8'));
  await conn.end();
  await require('../src/config/migrate')();
  await require('../src/config/db').end();
  console.log(`Banco "${name}" pronto.`);
})().catch((e) => { console.error('Falha:', e.message); process.exit(1); });
