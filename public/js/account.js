/* Conta do cliente no cardápio: login por WhatsApp, histórico, endereços salvos e "pedir de novo". */
const CAPI = `/api/customer/${slug}`, LKEY = 'orders:' + slug;
const BADGE = { aguardando: ['Aguardando confirmação', 'warning text-dark'], confirmado: ['Confirmado', 'info text-dark'], preparo: ['Em preparação', 'primary'], pronto: ['Pronto', 'success'], saiu_entrega: ['Saiu para entrega', 'secondary'], concluido: ['Concluído', 'success'], cancelado: ['Cancelado', 'danger'] };
const dtl = (s) => new Date(String(s).replace(' ', 'T')).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
let acctTab = 'login', resetToken = new URLSearchParams(location.search).get('reset');
const acctModal = () => bootstrap.Modal.getOrCreateInstance($('#acctModal'));

const localOrders = () => { try { const l = JSON.parse(localStorage.getItem(LKEY)); return Array.isArray(l) ? l : []; } catch { return []; } };

async function refreshMe() {
  try { customer = await api(CAPI + '/me'); } catch { customer = null; }
  $('#acctLabel').textContent = customer ? 'Olá, ' + customer.name.split(' ')[0] : 'Entrar';
  if (customer) { if (!form.name) form.name = customer.name; if (!form.phone) form.phone = maskPhone(customer.phone); }
}

/* ---- Ganchos usados pelo carrinho (menu.js) ---- */
function guestHint() {
  if (customer) return `<div class="small text-success"><i class="bi bi-person-check"></i> Você entrou como ${esc(customer.name)}. Este pedido ficará no seu histórico.</div>`;
  return '<div class="alert alert-light border small py-2 mb-0">Tem conta? <a href="#" data-acct="login">Entre</a> para preencher mais rápido e ver seus pedidos, ou <a href="#" data-acct="register">crie uma conta</a>.</div>';
}
function addressPicker() {
  if (!customer || !customer.addresses.length) return '';
  return `<label class="form-label" for="savedAddr">Meus endereços</label><select class="form-select mb-2" id="savedAddr"><option value="">Usar outro endereço</option>${customer.addresses.map((a) => `<option value="${a.id}" ${a.address === form.address ? 'selected' : ''}>${esc(a.label)} — ${esc(a.address)}</option>`).join('')}</select>`;
}
function saveAddressBox() {
  if (!customer || customer.addresses.length >= 5 || customer.addresses.some((a) => a.address === form.address)) return '';
  return `<div class="form-check mt-2"><input class="form-check-input" type="checkbox" id="saveAddr" ${form.saveAddr ? 'checked' : ''}><label class="form-check-label" for="saveAddr">Salvar este endereço na minha conta</label></div>${form.saveAddr ? `<input class="form-control form-control-sm mt-2" id="addrLabel" maxlength="30" placeholder="Apelido (ex.: Casa)" value="${esc(form.addrLabel)}">` : ''}`;
}
function pickSaved(id) { const a = customer.addresses.find((x) => String(x.id) === id); if (a) { form.address = a.address; form.neighborhood = a.neighborhood || ''; } }
async function afterOrder(order, f) {
  try { localStorage.setItem(LKEY, JSON.stringify([{ number: order.number, token: order.token, total: order.total, at: new Date().toISOString() }, ...localOrders()].slice(0, 10))); } catch { /* sem armazenamento */ }
  if (customer && f.saveAddr && f.type === 'entrega' && f.address) {
    try { await api(CAPI + '/addresses', { method: 'POST', body: { label: f.addrLabel || 'Casa', address: f.address, neighborhood: f.neighborhood } }); await refreshMe(); } catch { /* o pedido já foi feito; o endereço pode ser salvo depois */ }
  }
}

/* ---- Janela "Minha conta" ---- */
const field = (id, label, extra = '') => `<div class="mb-3"><label class="form-label" for="${id}">${label}</label><input class="form-control" id="${id}" data-f="${extra.f || id}" ${extra.attrs || ''}><div class="invalid-feedback"></div></div>`;
const PHONE = 'inputmode="numeric" autocomplete="tel-national" placeholder="(11) 99999-8888" maxlength="16"';
const errBox = '<div class="alert alert-danger py-2 d-none" id="acctErr" role="alert"></div>';

