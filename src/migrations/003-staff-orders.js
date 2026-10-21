// Pedidos criados pela equipe (origem/autor) e dados de cadastro do cliente (endereço e observações).
module.exports = {
  name: '003-staff-orders',
  async up(conn) {
    const hasCol = async (t, c) => (await conn.query('SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?', [t, c]))[0].length > 0;
    if (!(await hasCol('customers', 'address'))) await conn.query('ALTER TABLE customers ADD COLUMN address VARCHAR(255) NULL, ADD COLUMN neighborhood VARCHAR(100) NULL, ADD COLUMN notes VARCHAR(255) NULL');
    if (!(await hasCol('orders', 'source'))) await conn.query("ALTER TABLE orders ADD COLUMN source VARCHAR(10) NOT NULL DEFAULT 'online', ADD COLUMN created_by INT UNSIGNED NULL");
  },
};
