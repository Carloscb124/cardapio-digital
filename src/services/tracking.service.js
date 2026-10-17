const db = require('../config/db');
const { HttpError } = require('../utils/http');
const { waUrl } = require('./public.service');

// Dados do acompanhamento: quem tem o link (token secreto de 128 bits) vê o próprio pedido.
async function getByToken(token) {
  const [[o]] = await db.query(
    `SELECT o.*, e.name AS store_name, e.slug AS store_slug, e.whatsapp AS store_whatsapp, e.est_delivery_minutes
       FROM orders o JOIN establishments e ON e.id=o.establishment_id WHERE o.tracking_token=?`, [token]);
  if (!o) throw new HttpError(404, 'Pedido não encontrado. Confira o link.');
  const [items] = await db.query('SELECT id,name,unit_price,quantity,notes FROM order_items WHERE order_id=? ORDER BY id', [o.id]);
  const [opts] = await db.query('SELECT order_item_id,name,price_delta FROM order_item_options WHERE order_item_id IN (SELECT id FROM order_items WHERE order_id=?)', [o.id]);
  const [history] = await db.query('SELECT status, created_at FROM order_status_history WHERE order_id=? ORDER BY id', [o.id]);
  const full = { ...o, items: items.map((i) => ({ ...i, options: opts.filter((x) => x.order_item_id === i.id) })) };
  return {
    number: o.number, status: o.status, type: o.type, created_at: o.created_at,
    items: full.items.map((i) => ({ name: i.name, quantity: i.quantity, unit_price: i.unit_price, notes: i.notes, options: i.options.map((x) => ({ name: x.name, price_delta: x.price_delta })) })),
    subtotal: o.subtotal, delivery_fee: o.delivery_fee, discount: o.discount, total: o.total,
    address: o.address, neighborhood: o.neighborhood, payment_method: o.payment_method, change_for: o.change_for, notes: o.notes,
    history, store: { name: o.store_name, slug: o.store_slug, whatsapp: o.store_whatsapp, est_delivery_minutes: o.est_delivery_minutes },
    // Enquanto a loja não confirmou, o cliente pode reenviar a mensagem pelo WhatsApp.
    whatsappUrl: o.status === 'aguardando' ? waUrl({ whatsapp: o.store_whatsapp }, full) : null,
  };
}
module.exports = { getByToken };
