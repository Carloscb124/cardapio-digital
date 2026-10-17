// Área do cliente: rastreio de pedido, contas de clientes, endereços salvos e histórico de status.
const crypto = require('crypto');

module.exports = {
  name: '001-customer-area',
  async up(conn) {
    const hasCol = async (t, c) => (await conn.query('SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?', [t, c]))[0].length > 0;

    await conn.query(`CREATE TABLE IF NOT EXISTS customer_accounts (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      establishment_id INT UNSIGNED NOT NULL,
      name VARCHAR(100) NOT NULL,
      phone VARCHAR(20) NOT NULL,
      password_hash VARCHAR(100) NOT NULL,
      reset_hash CHAR(64) NULL,
      reset_expires DATETIME NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (establishment_id, phone),
      INDEX (reset_hash),
      FOREIGN KEY (establishment_id) REFERENCES establishments(id) ON DELETE CASCADE
    ) ENGINE=InnoDB`);
    await conn.query(`CREATE TABLE IF NOT EXISTS customer_addresses (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      account_id INT UNSIGNED NOT NULL,
      label VARCHAR(30) NOT NULL,
      address VARCHAR(255) NOT NULL,
      neighborhood VARCHAR(100) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (account_id) REFERENCES customer_accounts(id) ON DELETE CASCADE
    ) ENGINE=InnoDB`);
    await conn.query(`CREATE TABLE IF NOT EXISTS order_status_history (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      order_id INT UNSIGNED NOT NULL,
      status VARCHAR(20) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX (order_id),
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    ) ENGINE=InnoDB`);

    if (!(await hasCol('orders', 'tracking_token'))) await conn.query('ALTER TABLE orders ADD COLUMN tracking_token CHAR(32) NULL, ADD UNIQUE INDEX uq_orders_token (tracking_token)');
    if (!(await hasCol('orders', 'customer_account_id'))) {
      await conn.query('ALTER TABLE orders ADD COLUMN customer_account_id INT UNSIGNED NULL, ADD INDEX idx_orders_account (customer_account_id), ADD CONSTRAINT fk_orders_account FOREIGN KEY (customer_account_id) REFERENCES customer_accounts(id) ON DELETE SET NULL');
    }
    if (!(await hasCol('order_items', 'combo_id'))) await conn.query('ALTER TABLE order_items ADD COLUMN combo_id INT UNSIGNED NULL');

    // Pedidos já existentes ganham link de acompanhamento e um histórico mínimo.
    const [old] = await conn.query('SELECT id FROM orders WHERE tracking_token IS NULL');
    for (const o of old) await conn.query('UPDATE orders SET tracking_token=? WHERE id=?', [crypto.randomBytes(16).toString('hex'), o.id]);
    await conn.query("INSERT INTO order_status_history (order_id,status,created_at) SELECT id,'aguardando',created_at FROM orders o WHERE NOT EXISTS (SELECT 1 FROM order_status_history h WHERE h.order_id=o.id)");
    await conn.query("INSERT INTO order_status_history (order_id,status,created_at) SELECT id,status,updated_at FROM orders o WHERE status<>'aguardando' AND NOT EXISTS (SELECT 1 FROM order_status_history h WHERE h.order_id=o.id AND h.status=o.status)");
  },
};
