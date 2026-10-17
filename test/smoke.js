// Teste de fumaça da API (rode com o servidor ligado): ADMIN_PASS=... BASE=http://localhost:3000 node test/smoke.js
const BASE = process.env.BASE || 'http://localhost:3000';
function client() {
  let cookie = '', csrf = '';
  const call = async (method, path, body, raw) => {
    const h = {};
    if (body !== undefined && !raw) h['Content-Type'] = 'application/json';
    if (method !== 'GET') { if (!csrf) csrf = (await (await fetch(BASE + '/api/csrf', { headers: { cookie } }).then(async (r) => { const c = r.headers.get('set-cookie'); if (c) cookie = c.split(';')[0]; return r; })).json()).token; h['x-csrf-token'] = csrf; }
    h.cookie = cookie;
    const r = await fetch(BASE + path, { method, headers: h, body: raw ? body : body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
    const c = r.headers.get('set-cookie'); if (c) { cookie = c.split(';')[0]; csrf = ''; }
    const text = await r.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
    return { status: r.status, data };
  };
  return call;
}
let fail = 0;
const ok = (name, cond, extra = '') => { console.log((cond ? 'OK   ' : 'FALHA'), name, cond ? '' : JSON.stringify(extra)); if (!cond) fail++; };

(async () => {
  const pub = client(), adm = client();
  const base = { customer_name: 'Maria', customer_phone: '(11) 98888-7777', type: 'entrega', address: 'Rua A, 10', neighborhood: 'centro', payment_method: 'dinheiro', change_for: 100 };
  let r = await pub('GET', '/api/public/demo/menu');
  ok('cardápio público', r.status === 200 && r.data.categories.length === 2 && r.data.establishment.accepting, r.data);
  ok('produto em promoção', r.data.categories[0].products[0].promo_price === 21.9);

  r = await pub('POST', '/api/public/demo/orders', { ...base, items: [{ kind: 'product', id: 1, quantity: 1, options: [1] }] });
  ok('rejeita grupo obrigatório faltando', r.status === 400, r.data);
  r = await pub('POST', '/api/public/demo/orders', { ...base, neighborhood: 'Lua', items: [{ kind: 'product', id: 2, quantity: 1 }] });
  ok('rejeita bairro não atendido', r.status === 400, r.data);
  r = await pub('POST', '/api/public/demo/orders', { ...base, items: [{ kind: 'product', id: 2, quantity: 1 }], coupon: 'NAOEXISTE' });
  ok('rejeita cupom inexistente', r.status === 400, r.data);
  r = await pub('POST', '/api/public/demo/orders', { ...base, items: [{ kind: 'product', id: 3, quantity: 31 }] });
  ok('rejeita estoque insuficiente', r.status === 409, r.data);
  r = await pub('POST', '/api/public/demo/orders', { ...base, items: [{ kind: 'product', id: 3, quantity: 1 }] });
  ok('rejeita pedido mínimo', r.status === 400 && /mínimo/.test(r.data.error), r.data);

  // 2x X-Burger promo (21,90) + bacon (4) = 51,80 ; 1 refri 6 ; combo 26 -> subtotal 83,80; cupom 10% (cap 10)=8,38; entrega 5
  const items = [{ kind: 'product', id: 1, quantity: 2, options: [1, 4], notes: 'sem cebola' }, { kind: 'product', id: 3, quantity: 1 }, { kind: 'combo', id: 1, quantity: 1 }];
  r = await pub('POST', '/api/public/demo/orders', { ...base, items, coupon: 'bemvindo10' });
  ok('cria pedido', r.status === 201 && r.data.number === 1, r.data);
  ok('total recalculado no servidor (80,42)', r.data.total === 80.42, r.data);
  ok('link do WhatsApp', /^https:\/\/wa\.me\/5511999999999\?text=/.test(r.data.whatsappUrl || ''));
  const orderId = r.data.id;
  r = await pub('POST', '/api/public/demo/orders', { ...base, items: [{ kind: 'product', id: 1, quantity: 1, options: [4], price: 0.01 }], change_for: 10 });
  ok('rejeita troco menor que total', r.status === 400, r.data);

  r = await adm('GET', '/api/orders');
  ok('API admin exige login', r.status === 401);
  r = await adm('POST', '/api/auth/login', { email: 'admin@demo.local', password: 'errada' });
  ok('login com senha errada falha', r.status === 401);
  r = await adm('POST', '/api/auth/login', { email: 'admin@demo.local', password: process.env.ADMIN_PASS });
  ok('login admin', r.status === 200, r.data);

  r = await adm('GET', '/api/orders');
  ok('lista pedidos', r.status === 200 && r.data.length === 1 && r.data[0].status === 'aguardando');
  r = await adm('GET', '/api/orders/counts'); ok('contagem', r.data.aguardando === 1, r.data);
  r = await adm('GET', `/api/orders/${orderId}`);
  ok('detalhe com itens e adicionais', r.data.items.length === 3 && r.data.items[0].options.length === 2 && r.data.discount === 8.38, r.data);
  r = await adm('GET', `/api/orders/${orderId}/ticket`); ok('comanda', /PEDIDO #1/.test(r.data.text), r.data);
  r = await adm('GET', '/api/stock'); ok('estoque baixou (30 -> 28)', r.data.find((x) => x.id === 3).qty === 28, r.data);

  r = await adm('POST', `/api/orders/${orderId}/status`, { status: 'concluido' }); ok('bloqueia pulo de status', r.status === 409);
  for (const s of ['confirmado', 'preparo', 'pronto', 'saiu_entrega']) { r = await adm('POST', `/api/orders/${orderId}/status`, { status: s }); ok('status ' + s, r.status === 200, r.data); }
  r = await adm('POST', `/api/orders/${orderId}/status`, { status: 'concluido' }); ok('status concluido', r.status === 200);

  r = await pub('POST', '/api/public/demo/orders', { ...base, items, coupon: 'BEMVINDO10' });
  const id2 = r.data.id;
  r = await adm('POST', `/api/orders/${id2}/status`, { status: 'cancelado' }); ok('cancela pedido', r.status === 200);
  r = await adm('GET', '/api/stock'); ok('estoque devolvido no cancelamento (28)', r.data.find((x) => x.id === 3).qty === 28, r.data);
  r = await adm('GET', '/api/stock/movements'); ok('histórico de movimentações', r.data.length >= 3);
  r = await adm('POST', '/api/stock/adjust', { type: 'product', id: 3, delta: 10, reason: 'Compra' }); ok('entrada de estoque', r.status === 200);
  r = await adm('POST', '/api/stock/adjust', { type: 'product', id: 3, delta: -999 }); ok('estoque negativo bloqueado', r.status === 400);

  r = await adm('GET', '/api/dashboard'); ok('dashboard', r.status === 200 && r.data.todayOrders === 1 && Math.abs(r.data.todaySales - 80.42) < 0.01, r.data);
  r = await adm('GET', '/api/reports'); ok('relatório', r.status === 200 && r.data.cancelled.n === 1 && r.data.totals.orders === 1 && r.data.top.length > 0, r.data);
  r = await adm('GET', '/api/reports/export?kind=orders'); ok('exporta CSV', r.status === 200 && /Maria/.test(r.data));

  r = await adm('POST', '/api/categories', { name: 'Sobremesas', sort_order: 3, active: true }); ok('cria categoria', r.status === 201, r.data);
  r = await adm('POST', '/api/products', { name: 'Pudim', price: 8, promo_price: 9, category_id: r.data.id }); ok('promo >= preço bloqueado', r.status === 400);
  r = await adm('POST', '/api/products', { name: 'Pudim', price: 8, category_id: 99999 }); ok('categoria de outro tenant bloqueada', r.status === 400, r.data);
  r = await adm('POST', '/api/coupons', { code: 'x', type: 'percent', value: 150 }); ok('cupom > 100% bloqueado', r.status === 400);
  r = await adm('PUT', '/api/settings', { name: 'Lanchonete Demo', whatsapp: '11999999999', pickup_enabled: true, delivery_enabled: true, min_order: 15, orders_paused: true, opening_hours: null });
  ok('salva configurações (pausa)', r.status === 200, r.data);
  r = await pub('POST', '/api/public/demo/orders', { ...base, items }); ok('pedido bloqueado com loja pausada', r.status === 409, r.data);
  r = await adm('PUT', '/api/settings', { name: 'Lanchonete Demo', whatsapp: '11999999999', pickup_enabled: true, delivery_enabled: true, min_order: 15, orders_paused: false, opening_hours: [0, 1, 2, 3, 4, 5, 6].map(() => ({ closed: true })) });
  r = await pub('POST', '/api/public/demo/orders', { ...base, items }); ok('pedido bloqueado fora do horário', r.status === 409 && /fechados/.test(r.data.error), r.data);

  r = await adm('POST', '/api/users', { name: 'Cozinha 1', email: 'coz@demo.local', role: 'cozinha', password: 'senha-12345' }); ok('cria usuário cozinha', r.status === 201, r.data);
  const uid = r.data.id;
  r = await adm('POST', `/api/users/${uid}/reset-link`); ok('link de redefinição', /reset\.html\?token=/.test(r.data.path || ''));
  const token = (r.data.path || '').split('token=')[1];
  r = await client()('POST', '/api/auth/reset', { token, password: 'nova-senha-123' }); ok('redefine senha', r.status === 200, r.data);
  r = await client()('POST', '/api/auth/reset', { token, password: 'outra-senha-123' }); ok('token de uso único', r.status === 400);
  const k = client();
  r = await k('POST', '/api/auth/login', { email: 'coz@demo.local', password: 'nova-senha-123' }); ok('login cozinha', r.status === 200);
  r = await k('GET', '/api/products'); ok('cozinha sem acesso ao cardápio admin', r.status === 403);
  r = await k('GET', '/api/dashboard'); ok('cozinha sem acesso ao dashboard', r.status === 403);
  r = await adm('PUT', `/api/users/1`, { name: 'Admin', email: 'admin@demo.local', role: 'cozinha', active: true }); ok('admin não se rebaixa', r.status === 400);

  console.log(fail ? `\n${fail} FALHA(S)` : '\nTudo certo.');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
