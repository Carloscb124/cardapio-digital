// Pedidos e clientes criados pela equipe no painel (API). Uso: BASE=... ADMIN_PASS=... node test/staff.js
const BASE = process.env.BASE || 'http://localhost:3000';
function client() {
  let cookie = '', csrf = '';
  return async (method, path, body) => {
    const h = {};
    if (body !== undefined) h['Content-Type'] = 'application/json';
    if (method !== 'GET') {
      if (!csrf) { const r = await fetch(BASE + '/api/csrf', { headers: { cookie } }); const c = r.headers.get('set-cookie'); if (c) cookie = c.split(';')[0]; csrf = (await r.json()).token; }
      h['x-csrf-token'] = csrf;
    }
    h.cookie = cookie;
    const r = await fetch(BASE + path, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
    const c = r.headers.get('set-cookie'); if (c) { cookie = c.split(';')[0]; csrf = ''; }
    const t = await r.text(); let data; try { data = JSON.parse(t); } catch { data = t; }
    return { status: r.status, data };
  };
}
let fails = 0;
const ok = (n, c, x = '') => { console.log(c ? 'OK   ' : 'FALHA', n, c ? '' : JSON.stringify(x)); if (!c) fails++; };
const items = () => [{ kind: 'product', id: 1, quantity: 1, options: [1, 4] }, { kind: 'combo', id: 1, quantity: 1 }, { kind: 'product', id: 3, quantity: 2 }];
const order = (p = {}) => ({ customer_name: 'João Balcão', customer_phone: '(11) 97766-5544', type: 'retirada', payment_method: 'dinheiro', change_for: 100, status: 'confirmado', items: items(), ...p });

(async () => {
  const adm = client(), at = client(), kz = client(), anon = client(), lb = client(), pub = client();
  await adm('POST', '/api/auth/login', { email: 'admin@demo.local', password: process.env.ADMIN_PASS });
  await adm('POST', '/api/users', { name: 'Atendente', email: 'at@demo.local', role: 'atendente', password: 'senha-12345' });
  await adm('POST', '/api/users', { name: 'Cozinha', email: 'coz@demo.local', role: 'cozinha', password: 'senha-12345' });
  await at('POST', '/api/auth/login', { email: 'at@demo.local', password: 'senha-12345' }); await kz('POST', '/api/auth/login', { email: 'coz@demo.local', password: 'senha-12345' });
  const atId = (await at('GET', '/api/auth/me')).data.id;

  let r = await anon('GET', '/api/orders/menu'); ok('cardápio do painel exige login', r.status === 401);
  r = await kz('GET', '/api/orders/menu'); ok('cozinha não acessa o cardápio de lançamento', r.status === 403);
  r = await kz('POST', '/api/orders', order()); ok('cozinha não cria pedidos', r.status === 403);
  r = await at('GET', '/api/orders/menu'); ok('atendente carrega o cardápio para lançar pedidos', r.status === 200 && r.data.categories.length === 2 && r.data.zones.length === 2, r.data);

  /* criar pedido pela equipe */
  r = await at('POST', '/api/orders', order()); const o1 = r.data;
  ok('atendente cria pedido confirmado', r.status === 201 && o1.id && o1.number && Math.abs(o1.total - 63.9) < 0.001 && /^[a-f0-9]{32}$/.test(o1.token), r.data);
  r = await at('GET', '/api/orders/' + o1.id);
  ok('pedido guarda origem "painel", autor e status confirmado', r.data.source === 'painel' && r.data.created_by === atId && r.data.status === 'confirmado' && r.data.items.length === 3, r.data);
  r = await client()('GET', '/api/public/track/' + o1.token); ok('histórico registra aguardando e confirmado', r.data.history.map((h) => h.status).join() === 'aguardando,confirmado', r.data);
  r = await adm('GET', '/api/stock'); ok('estoque baixou (refrigerante direto + no combo: 30 → 27)', r.data.find((x) => x.id === 3).qty === 27, r.data);
  r = await at('POST', '/api/orders', order({ status: undefined, customer_name: 'Sem Status' })); r = await at('GET', '/api/orders/' + r.data.id); ok('sem status informado entra como aguardando', r.data.status === 'aguardando');

  /* equipe não é barrada por horário, pausa e pedido mínimo */
  const st = (await adm('GET', '/api/settings')).data;
  await adm('PUT', '/api/settings', { ...st, orders_paused: true });
  r = await pub('POST', '/api/public/demo/orders', { customer_name: 'Cli', customer_phone: '11911112222', type: 'retirada', payment_method: 'pix', items: [{ kind: 'product', id: 2, quantity: 1 }] }); ok('cliente online é barrado com a loja pausada', r.status === 409);
  r = await at('POST', '/api/orders', order({ items: [{ kind: 'product', id: 3, quantity: 1 }], change_for: undefined, payment_method: 'pix' })); ok('equipe lança pedido com a loja pausada e abaixo do mínimo', r.status === 201, r.data);
  await adm('PUT', '/api/settings', { ...st, orders_paused: false });

  /* validações iguais às do cardápio */
  const bad = async (n, p, s) => { const x = await at('POST', '/api/orders', order(p)); ok(n, x.status === s, x.data); };
  await bad('carrinho vazio', { items: [] }, 400); await bad('entrega sem endereço', { type: 'entrega' }, 400);
  await bad('entrega para bairro não atendido', { type: 'entrega', address: 'Rua Lua, 1', neighborhood: 'Lua' }, 400);
  await bad('forma de pagamento inválida', { payment_method: 'cheque' }, 400); await bad('opção inexistente', { items: [{ kind: 'product', id: 1, quantity: 1, options: [99999] }] }, 400);
  await bad('grupo obrigatório faltando', { items: [{ kind: 'product', id: 1, quantity: 1, options: [1] }] }, 400);
  await bad('estoque insuficiente', { items: [{ kind: 'product', id: 3, quantity: 99 }] }, 409); await bad('cupom inexistente', { coupon: 'NAOEXISTE' }, 400);
  await bad('telefone inválido', { customer_phone: '123' }, 400); await bad('troco menor que o total', { change_for: 10 }, 400);
  r = await at('POST', '/api/orders', order({ customer_name: '', customer_phone: '', change_for: undefined, payment_method: 'pix' }));
  ok('cliente avulso (sem nome e sem telefone) é aceito', r.status === 201, r.data); const avulso = (await at('GET', '/api/orders/' + r.data.id)).data;
  ok('avulso vira "Cliente balcão" e não cria cadastro de cliente', avulso.customer_name === 'Cliente balcão' && avulso.customer_id === null && !(await at('GET', '/api/customers')).data.some((c) => c.phone === ''), avulso);
  r = await at('POST', '/api/orders/coupon-preview', { code: 'bemvindo10', subtotal: 50 }); ok('prévia de cupom no painel', r.status === 200 && r.data.discount === 5, r.data);
  r = await at('POST', '/api/orders', order({ coupon: 'BEMVINDO10', change_for: 200 })); ok('pedido da equipe com cupom e entrega', r.status === 201 && Math.abs(r.data.total - (63.9 - 6.39)) < 0.001, r.data);

  /* isolamento entre lojas */
  r = await lb('POST', '/api/signup', { name: 'Loja B', slug: 'loja-b', whatsapp: '11999998888', owner: 'Dona B', email: 'b@lojab.com.br', password: 'LojaB2026ok', confirm: 'LojaB2026ok' });
  r = await lb('POST', '/api/orders', order({ items: [{ kind: 'product', id: 1, quantity: 1, options: [1, 4] }] })); ok('loja B não vende produtos da loja demo', r.status === 400, r.data);
  r = await lb('GET', '/api/orders/menu'); ok('cardápio de lançamento da loja B é o dela (vazio)', r.status === 200 && r.data.categories.length === 0);

  /* clientes */
  const cust = { name: 'Maria Silva', phone: '(21) 98888-1111', address: 'Rua A, 10', neighborhood: 'Centro', notes: 'Sem cebola' };
  r = await at('POST', '/api/customers', cust); const mid = r.data.id; ok('atendente cadastra cliente', r.status === 201 && mid, r.data);
  r = await at('POST', '/api/customers', { ...cust, phone: '123' }); ok('telefone inválido no cadastro', r.status === 400 && r.data.field === 'phone', r.data);
  r = await at('POST', '/api/customers', { ...cust, name: 'M' }); ok('nome curto no cadastro', r.status === 400 && r.data.field === 'name', r.data);
  r = await at('POST', '/api/customers', { ...cust, address: 'x'.repeat(300) }); ok('endereço longo demais', r.status === 400 && r.data.field === 'address', r.data);
  r = await at('POST', '/api/customers', cust); ok('WhatsApp repetido é recusado', r.status === 409 && r.data.field === 'phone', r.data);
  r = await at('GET', '/api/customers'); const m = r.data.find((c) => c.id === mid); ok('lista traz endereço, bairro e observações', m && m.address === 'Rua A, 10' && m.neighborhood === 'Centro' && m.notes === 'Sem cebola' && m.orders === 0, m);
  r = await at('GET', '/api/customers?q=maria'); ok('busca por nome', r.data.length === 1 && r.data[0].id === mid, r.data);
  r = await at('GET', '/api/customers?q=88881'); ok('busca por parte do telefone', r.data.some((c) => c.id === mid));
  r = await at('GET', '/api/customers?q=zzzz'); ok('busca sem resultado', r.data.length === 0);
  r = await at('POST', '/api/customers', { name: 'Pedro Alves', phone: '21977770000' }); const pid = r.data.id;
  r = await at('PUT', '/api/customers/' + mid, { ...cust, name: 'Maria S. Silva' }); ok('edita cliente', r.status === 200); r = await at('GET', '/api/customers?q=maria'); ok('edição aparece na lista', r.data[0].name === 'Maria S. Silva');
  r = await at('PUT', '/api/customers/' + mid, { ...cust, phone: '21977770000' }); ok('editar para um WhatsApp já usado é recusado', r.status === 409, r.data);
  r = await lb('PUT', '/api/customers/' + mid, cust); ok('loja B não edita cliente da loja demo', r.status === 404);
  r = await at('DELETE', '/api/customers/' + pid); ok('atendente não exclui cliente', r.status === 403);
  r = await kz('GET', '/api/customers'); ok('cozinha não vê clientes', r.status === 403); r = await kz('POST', '/api/customers', cust); ok('cozinha não cadastra clientes', r.status === 403);
  r = await adm('DELETE', '/api/customers/' + pid); ok('admin exclui cliente', r.status === 200);
  const joao = (await at('GET', '/api/customers?q=joão')).data.find((c) => c.phone === '11977665544'); ok('cliente criado pelo pedido do painel já fica cadastrado', joao && joao.orders >= 2, joao);
  await adm('DELETE', '/api/customers/' + joao.id); r = await at('GET', '/api/orders/' + o1.id); ok('excluir cliente não apaga seus pedidos', r.status === 200 && r.data.customer_id === null, r.data);

  /* pedido online grava o último endereço no cadastro */
  r = await pub('POST', '/api/public/demo/orders', { customer_name: 'Carlos Online', customer_phone: '11955554444', type: 'entrega', address: 'Rua Nova, 77', neighborhood: 'Centro', payment_method: 'pix', items: [{ kind: 'product', id: 2, quantity: 1 }] });
  ok('pedido online criado', r.status === 201, r.data); r = await at('GET', '/api/customers?q=5555'); ok('endereço do último pedido fica no cadastro do cliente', r.data[0] && r.data[0].address === 'Rua Nova, 77' && r.data[0].neighborhood === 'Centro', r.data);
  console.log(fails ? `\n${fails} FALHA(S)` : '\nPedidos e clientes da equipe OK.'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
