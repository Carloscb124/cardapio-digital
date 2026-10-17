const db = require('../config/db');
const crypto = require('crypto');
const tx = require('../utils/tx');
const catalog = require('./catalog.service');
const { isOpenNow } = require('./settings.service');
const { HttpError, parseJson } = require('../utils/http');
const { round2 } = require('../utils/validate');
const { brl, PAY } = require('./ticket.service');

const PAYMENTS = Object.keys(PAY);
const add = (m, k, q) => m.set(k, (m.get(k) || 0) + q);

function discountFor(c, subtotal) {
  if (!c || !c.active) throw new HttpError(400, 'Cupom inválido.');
  if (c.expires_at && new Date(c.expires_at.replace(' ', 'T')) < new Date()) throw new HttpError(400, 'Este cupom expirou.');
  if (c.max_uses != null && c.used_count >= c.max_uses) throw new HttpError(400, 'Este cupom atingiu o limite de usos.');
  if (subtotal < c.min_order) throw new HttpError(400, `Este cupom exige pedido mínimo de ${brl(c.min_order)}.`);
  let d = c.type === 'percent' ? (subtotal * c.value) / 100 : c.value;
  if (c.max_discount != null) d = Math.min(d, c.max_discount);
  return round2(Math.min(d, subtotal));
}

async function getEst(slug, conn = db) {
  const [[e]] = await conn.query('SELECT * FROM establishments WHERE slug=?', [String(slug)]);
  if (!e) throw new HttpError(404, 'Estabelecimento não encontrado.');
  e.opening_hours = parseJson(e.opening_hours);
  return e;
}

async function getMenu(slug) {
  const e = await getEst(slug);
  const [cats] = await db.query('SELECT id,name FROM categories WHERE establishment_id=? AND active=1 ORDER BY sort_order,name', [e.id]);
  const [prods] = await db.query(
    `SELECT id,category_id,name,description,price,promo_price,image_url,prep_minutes,track_stock,stock_qty
       FROM products WHERE establishment_id=? AND available=1 ORDER BY sort_order,name`, [e.id]);
  const [links] = await db.query('SELECT l.product_id,l.group_id FROM product_option_groups l JOIN products p ON p.id=l.product_id WHERE p.establishment_id=?', [e.id]);
  const groups = await catalog.listGroups(e.id);
  const shape = (g) => ({
    id: g.id, name: g.name, min: g.min_select, max: g.max_select,
    options: g.options.filter((o) => o.available).map((o) => ({ id: o.id, name: o.name, price_delta: o.price_delta, soldOut: !!o.track_stock && o.stock_qty <= 0 })),
  });
  const products = prods.map((p) => ({
    id: p.id, category_id: p.category_id, name: p.name, description: p.description, price: p.price,
    promo_price: p.promo_price != null && p.promo_price < p.price ? p.promo_price : null,
    image_url: p.image_url, prep_minutes: p.prep_minutes, soldOut: !!p.track_stock && p.stock_qty <= 0,
    groups: links.filter((l) => l.product_id === p.id).map((l) => groups.find((g) => g.id === l.group_id)).filter(Boolean).map(shape),
  }));
  const categories = cats.map((c) => ({ ...c, products: products.filter((p) => p.category_id === c.id) }));
  const loose = products.filter((p) => !cats.some((c) => c.id === p.category_id));
  if (loose.length) categories.push({ id: 0, name: 'Outros', products: loose });
  const combos = (await catalog.listCombos(e.id)).filter((c) => c.available)
    .map((c) => ({ id: c.id, name: c.name, description: c.description, price: c.price, image_url: c.image_url, items: c.items.map((i) => `${i.quantity}x ${i.product_name}`) }));
  const [zones] = await db.query('SELECT neighborhood, fee FROM delivery_zones WHERE establishment_id=? AND active=1 ORDER BY neighborhood', [e.id]);
  const open = isOpenNow(e.opening_hours);
  return {
    establishment: {
      name: e.name, description: e.description, logo_url: e.logo_url, cover_url: e.cover_url, address: e.address,
      pickup_enabled: !!e.pickup_enabled, delivery_enabled: !!e.delivery_enabled, min_order: e.min_order,
      est_delivery_minutes: e.est_delivery_minutes, hours: e.opening_hours, paused: !!e.orders_paused, open, accepting: open && !e.orders_paused,
    },
    categories: categories.filter((c) => c.products.length), combos, zones,
  };
}