function guestView() {
  const local = localOrders();
  return `${resetToken ? '' : `<ul class="nav nav-pills mb-3"><li class="nav-item"><button class="nav-link ${acctTab === 'login' ? 'active' : ''}" data-tab="login">Entrar</button></li><li class="nav-item"><button class="nav-link ${acctTab === 'register' ? 'active' : ''}" data-tab="register">Criar conta</button></li></ul>`}
    ${resetToken ? `<form id="fReset" novalidate><p class="text-muted small">Defina uma nova senha para sua conta.</p>${field('rsPass', 'Nova senha', { f: 'password', attrs: 'type="password" autocomplete="new-password"' })}${field('rsConfirm', 'Repita a senha', { f: 'confirm', attrs: 'type="password" autocomplete="new-password"' })}${errBox}<button class="btn btn-primary w-100">Salvar nova senha</button></form>`
    : acctTab === 'login' ? `<form id="fLogin" novalidate>${field('lgPhone', 'WhatsApp', { f: 'phone', attrs: `type="tel" ${PHONE}` })}${field('lgPass', 'Senha', { f: 'password', attrs: 'type="password" autocomplete="current-password"' })}${errBox}<button class="btn btn-primary w-100">Entrar</button><p class="small text-muted mt-3 mb-0">Esqueceu a senha? Peça ao estabelecimento um link para criar uma nova.</p></form>`
    : `<form id="fRegister" novalidate><p class="text-muted small">Sua conta vale para este estabelecimento. Você vê seus pedidos, salva endereços e pede de novo em um toque.</p>${field('rgName', 'Seu nome', { f: 'name', attrs: 'autocomplete="name" maxlength="100"' })}${field('rgPhone', 'WhatsApp', { f: 'phone', attrs: `type="tel" ${PHONE}` })}${field('rgPass', 'Senha (mín. 6 caracteres)', { f: 'password', attrs: 'type="password" autocomplete="new-password"' })}${field('rgConfirm', 'Repita a senha', { f: 'confirm', attrs: 'type="password" autocomplete="new-password"' })}${errBox}<button class="btn btn-primary w-100">Criar conta</button></form>`}
    ${local.length && !resetToken ? `<h6 class="mt-4">Pedidos feitos neste aparelho</h6>${local.map((o) => `<div class="d-flex justify-content-between align-items-center border-bottom py-2"><span>Pedido #${o.number} <small class="text-muted">${dtl(o.at)} · ${money(o.total)}</small></span><a class="btn btn-sm btn-outline-success" href="/pedido/${esc(o.token)}">Acompanhar</a></div>`).join('')}` : ''}`;
}

