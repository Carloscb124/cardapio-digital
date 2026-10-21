const slug = location.pathname.split('/').filter(Boolean)[1] || '';
const KEY = 'cart:' + slug;
let menu, cart = [], current, coupon = { code: '', discount: 0 }, done = null, customer = null;
const hook = (name, ...args) => (typeof window[name] === 'function' ? window[name](...args) : '');
const DAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

try { const c = JSON.parse(localStorage.getItem(KEY)); if (Array.isArray(c)) cart = c.filter((i) => i && i.qty > 0 && Number.isFinite(i.unit)); } catch { /* sem armazenamento */ }
const saveCart = () => { try { localStorage.setItem(KEY, JSON.stringify(cart)); } catch { /* ignore */ } };
const lineTotal = (i) => (i.unit + i.options.reduce((s, o) => s + o.price_delta, 0)) * i.qty;
const subtotal = () => cart.reduce((s, i) => s + lineTotal(i), 0);
const allProducts = () => menu.categories.flatMap((c) => c.products);

function hoursText(h) {
  if (!h) return '';
  const d = h[new Date().getDay()];
  return d.closed ? 'Hoje: fechado' : `Hoje: ${d.open} às ${d.close}`;
}

function renderHead() {
  const e = menu.establishment;
  document.title = e.name;
  if (e.cover_url) $('#hero').style.backgroundImage = `url("${encodeURI(e.cover_url)}")`;
  const info = [e.est_delivery_minutes ? `Entrega ~${e.est_delivery_minutes} min` : '', e.min_order ? `Mínimo ${money(e.min_order)}` : '', hoursText(e.hours)].filter(Boolean).join(' · ');
  $('#head').innerHTML = `${e.logo_url ? `<img class="shop-logo" src="${esc(e.logo_url)}" alt="">` : '<div class="shop-logo"><i class="bi bi-shop"></i></div>'}
    <div class="flex-grow-1"><h1 class="h5 mb-1">${esc(e.name)}</h1>
    <span class="badge ${e.accepting ? 'bg-success' : 'bg-secondary'}">${e.paused ? 'Pedidos pausados' : e.open ? 'Aberto' : 'Fechado'}</span>
    <div class="small text-muted mt-1">${esc(info)}</div>${e.address ? `<div class="small text-muted">${esc(e.address)}</div>` : ''}</div>`;
  $('#status').innerHTML = [e.description ? `<p class="text-muted small mb-2">${esc(e.description)}</p>` : '',
    !e.accepting ? `<div class="alert alert-warning py-2">${e.paused ? 'O estabelecimento pausou temporariamente os pedidos.' : 'Estamos fechados no momento.'} Você pode ver o cardápio, mas não é possível finalizar pedidos agora.</div>` : ''].join('');
}

function prodCard(p) {
  const price = p.promo_price != null ? `<span class="old">${money(p.price)}</span>${money(p.promo_price)}` : money(p.price);
  return `<div class="prod ${p.soldOut ? 'off' : ''}" data-p="${p.id}">
    <div class="flex-grow-1"><div class="name">${esc(p.name)}</div><div class="desc">${esc(p.description)}</div>
    <div class="price mt-1">${price} ${p.soldOut ? '<span class="badge bg-secondary">Esgotado</span>' : ''}</div></div>
    ${p.image_url ? `<img src="${esc(p.image_url)}" alt="" loading="lazy">` : ''}</div>`;
}

function renderList() {
  const q = $('#search').value.trim().toLowerCase();
  const match = (x) => !q || x.name.toLowerCase().includes(q) || (x.description || '').toLowerCase().includes(q);
  let html = '', chips = '';
  const combos = menu.combos.filter(match);
  if (combos.length) {
    chips += '<a class="chip" href="#sec-combos">Combos</a>';
    html += `<div class="sec-title" id="sec-combos">Combos</div>` + combos.map((c) => `<div class="prod" data-c="${c.id}">
      <div class="flex-grow-1"><div class="name">${esc(c.name)}</div><div class="desc">${esc(c.description)} ${esc(c.items.join(' + '))}</div><div class="price mt-1">${money(c.price)}</div></div>
      ${c.image_url ? `<img src="${esc(c.image_url)}" alt="" loading="lazy">` : ''}</div>`).join('');
  }
  for (const c of menu.categories) {
    const ps = c.products.filter(match);
    if (!ps.length) continue;
    chips += `<a class="chip" href="#sec-${c.id}">${esc(c.name)}</a>`;
    html += `<div class="sec-title" id="sec-${c.id}">${esc(c.name)}</div>` + ps.map(prodCard).join('');
  }
  $('#chips').innerHTML = chips;
  $('#list').innerHTML = html || '<div class="text-center text-muted py-5">Nenhum item encontrado.</div>';
}