async function previewCoupon(slug, code, subtotal) {
  const e = await getEst(slug);
  const [[c]] = await db.query('SELECT * FROM coupons WHERE establishment_id=? AND code=?', [e.id, String(code || '').trim().toUpperCase()]);
  const sub = Number(subtotal);
  if (!Number.isFinite(sub) || sub <= 0) throw new HttpError(400, 'Adicione itens ao carrinho primeiro.');
  return { discount: discountFor(c, sub) };
}

function whatsappText(o) {
  const L = [`*Novo pedido #${o.number}*`, `Cliente: ${o.customer_name}`, `Telefone: ${o.customer_phone}`, '', '*Itens*'];
  for (const it of o.items) {
    L.push(`${it.quantity}x ${it.name} — ${brl(it.unit_price * it.quantity)}`);
    it.options.forEach((x) => L.push(`   + ${x.name}${x.price_delta ? ' (' + brl(x.price_delta) + ')' : ''}`));
    if (it.notes) L.push(`   Obs: ${it.notes}`);
  }
  L.push('', `Subtotal: ${brl(o.subtotal)}`);
  if (o.delivery_fee) L.push(`Taxa de entrega: ${brl(o.delivery_fee)}`);
  if (o.discount) L.push(`Desconto: -${brl(o.discount)}`);
  L.push(`*Total: ${brl(o.total)}*`, '');
  L.push(o.type === 'entrega' ? `*Entrega:* ${o.address}${o.neighborhood ? ' - ' + o.neighborhood : ''}` : '*Retirada no local*');
  L.push(`Pagamento: ${PAY[o.payment_method]}`);
  if (o.change_for) L.push(`Troco para: ${brl(o.change_for)}`);
  if (o.notes) L.push(`Observações: ${o.notes}`);
  return L.join('\n');
}

function waUrl(e, order) {
  if (!e.whatsapp) return null;
  const num = e.whatsapp.length <= 11 ? '55' + e.whatsapp : e.whatsapp;
  return `https://wa.me/${num}?text=${encodeURIComponent(whatsappText(order))}`;
}

