/* Telas do painel. Cada tela é registrada em VIEWS (ordem = ordem do menu). */
const ALL = ['admin'], STAFF = ['admin', 'atendente'], EVERY = ['admin', 'atendente', 'cozinha'];

function infoModal(title, html) {
  const el = document.createElement('div'); el.className = 'modal fade'; el.tabIndex = -1;
  el.innerHTML = `<div class="modal-dialog modal-dialog-scrollable"><div class="modal-content"><div class="modal-header"><h5 class="modal-title"></h5><button class="btn-close" data-bs-dismiss="modal"></button></div><div class="modal-body">${html}</div></div></div>`;
  $('.modal-title', el).textContent = title; document.body.appendChild(el);
  const m = new bootstrap.Modal(el); m.show(); el.addEventListener('hidden.bs.modal', () => { m.dispose(); el.remove(); });
  return el;
}

/* ---------- Resumo ---------- */
VIEWS.dashboard = { label: 'Resumo', icon: 'bi-speedometer2', roles: STAFF, render(root) {
  root.innerHTML = '<div id="setup"></div><div class="row g-3 mb-3" id="cards"></div><div class="row g-3"><div class="col-lg-8"><div class="panel"><h2 class="h6">Vendas dos últimos 7 dias</h2><canvas id="chart" height="140"></canvas></div></div><div class="col-lg-4"><div class="panel"><h2 class="h6">Mais vendidos (30 dias)</h2><div id="top" class="small"></div></div></div></div>';
  let chart;
  const load = async () => {
    try {
      const d = await api('/api/dashboard');
      const items = [['bi-cash-coin', 'Vendas hoje', money(d.todaySales)], ['bi-receipt', 'Pedidos hoje', d.todayOrders], ['bi-hourglass-split', 'Aguardando confirmação', d.pending], ['bi-fire', 'Em preparação', d.preparing], ['bi-graph-up', 'Ticket médio', money(d.avgTicket)]];
      $('#cards').innerHTML = items.map(([ic, l, v]) => `<div class="col-6 col-lg"><div class="stat"><div class="label"><i class="bi ${ic}"></i>${l}</div><div class="value">${v}</div></div></div>`).join('');
      const st = d.setup, tick = (ok) => `<i class="bi ${ok ? 'bi-check-circle-fill text-success' : 'bi-circle'}"></i>`;
      $('#setup').innerHTML = me.role === 'admin' && (!st.categories || !st.products) ? `<div class="panel mb-3 border-start border-4 border-warning"><h2 class="h6">Primeiros passos</h2><ul class="list-unstyled mb-2"><li>${tick(true)} Conta criada</li><li>${tick(st.categories)} <a href="#/categories">Cadastre uma categoria</a></li><li>${tick(st.products)} <a href="#/products">Cadastre seu primeiro produto</a></li></ul><div class="small text-muted">Depois, ajuste horário e entrega em <a href="#/settings">Configurações</a>. Seu cardápio: <a href="/m/${esc(st.slug)}" target="_blank" rel="noopener">${esc(location.origin)}/m/${esc(st.slug)}</a></div></div>` : '';
      const labels = d.series.map((s) => s.day.slice(8) + '/' + s.day.slice(5, 7)), data = d.series.map((s) => s.sales);
      if (!chart) chart = new Chart($('#chart'), { type: 'bar', data: { labels, datasets: [{ label: 'Vendas (R$)', data, backgroundColor: '#166534', borderRadius: 6 }] }, options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } } });
      else { chart.data.labels = labels; chart.data.datasets[0].data = data; chart.update(); }
      $('#top').innerHTML = d.topProducts.length ? d.topProducts.map((p) => `<div class="d-flex justify-content-between border-bottom py-2"><span class="text-truncate me-2">${esc(p.name)}</span><strong>${p.qty}</strong></div>`).join('') : '<div class="text-muted">Nenhum pedido no período.</div>';
    } catch (e) { fail(e); }
  };
  load(); every(load, 20000);
} };

