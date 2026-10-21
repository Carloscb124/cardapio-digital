const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { HttpError } = require('../utils/http');
const { nationalPhone } = require('../utils/br');

const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
const DUMMY = bcrypt.hashSync('dummy-password', 12);
const COMMON = new Set(['123456', '1234567', '12345678', '123456789', 'password', 'senha123', 'senha1234', 'qwerty', 'qwerty123', '111111', '000000', 'abc123']);
const bad = (field, msg, status = 400) => { throw new HttpError(status, msg, field); };

async function estBySlug(slug) {
  const [[e]] = await db.query('SELECT id FROM establishments WHERE slug=?', [slug]);
  if (!e) throw new HttpError(404, 'Estabelecimento não encontrado.');
  return e.id;
}

function checkPassword(pw, field = 'password') {
  if (typeof pw !== 'string' || pw.length < 6) bad(field, 'A senha precisa ter pelo menos 6 caracteres.');
  if (pw.length > 100) bad(field, 'A senha pode ter no máximo 100 caracteres.');
  if (COMMON.has(pw.toLowerCase()) || /^(.)\1+$/.test(pw)) bad(field, 'Esta senha é fácil de adivinhar. Escolha outra.');
}

async function register(est, b) {
  const name = typeof b.name === 'string' ? b.name.trim() : '';
  const phone = nationalPhone(b.phone);
  if (name.length < 2 || name.length > 100) bad('name', 'Informe seu nome (2 a 100 caracteres).');
  if (!phone) bad('phone', 'WhatsApp inválido. Use DDD e número, ex.: (11) 99999-8888.');
  checkPassword(b.password);
  if (b.confirm !== b.password) bad('confirm', 'As senhas não conferem.');
  try {
    const [r] = await db.query('INSERT INTO customer_accounts (establishment_id,name,phone,password_hash) VALUES (?,?,?,?)', [est, name, phone, await bcrypt.hash(b.password, 12)]);
    return { id: r.insertId, name, phone };
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') bad('phone', 'Já existe uma conta com este WhatsApp. Entre na sua conta.', 409);
    throw e;
  }
}

async function login(est, rawPhone, password) {
  const phone = nationalPhone(rawPhone);
  const [[a]] = phone ? await db.query('SELECT * FROM customer_accounts WHERE establishment_id=? AND phone=?', [est, phone]) : [[]];
  const ok = await bcrypt.compare(String(password || ''), a ? a.password_hash : DUMMY);
  if (!a || !ok) throw new HttpError(401, 'WhatsApp ou senha incorretos.');
  return { id: a.id, name: a.name, phone: a.phone };
}

async function me(est, id) {
  const [[a]] = await db.query('SELECT id,name,phone FROM customer_accounts WHERE establishment_id=? AND id=?', [est, id]);
  if (!a) throw new HttpError(401, 'Sessão expirada.');
  const [addresses] = await db.query('SELECT id,label,address,neighborhood FROM customer_addresses WHERE account_id=? ORDER BY id', [id]);
  return { ...a, addresses };
}

async function addAddress(id, b) {
  const label = String(b.label || '').trim(), address = String(b.address || '').trim(), hood = String(b.neighborhood || '').trim() || null;
  if (!label || label.length > 30) bad('label', 'Dê um apelido ao endereço (até 30 caracteres), como "Casa".');
  if (address.length < 5 || address.length > 255) bad('address', 'Informe o endereço completo (rua, número e complemento).');
  if (hood && hood.length > 100) bad('neighborhood', 'Bairro muito longo.');
  const [[c]] = await db.query('SELECT COUNT(*) n FROM customer_addresses WHERE account_id=?', [id]);
  if (c.n >= 5) bad('address', 'Você pode salvar até 5 endereços. Remova um para adicionar outro.');
  const [r] = await db.query('INSERT INTO customer_addresses (account_id,label,address,neighborhood) VALUES (?,?,?,?)', [id, label, address, hood]);
  return r.insertId;
}

