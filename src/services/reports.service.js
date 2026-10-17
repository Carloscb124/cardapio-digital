const db = require('../config/db');
const { HttpError } = require('../utils/http');

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const GROUP = {
  day: 'DATE(created_at)',
  week: 'DATE_SUB(DATE(created_at), INTERVAL WEEKDAY(created_at) DAY)',
  month: "DATE_FORMAT(created_at, '%Y-%m')",
};

function range(q) {
  const today = new Date(), p = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  const from = DATE.test(q.from || '') ? q.from : iso(new Date(today.getFullYear(), today.getMonth(), 1));
  const to = DATE.test(q.to || '') ? q.to : iso(today);
  if (from > to) throw new HttpError(400, 'A data inicial não pode ser depois da final.');
  return { from, to };
}
const W = "establishment_id=? AND created_at>=? AND created_at<DATE_ADD(?, INTERVAL 1 DAY)";

async function summary(est, q) {
  const { from, to } = range(q);
  const expr = GROUP[q.group] || GROUP.day, a = [est, from, to];
  const [byPeriod] = await db.query(`SELECT ${expr} AS period, COUNT(*) AS orders, SUM(total) AS sales FROM orders WHERE ${W} AND status<>'cancelado' GROUP BY period ORDER BY period`, a);
  const [payments] = await db.query(`SELECT payment_method AS method, COUNT(*) AS orders, SUM(total) AS total FROM orders WHERE ${W} AND status<>'cancelado' GROUP BY payment_method ORDER BY total DESC`, a);
  const [top] = await db.query(
    `SELECT oi.name, SUM(oi.quantity) AS qty, SUM(oi.quantity*oi.unit_price) AS revenue FROM order_items oi JOIN orders o ON o.id=oi.order_id
      WHERE o.establishment_id=? AND o.status<>'cancelado' AND o.created_at>=? AND o.created_at<DATE_ADD(?, INTERVAL 1 DAY)
      GROUP BY oi.name ORDER BY qty DESC LIMIT 20`, a);
  const [[can]] = await db.query(`SELECT COUNT(*) AS n, COALESCE(SUM(total),0) AS total FROM orders WHERE ${W} AND status='cancelado'`, a);
  const [[tot]] = await db.query(`SELECT COUNT(*) AS orders, COALESCE(SUM(total),0) AS sales FROM orders WHERE ${W} AND status<>'cancelado'`, a);
  return {
    from, to, group: GROUP[q.group] ? q.group : 'day',
    totals: { orders: tot.orders, sales: tot.sales, avgTicket: tot.orders ? tot.sales / tot.orders : 0 },
    byPeriod: byPeriod.map((r) => ({ period: String(r.period).slice(0, 10).length === 10 ? String(r.period).slice(0, 10) : String(r.period), orders: r.orders, sales: r.sales })),
    payments, top, cancelled: can,
  };
}

async function exportRows(est, q) {
  const { from, to } = range(q), a = [est, from, to];
  if (q.kind === 'products') {
    const s = await summary(est, q);
    return { name: 'produtos', header: ['Produto', 'Quantidade', 'Receita'], rows: s.top.map((r) => [r.name, r.qty, r.revenue.toFixed(2)]) };
  }
  if (q.kind === 'payments') {
    const s = await summary(est, q);
    return { name: 'pagamentos', header: ['Forma de pagamento', 'Pedidos', 'Total'], rows: s.payments.map((r) => [r.method, r.orders, r.total.toFixed(2)]) };
  }
  const cancelled = q.kind === 'cancelled';
  const [rows] = await db.query(
    `SELECT number, created_at, customer_name, type, payment_method, subtotal, delivery_fee, discount, total, status FROM orders
      WHERE ${W} ${cancelled ? "AND status='cancelado'" : ''} ORDER BY created_at`, a);
  return {
    name: cancelled ? 'cancelados' : 'pedidos',
    header: ['Número', 'Data', 'Cliente', 'Tipo', 'Pagamento', 'Subtotal', 'Entrega', 'Desconto', 'Total', 'Status'],
    rows: rows.map((r) => [r.number, r.created_at, r.customer_name, r.type, r.payment_method, r.subtotal.toFixed(2), r.delivery_fee.toFixed(2), r.discount.toFixed(2), r.total.toFixed(2), r.status]),
  };
}
module.exports = { summary, exportRows };
