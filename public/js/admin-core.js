/* Núcleo do painel: toasts, formulários em modal, CRUD genérico, roteador e alertas de pedidos. */
const ST = {
  aguardando: ['Aguardando confirmação', 'warning text-dark'], confirmado: ['Confirmado', 'info text-dark'], preparo: ['Em preparação', 'primary'],
  pronto: ['Pronto', 'success'], saiu_entrega: ['Saiu para entrega', 'secondary'], concluido: ['Concluído', 'success'], cancelado: ['Cancelado', 'danger'],
};
const ACTION = { confirmado: 'Confirmar', preparo: 'Iniciar preparo', pronto: 'Marcar pronto', saiu_entrega: 'Saiu para entrega', concluido: 'Concluir', cancelado: 'Cancelar' };
const PAY = { dinheiro: 'Dinheiro', pix: 'Pix', cartao_credito: 'Cartão de crédito', cartao_debito: 'Cartão de débito' };
const badge = (s) => `<span class="badge bg-${ST[s][1]}">${ST[s][0]}</span>`;
const dt = (s) => (s ? new Date(String(s).replace(' ', 'T')).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '');
const yesno = (v) => (v ? '<span class="badge bg-success">Sim</span>' : '<span class="badge bg-secondary">Não</span>');
let me = null, timers = [];

function toast(msg, type = 'success') {
  let c = $('#toasts');
  if (!c) { c = document.createElement('div'); c.id = 'toasts'; c.className = 'toast-container position-fixed bottom-0 end-0 p-3'; document.body.appendChild(c); }
  const el = document.createElement('div');
  el.className = `toast align-items-center text-bg-${type} border-0`;
  el.innerHTML = '<div class="d-flex"><div class="toast-body"></div><button class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button></div>';
  $('.toast-body', el).textContent = msg; c.appendChild(el);
  new bootstrap.Toast(el, { delay: 4000 }).show();
  el.addEventListener('hidden.bs.toast', () => el.remove());
}
const fail = (e) => { if (e.status === 401) location.href = '/login.html'; else toast(e.message, 'danger'); };
const every = (fn, ms) => { timers.push(setInterval(fn, ms)); };

/* ---------- Formulários ---------- */
function rowHtml(cols, d = {}) {
  return `<div class="row g-2 align-items-center mb-2 row-item" data-id="${esc(d.id || '')}">${cols.map((c) => {
    const v = d[c.name]; const w = c.w || 'col';
    if (c.type === 'checkbox') return `<div class="${w}"><label class="small"><input type="checkbox" data-c="${c.name}" ${v ? 'checked' : ''}> ${esc(c.label)}</label></div>`;
    if (c.type === 'select') return `<div class="${w}"><select class="form-select form-select-sm" data-c="${c.name}">${c.options.map((o) => `<option value="${esc(o.value)}" ${String(o.value) === String(v ?? '') ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select></div>`;
    return `<div class="${w}"><input class="form-control form-control-sm" data-c="${c.name}" type="${c.type || 'text'}" ${c.type === 'number' ? 'step="any" min="0"' : ''} placeholder="${esc(c.label)}" value="${esc(v ?? '')}"></div>`;
  }).join('')}<div class="col-auto"><button type="button" class="btn btn-sm btn-outline-danger" data-del-row><i class="bi bi-x"></i></button></div></div>`;
}

function fieldHtml(f, v) {
  const id = 'f_' + f.name, req = f.req ? ' required' : '';
  const lab = `<label class="form-label" for="${id}">${esc(f.label)}</label>`, help = f.help ? `<div class="form-text">${esc(f.help)}</div>` : '';
  switch (f.type) {
    case 'textarea': return `<div class="mb-3">${lab}<textarea class="form-control" id="${id}" rows="3"${req}>${esc(v ?? '')}</textarea>${help}</div>`;
    case 'select': return `<div class="mb-3">${lab}<select class="form-select" id="${id}"${req}>${f.options.map((o) => `<option value="${esc(o.value)}" ${String(o.value) === String(v ?? '') ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>${help}</div>`;
    case 'checkbox': return `<div class="form-check form-switch mb-3"><input class="form-check-input" type="checkbox" id="${id}" ${v ? 'checked' : ''}><label class="form-check-label" for="${id}">${esc(f.label)}</label>${help}</div>`;
    case 'image': return `<div class="mb-3">${lab}<div class="d-flex gap-2 align-items-center"><img class="thumb ${v ? '' : 'd-none'}" src="${esc(v || '')}" alt=""><input type="file" class="form-control" accept="image/jpeg,image/png,image/webp" data-upload="${id}"><button type="button" class="btn btn-sm btn-outline-danger" data-clear="${id}">Remover</button></div><input type="hidden" id="${id}" value="${esc(v || '')}"><div class="form-text">JPG, PNG ou WebP, até 2 MB.</div></div>`;
    case 'multicheck': return `<div class="mb-3"><label class="form-label">${esc(f.label)}</label><div id="${id}" class="border rounded p-2">${f.options.length ? f.options.map((o) => `<label class="d-block"><input type="checkbox" value="${o.value}" ${(v || []).includes(o.value) ? 'checked' : ''}> ${esc(o.label)}</label>`).join('') : `<span class="text-muted small">${esc(f.empty || 'Nenhuma opção cadastrada.')}</span>`}</div></div>`;
    case 'rows': return `<div class="mb-3"><label class="form-label">${esc(f.label)}</label><div id="${id}" data-rows>${(v || []).map((r) => rowHtml(f.cols, r)).join('')}</div><button type="button" class="btn btn-sm btn-outline-success" data-add-row="${id}"><i class="bi bi-plus"></i> Adicionar</button></div>`;
    default: return `<div class="mb-3">${lab}<input class="form-control" id="${id}" type="${f.type || 'text'}" ${f.type === 'number' ? `step="any" ${f.allowNeg ? '' : 'min="0"'}` : ''} ${f.maxlength ? `maxlength="${f.maxlength}"` : ''} value="${esc(v ?? '')}"${req}>${help}</div>`;
  }
}

