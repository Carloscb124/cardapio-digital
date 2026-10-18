// Sessões e imagens no banco: necessário em hospedagem sem disco persistente (ex.: Vercel).
module.exports = {
  name: '002-sessions-uploads',
  async up(conn) {
    await conn.query(`CREATE TABLE IF NOT EXISTS sessions (
      sid VARCHAR(128) PRIMARY KEY,
      data MEDIUMTEXT NOT NULL,
      expires_at DATETIME NOT NULL,
      INDEX (expires_at)
    ) ENGINE=InnoDB`);
    await conn.query(`CREATE TABLE IF NOT EXISTS uploads (
      name VARCHAR(64) PRIMARY KEY,
      mime VARCHAR(30) NOT NULL,
      data MEDIUMBLOB NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB`);
  },
};
