/* Novo pedido pelo painel (balcão, telefone, WhatsApp). O servidor repete todas as validações de preço, opções e estoque. */
const PAYS = [['pix', 'Pix'], ['dinheiro', 'Dinheiro'], ['cartao_credito', 'Cartão de crédito'], ['cartao_debito', 'Cartão de débito']];

async function openNewOrder(prefill) {
  let data; try { data = await api('/api/orders/menu'); } catch (e) { return fail(e); }
  const est = data.establishment, zones = data.zones;
  const types = [est.delivery_enabled && ['entrega', 'Entrega'], est.pickup_enabled && ['retirada', 'Retirada / balcão']].filter(Boolean);
  const st = { cart: [], picking: null, coupon: { code: '', discount: 0 } };
  const el = document.createElement('div'); el.className = 'modal fade'; el.tabIndex = -1;
  el.innerHTML = `<div class="modal-dialog modal-xl modal-dialog-scrollable"><div class="modal-content">
    <div class="modal-header"><h5 class="modal-title">Novo pedido</h5><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button></div>
    <div class="modal-body"><div class="row g-4">
      <div class="col-lg-6"><input class="form-control mb-2" id="noSearch" placeholder="Buscar produto" autocomplete="off"><div id="noItems"></div></div>
      <div class="col-lg-6">
        <div class="mb-3"><label class="form-label" for="noSearchCust">Cliente</label><input class="form-control" id="noSearchCust" placeholder="Buscar cliente cadastrado (nome ou telefone)" autocomplete="off"><div class="list-group mt-1" id="noCustList"></div></div>
        <div class="row g-2 mb-3"><div class="col-7"><input class="form-control" id="noName" placeholder="Nome (vazio = Cliente balcão)" maxlength="100" aria-label="Nome do cliente"></div><div class="col-5"><input class="form-control" id="noPhone" placeholder="WhatsApp (opcional)" inputmode="numeric" maxlength="16" aria-label="WhatsApp do cliente"></div></div>
        <div class="btn-group w-100 mb-3">${types.map((t, i) => `<input type="radio" class="btn-check" name="noType" id="noT_${t[0]}" value="${t[0]}" ${i === 0 ? 'checked' : ''}><label class="btn btn-outline-success" for="noT_${t[0]}">${t[1]}</label>`).join('')}</div>
        <div id="noDelivery" class="mb-3">${zones.length ? `<select class="form-select mb-2" id="noHood" aria-label="Bairro"><option value="">Bairro...</option>${zones.map((z) => `<option value="${esc(z.neighborhood)}">${esc(z.neighborhood)} — ${money(z.fee)}</option>`).join('')}</select>` : ''}<input class="form-control" id="noAddr" placeholder="Endereço (rua, número, complemento)" maxlength="255" aria-label="Endereço de entrega"></div>
        <div class="row g-2 mb-3"><div class="col-6"><select class="form-select" id="noPay" aria-label="Forma de pagamento"><option value="">Pagamento...</option>${PAYS.map((p) => `<option value="${p[0]}">${p[1]}</option>`).join('')}</select></div><div class="col-6 d-none" id="noChangeBox"><input class="form-control" id="noChange" placeholder="Troco para (R$)" inputmode="decimal" aria-label="Troco para"></div></div>
        <div class="input-group mb-3"><input class="form-control text-uppercase" id="noCoupon" placeholder="Cupom (opcional)" aria-label="Cupom"><button class="btn btn-outline-success" id="noApply" type="button">Aplicar</button></div>
        <div class="row g-2 mb-3"><div class="col-5"><select class="form-select" id="noStatus" aria-label="Situação inicial"><option value="confirmado">Já confirmado</option><option value="aguardando">Aguardando confirmação</option></select></div><div class="col-7"><input class="form-control" id="noNotes" placeholder="Observações do pedido" maxlength="500" aria-label="Observações"></div></div>
        <h6>Itens do pedido</h6><div id="noCart"></div><div id="noSummary" class="mt-2"></div>
      </div></div></div>
    <div class="modal-footer"><div class="text-danger small me-auto" id="noErr" role="alert"></div><button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancelar</button><button type="button" class="btn btn-primary" id="noSave">Criar pedido</button></div></div></div>`;
  document.body.appendChild(el);
  const q = (s) => $(s, el), modal = new bootstrap.Modal(el); modal.show();
  el.addEventListener('hidden.bs.modal', () => { modal.dispose(); el.remove(); });

  const unitOf = (p) => (p.promo_price != null ? p.promo_price : p.price);
  const lineTotal = (i) => (i.unit + i.options.reduce((s, o) => s + o.price_delta, 0)) * i.qty;
  const subtotal = () => st.cart.reduce((s, i) => s + lineTotal(i), 0);
  const type = () => (q('input[name="noType"]:checked') || {}).value;
  const fee = () => { const z = type() === 'entrega' && q('#noHood') ? zones.find((x) => x.neighborhood === q('#noHood').value) : null; return z ? z.fee : 0; };
  const total = () => Math.max(0, subtotal() + fee() - st.coupon.discount);
  const err = (m) => { q('#noErr').textContent = m || ''; };

  function renderItems() {
    const f = q('#noSearch').value.trim().toLowerCase(), match = (x) => !f || x.name.toLowerCase().includes(f);
    const price = (p) => (p.promo_price != null ? `<s class="text-muted small">${money(p.price)}</s> ${money(p.promo_price)}` : money(p.price));
    const combos = data.combos.filter(match);
    q('#noItems').innerHTML = (combos.length ? `<div class="fw-semibold mt-2">Combos</div><div class="list-group">${combos.map((c) => `<button type="button" class="list-group-item list-group-item-action d-flex justify-content-between" data-c="${c.id}"><span>${esc(c.name)}</span><span>${money(c.price)}</span></button>`).join('')}</div>` : '')
      + data.categories.map((c) => { const ps = c.products.filter(match); return ps.length ? `<div class="fw-semibold mt-3">${esc(c.name)}</div><div class="list-group">${ps.map((p) => `<button type="button" class="list-group-item list-group-item-action d-flex justify-content-between ${p.soldOut ? 'disabled' : ''}" data-p="${p.id}"><span>${esc(p.name)}${p.soldOut ? ' (esgotado)' : ''}${p.groups.length ? ' <i class="bi bi-sliders text-muted" title="Tem opções"></i>' : ''}</span><span>${price(p)}</span></button>`).join('')}</div>` : ''; }).join('')
      || '<div class="text-muted">Nenhum produto encontrado. Cadastre produtos em Produtos.</div>';
  }

  function renderPicker() {
    const p = st.picking.p;
    q('#noItems').innerHTML = `<button type="button" class="btn btn-sm btn-link px-0" data-back><i class="bi bi-chevron-left"></i> Voltar aos produtos</button><h6>${esc(p.name)}</h6>
      ${p.groups.map((g) => `<div class="mb-3" data-g data-min="${g.min}" data-max="${g.max}"><div class="fw-semibold">${esc(g.name)} <small class="text-muted">${g.min ? 'obrigatório' : 'opcional'} · ${g.max === 1 ? 'escolha 1' : `até ${g.max}`}</small></div>${g.options.map((o) => `<label class="opt"><span><input class="form-check-input me-2" type="checkbox" value="${o.id}" data-name="${esc(o.name)}" data-price="${o.price_delta}" ${o.soldOut ? 'disabled data-sold="1"' : ''}>${esc(o.name)}${o.soldOut ? ' (esgotado)' : ''}</span><span class="text-muted">${o.price_delta ? '+ ' + money(o.price_delta) : ''}</span></label>`).join('')}</div>`).join('')}
      <input class="form-control mb-3" id="noPickNotes" maxlength="255" placeholder="Observação do item (ex.: sem cebola)" aria-label="Observação do item">
      <div class="d-flex align-items-center gap-3"><div class="qty"><button type="button" id="noPickMinus">−</button><strong id="noPickQty">1</strong><button type="button" id="noPickPlus">+</button></div><button type="button" class="btn btn-primary flex-grow-1" id="noPickAdd" disabled></button></div>`;
    updatePicker();
  }
  function updatePicker() {
    const p = st.picking.p; let extra = 0, valid = true;
    $$('[data-g]', el).forEach((g) => {
      const boxes = $$('input', g), on = boxes.filter((b) => b.checked), max = Number(g.dataset.max);
      on.forEach((b) => { extra += Number(b.dataset.price); });
      boxes.forEach((b) => { if (!b.dataset.sold) b.disabled = on.length >= max && !b.checked && max > 1; });
      if (on.length < Number(g.dataset.min)) valid = false;
    });
    q('#noPickQty').textContent = st.picking.qty;
    q('#noPickAdd').textContent = `Adicionar ${money((unitOf(p) + extra) * st.picking.qty)}`; q('#noPickAdd').disabled = !valid;
  }

  function addLine(l) {
    const key = JSON.stringify([l.kind, l.id, l.options.map((o) => o.id).sort(), l.notes || '']);
    const ex = st.cart.find((i) => i.key === key);
    if (ex) ex.qty = Math.min(99, ex.qty + l.qty); else st.cart.push({ ...l, key });
    renderCart(); refreshCoupon(true);
  }

  function renderCart() {
    q('#noCart').innerHTML = st.cart.length ? st.cart.map((i, n) => `<div class="d-flex justify-content-between border-bottom py-2"><div class="pe-2"><div class="fw-semibold">${esc(i.name)}</div>${i.options.map((o) => `<div class="small text-muted">+ ${esc(o.name)}</div>`).join('')}${i.notes ? `<div class="small text-muted">Obs: ${esc(i.notes)}</div>` : ''}<div class="qty mt-1"><button type="button" data-m="${n}" aria-label="Diminuir">−</button><strong>${i.qty}</strong><button type="button" data-p2="${n}" aria-label="Aumentar">+</button></div></div><div class="text-end"><div>${money(lineTotal(i))}</div><button type="button" class="btn btn-sm btn-link text-danger p-0" data-r="${n}">remover</button></div></div>`).join('') : '<div class="text-muted small">Nenhum item ainda. Toque em um produto à esquerda.</div>';
    q('#noSummary').innerHTML = `<div class="d-flex justify-content-between"><span>Subtotal</span><span>${money(subtotal())}</span></div>${fee() ? `<div class="d-flex justify-content-between"><span>Entrega</span><span>${money(fee())}</span></div>` : ''}${st.coupon.discount ? `<div class="d-flex justify-content-between text-success"><span>Desconto</span><span>− ${money(st.coupon.discount)}</span></div>` : ''}<div class="d-flex justify-content-between fw-bold fs-5"><span>Total</span><span id="noTotal">${money(total())}</span></div>`;
  }

  async function refreshCoupon(silent) {
    if (!st.coupon.code) return;
    try { st.coupon.discount = (await api('/api/orders/coupon-preview', { method: 'POST', body: { code: st.coupon.code, subtotal: subtotal() } })).discount; }
    catch (e) { st.coupon = { code: '', discount: 0 }; if (!silent) err(e.message); }
    renderCart();
  }

  function pickCustomer(c) {
    q('#noName').value = c.name; q('#noPhone').value = maskPhone(c.phone);
    if (c.address && types.some((t) => t[0] === 'entrega')) { q('#noT_entrega').checked = true; q('#noAddr').value = c.address; if (q('#noHood') && zones.some((z) => z.neighborhood === c.neighborhood)) q('#noHood').value = c.neighborhood; }
    q('#noCustList').innerHTML = ''; q('#noSearchCust').value = ''; syncType(); renderCart();
  }
  function syncType() { q('#noDelivery').classList.toggle('d-none', type() !== 'entrega'); }

  let custRows = [], timer;
  q('#noSearchCust').addEventListener('input', () => {
    clearTimeout(timer); const v = q('#noSearchCust').value.trim();
    if (v.length < 2) { q('#noCustList').innerHTML = ''; return; }
    timer = setTimeout(async () => {
      try {
        custRows = (await api('/api/customers?q=' + encodeURIComponent(v))).slice(0, 6);
        q('#noCustList').innerHTML = custRows.map((c, i) => `<button type="button" class="list-group-item list-group-item-action" data-cust="${i}"><strong>${esc(c.name)}</strong> <span class="text-muted small">${esc(maskPhone(c.phone))}${c.address ? ' · ' + esc(c.address) : ''}</span></button>`).join('') || '<div class="list-group-item text-muted small">Nenhum cliente encontrado. Preencha nome e WhatsApp para cadastrar junto com o pedido.</div>';
      } catch (e) { fail(e); }
    }, 300);
  });
  q('#noSearch').addEventListener('input', () => { if (!st.picking) renderItems(); });
  q('#noPhone').addEventListener('input', () => { q('#noPhone').value = maskPhone(q('#noPhone').value); });
  el.addEventListener('change', (e) => {
    if (e.target.name === 'noType') { syncType(); renderCart(); }
    else if (e.target.id === 'noHood') renderCart();
    else if (e.target.id === 'noPay') q('#noChangeBox').classList.toggle('d-none', e.target.value !== 'dinheiro');
    else if (e.target.closest('[data-g]')) {
      const g = e.target.closest('[data-g]');
      if (Number(g.dataset.max) === 1 && e.target.checked) $$('input', g).forEach((b) => { if (b !== e.target) b.checked = false; });
      updatePicker();
    }
  });
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.cust !== undefined) pickCustomer(custRows[+b.dataset.cust]);
    else if (b.dataset.p) {
      const p = data.categories.flatMap((c) => c.products).find((x) => x.id === Number(b.dataset.p));
      if (!p || p.soldOut) return;
      if (!p.groups.length) addLine({ kind: 'product', id: p.id, name: p.name, unit: unitOf(p), qty: 1, options: [], notes: '' });
      else { st.picking = { p, qty: 1 }; q('#noSearch').classList.add('d-none'); renderPicker(); }
    } else if (b.dataset.c) { const c = data.combos.find((x) => x.id === Number(b.dataset.c)); addLine({ kind: 'combo', id: c.id, name: 'Combo: ' + c.name, unit: c.price, qty: 1, options: [], notes: '' }); }
    else if (b.dataset.back !== undefined) { st.picking = null; q('#noSearch').classList.remove('d-none'); renderItems(); }
    else if (b.id === 'noPickMinus') { if (st.picking.qty > 1) { st.picking.qty--; updatePicker(); } }
    else if (b.id === 'noPickPlus') { if (st.picking.qty < 99) { st.picking.qty++; updatePicker(); } }
    else if (b.id === 'noPickAdd') {
      const p = st.picking.p;
      addLine({ kind: 'product', id: p.id, name: p.name, unit: unitOf(p), qty: st.picking.qty, options: $$('[data-g] input:checked', el).map((x) => ({ id: Number(x.value), name: x.dataset.name, price_delta: Number(x.dataset.price) })), notes: q('#noPickNotes').value.trim() });
      st.picking = null; q('#noSearch').classList.remove('d-none'); renderItems();
    } else if (b.dataset.m !== undefined) { const i = st.cart[+b.dataset.m]; if (--i.qty < 1) st.cart.splice(+b.dataset.m, 1); renderCart(); refreshCoupon(true); }
    else if (b.dataset.p2 !== undefined) { const i = st.cart[+b.dataset.p2]; i.qty = Math.min(99, i.qty + 1); renderCart(); refreshCoupon(true); }
    else if (b.dataset.r !== undefined) { st.cart.splice(+b.dataset.r, 1); renderCart(); refreshCoupon(true); }
    else if (b.id === 'noApply') { err(''); st.coupon = { code: q('#noCoupon').value.trim().toUpperCase(), discount: 0 }; if (!st.cart.length) return err('Adicione itens antes de aplicar o cupom.'); await refreshCoupon(false); }
    else if (b.id === 'noSave') save(b);
  });

  async function save(btn) {
    err('');
    if (!st.cart.length) return err('Adicione pelo menos um item ao pedido.');
    const t = type(), phone = phoneDigits(q('#noPhone').value), pay = q('#noPay').value;
    if (phone && !phoneOk(phone)) return err('WhatsApp inválido. Use DDD e número, ex.: (11) 99999-8888.');
    if (t === 'entrega') {
      if (zones.length && !q('#noHood').value) return err('Escolha o bairro da entrega.');
      if (q('#noAddr').value.trim().length < 5) return err('Informe o endereço de entrega.');
    }
    if (!pay) return err('Escolha a forma de pagamento.');
    const change = pay === 'dinheiro' && q('#noChange').value.trim() ? Number(q('#noChange').value.replace(',', '.')) : null;
    if (change !== null && !Number.isFinite(change)) return err('Valor de troco inválido.');
    btn.disabled = true;
    try {
      const r = await api('/api/orders', { method: 'POST', body: {
        customer_name: q('#noName').value, customer_phone: phone, type: t, address: t === 'entrega' ? q('#noAddr').value : null, neighborhood: t === 'entrega' && q('#noHood') ? q('#noHood').value : null,
        payment_method: pay, change_for: change, notes: q('#noNotes').value, coupon: st.coupon.code, status: q('#noStatus').value,
        items: st.cart.map((i) => ({ kind: i.kind, id: i.id, quantity: i.qty, options: i.options.map((o) => o.id), notes: i.notes })) } });
      modal.hide(); window.dispatchEvent(new Event('orders-changed')); toast(`Pedido #${r.number} criado.`);
      const link = location.origin + r.trackUrl;
      const wa = phone ? `https://wa.me/${phone.length <= 11 ? '55' : ''}${phone}?text=${encodeURIComponent(`Olá! Seu pedido #${r.number} foi registrado. Acompanhe por aqui: ${link}`)}` : '';
      const m = infoModal(`Pedido #${r.number} criado`, `<p class="mb-1">Total: <strong>${money(r.total)}</strong></p><p class="text-muted small">Ele já aparece em Pedidos. Compartilhe o acompanhamento com o cliente ou imprima a comanda.</p>
        ${r.pix ? pixHtml(r.pix, r.total, { title: 'Cobrar com Pix', note: 'Mostre o QR Code ao cliente ou copie o código. Confira o recebimento no app do seu banco: o sistema não confirma o pagamento sozinho.' }) : ''}
        <div class="d-grid gap-2"><a class="btn btn-outline-secondary" target="_blank" rel="noopener" href="/print/${r.id}"><i class="bi bi-printer"></i> Abrir comanda</a>${wa ? `<a class="btn btn-outline-success" target="_blank" rel="noopener" href="${esc(wa)}"><i class="bi bi-whatsapp"></i> Enviar acompanhamento pelo WhatsApp</a>` : ''}<button class="btn btn-outline-secondary" data-copy="${esc(link)}"><i class="bi bi-link-45deg"></i> Copiar link de acompanhamento</button></div>`);
      m.addEventListener('click', async (ev) => { const c = ev.target.closest('[data-copy]'); if (c) { try { await navigator.clipboard.writeText(c.dataset.copy); toast('Link copiado.'); } catch { toast('Copie o link manualmente.', 'warning'); } } });
    } catch (e) { err(e.message); btn.disabled = false; if (e.status === 401) location.href = '/login.html'; }
  }

  renderItems(); renderCart(); syncType();
  if (prefill) pickCustomer(prefill);
}