function renderBar() {
  const n = cart.reduce((s, i) => s + i.qty, 0);
  $('#cartBar').classList.toggle('d-none', !n);
  $('#cartCount').textContent = n; $('#cartTotal').textContent = money(subtotal());
}

/* ---------- Produto ---------- */
function openProduct(p) {
  current = { p, qty: 1 };
  $('#pmTitle').textContent = p.name;
  const base = p.promo_price != null ? p.promo_price : p.price;
  $('#pmBody').innerHTML = `${p.image_url ? `<img src="${esc(p.image_url)}" class="img-fluid rounded mb-2" alt="">` : ''}<p class="text-muted">${esc(p.description)}</p>
    ${p.groups.map((g) => `<div class="mb-3" data-g="${g.id}" data-min="${g.min}" data-max="${g.max}"><div class="fw-semibold">${esc(g.name)} <small class="text-muted">${g.min ? 'obrigatório' : 'opcional'} · ${g.max === 1 ? 'escolha 1' : `até ${g.max}`}</small></div>
    ${g.options.map((o) => `<label class="opt"><span><input class="form-check-input me-2" type="checkbox" value="${o.id}" data-name="${esc(o.name)}" data-price="${o.price_delta}" ${o.soldOut ? 'disabled data-sold="1"' : ''}>${esc(o.name)} ${o.soldOut ? '<small class="text-muted">(esgotado)</small>' : ''}</span><span class="text-muted">${o.price_delta ? '+ ' + money(o.price_delta) : ''}</span></label>`).join('')}</div>`).join('')}
    <label class="form-label mt-2" for="pmNotes">Observações</label><input class="form-control" id="pmNotes" maxlength="255" placeholder="Ex.: sem cebola">`;
  const update = () => {
    let extra = 0, valid = true;
    $$('#pmBody [data-g]').forEach((g) => {
      const boxes = $$('input', g), on = boxes.filter((b) => b.checked), max = Number(g.dataset.max);
      on.forEach((b) => { extra += Number(b.dataset.price); });
      boxes.forEach((b) => { if (!b.dataset.sold) b.disabled = on.length >= max && !b.checked && max > 1; });
      if (on.length < Number(g.dataset.min)) valid = false;
    });
    $('#pmQty').textContent = current.qty;
    $('#pmAdd').textContent = `Adicionar ${money((base + extra) * current.qty)}`;
    $('#pmAdd').disabled = !valid;
  };
  $$('#pmBody [data-g]').forEach((g) => g.addEventListener('change', (e) => {
    if (Number(g.dataset.max) === 1 && e.target.checked) $$('input', g).forEach((b) => { if (b !== e.target) b.checked = false; });
    update();
  }));
  current.update = update; update();
  bootstrap.Modal.getOrCreateInstance($('#prodModal')).show();
}
$('#pmMinus').onclick = () => { if (current.qty > 1) { current.qty--; current.update(); } };
$('#pmPlus').onclick = () => { if (current.qty < 99) { current.qty++; current.update(); } };
$('#pmAdd').onclick = () => {
  const p = current.p;
  const options = $$('#pmBody input:checked').map((b) => ({ id: Number(b.value), name: b.dataset.name, price_delta: Number(b.dataset.price) }));
  addToCart({ kind: 'product', id: p.id, name: p.name, unit: p.promo_price != null ? p.promo_price : p.price, qty: current.qty, options, notes: $('#pmNotes').value.trim() });
  bootstrap.Modal.getInstance($('#prodModal')).hide();
};