function collect(fields, root) {
  const out = {};
  for (const f of fields) {
    const el = $('#f_' + f.name, root);
    if (f.type === 'checkbox') out[f.name] = el.checked;
    else if (f.type === 'multicheck') out[f.name] = $$('input:checked', el).map((i) => Number(i.value));
    else if (f.type === 'rows') out[f.name] = $$('.row-item', el).map((r) => {
      const o = r.dataset.id ? { id: Number(r.dataset.id) } : {};
      $$('[data-c]', r).forEach((i) => { o[i.dataset.c] = i.type === 'checkbox' ? i.checked : i.value; });
      return o;
    });
    else out[f.name] = el.value;
  }
  return out;
}

function formModal({ title, fields, values = {}, save, wide, okText = 'Salvar' }) {
  const el = document.createElement('div'); el.className = 'modal fade'; el.tabIndex = -1;
  el.innerHTML = `<div class="modal-dialog modal-dialog-scrollable ${wide ? 'modal-lg' : ''}"><form class="modal-content"><div class="modal-header"><h5 class="modal-title"></h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div><div class="modal-body">${fields.map((f) => fieldHtml(f, values[f.name])).join('')}</div><div class="modal-footer"><div class="text-danger small me-auto err"></div><button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancelar</button><button class="btn btn-primary">${okText}</button></div></form></div>`;
  $('.modal-title', el).textContent = title; document.body.appendChild(el);
  const modal = new bootstrap.Modal(el); modal.show();
  el.addEventListener('hidden.bs.modal', () => { modal.dispose(); el.remove(); });
  el.addEventListener('click', (e) => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.delRow !== undefined) t.closest('.row-item').remove();
    if (t.dataset.addRow) { const f = fields.find((x) => 'f_' + x.name === t.dataset.addRow); $('#' + t.dataset.addRow, el).insertAdjacentHTML('beforeend', rowHtml(f.cols, f.newRow || {})); }
    if (t.dataset.clear) { $('#' + t.dataset.clear, el).value = ''; const img = $('img.thumb', t.parentElement); if (img) img.classList.add('d-none'); }
  });
  el.addEventListener('change', async (e) => {
    const inp = e.target; if (!inp.dataset.upload || !inp.files[0]) return;
    try { const url = await apiUpload(inp.files[0]); $('#' + inp.dataset.upload, el).value = url; const img = $('img.thumb', inp.parentElement); img.src = url; img.classList.remove('d-none'); }
    catch (err) { $('.err', el).textContent = err.message; inp.value = ''; }
  });
  $('form', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('.btn-primary', el); btn.disabled = true; $('.err', el).textContent = '';
    try { await save(collect(fields, el)); modal.hide(); }
    catch (err) { $('.err', el).textContent = err.message; btn.disabled = false; if (err.status === 401) location.href = '/login.html'; }
  });
  return el;
}

const toLocalInput = (s) => (s ? String(s).replace(' ', 'T').slice(0, 16) : '');