/* ---------- Pedidos ---------- */
function orderDetail(o) {
  const wa = o.customer_phone.length <= 11 ? '55' + o.customer_phone : o.customer_phone;
  return `<div class="mb-2">${badge(o.status)} <span class="text-muted small">${dt(o.created_at)}</span></div>
    <div><strong>${esc(o.customer_name)}</strong> · ${esc(o.customer_phone)} ${me.role !== 'cozinha' ? `<a class="btn btn-sm btn-outline-success ms-1" target="_blank" rel="noopener" title="Chamar no WhatsApp com o link de acompanhamento" href="https://wa.me/${esc(wa)}?text=${encodeURIComponent(`Olá! Acompanhe seu pedido #${o.number}: ${location.origin}/pedido/${o.tracking_token}`)}"><i class="bi bi-whatsapp"></i></a>` : ''}</div>
    <div class="mb-2">${o.type === 'entrega' ? `<i class="bi bi-bicycle"></i> Entrega: ${esc(o.address)}${o.neighborhood ? ' — ' + esc(o.neighborhood) : ''}` : '<i class="bi bi-shop"></i> Retirada no local'}</div>
    <table class="table table-sm"><tbody>${o.items.map((i) => `<tr><td>${i.quantity}x ${esc(i.name)}${i.options.map((x) => `<div class="small text-muted">+ ${esc(x.name)}${x.price_delta ? ' (' + money(x.price_delta) + ')' : ''}</div>`).join('')}${i.notes ? `<div class="small text-muted">Obs: ${esc(i.notes)}</div>` : ''}</td><td class="text-end">${money(i.unit_price * i.quantity)}</td></tr>`).join('')}</tbody></table>
    <div class="d-flex justify-content-between"><span>Subtotal</span><span>${money(o.subtotal)}</span></div>
    ${o.delivery_fee ? `<div class="d-flex justify-content-between"><span>Entrega</span><span>${money(o.delivery_fee)}</span></div>` : ''}
    ${o.discount ? `<div class="d-flex justify-content-between text-success"><span>Desconto</span><span>− ${money(o.discount)}</span></div>` : ''}
    <div class="d-flex justify-content-between fw-bold fs-5"><span>Total</span><span>${money(o.total)}</span></div>
    <div class="mt-2">Pagamento: ${esc(PAY[o.payment_method])}${o.change_for ? ` · troco para ${money(o.change_for)}` : ''}</div>
    ${o.notes ? `<div class="alert alert-light mt-2 mb-0">Obs: ${esc(o.notes)}</div>` : ''}
    ${me.role !== 'cozinha' && o.tracking_token ? `<div class="mt-3 small">Link de acompanhamento do cliente: <a href="/pedido/${esc(o.tracking_token)}" target="_blank" rel="noopener">abrir</a> <button class="btn btn-sm btn-outline-secondary ms-1" data-copy="${esc(location.origin)}/pedido/${esc(o.tracking_token)}">Copiar link</button></div>` : ''}`;
}