function accountView() {
  const zones = menu ? menu.zones : [];
  return `<div class="d-flex justify-content-between align-items-center mb-3"><div><strong>${esc(customer.name)}</strong><div class="small text-muted">${esc(maskPhone(customer.phone))}</div></div><button class="btn btn-sm btn-outline-secondary" id="logoutBtn">Sair</button></div>
    <h6>Meus pedidos</h6><div id="histBox" class="mb-4">Carregando...</div>
    <h6>Endereços salvos</h6>
    ${customer.addresses.length ? customer.addresses.map((a) => `<div class="d-flex justify-content-between align-items-center border-bottom py-2"><div><strong>${esc(a.label)}</strong><div class="small text-muted">${esc(a.address)}${a.neighborhood ? ' — ' + esc(a.neighborhood) : ''}</div></div><button class="btn btn-sm btn-outline-danger" data-deladdr="${a.id}" aria-label="Remover endereço ${esc(a.label)}"><i class="bi bi-trash"></i></button></div>`).join('') : '<div class="text-muted small mb-2">Nenhum endereço salvo.</div>'}
    <form id="fAddr" class="mt-3" novalidate><div class="row g-2"><div class="col-5">${field('adLabel', 'Apelido', { f: 'label', attrs: 'maxlength="30" placeholder="Casa"' })}</div>
      <div class="col-7"><div class="mb-3"><label class="form-label" for="adHood">Bairro</label>${zones.length ? `<select class="form-select" id="adHood" data-f="neighborhood"><option value="">Selecione</option>${zones.map((z) => `<option>${esc(z.neighborhood)}</option>`).join('')}</select>` : '<input class="form-control" id="adHood" data-f="neighborhood" maxlength="100">'}<div class="invalid-feedback"></div></div></div></div>
      ${field('adAddr', 'Endereço (rua, número, complemento)', { f: 'address', attrs: 'maxlength="255"' })}${errBox}<button class="btn btn-outline-success btn-sm">Salvar endereço</button></form>
    <details class="mt-4"><summary class="fw-semibold">Alterar senha</summary><form id="fPass" class="mt-3" novalidate>${field('pwCur', 'Senha atual', { f: 'current', attrs: 'type="password" autocomplete="current-password"' })}${field('pwNew', 'Nova senha', { f: 'password', attrs: 'type="password" autocomplete="new-password"' })}${field('pwConf', 'Repita a nova senha', { f: 'confirm', attrs: 'type="password" autocomplete="new-password"' })}${errBox}<button class="btn btn-outline-secondary btn-sm">Alterar senha</button></form></details>`;
}

async function loadHistory() {
  const box = $('#histBox'); if (!box) return;
  try {
    const rows = await api(CAPI + '/orders');
    box.innerHTML = rows.length ? rows.map((o) => `<div class="border rounded p-2 mb-2"><div class="d-flex justify-content-between"><strong>Pedido #${o.number}</strong><span class="badge bg-${BADGE[o.status][1]}">${BADGE[o.status][0]}</span></div><div class="small text-muted">${dtl(o.created_at)} · ${money(o.total)}</div><div class="mt-2 d-flex gap-2"><a class="btn btn-sm btn-outline-success" href="/pedido/${esc(o.tracking_token)}">Acompanhar</a><button class="btn btn-sm btn-primary" data-reorder="${o.id}">Pedir de novo</button></div></div>`).join('')
      : '<div class="text-muted small">Você ainda não tem pedidos nesta conta. Os próximos pedidos aparecerão aqui.</div>';
  } catch (e) { box.textContent = e.message; }
}

function showAccount(tab) {
  if (tab) acctTab = tab;
  $('#acctTitle').textContent = resetToken ? 'Nova senha' : customer ? 'Minha conta' : acctTab === 'register' ? 'Criar conta' : 'Entrar';
  $('#acctBody').innerHTML = customer ? accountView() : guestView();
  if (customer) loadHistory();
  acctModal().show();
}

function clearErrs(f) { $$('.is-invalid', f).forEach((i) => i.classList.remove('is-invalid')); const e = $('#acctErr', f); if (e) e.classList.add('d-none'); }
function showErr(f, err) {
  const input = err.field && $(`[data-f="${err.field}"]`, f);
  if (input) { input.classList.add('is-invalid'); input.nextElementSibling.textContent = err.message; input.focus(); }
  else { const e = $('#acctErr', f); e.textContent = err.message; e.classList.remove('d-none'); }
}
const val = (f, k) => ($(`[data-f="${k}"]`, f) || {}).value || '';