function addToCart(item) {
  done = null; // novo item depois de um pedido concluído: volta a mostrar o carrinho, não a confirmação antiga
  const key = JSON.stringify([item.kind, item.id, item.options.map((o) => o.id).sort(), item.notes]);
  const ex = cart.find((i) => i.key === key);
  if (ex) ex.qty = Math.min(99, ex.qty + item.qty); else cart.push({ ...item, key });
  saveCart(); renderBar(); refreshCoupon(true);
}

$('#list').addEventListener('click', (e) => {
  const c = e.target.closest('[data-c]'), p = e.target.closest('[data-p]');
  if (c) { const cb = menu.combos.find((x) => x.id === Number(c.dataset.c)); addToCart({ kind: 'combo', id: cb.id, name: 'Combo: ' + cb.name, unit: cb.price, qty: 1, options: [], notes: '' }); }
  else if (p) { const pr = allProducts().find((x) => x.id === Number(p.dataset.p)); if (pr && !pr.soldOut) openProduct(pr); }
});
$('#search').addEventListener('input', renderList);

/* ---------- Carrinho / checkout ---------- */
let form = { type: '', neighborhood: '', address: '', name: '', phone: '', payment: '', change: '', notes: '', saveAddr: false, addrLabel: '' };
const sheet = () => bootstrap.Offcanvas.getOrCreateInstance($('#cartSheet'));
$('#openCart').onclick = () => { renderCart(); sheet().show(); };

function fee() {
  if (form.type !== 'entrega') return 0;
  const z = menu.zones.find((x) => x.neighborhood === form.neighborhood);
  return z ? z.fee : 0;
}
const total = () => Math.max(0, subtotal() + fee() - coupon.discount);

async function refreshCoupon(silent) {
  if (!coupon.code) return;
  try { coupon.discount = (await api(`/api/public/${slug}/coupon`, { method: 'POST', body: { code: coupon.code, subtotal: subtotal() } })).discount; }
  catch (e) { coupon = { code: '', discount: 0 }; if (!silent) alert(e.message); }
  if ($('#cartSheet').classList.contains('show')) renderCart();
}