VIEWS.orders = { label: 'Pedidos', icon: 'bi-receipt', roles: EVERY, render(root) {
  const kitchen = me.role === 'cozinha';
  let tab = 'open';
  root.innerHTML = `<div class="d-flex flex-wrap gap-2 align-items-center mb-3"><h1 class="h4 mb-0 me-auto"><i class="bi bi-receipt"></i> ${kitchen ? 'Cozinha' : 'Pedidos'}</h1>
    ${kitchen ? '' : '<div class="btn-group"><button class="btn btn-outline-success active" data-tab="open">Em andamento</button><button class="btn btn-outline-success" data-tab="hist">Histórico</button></div>'}</div>
    <div id="hist" class="panel mb-3 d-none"><div class="row g-2"><div class="col-6 col-md-3"><input class="form-control" type="date" id="hFrom"></div><div class="col-6 col-md-3"><input class="form-control" type="date" id="hTo"></div><div class="col-8 col-md-4"><input class="form-control" id="hQ" placeholder="Nº do pedido ou cliente"></div><div class="col-4 col-md-2"><button class="btn btn-primary w-100" id="hGo">Filtrar</button></div></div></div>
    <div id="list" class="row g-3"></div>`;
  let rows = [];
  const canAct = (o, n) => !kitchen || (o.status === 'confirmado' && n === 'preparo') || (o.status === 'preparo' && n === 'pronto');
  const load = async () => {
    const qs = new URLSearchParams(tab === 'open' ? { status: 'aguardando,confirmado,preparo,pronto,saiu_entrega' } : { status: 'concluido,cancelado', from: $('#hFrom').value, to: $('#hTo').value, q: $('#hQ').value });
    try { rows = await api('/api/orders?' + qs); } catch (e) { return fail(e); }
    if (!document.body.contains(root)) return;
    $('#list').innerHTML = rows.length ? rows.map((o, i) => `<div class="col-md-6 col-xl-4"><div class="panel h-100 d-flex flex-column">
      <div class="d-flex justify-content-between"><strong>#${o.number}</strong>${badge(o.status)}</div>
      <div class="small text-muted">${dt(o.created_at)} · ${o.type === 'entrega' ? 'Entrega' : 'Retirada'}${o.neighborhood ? ' · ' + esc(o.neighborhood) : ''}</div>
      <div class="mt-1">${esc(o.customer_name)} <span class="text-muted small">· ${o.items_count} item(ns)</span></div>
      <div class="price fs-5">${money(o.total)}</div>
      <div class="mt-auto pt-2 d-flex flex-wrap gap-1"><button class="btn btn-sm btn-outline-secondary" data-det="${i}"><i class="bi bi-eye"></i> Detalhes</button>
      ${kitchen ? '' : `<a class="btn btn-sm btn-outline-secondary" target="_blank" href="/print/${o.id}"><i class="bi bi-printer"></i></a>`}
      ${o.next.filter((n) => canAct(o, n)).map((n) => `<button class="btn btn-sm ${n === 'cancelado' ? 'btn-outline-danger' : 'btn-primary'}" data-st="${i}:${n}">${ACTION[n]}</button>`).join('')}</div></div></div>`).join('') : '<div class="text-muted">Nenhum pedido aqui.</div>';
  };
  root.addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.tab) { tab = b.dataset.tab; $$('[data-tab]').forEach((x) => x.classList.toggle('active', x === b)); $('#hist').classList.toggle('d-none', tab === 'open'); load(); }
    else if (b.id === 'hGo') load();
    else if (b.dataset.det !== undefined) { try { const o = await api('/api/orders/' + rows[+b.dataset.det].id); const m = infoModal(`Pedido #${o.number}`, orderDetail(o)); m.addEventListener('click', async (ev) => { const c = ev.target.closest('[data-copy]'); if (c) { try { await navigator.clipboard.writeText(c.dataset.copy); toast('Link copiado.'); } catch { toast('Copie o link manualmente.', 'warning'); } } }); } catch (err) { fail(err); } }
    else if (b.dataset.st) {
      const [i, n] = b.dataset.st.split(':'), o = rows[+i];
      if (n === 'cancelado' && !confirm(`Cancelar o pedido #${o.number}? O estoque será devolvido.`)) return;
      b.disabled = true;
      try { await api(`/api/orders/${o.id}/status`, { method: 'POST', body: { status: n } }); toast(`Pedido #${o.number}: ${ST[n][0]}.`); } catch (err) { fail(err); }
      load();
    }
  });
  const onNew = () => document.body.contains(root) && load();
  window.addEventListener('orders-changed', onNew);
  load(); every(load, 15000);
} };

/* ---------- Clientes ---------- */
VIEWS.customers = { label: 'Clientes', icon: 'bi-person-lines-fill', roles: STAFF, async render(root) {
  root.innerHTML = '<h1 class="h4 mb-1"><i class="bi bi-person-lines-fill"></i> Clientes</h1><p class="text-muted">Quem já pediu na sua loja. "Conta" indica clientes que criaram login no cardápio.</p><div class="panel table-responsive" id="tbl">Carregando...</div>';
  let rows; try { rows = await api('/api/customers'); } catch (e) { return fail(e); }
  $('#tbl').innerHTML = rows.length ? `<table class="table align-middle mb-0"><thead><tr><th>Cliente</th><th>Pedidos</th><th>Total gasto</th><th>Último pedido</th><th>Conta</th><th></th></tr></thead><tbody>${rows.map((c, i) => `<tr><td><strong>${esc(c.name)}</strong><div class="small text-muted">${esc(maskPhone(c.phone))}</div></td><td>${c.orders}</td><td>${money(c.spent)}</td><td>${c.last_order ? dt(c.last_order) : '—'}</td><td>${yesno(c.account_id)}</td><td class="text-end text-nowrap"><a class="btn btn-sm btn-outline-success" target="_blank" rel="noopener" href="https://wa.me/${c.phone.length <= 11 ? '55' : ''}${esc(c.phone)}" title="Chamar no WhatsApp"><i class="bi bi-whatsapp"></i></a>${me.role === 'admin' && c.account_id ? ` <button class="btn btn-sm btn-outline-primary" data-reset="${i}" title="Gerar link de nova senha"><i class="bi bi-key"></i></button>` : ''}</td></tr>`).join('')}</tbody></table>` : '<div class="text-muted">Nenhum cliente ainda. Eles aparecem aqui depois do primeiro pedido.</div>';
  root.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-reset]'); if (!b) return;
    try {
      const { path } = await api(`/api/customers/${rows[+b.dataset.reset].account_id}/reset-link`, { method: 'POST' });
      const url = location.origin + path;
      const m = infoModal('Link de nova senha do cliente', `<p>Envie este link ao cliente pelo WhatsApp. Vale por 1 hora e só pode ser usado uma vez.</p><input class="form-control" readonly id="lnk" value="${esc(url)}"><button class="btn btn-primary mt-2" id="cp">Copiar</button>`);
      $('#cp', m).onclick = async () => { $('#lnk', m).select(); try { await navigator.clipboard.writeText(url); toast('Link copiado.'); } catch { toast('Selecione e copie manualmente.', 'warning'); } };
    } catch (err) { fail(err); }
  });
} };

