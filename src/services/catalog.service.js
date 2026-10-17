const db = require('../config/db');
const tx = require('../utils/tx');
const { HttpError } = require('../utils/http');

const ids = (arr) => [...new Set((Array.isArray(arr) ? arr : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];

async function assertOwned(conn, table, est, list, msg) {
  if (!list.length) return;
  const [r] = await conn.query(`SELECT id FROM \`${table}\` WHERE establishment_id=? AND id IN (?)`, [est, list]);
  if (r.length !== list.length) throw new HttpError(400, msg);
}

/* ---------- Produtos ---------- */
async function listProducts(est) {
  const [rows] = await db.query(
    `SELECT p.*, c.name AS category_name FROM products p LEFT JOIN categories c ON c.id=p.category_id
      WHERE p.establishment_id=? ORDER BY p.sort_order, p.name`, [est]);
  const [links] = await db.query(
    `SELECT l.product_id, l.group_id FROM product_option_groups l JOIN products p ON p.id=l.product_id WHERE p.establishment_id=?`, [est]);
  const map = {};
  links.forEach((l) => (map[l.product_id] ||= []).push(l.group_id));
  return rows.map((r) => ({ ...r, group_ids: map[r.id] || [] }));
}

const PCOLS = ['category_id', 'name', 'description', 'price', 'promo_price', 'image_url', 'available', 'prep_minutes', 'track_stock', 'stock_min', 'sort_order'];

async function saveProduct(est, id, d, groupIds) {
  if (d.promo_price != null && d.promo_price >= d.price) throw new HttpError(400, 'O preço promocional deve ser menor que o preço.');
  const groups = ids(groupIds);
  return tx(async (conn) => {
    if (d.category_id) await assertOwned(conn, 'categories', est, [d.category_id], 'Categoria inválida.');
    await assertOwned(conn, 'option_groups', est, groups, 'Grupo de opções inválido.');
    let pid = id;
    if (id) {
      const [r] = await conn.query(`UPDATE products SET ${PCOLS.map((c) => `${c}=?`).join(',')} WHERE establishment_id=? AND id=?`,
        [...PCOLS.map((c) => d[c]), est, id]);
      if (!r.affectedRows) throw new HttpError(404, 'Produto não encontrado.');
    } else {
      const [r] = await conn.query(`INSERT INTO products (establishment_id,${PCOLS.join(',')}) VALUES (?${',?'.repeat(PCOLS.length)})`,
        [est, ...PCOLS.map((c) => d[c])]);
      pid = r.insertId;
    }
    await conn.query('DELETE FROM product_option_groups WHERE product_id=?', [pid]);
    for (const g of groups) await conn.query('INSERT INTO product_option_groups (product_id, group_id) VALUES (?,?)', [pid, g]);
    return pid;
  });
}

/* ---------- Grupos de opções ---------- */
async function listGroups(est) {
  const [groups] = await db.query('SELECT * FROM option_groups WHERE establishment_id=? ORDER BY name', [est]);
  const [opts] = await db.query(
    `SELECT o.* FROM options o JOIN option_groups g ON g.id=o.group_id WHERE g.establishment_id=? ORDER BY o.id`, [est]);
  return groups.map((g) => ({ ...g, options: opts.filter((o) => o.group_id === g.id) }));
}

async function saveGroup(est, id, d, rows) {
  if (d.min_select > d.max_select) throw new HttpError(400, 'O mínimo não pode ser maior que o máximo.');
  if (!rows.length) throw new HttpError(400, 'Adicione ao menos uma opção.');
  if (d.max_select > rows.length) throw new HttpError(400, 'O máximo não pode ser maior que a quantidade de opções.');
  return tx(async (conn) => {
    let gid = id;
    if (id) {
      const [r] = await conn.query('UPDATE option_groups SET name=?, min_select=?, max_select=? WHERE establishment_id=? AND id=?',
        [d.name, d.min_select, d.max_select, est, id]);
      if (!r.affectedRows) throw new HttpError(404, 'Grupo não encontrado.');
    } else {
      const [r] = await conn.query('INSERT INTO option_groups (establishment_id,name,min_select,max_select) VALUES (?,?,?,?)',
        [est, d.name, d.min_select, d.max_select]);
      gid = r.insertId;
    }
    const [existing] = await conn.query('SELECT id FROM options WHERE group_id=?', [gid]);
    const keep = new Set();
    for (const o of rows) {
      const oid = Number(o.id);
      if (oid && existing.some((e) => e.id === oid)) {
        keep.add(oid);
        await conn.query('UPDATE options SET name=?, price_delta=?, available=?, track_stock=? WHERE id=? AND group_id=?',
          [o.name, o.price_delta, o.available, o.track_stock, oid, gid]);
      } else {
        await conn.query('INSERT INTO options (group_id,name,price_delta,available,track_stock) VALUES (?,?,?,?,?)',
          [gid, o.name, o.price_delta, o.available, o.track_stock]);
      }
    }
    const drop = existing.map((e) => e.id).filter((x) => !keep.has(x) && rows.every((o) => Number(o.id) !== x));
    if (drop.length) await conn.query('DELETE FROM options WHERE group_id=? AND id IN (?)', [gid, drop]);
    return gid;
  });
}

/* ---------- Combos ---------- */
async function listCombos(est) {
  const [combos] = await db.query('SELECT * FROM combos WHERE establishment_id=? ORDER BY name', [est]);
  const [items] = await db.query(
    `SELECT ci.combo_id, ci.product_id, ci.quantity, p.name AS product_name FROM combo_items ci
       JOIN combos c ON c.id=ci.combo_id JOIN products p ON p.id=ci.product_id WHERE c.establishment_id=?`, [est]);
  return combos.map((c) => ({ ...c, items: items.filter((i) => i.combo_id === c.id) }));
}

async function saveCombo(est, id, d, rows) {
  const items = rows.map((r) => ({ product_id: Number(r.product_id), quantity: Number(r.quantity) }));
  if (!items.length) throw new HttpError(400, 'Adicione ao menos um produto ao combo.');
  if (items.some((i) => !Number.isInteger(i.product_id) || !Number.isInteger(i.quantity) || i.quantity < 1 || i.quantity > 99)) throw new HttpError(400, 'Itens do combo inválidos.');
  if (new Set(items.map((i) => i.product_id)).size !== items.length) throw new HttpError(400, 'Produto repetido no combo.');
  return tx(async (conn) => {
    await assertOwned(conn, 'products', est, items.map((i) => i.product_id), 'Produto inválido no combo.');
    let cid = id;
    const cols = ['name', 'description', 'price', 'image_url', 'available'];
    if (id) {
      const [r] = await conn.query(`UPDATE combos SET ${cols.map((c) => `${c}=?`).join(',')} WHERE establishment_id=? AND id=?`, [...cols.map((c) => d[c]), est, id]);
      if (!r.affectedRows) throw new HttpError(404, 'Combo não encontrado.');
    } else {
      const [r] = await conn.query(`INSERT INTO combos (establishment_id,${cols.join(',')}) VALUES (?,?,?,?,?,?)`, [est, ...cols.map((c) => d[c])]);
      cid = r.insertId;
    }
    await conn.query('DELETE FROM combo_items WHERE combo_id=?', [cid]);
    for (const i of items) await conn.query('INSERT INTO combo_items (combo_id,product_id,quantity) VALUES (?,?,?)', [cid, i.product_id, i.quantity]);
    return cid;
  });
}

module.exports = { listProducts, saveProduct, listGroups, saveGroup, listCombos, saveCombo };
