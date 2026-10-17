// Aplica migrações pendentes (idempotente). Roda no db:init e a cada início do servidor.
const fs = require('fs');
const path = require('path');
const db = require('./db');

module.exports = async function migrate() {
  const conn = await db.getConnection();
  try {
    await conn.query("SELECT GET_LOCK('cardapio_migrate', 60)"); // evita corrida se dois servidores iniciarem juntos
    await conn.query('CREATE TABLE IF NOT EXISTS schema_migrations (name VARCHAR(100) PRIMARY KEY, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB');
    const [rows] = await conn.query('SELECT name FROM schema_migrations');
    const applied = new Set(rows.map((r) => r.name));
    const dir = path.join(__dirname, '..', 'migrations');
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js')).sort()) {
      const m = require(path.join(dir, f));
      if (applied.has(m.name)) continue;
      await m.up(conn);
      await conn.query('INSERT INTO schema_migrations (name) VALUES (?)', [m.name]);
      console.log('Migração aplicada:', m.name);
    }
  } finally {
    await conn.query("SELECT RELEASE_LOCK('cardapio_migrate')").catch(() => {});
    conn.release();
  }
};