/* ---------- Cardápio ---------- */
const opt = (rows, label = 'name') => rows.map((r) => ({ value: r.id, label: r[label] }));

VIEWS.products = { label: 'Produtos', icon: 'bi-basket', roles: ALL, render: crudView({
  title: 'Produtos', icon: 'bi-basket', endpoint: '/api/products', wide: true, blank: { available: true },
  columns: [
    { label: '', render: (r) => (r.image_url ? `<img class="thumb" src="${esc(r.image_url)}" alt="">` : '') },
    { label: 'Produto', render: (r) => `<strong>${esc(r.name)}</strong><div class="small text-muted">${esc(r.category_name || 'Sem categoria')}</div>` },
    { label: 'Preço', render: (r) => (r.promo_price != null ? `<span class="old">${money(r.price)}</span> ${money(r.promo_price)}` : money(r.price)) },
    { label: 'Disponível', render: (r) => yesno(r.available) },
  ],
  fields: async () => {
    const [cats, groups] = await Promise.all([api('/api/categories'), api('/api/option-groups')]);
    return [
      { name: 'name', label: 'Nome', req: true, maxlength: 120 }, { name: 'description', label: 'Descrição', type: 'textarea' },
      { name: 'category_id', label: 'Categoria', type: 'select', options: [{ value: '', label: 'Sem categoria' }, ...opt(cats)] },
      { name: 'price', label: 'Preço (R$)', type: 'number', req: true }, { name: 'promo_price', label: 'Preço promocional (R$)', type: 'number', help: 'Deve ser menor que o preço.' },
      { name: 'image_url', label: 'Imagem', type: 'image' }, { name: 'prep_minutes', label: 'Tempo de preparo (min)', type: 'number' },
      { name: 'available', label: 'Disponível no cardápio', type: 'checkbox' },
      { name: 'track_stock', label: 'Controlar estoque', type: 'checkbox', help: 'A quantidade é lançada na tela Estoque.' },
      { name: 'stock_min', label: 'Estoque mínimo (alerta)', type: 'number' },
      { name: 'group_ids', label: 'Grupos de opções e adicionais', type: 'multicheck', options: opt(groups), empty: 'Cadastre grupos na tela "Adicionais".' },
      { name: 'sort_order', label: 'Ordem de exibição', type: 'number' },
    ];
  },
}) };

VIEWS.categories = { label: 'Categorias', icon: 'bi-tags', roles: ALL, render: crudView({
  title: 'Categorias', icon: 'bi-tags', endpoint: '/api/categories', blank: { active: true, sort_order: 0 },
  columns: [{ label: 'Nome', key: 'name' }, { label: 'Ordem', key: 'sort_order' }, { label: 'Ativa', render: (r) => yesno(r.active) }],
  fields: [{ name: 'name', label: 'Nome', req: true, maxlength: 80 }, { name: 'sort_order', label: 'Ordem de exibição', type: 'number' }, { name: 'active', label: 'Ativa', type: 'checkbox' }],
}) };

VIEWS.groups = { label: 'Adicionais', icon: 'bi-plus-square', roles: ALL, render: crudView({
  title: 'Adicionais e opções', icon: 'bi-plus-square', endpoint: '/api/option-groups', wide: true, blank: { min_select: 0, max_select: 1, options: [{ available: true }] },
  intro: 'Crie grupos como "Tamanho", "Sabor" ou "Adicionais" e vincule-os aos produtos.',
  columns: [{ label: 'Grupo', key: 'name' }, { label: 'Escolha', render: (r) => `${r.min_select} a ${r.max_select}` }, { label: 'Opções', render: (r) => esc(r.options.map((o) => o.name).join(', ')) }],
  fields: [
    { name: 'name', label: 'Nome do grupo', req: true, maxlength: 80 },
    { name: 'min_select', label: 'Mínimo de escolhas (0 = opcional)', type: 'number' }, { name: 'max_select', label: 'Máximo de escolhas', type: 'number', req: true },
    { name: 'options', label: 'Opções', type: 'rows', newRow: { available: true }, cols: [{ name: 'name', label: 'Nome', w: 'col-12 col-md-4' }, { name: 'price_delta', label: 'Preço +', type: 'number', w: 'col-5 col-md-2' }, { name: 'available', label: 'Disponível', type: 'checkbox', w: 'col-auto' }, { name: 'track_stock', label: 'Estoque', type: 'checkbox', w: 'col-auto' }] },
  ],
}) };

