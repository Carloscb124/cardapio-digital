// Opções de conexão compartilhadas (servidor e scripts). Para bancos na nuvem: DB_SSL=true + DB_SSL_CA (conteúdo do certificado).
const fs = require('fs');

function ssl() {
  if (process.env.DB_SSL !== 'true') return undefined;
  let ca = process.env.DB_SSL_CA;
  if (ca) ca = ca.replace(/\\n/g, '\n');
  else if (process.env.DB_SSL_CA_FILE) ca = fs.readFileSync(process.env.DB_SSL_CA_FILE, 'utf8');
  return { minVersion: 'TLSv1.2', rejectUnauthorized: process.env.DB_SSL_INSECURE !== 'true', ...(ca ? { ca } : {}) };
}

module.exports = () => ({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: ssl(),
});