function renderCart() {
  const e = menu.establishment;
  if (done) return renderDone();
  if (!cart.length) { $('#cartBody').innerHTML = '<div class="text-center text-muted py-5">Seu carrinho está vazio.</div>'; return; }
  const types = [e.delivery_enabled && ['entrega', 'Entrega'], e.pickup_enabled && ['retirada', 'Retirada']].filter(Boolean);
  if (!types.some((t) => t[0] === form.type)) form.type = types[0][0];
  const pays = [['pix', 'Pix'], ['dinheiro', 'Dinheiro'], ['cartao_credito', 'Cartão de crédito'], ['cartao_debito', 'Cartão de débito']];
  $('#cartBody').innerHTML = `
    ${cart.map((i, idx) => `<div class="d-flex justify-content-between border-bottom py-2"><div class="pe-2"><div class="fw-semibold">${esc(i.name)}</div>
      ${i.options.map((o) => `<div class="small text-muted">+ ${esc(o.name)}</div>`).join('')}${i.notes ? `<div class="small text-muted">Obs: ${esc(i.notes)}</div>` : ''}
      <div class="qty mt-1"><button type="button" data-m="${idx}">−</button><strong>${i.qty}</strong><button type="button" data-p="${idx}">+</button></div></div>
      <div class="text-end"><div class="price">${money(lineTotal(i))}</div><button type="button" class="btn btn-sm btn-link text-danger p-0" data-r="${idx}">remover</button></div></div>`).join('')}
    <div class="mt-3"><label class="form-label">Como deseja receber?</label><div class="btn-group w-100">${types.map((t) => `<input type="radio" class="btn-check" name="type" id="t_${t[0]}" value="${t[0]}" ${form.type === t[0] ? 'checked' : ''}><label class="btn btn-outline-success" for="t_${t[0]}">${t[1]}</label>`).join('')}</div></div>
    ${form.type === 'entrega' ? `<div class="mt-3">${hook('addressPicker')}${menu.zones.length ? `<label class="form-label" for="hood">Bairro</label><select class="form-select mb-2" id="hood"><option value="">Selecione...</option>${menu.zones.map((z) => `<option value="${esc(z.neighborhood)}" ${form.neighborhood === z.neighborhood ? 'selected' : ''}>${esc(z.neighborhood)} — ${money(z.fee)}</option>`).join('')}</select>` : ''}
      <label class="form-label" for="addr">Endereço (rua, número, complemento)</label><input class="form-control" id="addr" maxlength="255" value="${esc(form.address)}">${hook('saveAddressBox')}</div>` : (e.address ? `<div class="small text-muted mt-2">Retirar em: ${esc(e.address)}</div>` : '')}
    <div class="mt-3">${hook('guestHint')}</div>
    <div class="row g-2 mt-1"><div class="col-12"><label class="form-label" for="cname">Seu nome</label><input class="form-control" id="cname" maxlength="100" value="${esc(form.name)}"></div>
      <div class="col-12"><label class="form-label" for="cphone">Telefone com DDD</label><input class="form-control" id="cphone" type="tel" maxlength="20" value="${esc(form.phone)}"></div></div>
    <div class="mt-3"><label class="form-label" for="pay">Forma de pagamento</label><select class="form-select" id="pay"><option value="">Selecione...</option>${pays.map((p) => `<option value="${p[0]}" ${form.payment === p[0] ? 'selected' : ''}>${p[1]}</option>`).join('')}</select></div>
    ${form.payment === 'dinheiro' ? `<div class="mt-2"><label class="form-label" for="chg">Troco para quanto? (opcional)</label><input class="form-control" id="chg" inputmode="decimal" value="${esc(form.change)}" placeholder="Ex.: 100"></div>` : ''}
    <div class="mt-3"><label class="form-label" for="cup">Cupom de desconto</label><div class="input-group"><input class="form-control text-uppercase" id="cup" value="${esc(coupon.code)}"><button class="btn btn-outline-success" id="applyCup" type="button">Aplicar</button></div></div>
    <div class="mt-3"><label class="form-label" for="onotes">Observações do pedido</label><textarea class="form-control" id="onotes" rows="2" maxlength="500">${esc(form.notes)}</textarea></div>
    <div class="mt-3 border-top pt-3"><div class="d-flex justify-content-between"><span>Subtotal</span><span>${money(subtotal())}</span></div>
      ${form.type === 'entrega' ? `<div class="d-flex justify-content-between"><span>Entrega</span><span>${money(fee())}</span></div>` : ''}
      ${coupon.discount ? `<div class="d-flex justify-content-between text-success"><span>Desconto</span><span>− ${money(coupon.discount)}</span></div>` : ''}
      <div class="d-flex justify-content-between fs-5 fw-bold"><span>Total</span><span>${money(total())}</span></div></div>
    <div id="cartErr" class="alert alert-danger py-2 mt-3 d-none"></div>
    ${!e.accepting ? `<div class="alert alert-warning py-2 mt-3">${e.paused ? 'Pedidos pausados no momento.' : 'Estamos fechados no momento.'}</div>` : ''}
    <button class="btn btn-primary btn-lg w-100 mt-3" id="send" ${e.accepting ? '' : 'disabled'}>Registrar pedido</button>
    <p class="small text-muted mt-2">Ao registrar, seu pedido é salvo e você segue para o WhatsApp para enviá-lo ao estabelecimento.</p>`;
}

function readForm() {
  const g = (id) => ($(id) ? $(id).value : null);
  if ($('#addr')) form.address = g('#addr'); if ($('#hood')) form.neighborhood = g('#hood');
  if ($('#saveAddr')) form.saveAddr = $('#saveAddr').checked; form.addrLabel = g('#addrLabel') ?? form.addrLabel;
  form.name = g('#cname') ?? form.name; form.phone = g('#cphone') ?? form.phone;
  form.payment = g('#pay') ?? form.payment; if ($('#chg')) form.change = g('#chg'); form.notes = g('#onotes') ?? form.notes;
}

