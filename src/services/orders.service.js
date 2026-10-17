const db = require('../config/db');
const tx = require('../utils/tx');
const { HttpError } = require('../utils/http');

const STATUSES = ['aguardando', 'confirmado', 'preparo', 'pronto', 'saiu_entrega', 'concluido', 'cancelado'];
const NEXT = (o) => ({
  aguardando: ['confirmado', 'cancelado'],
  confirmado: ['preparo', 'cancelado'],
  preparo: ['pronto', 'cancelado'],
  pronto: [o.type === 'entrega' ? 'saiu_entrega' : 'concluido', 'cancelado'],
  saiu_entrega: ['concluido', 'cancelado'],
}[o.status] || []);
const KITCHEN = { confirmado: 'preparo', preparo: 'pronto' };
const DATE = /^\d{4}-\d{2}-\d{2}$/;

async function list(est, f) {
  const where = ['o.establishment_id=?'], p = [est];
  const st = String(f.status || '').split(',').filter((s) => STATUSES.includes(s));
  if (st.length) { where.push('o.status IN (?)'); p.push(st); }
  if (DATE.test(f.from || '')) { where.push('o.created_at>=?'); p.push(f.from); }
  if (DATE.test(f.to || '')) { where.push('o.created_at<DATE_ADD(?, INTERVAL 1 DAY)'); p.push(f.to); }
  if (f.q) { where.push('(o.number=? OR o.customer_name LIKE ?)'); p.push(Number(f.q) || 0, `%${String(f.q).slice(0, 50)}%`); }
  const limit = Math.min(Number(f.limit) || 100, 500);
  const [rows] = await db.query(
    `SELECT o.*, (SELECT COALESCE(SUM(quantity),0) FROM order_items WHERE order_id=o.id) AS items_count
       FROM orders o WHERE ${where.join(' AND ')} ORDER BY o.created_at DESC, o.id DESC LIMIT ${limit}`, p);
  return rows.map((o) => ({ ...o, next: NEXT(o) }));
}

async function get(est, id) {
  const [[o]] = await db.query('SELECT * FROM orders WHERE establishment_id=? AND id=?', [est, id]);
  if (!o) throw new HttpError(404, 'Pedido não encontrado.');
  const [items] = await db.query('SELECT * FROM order_items WHERE order_id=? ORDER BY id', [id]);
  const [opts] = await db.query('SELECT * FROM order_item_options WHERE order_item_id IN (SELECT id FROM order_items WHERE order_id=?)', [id]);
  o.items = items.map((i) => ({ ...i, options: opts.filter((x) => x.order_item_id === i.id) }));
  o.next = NEXT(o);
  return o;
}

async function counts(est) {
  const [rows] = await db.query("SELECT status, COUNT(*) AS n FROM orders WHERE establishment_id=? AND status IN ('aguardando','confirmado','preparo','pronto') GROUP BY status", [est]);
  const out = { aguardando: 0, confirmado: 0, preparo: 0, pronto: 0 };
  rows.forEach((r) => { out[r.status] = r.n; });
  return out;
}

async function setStatus(est, id, next, role) {
  if (!STATUSES.includes(next)) throw new HttpError(400, 'Status inválido.');
  return tx(async (conn) => {
    const [[o]] = await conn.query('SELECT * FROM orders WHERE establishment_id=? AND id=? FOR UPDATE', [est, id]);
    if (!o) throw new HttpError(404, 'Pedido não encontrado.');
    if (!NEXT(o).includes(next)) throw new HttpError(409, 'Esta mudança de status não é permitida para este pedido.');
    if (role === 'cozinha' && KITCHEN[o.status] !== next) throw new HttpError(403, 'A cozinha só atualiza pedidos para "em preparação" e "pronto".');
    if (next === 'cancelado') {
      const [moves] = await conn.query('SELECT product_id, option_id, delta FROM stock_movements WHERE order_id=? AND delta<0', [id]);
      for (const m of moves) {
        const col = m.product_id ? 'product_id' : 'option_id', tbl = m.product_id ? 'products' : 'options', ref = m.product_id || m.option_id;
        await conn.query(`UPDATE ${tbl} SET stock_qty=stock_qty+? WHERE id=?`, [-m.delta, ref]);
        await conn.query(`INSERT INTO stock_movements (establishment_id,${col},delta,reason,order_id) VALUES (?,?,?,?,?)`, [est, ref, -m.delta, `Cancelamento do pedido #${o.number}`, id]);
      }
      if (o.coupon_id) await conn.query('UPDATE coupons SET used_count=GREATEST(used_count-1,0) WHERE id=?', [o.coupon_id]);
    }
    await conn.query('UPDATE orders SET status=? WHERE id=?', [next, id]);
    await conn.query('INSERT INTO order_status_history (order_id,status) VALUES (?,?)', [id, next]);
  });
}

module.exports = { list, get, counts, setStatus };
