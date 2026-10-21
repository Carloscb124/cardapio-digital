// Chave Pix do estabelecimento (usada para gerar o QR Code de pagamento).
module.exports = {
  name: '004-pix',
  async up(conn) {
    const has = (await conn.query("SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='establishments' AND COLUMN_NAME='pix_key'"))[0].length > 0;
    if (!has) await conn.query('ALTER TABLE establishments ADD COLUMN pix_key_type VARCHAR(10) NULL, ADD COLUMN pix_key VARCHAR(100) NULL, ADD COLUMN pix_name VARCHAR(25) NULL, ADD COLUMN pix_city VARCHAR(15) NULL');
  },
};