async function createOrder(slug, b, accountId = null) {
  const name = String(b.customer_name || '').trim();
  const phone = String(b.customer_phone || '').replace(/\D/g, '');
  const type = b.type, pay = b.payment_method;
  const notes = b.notes ? String(b.notes).trim() : null;
  if (name.length < 2 || name.length > 100) throw new HttpError(400, 'Informe seu nome.');
  if (phone.length < 10 || phone.length > 13) throw new HttpError(400, 'Informe um telefone válido com DDD.');
  if (!['entrega', 'retirada'].includes(type)) throw new HttpError(400, 'Escolha entrega ou retirada.');
  if (!PAYMENTS.includes(pay)) throw new HttpError(400, 'Escolha a forma de pagamento.');
  if (notes && notes.length > 500) throw new HttpError(400, 'Observações muito longas.');
  if (!Array.isArray(b.items) || !b.items.length || b.items.length > 50) throw new HttpError(400, 'Seu carrinho está vazio.');
  const address = b.address ? String(b.address).trim() : null;
  if (type === 'entrega' && (!address || address.length < 5 || address.length > 255)) throw new HttpError(400, 'Informe o endereço de entrega.');

  return tx(async (conn) => {
    // O bloqueio da linha do estabelecimento serializa pedidos (numeração e estoque consistentes).
    const [[e]] = await conn.query('SELECT * FROM establishments WHERE slug=? FOR UPDATE', [String(slug)]);
    if (!e) throw new HttpError(404, 'Estabelecimento não encontrado.');
    e.opening_hours = parseJson(e.opening_hours);
    if (e.orders_paused) throw new HttpError(409, 'O estabelecimento pausou temporariamente os pedidos.');
    if (!isOpenNow(e.opening_hours)) throw new HttpError(409, 'Estamos fechados no momento. Confira o horário de funcionamento.');
    if (type === 'entrega' && !e.delivery_enabled) throw new HttpError(400, 'Este estabelecimento não faz entregas.');
    if (type === 'retirada' && !e.pickup_enabled) throw new HttpError(400, 'Este estabelecimento não oferece retirada.');

    const needP = new Map(), needO = new Map(), lines = [];
    let subtotal = 0;
    for (const it of b.items) {
      const qty = Number(it.quantity);
      if (!Number.isInteger(qty) || qty < 1 || qty > 99) throw new HttpError(400, 'Quantidade inválida no carrinho.');
      const note = it.notes ? String(it.notes).trim().slice(0, 255) : null;
      if (it.kind === 'combo') {
        const [[c]] = await conn.query('SELECT * FROM combos WHERE id=? AND establishment_id=? AND available=1', [Number(it.id), e.id]);
        if (!c) throw new HttpError(400, 'Um combo do carrinho não está mais disponível.');
        const [parts] = await conn.query('SELECT product_id, quantity FROM combo_items WHERE combo_id=?', [c.id]);
        parts.forEach((x) => add(needP, x.product_id, x.quantity * qty));
        lines.push({ combo_id: c.id, product_id: null, name: `Combo: ${c.name}`, unit_price: c.price, quantity: qty, notes: note, options: [] });
        subtotal += c.price * qty;
        continue;
      }
      const [[p]] = await conn.query('SELECT * FROM products WHERE id=? AND establishment_id=? AND available=1', [Number(it.id), e.id]);
      if (!p) throw new HttpError(400, 'Um produto do carrinho não está mais disponível.');
      const unit = p.promo_price != null && p.promo_price < p.price ? p.promo_price : p.price;
      const [gs] = await conn.query('SELECT g.* FROM option_groups g JOIN product_option_groups l ON l.group_id=g.id WHERE l.product_id=?', [p.id]);
      const chosen = [...new Set((Array.isArray(it.options) ? it.options : []).map(Number))];
      const opts = chosen.length ? (await conn.query('SELECT * FROM options WHERE id IN (?)', [chosen]))[0] : [];
      if (opts.length !== chosen.length || opts.some((o) => !o.available || !gs.some((g) => g.id === o.group_id))) throw new HttpError(400, `Opção inválida em "${p.name}".`);
      for (const g of gs) {
        const n = opts.filter((o) => o.group_id === g.id).length;
        if (n < g.min_select || n > g.max_select) throw new HttpError(400, `Em "${p.name}", escolha ${g.min_select === g.max_select ? g.min_select : `de ${g.min_select} a ${g.max_select}`} opção(ões) de "${g.name}".`);
      }
      add(needP, p.id, qty); opts.forEach((o) => add(needO, o.id, qty));
      lines.push({ combo_id: null, product_id: p.id, name: p.name, unit_price: unit, quantity: qty, notes: note, options: opts.map((o) => ({ id: o.id, name: o.name, price_delta: o.price_delta })) });
      subtotal += (unit + opts.reduce((s, o) => s + o.price_delta, 0)) * qty;
    }
    subtotal = round2(subtotal);

    const stock = [];
    for (const [id, qty] of needP) {
      const [[p]] = await conn.query('SELECT name,track_stock,stock_qty FROM products WHERE id=? FOR UPDATE', [id]);
      if (p.track_stock) { if (p.stock_qty < qty) throw new HttpError(409, `"${p.name}" não tem estoque suficiente.`); stock.push(['product', id, qty]); }
    }
    for (const [id, qty] of needO) {
      const [[o]] = await conn.query('SELECT name,track_stock,stock_qty FROM options WHERE id=? FOR UPDATE', [id]);
      if (o.track_stock) { if (o.stock_qty < qty) throw new HttpError(409, `"${o.name}" não tem estoque suficiente.`); stock.push(['option', id, qty]); }
    }

    if (subtotal < e.min_order) throw new HttpError(400, `O pedido mínimo é de ${brl(e.min_order)}.`);

    let fee = 0, hood = null;
    if (type === 'entrega') {
      const [zones] = await conn.query('SELECT neighborhood, fee FROM delivery_zones WHERE establishment_id=? AND active=1', [e.id]);
      hood = String(b.neighborhood || '').trim() || null;
      if (zones.length) {
        const z = zones.find((x) => x.neighborhood.toLowerCase() === (hood || '').toLowerCase());
        if (!z) throw new HttpError(400, 'Não entregamos nesse bairro. Escolha um bairro da lista.');
        fee = z.fee; hood = z.neighborhood;
      }
    }

    let discount = 0, couponId = null;
    const code = String(b.coupon || '').trim().toUpperCase();
    if (code) {
      const [[c]] = await conn.query('SELECT * FROM coupons WHERE establishment_id=? AND code=? FOR UPDATE', [e.id, code]);
      discount = discountFor(c, subtotal); couponId = c.id;
      await conn.query('UPDATE coupons SET used_count=used_count+1 WHERE id=?', [c.id]);
    }
    const total = round2(subtotal + fee - discount);
    let change = null;
    if (pay === 'dinheiro' && b.change_for) {
      change = Number(b.change_for);
      if (!Number.isFinite(change) || change < total) throw new HttpError(400, 'O valor para troco deve ser maior ou igual ao total do pedido.');
    }

    const token = crypto.randomBytes(16).toString('hex');
    const [cr] = await conn.query('INSERT INTO customers (establishment_id,name,phone) VALUES (?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name), id=LAST_INSERT_ID(id)', [e.id, name, phone]);
    const [[{ n: number }]] = await conn.query('SELECT COALESCE(MAX(number),0)+1 AS n FROM orders WHERE establishment_id=?', [e.id]);
    const [or] = await conn.query(
      `INSERT INTO orders (establishment_id,number,customer_id,customer_name,customer_phone,type,address,neighborhood,subtotal,delivery_fee,discount,total,coupon_id,payment_method,change_for,notes,tracking_token,customer_account_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [e.id, number, cr.insertId, name, phone, type, type === 'entrega' ? address : null, hood, subtotal, fee, discount, total, couponId, pay, change, notes, token, accountId]);
    await conn.query('INSERT INTO order_status_history (order_id,status) VALUES (?,?)', [or.insertId, 'aguardando']);
    for (const l of lines) {
      const [ir] = await conn.query('INSERT INTO order_items (order_id,product_id,combo_id,name,unit_price,quantity,notes) VALUES (?,?,?,?,?,?,?)', [or.insertId, l.product_id, l.combo_id, l.name, l.unit_price, l.quantity, l.notes]);
      for (const o of l.options) await conn.query('INSERT INTO order_item_options (order_item_id,option_id,name,price_delta) VALUES (?,?,?,?)', [ir.insertId, o.id, o.name, o.price_delta]);
    }
    for (const [kind, id, qty] of stock) {
      await conn.query(`UPDATE ${kind === 'product' ? 'products' : 'options'} SET stock_qty=stock_qty-? WHERE id=?`, [qty, id]);
      await conn.query(`INSERT INTO stock_movements (establishment_id,${kind === 'product' ? 'product_id' : 'option_id'},delta,reason,order_id) VALUES (?,?,?,?,?)`, [e.id, id, -qty, `Pedido #${number}`, or.insertId]);
    }

    const order = { number, customer_name: name, customer_phone: phone, type, address, neighborhood: hood, subtotal, delivery_fee: fee, discount, total, payment_method: pay, change_for: change, notes, items: lines };
    return { id: or.insertId, number, total, whatsappUrl: waUrl(e, order), token, trackUrl: `/pedido/${token}` };
  });
}

module.exports = { getMenu, previewCoupon, createOrder, whatsappText, waUrl };