VIEWS.combos = { label: 'Combos', icon: 'bi-box2-heart', roles: ALL, render: crudView({
  title: 'Combos', icon: 'bi-box2-heart', endpoint: '/api/combos', wide: true, blank: { available: true, items: [{ quantity: 1 }] },
  columns: [{ label: 'Combo', key: 'name' }, { label: 'Itens', render: (r) => esc(r.items.map((i) => `${i.quantity}x ${i.product_name}`).join(', ')) }, { label: 'Preço', render: (r) => money(r.price) }, { label: 'Disponível', render: (r) => yesno(r.available) }],
  fields: async () => {
    const prods = await api('/api/products');
    return [
      { name: 'name', label: 'Nome', req: true, maxlength: 120 }, { name: 'description', label: 'Descrição', type: 'textarea' },
      { name: 'price', label: 'Preço do combo (R$)', type: 'number', req: true }, { name: 'image_url', label: 'Imagem', type: 'image' }, { name: 'available', label: 'Disponível', type: 'checkbox' },
      { name: 'items', label: 'Produtos do combo', type: 'rows', newRow: { quantity: 1 }, cols: [{ name: 'product_id', type: 'select', options: opt(prods), w: 'col-8' }, { name: 'quantity', label: 'Qtd', type: 'number', w: 'col-3' }] },
    ];
  },
}) };

/* ---------- Promoções e entrega ---------- */
VIEWS.coupons = { label: 'Cupons', icon: 'bi-ticket-perforated', roles: ALL, render: crudView({
  title: 'Cupons', icon: 'bi-ticket-perforated', endpoint: '/api/coupons', blank: { active: true, type: 'percent' },
  toForm: (r) => ({ ...r, expires_at: toLocalInput(r.expires_at) }),
  columns: [{ label: 'Código', render: (r) => `<strong>${esc(r.code)}</strong>` }, { label: 'Desconto', render: (r) => (r.type === 'percent' ? `${r.value}%${r.max_discount ? ' (máx. ' + money(r.max_discount) + ')' : ''}` : money(r.value)) },
    { label: 'Mínimo', render: (r) => money(r.min_order) }, { label: 'Validade', render: (r) => (r.expires_at ? dt(r.expires_at) : '—') }, { label: 'Usos', render: (r) => `${r.used_count}${r.max_uses ? '/' + r.max_uses : ''}` }, { label: 'Ativo', render: (r) => yesno(r.active) }],
  fields: [
    { name: 'code', label: 'Código promocional', req: true, maxlength: 30 },
    { name: 'type', label: 'Tipo', type: 'select', options: [{ value: 'percent', label: 'Percentual (%)' }, { value: 'fixed', label: 'Valor fixo (R$)' }] },
    { name: 'value', label: 'Valor do desconto', type: 'number', req: true }, { name: 'min_order', label: 'Valor mínimo de compra (R$)', type: 'number' },
    { name: 'max_discount', label: 'Desconto máximo (R$)', type: 'number' }, { name: 'expires_at', label: 'Válido até', type: 'datetime-local' },
    { name: 'max_uses', label: 'Limite de utilizações', type: 'number' }, { name: 'active', label: 'Ativo', type: 'checkbox' },
  ],
}) };

VIEWS.zones = { label: 'Entrega', icon: 'bi-bicycle', roles: ALL, render: crudView({
  title: 'Bairros e taxas de entrega', icon: 'bi-bicycle', endpoint: '/api/delivery-zones', blank: { active: true },
  intro: 'Com bairros cadastrados, o cliente só consegue pedir entrega para eles. Sem bairros, a entrega é gratuita para qualquer endereço.',
  columns: [{ label: 'Bairro', key: 'neighborhood' }, { label: 'Taxa', render: (r) => money(r.fee) }, { label: 'Ativo', render: (r) => yesno(r.active) }],
  fields: [{ name: 'neighborhood', label: 'Bairro', req: true, maxlength: 100 }, { name: 'fee', label: 'Taxa de entrega (R$)', type: 'number', req: true }, { name: 'active', label: 'Ativo', type: 'checkbox' }],
}) };

