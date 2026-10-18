const mysql = require('mysql2/promise');

module.exports = mysql.createPool({
  ...require('./db-options')(),
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL) || 10, // na Vercel use 3: cada instância tem o seu pool
  enableKeepAlive: true,
  dateStrings: true,
  decimalNumbers: true,
});