/* ---------- CRUD genérico ---------- */
function crudView({ title, icon, endpoint, columns, fields, blank = {}, toForm = (r) => r, toBody = (d) => d, canDelete = true, intro = '', wide = false, rowActions = '', onAction }) {
  return async (root) => {
    root.innerHTML = `<div class="d-flex justify-content-between align-items-center mb-3"><h1 class="h4 mb-0"><i class="bi ${icon}"></i> ${title}</h1><button class="btn btn-primary" id="new"><i class="bi bi-plus-lg"></i> Novo</button></div>${intro ? `<p class="text-muted">${intro}</p>` : ''}<div class="panel table-responsive" id="tbl">Carregando...</div>`;
    let rows = [];
    const draw = async () => {
      try { rows = await api(endpoint); } catch (e) { return fail(e); }
      $('#tbl', root).innerHTML = rows.length ? `<table class="table align-middle mb-0"><thead><tr>${columns.map((c) => `<th>${c.label}</th>`).join('')}<th></th></tr></thead><tbody>${rows.map((r, i) => `<tr>${columns.map((c) => `<td>${c.render ? c.render(r) : esc(r[c.key])}</td>`).join('')}<td class="text-end text-nowrap">${rowActions ? rowActions(r, i) : ''}<button class="btn btn-sm btn-outline-secondary" data-edit="${i}"><i class="bi bi-pencil"></i></button> ${canDelete ? `<button class="btn btn-sm btn-outline-danger" data-rm="${i}"><i class="bi bi-trash"></i></button>` : ''}</td></tr>`).join('')}</tbody></table>` : '<div class="text-muted">Nada cadastrado ainda.</div>';
    };
    const open = async (row) => {
      const fs = typeof fields === 'function' ? await fields(row) : fields;
      formModal({ title: row ? `Editar — ${title}` : `Novo — ${title}`, fields: fs, values: row ? toForm(row) : blank, wide,
        save: async (d) => { await api(row ? `${endpoint}/${row.id}` : endpoint, { method: row ? 'PUT' : 'POST', body: toBody(d, row) }); toast('Salvo com sucesso.'); draw(); } });
    };
    root.addEventListener('click', async (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.id === 'new') open(null).catch(fail);
      else if (b.dataset.edit !== undefined) open(rows[+b.dataset.edit]).catch(fail);
      else if (b.dataset.rm !== undefined) {
        if (!confirm('Excluir este registro? Esta ação não pode ser desfeita.')) return;
        try { await api(`${endpoint}/${rows[+b.dataset.rm].id}`, { method: 'DELETE' }); toast('Excluído.'); draw(); } catch (err) { fail(err); }
      } else if (onAction) onAction(b, rows, draw);
    });
    draw();
  };
}

/* ---------- Alertas de novos pedidos ---------- */
let soundOn = false, audioCtx, lastCount = null;
function beep() {
  if (!soundOn || !audioCtx) return;
  const o = audioCtx.createOscillator(), g = audioCtx.createGain();
  o.connect(g); g.connect(audioCtx.destination); o.frequency.value = 880;
  g.gain.setValueAtTime(0.25, audioCtx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.9);
  o.start(); o.stop(audioCtx.currentTime + 0.9);
}
async function pollCounts() {
  try {
    const c = await api('/api/orders/counts');
    const watch = me.role === 'cozinha' ? c.confirmado : c.aguardando;
    const nb = $('#navbadge'); if (nb) { nb.textContent = watch || ''; nb.classList.toggle('d-none', !watch); }
    if (lastCount !== null && watch > lastCount) { beep(); toast(me.role === 'cozinha' ? 'Novo pedido para a cozinha!' : 'Novo pedido recebido!', 'warning'); window.dispatchEvent(new Event('orders-changed')); }
    lastCount = watch;
  } catch (e) { if (e.status === 401) location.href = '/login.html'; }
}

/* ---------- Roteador ---------- */
const VIEWS = {};
function route() {
  timers.forEach(clearInterval); timers = [];
  const id = location.hash.slice(2);
  const v = VIEWS[id] && VIEWS[id].roles.includes(me.role) ? id : Object.keys(VIEWS).find((k) => VIEWS[k].roles.includes(me.role));
  $$('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.v === v));
  document.body.classList.remove('sb-open');
  const root = $('#view'); root.innerHTML = '';
  const fresh = root.cloneNode(false); root.replaceWith(fresh); // descarta listeners da tela anterior
  Promise.resolve(VIEWS[v].render(fresh)).catch(fail);
}

async function boot() {
  try { me = await api('/api/auth/me'); } catch { return (location.href = '/login.html'); }
  $('#estName').textContent = me.establishmentName; $('#userName').textContent = `${me.name} (${me.role})`;
  $('#nav').innerHTML = Object.entries(VIEWS).filter(([, v]) => v.roles.includes(me.role)).map(([k, v]) =>
    `<a class="nav-link" data-v="${k}" href="#/${k}"><i class="bi ${v.icon}"></i><span class="txt">${v.label}</span>${k === 'orders' ? '<span id="navbadge" class="badge bg-warning text-dark ms-auto txt d-none"></span>' : ''}</a>`).join('');
  window.addEventListener('hashchange', route); route();
  pollCounts(); setInterval(pollCounts, 15000);
  $('#toggle').onclick = () => document.body.classList.toggle(innerWidth < 768 ? 'sb-open' : 'sb-collapsed');
  document.addEventListener('click', (e) => { if (document.body.classList.contains('sb-open') && !e.target.closest('#sidebar,#toggle')) document.body.classList.remove('sb-open'); });
  $('#sound').onclick = () => {
    soundOn = !soundOn;
    if (soundOn) { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); beep(); }
    $('#sound').innerHTML = soundOn ? '<i class="bi bi-volume-up"></i> <span>Som ligado</span>' : '<i class="bi bi-volume-mute"></i> <span>Som desligado</span>';
  };
  $('#logout').onclick = async () => { try { await api('/api/auth/logout', { method: 'POST' }); } finally { location.href = '/login.html'; } };
}
