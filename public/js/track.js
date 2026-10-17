const token = location.pathname.split('/').filter(Boolean)[1] || '';
const LABEL = { aguardando: 'Pedido registrado', confirmado: 'Pedido confirmado', preparo: 'Em preparação', pronto: 'Pronto', saiu_entrega: 'Saiu para entrega', concluido: 'Concluído' };
const PATH = { entrega: ['aguardando', 'confirmado', 'preparo', 'pronto', 'saiu_entrega', 'concluido'], retirada: ['aguardando', 'confirmado', 'preparo', 'pronto', 'concluido'] };
const HEAD = {
  aguardando: 'Pedido registrado. Aguardando o estabelecimento confirmar.', confirmado: 'O estabelecimento confirmou seu pedido.', preparo: 'Seu pedido está sendo preparado.',
  pronto: (t) => (t === 'entrega' ? 'Seu pedido está pronto e logo sai para entrega.' : 'Seu pedido está pronto para retirada.'), saiu_entrega: 'Seu pedido saiu para entrega.', concluido: 'Pedido concluído. Bom apetite!', cancelado: 'Este pedido foi cancelado.',
};
const PAY = { dinheiro: 'Dinheiro', pix: 'Pix', cartao_credito: 'Cartão de crédito', cartao_debito: 'Cartão de débito' };
const hm = (s) => new Date(String(s).replace(' ', 'T')).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const day = (s) => new Date(String(s).replace(' ', 'T')).toLocaleDateString('pt-BR');
let timer = null;

function render(d) {
  const path = PATH[d.type], idx = path.indexOf(d.status), cancelled = d.status === 'cancelado', final = cancelled || d.status === 'concluido';
  const when = (st) => { const h = d.history.find((x) => x.status === st); return h ? hm(h.created_at) : ''; };
  const head = typeof HEAD[d.status] === 'function' ? HEAD[d.status](d.type) : HEAD[d.status];
  const wa = d.store.whatsapp ? 'https://wa.me/' + (d.store.whatsapp.length <= 11 ? '55' : '') + d.store.whatsapp : '';
  document.title = `Pedido #${d.number} — ${d.store.name}`;
  $('#app').innerHTML = `
    <a class="small" href="/m/${esc(d.store.slug)}"><i class="bi bi-chevron-left"></i> Voltar ao cardápio de ${esc(d.store.name)}</a>
    <h1 class="h4 mt-3 mb-1">Pedido #${d.number}</h1><div class="text-muted small mb-3">${day(d.created_at)} às ${hm(d.created_at)} · ${d.type === 'entrega' ? 'Entrega' : 'Retirada'}</div>
    <div class="status-box ${cancelled ? 'cancelled' : ''}" aria-live="polite"><div class="fs-5 fw-semibold">${esc(head)}</div>
      ${!final && d.type === 'entrega' && d.store.est_delivery_minutes ? `<div class="small mt-1">Tempo médio de entrega: cerca de ${d.store.est_delivery_minutes} min.</div>` : ''}</div>
    ${d.whatsappUrl ? `<div class="alert alert-warning mt-3 mb-0">Se você ainda não enviou o pedido pelo WhatsApp, o estabelecimento não o recebeu. <a class="btn btn-success btn-sm d-block mt-2" href="${esc(d.whatsappUrl)}" target="_blank" rel="noopener"><i class="bi bi-whatsapp"></i> Enviar pelo WhatsApp</a></div>` : ''}
    ${cancelled ? `<p class="mt-3 mb-0">Se tiver dúvidas, fale com o estabelecimento.</p>` : `<div class="panel mt-3"><ol class="tl mb-0">${path.map((st, i) => `<li class="${i < idx || (i === idx && final) ? 'done' : i === idx ? 'now' : ''}">${st === 'pronto' && d.type === 'retirada' ? 'Pronto para retirada' : LABEL[st]}${when(st) && i <= idx ? `<small>${when(st)}</small>` : ''}</li>`).join('')}</ol></div>`}
    <div class="panel mt-3"><h2 class="h6">Resumo</h2>
      ${d.items.map((i) => `<div class="d-flex justify-content-between py-1"><div>${i.quantity}x ${esc(i.name)}${i.options.map((o) => `<div class="small text-muted">+ ${esc(o.name)}</div>`).join('')}${i.notes ? `<div class="small text-muted">Obs: ${esc(i.notes)}</div>` : ''}</div><div>${money(i.unit_price * i.quantity)}</div></div>`).join('')}
      <hr class="my-2"><div class="d-flex justify-content-between"><span>Subtotal</span><span>${money(d.subtotal)}</span></div>
      ${d.delivery_fee ? `<div class="d-flex justify-content-between"><span>Entrega</span><span>${money(d.delivery_fee)}</span></div>` : ''}
      ${d.discount ? `<div class="d-flex justify-content-between text-success"><span>Desconto</span><span>− ${money(d.discount)}</span></div>` : ''}
      <div class="d-flex justify-content-between fw-bold fs-5"><span>Total</span><span>${money(d.total)}</span></div>
      <div class="small text-muted mt-2">Pagamento: ${esc(PAY[d.payment_method] || d.payment_method)}${d.change_for ? ` · troco para ${money(d.change_for)}` : ''}</div>
      ${d.type === 'entrega' ? `<div class="small text-muted">Entrega em: ${esc(d.address)}${d.neighborhood ? ' — ' + esc(d.neighborhood) : ''}</div>` : ''}
      ${d.notes ? `<div class="small text-muted">Observações: ${esc(d.notes)}</div>` : ''}</div>
    ${wa ? `<a class="btn btn-outline-success w-100 mt-3" href="${esc(wa)}" target="_blank" rel="noopener"><i class="bi bi-whatsapp"></i> Falar com o estabelecimento</a>` : ''}
    ${final ? '' : '<p class="small text-muted text-center mt-3 mb-0">Esta página atualiza sozinha.</p>'}`;
  clearTimeout(timer);
  if (!final) timer = setTimeout(load, 10000);
}

async function load() {
  try { render(await api('/api/public/track/' + encodeURIComponent(token))); }
  catch (e) { clearTimeout(timer); if (!$('#app .status-box')) $('#app').innerHTML = `<div class="alert alert-danger mt-4">${esc(e.message)}</div>`; else timer = setTimeout(load, 15000); }
}
load();