$('#acctBody').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target; clearErrs(f);
  const bad = (field, message) => { showErr(f, { field, message }); };
  try {
    if (f.id === 'fLogin' || f.id === 'fRegister') {
      const phone = phoneDigits(val(f, 'phone'));
      if (f.id === 'fRegister' && val(f, 'name').trim().length < 2) return bad('name', 'Informe seu nome.');
      if (!phoneOk(phone)) return bad('phone', 'WhatsApp inválido. Use DDD e número, ex.: (11) 99999-8888.');
      if (f.id === 'fLogin' && !val(f, 'password')) return bad('password', 'Informe sua senha.');
      if (f.id === 'fRegister') {
        if (val(f, 'password').length < 6) return bad('password', 'A senha precisa ter pelo menos 6 caracteres.');
        if (val(f, 'confirm') !== val(f, 'password')) return bad('confirm', 'As senhas não conferem.');
      }
      const body = f.id === 'fLogin' ? { phone, password: val(f, 'password') } : { name: val(f, 'name'), phone, password: val(f, 'password'), confirm: val(f, 'confirm') };
      await api(CAPI + (f.id === 'fLogin' ? '/login' : '/register'), { method: 'POST', body });
      resetCsrf(); await refreshMe(); showAccount(); if ($('#cartSheet').classList.contains('show')) renderCart();
    } else if (f.id === 'fReset') {
      if (val(f, 'confirm') !== val(f, 'password')) return bad('confirm', 'As senhas não conferem.');
      await api(CAPI + '/reset', { method: 'POST', body: { token: resetToken, password: val(f, 'password') } });
      resetToken = null; history.replaceState(null, '', location.pathname); acctTab = 'login'; showAccount();
      $('#acctBody').insertAdjacentHTML('afterbegin', '<div class="alert alert-success py-2">Senha definida. Agora é só entrar.</div>');
    } else if (f.id === 'fAddr') {
      await api(CAPI + '/addresses', { method: 'POST', body: { label: val(f, 'label'), address: val(f, 'address'), neighborhood: val(f, 'neighborhood') } });
      await refreshMe(); showAccount();
    } else if (f.id === 'fPass') {
      if (val(f, 'confirm') !== val(f, 'password')) return bad('confirm', 'As senhas não conferem.');
      await api(CAPI + '/password', { method: 'POST', body: { current: val(f, 'current'), password: val(f, 'password'), confirm: val(f, 'confirm') } });
      f.reset(); const ok = $('#acctErr', f); ok.className = 'alert alert-success py-2'; ok.textContent = 'Senha alterada.';
    }
  } catch (err) { showErr(f, err); }
});

$('#acctBody').addEventListener('input', (e) => { if (e.target.type === 'tel') e.target.value = maskPhone(e.target.value); e.target.classList.remove('is-invalid'); });

$('#acctBody').addEventListener('click', async (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.tab) showAccount(b.dataset.tab);
  else if (b.id === 'logoutBtn') { await api(CAPI + '/logout', { method: 'POST' }); resetCsrf(); customer = null; await refreshMe(); showAccount('login'); if ($('#cartSheet').classList.contains('show')) renderCart(); }
  else if (b.dataset.deladdr) { try { await api(`${CAPI}/addresses/${b.dataset.deladdr}`, { method: 'DELETE' }); await refreshMe(); showAccount(); } catch (err) { alert(err.message); } }
  else if (b.dataset.reorder) {
    b.disabled = true;
    try {
      const r = await api(`${CAPI}/orders/${b.dataset.reorder}/reorder`, { method: 'POST' });
      r.lines.forEach((l) => addToCart(l));
      if (r.skipped) { $('#histBox').insertAdjacentHTML('afterbegin', `<div class="alert alert-warning py-2">${r.skipped} item(ns) deste pedido não estão mais disponíveis e não foram adicionados. <button class="btn btn-sm btn-success d-block mt-2" id="openCartNow">Ver carrinho</button></div>`); }
      else if (r.lines.length) { acctModal().hide(); renderCart(); sheet().show(); }
      else $('#histBox').insertAdjacentHTML('afterbegin', '<div class="alert alert-warning py-2">Os itens deste pedido não estão mais disponíveis.</div>');
    } catch (err) { alert(err.message); }
    b.disabled = false;
  } else if (b.id === 'openCartNow') { acctModal().hide(); renderCart(); sheet().show(); }
});

document.addEventListener('click', (e) => { const a = e.target.closest('[data-acct]'); if (a) { e.preventDefault(); showAccount(a.dataset.acct); } });
$('#acctBtn').onclick = () => showAccount();
$('#ordersBtn').onclick = () => showAccount();

refreshMe().then(() => { if (resetToken) showAccount(); });