/* ---------- Estoque ---------- */
VIEWS.stock = { label: 'Estoque', icon: 'bi-box-seam', roles: ALL, async render(root) {
  root.innerHTML = '<h1 class="h4 mb-3"><i class="bi bi-box-seam"></i> Estoque</h1><div id="low"></div><div class="panel table-responsive mb-3" id="items">Carregando...</div><h2 class="h6">Histórico de movimentações</h2><div class="panel table-responsive" id="moves"></div>';
  let items = [];
  const load = async () => {
    try {
      let moves; [items, moves] = await Promise.all([api('/api/stock'), api('/api/stock/movements')]);
      const low = items.filter((i) => i.low);
      $('#low').innerHTML = low.length ? `<div class="alert alert-warning"><i class="bi bi-exclamation-triangle"></i> Estoque baixo: ${low.map((i) => esc(i.name)).join(', ')}</div>` : '';
      $('#items').innerHTML = items.length ? `<table class="table align-middle mb-0"><thead><tr><th>Item</th><th>Quantidade</th><th>Mínimo</th><th></th><th></th></tr></thead><tbody>${items.map((i, n) => `<tr><td>${esc(i.name)}</td><td>${i.qty}</td><td>${i.min || '—'}</td><td>${i.qty <= 0 ? '<span class="badge bg-danger">Esgotado</span>' : i.low ? '<span class="badge bg-warning text-dark">Baixo</span>' : '<span class="badge bg-success">OK</span>'}</td><td class="text-end"><button class="btn btn-sm btn-outline-secondary" data-adj="${n}">Lançar entrada/saída</button></td></tr>`).join('')}</tbody></table>` : '<div class="text-muted">Nenhum item com controle de estoque. Ative "Controlar estoque" no cadastro do produto ou da opção.</div>';
      $('#moves').innerHTML = moves.length ? `<table class="table table-sm mb-0"><thead><tr><th>Data</th><th>Item</th><th>Variação</th><th>Motivo</th></tr></thead><tbody>${moves.map((m) => `<tr><td>${dt(m.created_at)}</td><td>${esc(m.item)}</td><td class="${m.delta > 0 ? 'text-success' : 'text-danger'}">${m.delta > 0 ? '+' : ''}${m.delta}</td><td>${esc(m.reason)}</td></tr>`).join('')}</tbody></table>` : '<div class="text-muted">Sem movimentações.</div>';
    } catch (e) { fail(e); }
  };
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-adj]'); if (!b) return;
    const it = items[+b.dataset.adj];
    formModal({ title: `Estoque — ${it.name}`, values: { delta: '', reason: '' }, okText: 'Lançar',
      fields: [{ name: 'delta', label: 'Quantidade (positiva = entrada, negativa = saída)', type: 'number', allowNeg: true, req: true }, { name: 'reason', label: 'Motivo', maxlength: 100 }],
      save: async (d) => { await api('/api/stock/adjust', { method: 'POST', body: { type: it.type, id: it.id, delta: d.delta, reason: d.reason } }); toast('Estoque atualizado.'); load(); } });
  });
  load();
} };

/* ---------- Relatórios ---------- */
VIEWS.reports = { label: 'Relatórios', icon: 'bi-bar-chart-line', roles: ALL, render(root) {
  const today = new Date(), p = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  root.innerHTML = `<h1 class="h4 mb-3"><i class="bi bi-bar-chart-line"></i> Relatórios</h1>
    <div class="panel mb-3"><div class="row g-2 align-items-end"><div class="col-6 col-md-3"><label class="form-label">De</label><input class="form-control" type="date" id="rFrom" value="${iso(new Date(today.getFullYear(), today.getMonth(), 1))}"></div>
    <div class="col-6 col-md-3"><label class="form-label">Até</label><input class="form-control" type="date" id="rTo" value="${iso(today)}"></div>
    <div class="col-6 col-md-3"><label class="form-label">Agrupar por</label><select class="form-select" id="rGroup"><option value="day">Dia</option><option value="week">Semana</option><option value="month">Mês</option></select></div>
    <div class="col-6 col-md-3"><button class="btn btn-primary w-100" id="rGo">Atualizar</button></div></div>
    <div class="mt-3 d-flex flex-wrap gap-2" id="csv"></div></div>
    <div class="row g-3 mb-3" id="rCards"></div><div class="panel mb-3"><canvas id="rChart" height="120"></canvas></div>
    <div class="row g-3"><div class="col-md-6"><div class="panel"><h2 class="h6">Formas de pagamento</h2><div id="rPay"></div></div></div><div class="col-md-6"><div class="panel"><h2 class="h6">Produtos mais vendidos</h2><div id="rTop"></div></div></div></div>`;
  let chart;
  const load = async () => {
    const q = new URLSearchParams({ from: $('#rFrom').value, to: $('#rTo').value, group: $('#rGroup').value });
    try {
      const d = await api('/api/reports?' + q);
      $('#csv').innerHTML = [['orders', 'Pedidos'], ['products', 'Produtos'], ['payments', 'Pagamentos'], ['cancelled', 'Cancelados']].map(([k, l]) => `<a class="btn btn-sm btn-outline-success" href="/api/reports/export?kind=${k}&${q}"><i class="bi bi-download"></i> CSV ${l}</a>`).join('');
      $('#rCards').innerHTML = [['Vendas', money(d.totals.sales)], ['Pedidos', d.totals.orders], ['Ticket médio', money(d.totals.avgTicket)], ['Cancelados', `${d.cancelled.n} (${money(d.cancelled.total)})`]].map(([l, v]) => `<div class="col-6 col-lg-3"><div class="stat"><div class="label">${l}</div><div class="value">${v}</div></div></div>`).join('');
      const labels = d.byPeriod.map((r) => r.period), data = d.byPeriod.map((r) => r.sales);
      if (chart) chart.destroy();
      chart = new Chart($('#rChart'), { type: 'bar', data: { labels, datasets: [{ label: 'Vendas (R$)', data, backgroundColor: '#166534', borderRadius: 6 }] }, options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } } });
      $('#rPay').innerHTML = d.payments.length ? d.payments.map((r) => `<div class="d-flex justify-content-between border-bottom py-1"><span>${esc(PAY[r.method] || r.method)} <small class="text-muted">(${r.orders})</small></span><strong>${money(r.total)}</strong></div>`).join('') : '<div class="text-muted">Sem dados.</div>';
      $('#rTop').innerHTML = d.top.length ? d.top.map((r) => `<div class="d-flex justify-content-between border-bottom py-1"><span class="text-truncate me-2">${esc(r.name)}</span><span>${r.qty} un · ${money(r.revenue)}</span></div>`).join('') : '<div class="text-muted">Sem dados.</div>';
    } catch (e) { fail(e); }
  };
  $('#rGo').onclick = load; load();
} };