async function removeAddress(id, addrId) {
  const [r] = await db.query('DELETE FROM customer_addresses WHERE account_id=? AND id=?', [id, addrId]);
  if (!r.affectedRows) throw new HttpError(404, 'Endereço não encontrado.');
}

async function changePassword(id, current, next, confirm) {
  const [[a]] = await db.query('SELECT password_hash FROM customer_accounts WHERE id=?', [id]);
  if (!(await bcrypt.compare(String(current || ''), a.password_hash))) bad('current', 'A senha atual está incorreta.');
  checkPassword(next, 'password');
  if (confirm !== next) bad('confirm', 'As senhas não conferem.');
  await db.query('UPDATE customer_accounts SET password_hash=?, reset_hash=NULL, reset_expires=NULL WHERE id=?', [await bcrypt.hash(next, 12), id]);
}

const history = async (est, id) => (await db.query(
  'SELECT id,number,status,type,total,created_at,tracking_token FROM orders WHERE establishment_id=? AND customer_account_id=? ORDER BY id DESC LIMIT 30', [est, id]))[0];

// "Pedir de novo": remonta o carrinho com preços e disponibilidade ATUAIS; o servidor valida tudo de novo no pedido.
async function reorder(est, accountId, orderId) {
  const [[o]] = await db.query('SELECT id FROM orders WHERE id=? AND establishment_id=? AND customer_account_id=?', [orderId, est, accountId]);
  if (!o) throw new HttpError(404, 'Pedido não encontrado.');
  const [items] = await db.query('SELECT * FROM order_items WHERE order_id=? ORDER BY id', [orderId]);
  const lines = []; let skipped = 0;
  for (const it of items) {
    if (it.combo_id) {
      const [[c]] = await db.query('SELECT id,name,price FROM combos WHERE id=? AND establishment_id=? AND available=1', [it.combo_id, est]);
      if (c) lines.push({ kind: 'combo', id: c.id, name: `Combo: ${c.name}`, unit: c.price, qty: it.quantity, options: [], notes: it.notes || '' }); else skipped++;
      continue;
    }
    const [[p]] = it.product_id ? await db.query('SELECT * FROM products WHERE id=? AND establishment_id=? AND available=1', [it.product_id, est]) : [[]];
    if (!p || (p.track_stock && p.stock_qty < it.quantity)) { skipped++; continue; }
    const [saved] = await db.query('SELECT option_id FROM order_item_options WHERE order_item_id=?', [it.id]);
    const ids = saved.map((s) => s.option_id).filter(Boolean);
    let opts = [];
    if (ids.length) {
      [opts] = await db.query(
        `SELECT op.id, op.name, op.price_delta FROM options op JOIN product_option_groups l ON l.group_id=op.group_id
          WHERE l.product_id=? AND op.available=1 AND (op.track_stock=0 OR op.stock_qty>=?) AND op.id IN (?)`, [p.id, it.quantity, ids]);
    }
    if (opts.length !== saved.length) { skipped++; continue; } // alguma opção mudou ou acabou
    lines.push({ kind: 'product', id: p.id, name: p.name, unit: p.promo_price != null && p.promo_price < p.price ? p.promo_price : p.price, qty: it.quantity, options: opts, notes: it.notes || '' });
  }
  return { lines, skipped };
}

/* ----- Uso do painel (equipe) ----- */
const trimOrNull = (v, max, field, label) => { const t = typeof v === 'string' ? v.trim() : ''; if (t.length > max) bad(field, `${label} muito longo (máx. ${max} caracteres).`); return t || null; };

function cleanCustomer(b) {
  const name = typeof b.name === 'string' ? b.name.trim() : '';
  if (name.length < 2 || name.length > 100) bad('name', 'Informe o nome do cliente (2 a 100 caracteres).');
  const phone = nationalPhone(b.phone);
  if (!phone) bad('phone', 'WhatsApp inválido. Use DDD e número, ex.: (11) 99999-8888.');
  return { name, phone, address: trimOrNull(b.address, 255, 'address', 'Endereço'), neighborhood: trimOrNull(b.neighborhood, 100, 'neighborhood', 'Bairro'), notes: trimOrNull(b.notes, 255, 'notes', 'Observações') };
}
const dup = (e) => { if (e.code === 'ER_DUP_ENTRY') bad('phone', 'Já existe um cliente com este WhatsApp.', 409); throw e; };

