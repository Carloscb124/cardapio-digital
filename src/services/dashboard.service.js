const db = require('../config/db');

// Todas as consultas filtram por establishment_id (isolamento entre estabelecimentos).
async function getSummary(estId) {
  const [[today]] = await db.query(
    `SELECT COUNT(*) AS orders, COALESCE(SUM(total), 0) AS sales
       FROM orders WHERE establishment_id = ? AND created_at >= CURDATE() AND status <> 'cancelado'`, [estId]);
  const [[open]] = await db.query(
    `SELECT SUM(status = 'aguardando') AS pending, SUM(status = 'preparo') AS preparing
       FROM orders WHERE establishment_id = ? AND status IN ('aguardando','preparo')`, [estId]);
  const [daily] = await db.query(
    `SELECT DATE(created_at) AS day, SUM(total) AS sales
       FROM orders WHERE establishment_id = ? AND status <> 'cancelado'
        AND created_at >= CURDATE() - INTERVAL 6 DAY GROUP BY DATE(created_at)`, [estId]);
  const [top] = await db.query(
    `SELECT oi.name, SUM(oi.quantity) AS qty
       FROM order_items oi JOIN orders o ON o.id = oi.order_id
      WHERE o.establishment_id = ? AND o.status <> 'cancelado' AND o.created_at >= CURDATE() - INTERVAL 30 DAY
      GROUP BY oi.name ORDER BY qty DESC LIMIT 5`, [estId]);

  const [[setup]] = await db.query(
    `SELECT (SELECT COUNT(*) FROM categories WHERE establishment_id=?) AS categories,
            (SELECT COUNT(*) FROM products WHERE establishment_id=?) AS products,
            (SELECT slug FROM establishments WHERE id=?) AS slug`, [estId, estId, estId]);
  const sales = Number(today.sales), orders = Number(today.orders);
  const map = Object.fromEntries(daily.map((d) => [String(d.day).slice(0, 10), Number(d.sales)]));
  const series = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    series.push({ day: key, sales: map[key] || 0 });
  }
  return {
    todaySales: sales, todayOrders: orders,
    avgTicket: orders ? sales / orders : 0,
    pending: Number(open.pending || 0), preparing: Number(open.preparing || 0),
    setup, series, topProducts: top.map((t) => ({ name: t.name, qty: Number(t.qty) })),
  };
}

module.exports = { getSummary };