/* ---------- Usuários ---------- */
VIEWS.users = { label: 'Usuários', icon: 'bi-people', roles: ALL, render: crudView({
  title: 'Usuários', icon: 'bi-people', endpoint: '/api/users', canDelete: false, blank: { active: true, role: 'atendente' },
  intro: 'Administrador: acesso total · Atendente: pedidos · Cozinha: apenas preparo dos pedidos. Para recuperar um acesso, gere um link de redefinição (válido por 1 hora).',
  toBody: (d) => { const b = { ...d }; if (!b.password) delete b.password; return b; },
  columns: [{ label: 'Nome', key: 'name' }, { label: 'E-mail', key: 'email' }, { label: 'Perfil', key: 'role' }, { label: 'Ativo', render: (r) => yesno(r.active) }],
  rowActions: (r) => `<button class="btn btn-sm btn-outline-primary" data-link="${r.id}" title="Gerar link de redefinição de senha"><i class="bi bi-key"></i></button> `,
  fields: (row) => [
    { name: 'name', label: 'Nome', req: true, maxlength: 100 }, { name: 'email', label: 'E-mail', type: 'email', req: true, maxlength: 150 },
    { name: 'role', label: 'Perfil', type: 'select', options: [{ value: 'admin', label: 'Administrador' }, { value: 'atendente', label: 'Atendente' }, { value: 'cozinha', label: 'Cozinha' }] },
    { name: 'password', label: row ? 'Nova senha (deixe em branco para manter)' : 'Senha (mín. 8 caracteres)', type: 'password', req: !row, maxlength: 100 },
    { name: 'active', label: 'Ativo', type: 'checkbox' },
  ],
  async onAction(b) {
    if (!b.dataset.link) return;
    try {
      const { path } = await api(`/api/users/${b.dataset.link}/reset-link`, { method: 'POST' });
      const url = location.origin + path;
      const m = infoModal('Link de redefinição de senha', `<p>Envie este link ao usuário. Ele vale por 1 hora e só pode ser usado uma vez.</p><input class="form-control" readonly id="lnk" value="${esc(url)}"><button class="btn btn-primary mt-2" id="cp">Copiar</button>`);
      $('#cp', m).onclick = async () => { $('#lnk', m).select(); try { await navigator.clipboard.writeText(url); toast('Link copiado.'); } catch { toast('Selecione e copie manualmente.', 'warning'); } };
    } catch (e) { fail(e); }
  },
}) };

