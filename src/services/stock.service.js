const db = require('../config/db');
const { HttpError } = require('../utils/http');

async function list(est) {
  const [p] = await db.query("SELECT p.id, p.name, COALESCE(c.name,'Sem categoria') AS category, p.stock_qty AS qty, p.stock_min AS min FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.establishment_id=? AND p.track_stock=1 ORDER BY category, p.name", [est]);
  const [o] = await db.query(
    `SELECT o.id, CONCAT(o.name,' (',g.name,')') AS name, CONCAT('Adicional: ',g.name) AS category, o.stock_qty AS qty, 0 AS min FROM options o
       JOIN option_groups g ON g.id=o.group_id WHERE g.establishment_id=? AND o.track_stock=1 ORDER BY g.name, o.name`, [est]);
  const mark = (type) => (r) => ({ ...r, type, low: r.qty <= r.min });
  return [...p.map(mark('product')), ...o.map(mark('option'))];
}

async function adjust(est, { type, id, delta, reason }, mode) {
  const d = Number(delta);
  if (!['product', 'option'].includes(type)) throw new HttpError(400, 'Tipo inválido.');
  if (!Number.isInteger(d) || d === 0 || Math.abs(d) > 100000) throw new HttpError(400, 'Informe uma quantidade inteira diferente de zero.');
  const why = String(reason || '').trim().slice(0, 100) || (d > 0 ? 'Entrada de estoque' : 'Saída / ajuste');
  const tx = require('../utils/tx');
  return tx(async (conn) => {
    const [[r]] = type === 'product'
      ? await conn.query('SELECT id, stock_qty FROM products WHERE establishment_id=? AND id=? AND track_stock=1 FOR UPDATE', [est, Number(id)])
      : await conn.query('SELECT o.id, o.stock_qty FROM options o JOIN option_groups g ON g.id=o.group_id WHERE g.establishment_id=? AND o.id=? AND o.track_stock=1 FOR UPDATE', [est, Number(id)]);
    if (!r) throw new HttpError(404, 'Item sem controle de estoque.');
    if (r.stock_qty + d < 0) throw new HttpError(400, 'O estoque não pode ficar negativo.');
    await conn.query(`UPDATE ${type === 'product' ? 'products' : 'options'} SET stock_qty=stock_qty+? WHERE id=?`, [d, r.id]);
    await conn.query(`INSERT INTO stock_movements (establishment_id,${type === 'product' ? 'product_id' : 'option_id'},delta,reason) VALUES (?,?,?,?)`, [est, r.id, d, why]);
  });
}

const movements = async (est) => (await db.query(
  `SELECT m.id, m.delta, m.reason, m.created_at, COALESCE(p.name, o.name, '(removido)') AS item
     FROM stock_movements m LEFT JOIN products p ON p.id=m.product_id LEFT JOIN options o ON o.id=m.option_id
    WHERE m.establishment_id=? ORDER BY m.id DESC LIMIT 200`, [est]))[0];

module.exports = { list, adjust, movements };
