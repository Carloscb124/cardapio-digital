// Monta a comanda como dados estruturados + texto de 32 colunas.
// Um futuro serviço local de impressão pode consumir GET /api/orders/:id/ticket (JSON) e enviar à impressora.
const brl = (n) => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const PAY = { dinheiro: 'Dinheiro', pix: 'Pix', cartao_credito: 'Cartão de crédito', cartao_debito: 'Cartão de débito' };
const W = 32;
const line = (l, r) => {
  if (r === undefined) return l;
  if (l.length + r.length + 1 > W) return l + '\n' + ' '.repeat(Math.max(0, W - r.length)) + r;
  return l + ' '.repeat(W - l.length - r.length) + r;
};

function build(order, establishmentName) {
  const t = [establishmentName.toUpperCase(), `PEDIDO #${order.number}`, new Date(String(order.created_at).replace(' ', 'T')).toLocaleString('pt-BR'), '-'.repeat(W)];
  for (const it of order.items) {
    t.push(line(`${it.quantity}x ${it.name}`, brl(it.unit_price * it.quantity)));
    for (const o of it.options) t.push(`   + ${o.name}${o.price_delta ? ' (' + brl(o.price_delta) + ')' : ''}`);
    if (it.notes) t.push(`   Obs: ${it.notes}`);
  }
  t.push('-'.repeat(W), line('Subtotal', brl(order.subtotal)));
  if (order.delivery_fee) t.push(line('Entrega', brl(order.delivery_fee)));
  if (order.discount) t.push(line('Desconto', '-' + brl(order.discount)));
  t.push(line('TOTAL', brl(order.total)), '-'.repeat(W));
  t.push(`Cliente: ${order.customer_name}`, `Tel: ${order.customer_phone}`);
  t.push(order.type === 'entrega' ? `ENTREGA: ${order.address}${order.neighborhood ? ' - ' + order.neighborhood : ''}` : 'RETIRADA NO LOCAL');
  t.push(`Pagamento: ${PAY[order.payment_method] || order.payment_method}`);
  if (order.change_for) t.push(`Troco para: ${brl(order.change_for)}`);
  if (order.notes) t.push(`Obs: ${order.notes}`);
  return { establishment: establishmentName, order, text: t.join('\n') };
}
module.exports = { build, brl, PAY };