/* ---------- Configurações ---------- */
VIEWS.settings = { label: 'Configurações', icon: 'bi-gear', roles: ALL, async render(root) {
  const DAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  let e; try { e = await api('/api/settings'); } catch (err) { return fail(err); }
  const fields = [
    { name: 'name', label: 'Nome do estabelecimento', req: true, maxlength: 120 }, { name: 'description', label: 'Descrição', type: 'textarea' },
    { name: 'logo_url', label: 'Logo', type: 'image' }, { name: 'cover_url', label: 'Imagem de capa', type: 'image' },
    { name: 'whatsapp', label: 'WhatsApp para receber pedidos', help: 'DDD + número, só dígitos. Ex.: 11999998888', maxlength: 20 },
    { name: 'address', label: 'Endereço', maxlength: 255 },
    { name: 'min_order', label: 'Pedido mínimo (R$)', type: 'number' }, { name: 'est_delivery_minutes', label: 'Tempo estimado de entrega (min)', type: 'number' },
    { name: 'pickup_enabled', label: 'Aceitar retirada no estabelecimento', type: 'checkbox' }, { name: 'delivery_enabled', label: 'Aceitar entrega em domicílio', type: 'checkbox' },
    { name: 'orders_paused', label: 'Pausar pedidos temporariamente', type: 'checkbox', help: 'Enquanto ativo, clientes veem o cardápio mas não finalizam pedidos.' },
  ];
  const hours = e.opening_hours || DAYS.map(() => ({ closed: false, open: '08:00', close: '22:00' }));
  const link = `${location.origin}/m/${e.slug}`;
  root.innerHTML = `<h1 class="h4 mb-3"><i class="bi bi-gear"></i> Configurações</h1>
    <div class="panel mb-3"><div class="fw-semibold mb-1">Link do seu cardápio</div><div class="input-group"><input class="form-control" readonly value="${esc(link)}" id="pubLink"><a class="btn btn-outline-success" target="_blank" href="${esc(link)}">Abrir</a><button class="btn btn-outline-secondary" id="copyLink" type="button">Copiar</button></div></div>
    <form class="panel" id="sForm">${fields.map((f) => fieldHtml(f, e[f.name])).join('')}
      <div class="form-check form-switch mb-2"><input class="form-check-input" type="checkbox" id="useHours" ${e.opening_hours ? 'checked' : ''}><label class="form-check-label" for="useHours">Definir horário de funcionamento <span class="text-muted">(desligado = sempre aberto)</span></label></div>
      <div id="hoursBox" class="${e.opening_hours ? '' : 'd-none'} mb-3">${hours.map((h, i) => `<div class="row g-2 align-items-center mb-1" data-day="${i}"><div class="col-4 col-md-2">${DAYS[i]}</div><div class="col-auto"><label class="small"><input type="checkbox" class="h-closed" ${h.closed ? 'checked' : ''}> Fechado</label></div><div class="col-auto"><input type="time" class="form-control form-control-sm h-open" value="${esc(h.open || '08:00')}"></div><div class="col-auto">às</div><div class="col-auto"><input type="time" class="form-control form-control-sm h-close" value="${esc(h.close || '22:00')}"></div></div>`).join('')}<div class="form-text">Para funcionar além da meia-noite, use um horário final menor que o inicial (ex.: 18:00 às 02:00).</div></div>
      <div class="text-danger small mb-2" id="sErr"></div><button class="btn btn-primary">Salvar configurações</button></form>`;
  $('#copyLink').onclick = async () => { try { await navigator.clipboard.writeText(link); toast('Link copiado.'); } catch { $('#pubLink').select(); } };
  $('#useHours').onchange = (ev) => $('#hoursBox').classList.toggle('d-none', !ev.target.checked);
  root.addEventListener('change', async (ev) => {
    const inp = ev.target; if (!inp.dataset.upload || !inp.files[0]) return;
    try { const url = await apiUpload(inp.files[0]); $('#' + inp.dataset.upload).value = url; const img = $('img.thumb', inp.parentElement); img.src = url; img.classList.remove('d-none'); } catch (err) { toast(err.message, 'danger'); inp.value = ''; }
  });
  root.addEventListener('click', (ev) => { const t = ev.target.closest('[data-clear]'); if (t) { $('#' + t.dataset.clear).value = ''; $('img.thumb', t.parentElement).classList.add('d-none'); } });
  $('#sForm').addEventListener('submit', async (ev) => {
    ev.preventDefault(); $('#sErr').textContent = '';
    const body = collect(fields, root);
    body.opening_hours = $('#useHours').checked ? $$('[data-day]').map((r) => ({ closed: $('.h-closed', r).checked, open: $('.h-open', r).value, close: $('.h-close', r).value })) : null;
    try { await api('/api/settings', { method: 'PUT', body }); $('#estName').textContent = body.name; toast('Configurações salvas.'); } catch (err) { $('#sErr').textContent = err.message; fail(err); }
  });
} };

boot();