$('#cartBody').addEventListener('click', async (e) => {
  const t = e.target.closest('button'); if (!t) return;
  readForm();
  if (t.dataset.m !== undefined) { const i = cart[+t.dataset.m]; i.qty--; if (i.qty < 1) cart.splice(+t.dataset.m, 1); }
  else if (t.dataset.p !== undefined) { const i = cart[+t.dataset.p]; i.qty = Math.min(99, i.qty + 1); }
  else if (t.dataset.r !== undefined) cart.splice(+t.dataset.r, 1);
  else if (t.id === 'applyCup') { coupon = { code: $('#cup').value.trim().toUpperCase(), discount: 0 }; await refreshCoupon(false); renderCart(); return; }
  else if (t.id === 'send') return submit(t);
  else return;
  saveCart(); renderBar(); await refreshCoupon(true); renderCart();
});
$('#cartBody').addEventListener('change', (e) => {
  readForm();
  if (e.target.name === 'type') form.type = e.target.value;
  if (e.target.id === 'savedAddr') hook('pickSaved', e.target.value);
  if (['type', 'hood', 'pay', 'savedAddr', 'saveAddr'].includes(e.target.name || e.target.id)) renderCart();
});

async function submit(btn) {
  readForm();
  const err = $('#cartErr'); err.classList.add('d-none');
  btn.disabled = true; btn.textContent = 'Registrando...';
  try {
    const change = form.payment === 'dinheiro' && form.change ? Number(String(form.change).replace(',', '.')) : null;
    if (change !== null && !Number.isFinite(change)) throw new Error('Valor de troco inválido.');
    done = await api(`/api/public/${slug}/orders`, { method: 'POST', body: {
      customer_name: form.name, customer_phone: form.phone, type: form.type, address: form.address, neighborhood: form.neighborhood,
      payment_method: form.payment, change_for: change, notes: form.notes, coupon: coupon.code,
      items: cart.map((i) => ({ kind: i.kind, id: i.id, quantity: i.qty, options: i.options.map((o) => o.id), notes: i.notes })),
    } });
    hook('afterOrder', done, { ...form });
    cart = []; coupon = { code: '', discount: 0 }; saveCart(); renderBar(); renderDone();
  } catch (e) {
    err.textContent = e.message; err.classList.remove('d-none'); err.scrollIntoView({ block: 'center' });
    btn.disabled = false; btn.textContent = 'Registrar pedido';
  }
}

function renderDone() {
  $('#cartBody').innerHTML = `<div class="text-center py-4"><i class="bi bi-check-circle text-success" style="font-size:3rem"></i>
    <h2 class="h5 mt-2">Pedido #${done.number} registrado</h2><p class="mb-1">Total: <strong>${money(done.total)}</strong></p>
    ${done.pix ? pixHtml(done.pix, done.total) : ''}
    ${done.whatsappUrl ? `<div class="alert alert-warning text-start mt-3">Falta um passo: o estabelecimento só recebe seu pedido quando você <strong>enviar a mensagem pelo WhatsApp</strong>.</div>
      <a class="btn btn-success btn-lg w-100" href="${esc(done.whatsappUrl)}" target="_blank" rel="noopener"><i class="bi bi-whatsapp"></i> Abrir WhatsApp e enviar</a>`
    : `<div class="alert alert-warning text-start mt-3">Este estabelecimento ainda não configurou o WhatsApp. Entre em contato informando o número do pedido (#${done.number}).</div>`}
    <a class="btn btn-outline-success w-100 mt-2" href="${esc(done.trackUrl)}"><i class="bi bi-geo-alt"></i> Acompanhar pedido</a>
    <button class="btn btn-link mt-3" id="newOrder">Fazer outro pedido</button></div>`;
  $('#newOrder').onclick = () => { done = null; sheet().hide(); };
}

(async () => {
  try {
    menu = await api(`/api/public/${encodeURIComponent(slug)}/menu`);
  } catch (e) { $('#list').innerHTML = `<div class="alert alert-danger mt-4">${esc(e.message)}</div>`; $('#head').remove(); return; }
  cart = cart.filter((i) => (i.kind === 'combo' ? menu.combos.some((c) => c.id === i.id) : allProducts().some((p) => p.id === i.id)));
  renderHead(); renderList(); renderBar();
})();