async function adminCreate(est, b) {
  const d = cleanCustomer(b);
  try { return (await db.query('INSERT INTO customers (establishment_id,name,phone,address,neighborhood,notes) VALUES (?,?,?,?,?,?)', [est, d.name, d.phone, d.address, d.neighborhood, d.notes]))[0].insertId; } catch (e) { return dup(e); }
}
async function adminUpdate(est, id, b) {
  const d = cleanCustomer(b);
  const [[c]] = await db.query('SELECT id FROM customers WHERE establishment_id=? AND id=?', [est, id]);
  if (!c) throw new HttpError(404, 'Cliente não encontrado.');
  try { await db.query('UPDATE customers SET name=?, phone=?, address=?, neighborhood=?, notes=? WHERE id=?', [d.name, d.phone, d.address, d.neighborhood, d.notes, id]); } catch (e) { dup(e); }
}
async function adminRemove(est, id) {
  const [r] = await db.query('DELETE FROM customers WHERE establishment_id=? AND id=?', [est, id]);
  if (!r.affectedRows) throw new HttpError(404, 'Cliente não encontrado.');
}

async function adminList(est, q) {
  const where = ['c.establishment_id=?'], p = [est];
  const text = String(q || '').trim().slice(0, 50), digits = text.replace(/\D/g, '');
  if (text) { where.push(digits ? '(c.name LIKE ? OR c.phone LIKE ?)' : 'c.name LIKE ?'); p.push(`%${text}%`); if (digits) p.push(`%${digits}%`); }
  return (await db.query(
    `SELECT c.id, c.name, c.phone, c.address, c.neighborhood, c.notes, COUNT(o.id) AS orders, COALESCE(SUM(CASE WHEN o.status<>'cancelado' THEN o.total END),0) AS spent, MAX(o.created_at) AS last_order,
            (SELECT a.id FROM customer_accounts a WHERE a.establishment_id=c.establishment_id AND a.phone=c.phone) AS account_id
       FROM customers c LEFT JOIN orders o ON o.customer_id=c.id WHERE ${where.join(' AND ')} GROUP BY c.id ORDER BY last_order DESC, c.id DESC LIMIT 500`, p))[0];
}

async function createResetToken(est, accountId) {
  const [[a]] = await db.query('SELECT id FROM customer_accounts WHERE establishment_id=? AND id=?', [est, accountId]);
  if (!a) throw new HttpError(404, 'Conta de cliente não encontrada.');
  const token = crypto.randomBytes(32).toString('hex');
  await db.query('UPDATE customer_accounts SET reset_hash=?, reset_expires=DATE_ADD(NOW(), INTERVAL 1 HOUR) WHERE id=?', [sha(token), accountId]);
  return token;
}

async function resetPassword(est, token, password) {
  checkPassword(password);
  if (typeof token !== 'string' || token.length !== 64) throw new HttpError(400, 'Link inválido ou expirado. Peça um novo ao estabelecimento.');
  const [[a]] = await db.query('SELECT id FROM customer_accounts WHERE establishment_id=? AND reset_hash=? AND reset_expires>NOW()', [est, sha(token)]);
  if (!a) throw new HttpError(400, 'Link inválido ou expirado. Peça um novo ao estabelecimento.');
  await db.query('UPDATE customer_accounts SET password_hash=?, reset_hash=NULL, reset_expires=NULL WHERE id=?', [await bcrypt.hash(password, 12), a.id]);
}

module.exports = { estBySlug, register, login, me, addAddress, removeAddress, changePassword, history, reorder, adminList, adminCreate, adminUpdate, adminRemove, createResetToken, resetPassword };
