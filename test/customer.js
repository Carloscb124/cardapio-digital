// Testes da área do cliente (API). Uso: BASE=... BASE2=... ADMIN_PASS=... node test/customer.js
const BASE = process.env.BASE || 'http://localhost:3000', BASE2 = process.env.BASE2;
function client(base = BASE) {
  let cookie = '', csrf = '';
  return async (method, path, body, opts = {}) => {
    const h = {};
    if (body !== undefined) h['Content-Type'] = 'application/json';
    if (method !== 'GET' && !opts.noCsrf) {
      if (!csrf) { const r = await fetch(base + '/api/csrf', { headers: { cookie } }); const c = r.headers.get('set-cookie'); if (c) cookie = c.split(';')[0]; csrf = (await r.json()).token; }
      h['x-csrf-token'] = csrf;
    }
    h.cookie = cookie;
    const r = await fetch(base + path, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
    const c = r.headers.get('set-cookie'); if (c) { cookie = c.split(';')[0]; csrf = ''; }
    const t = await r.text(); let data; try { data = JSON.parse(t); } catch { data = t; }
    return { status: r.status, data };
  };
}
let fails = 0;
const ok = (n, c, x = '') => { console.log(c ? 'OK   ' : 'FALHA', n, c ? '' : JSON.stringify(x)); if (!c) fails++; };
const C = '/api/customer/demo';
const ana = { name: 'Ana Souza', phone: '(11) 98888-7777', password: 'doce2026', confirm: 'doce2026' };
const base = { customer_name: 'Ana Souza', customer_phone: '11988887777', type: 'entrega', address: 'Rua das Flores, 123', neighborhood: 'Centro', payment_method: 'pix' };

(async () => {
  const adm = client(); await adm('POST', '/api/auth/login', { email: 'admin@demo.local', password: process.env.ADMIN_PASS });
  const a = client(), b = client(), guest = client();

  /* Cadastro de cliente */
  const reg = async (name, patch, st, field) => { const r = await client()('POST', C + '/register', { ...ana, ...patch }); ok(name, r.status === st && (!field || r.data.field === field), r.data); };
  await reg('nome vazio', { name: '' }, 400, 'name'); await reg('WhatsApp inválido', { phone: '123' }, 400, 'phone'); await reg('DDD inexistente', { phone: '00988887777' }, 400, 'phone');
  await reg('senha curta', { password: '123', confirm: '123' }, 400, 'password'); await reg('senha comum', { password: '123456', confirm: '123456' }, 400, 'password');
  await reg('senha de caractere repetido', { password: 'aaaaaa', confirm: 'aaaaaa' }, 400, 'password'); await reg('confirmação diferente', { confirm: 'outra123' }, 400, 'confirm');
  let r = await client()('POST', '/api/customer/nao-existe/register', ana); ok('loja inexistente', r.status === 404);
  r = await client()('POST', C + '/register', ana, { noCsrf: true }); ok('sem CSRF é recusado', r.status === 403);
  r = await a('POST', C + '/register', ana); ok('cadastro do cliente', r.status === 200, r.data);
  r = await a('GET', C + '/me'); ok('já entra logada; telefone guardado só com dígitos', r.status === 200 && r.data.phone === '11988887777' && r.data.name === 'Ana Souza' && r.data.addresses.length === 0, r.data);
  r = await client()('POST', C + '/register', ana); ok('WhatsApp repetido na mesma loja é recusado', r.status === 409 && r.data.field === 'phone', r.data);
  r = await guest('GET', C + '/me'); ok('visitante sem conta não acessa /me', r.status === 401);
  await a('POST', C + '/logout', {}); r = await a('GET', C + '/me'); ok('logout encerra a sessão do cliente', r.status === 401);
  r = await a('POST', C + '/login', { phone: '11988887777', password: 'errada1' }); const m1 = r.data.error; ok('senha errada', r.status === 401);
  r = await a('POST', C + '/login', { phone: '11977776666', password: 'doce2026' }); ok('telefone desconhecido dá a mesma mensagem (sem revelar contas)', r.status === 401 && r.data.error === m1);
  r = await a('POST', C + '/login', { phone: '(11) 98888-7777', password: 'doce2026' }); ok('login com máscara', r.status === 200);
  r = await b('POST', C + '/register', { name: 'Beto Lima', phone: '21977776666', password: 'beto2026x', confirm: 'beto2026x' }); ok('segunda cliente (Beto)', r.status === 200);

  /* Isolamento entre lojas */
  const lb = client(); r = await lb('POST', '/api/signup', { name: 'Loja B', slug: 'loja-b', whatsapp: '11999998888', owner: 'Dona B', email: 'b@lojab.com.br', password: 'LojaB2026ok', confirm: 'LojaB2026ok' }); ok('loja B criada', r.status === 201, r.data);
  r = await a('GET', '/api/customer/loja-b/me'); ok('sessão da loja demo não vale na loja B', r.status === 401);
  r = await client()('POST', '/api/customer/loja-b/register', ana); ok('mesmo WhatsApp pode ter conta em outra loja', r.status === 200, r.data);

  /* Endereços */
  const addr = (p) => a('POST', C + '/addresses', { label: 'Casa', address: 'Rua das Flores, 123', neighborhood: 'Centro', ...p });
  r = await addr({ address: 'Rua' }); ok('endereço curto', r.status === 400 && r.data.field === 'address');
  r = await addr({ label: '' }); ok('endereço sem apelido', r.status === 400 && r.data.field === 'label');
  r = await addr({}); const addrId = r.data.id; ok('salva endereço', r.status === 201, r.data);
  for (let i = 0; i < 4; i++) await addr({ label: 'Outro ' + i });
  r = await addr({ label: 'Sexto' }); ok('limite de 5 endereços', r.status === 400 && /5 endereços/.test(r.data.error), r.data);
  r = await b('DELETE', `${C}/addresses/${addrId}`); ok('outro cliente não remove meu endereço', r.status === 404);
  r = await a('DELETE', `${C}/addresses/${addrId}`); ok('remove o próprio endereço', r.status === 200); r = await a('DELETE', `${C}/addresses/${addrId}`); ok('remover de novo dá 404', r.status === 404);
  r = await a('GET', C + '/me'); ok('lista de endereços da conta', r.data.addresses.length === 4, r.data);

  /* Pedido logado x visitante + acompanhamento */
  const items = [{ kind: 'product', id: 1, quantity: 2, options: [1, 4], notes: 'sem cebola' }, { kind: 'combo', id: 1, quantity: 1 }, { kind: 'product', id: 3, quantity: 1 }];
  r = await a('POST', '/api/public/demo/orders', { ...base, items }); const o1 = r.data; ok('pedido logado criado com link de acompanhamento', r.status === 201 && /^[a-f0-9]{32}$/.test(o1.token) && o1.trackUrl === '/pedido/' + o1.token, r.data);
  r = await guest('POST', '/api/public/demo/orders', { ...base, customer_name: 'Visitante', items: [{ kind: 'product', id: 2, quantity: 1 }] }); const og = r.data; ok('pedido de visitante criado', r.status === 201, r.data);
  r = await a('GET', C + '/orders'); ok('histórico da cliente só tem o pedido dela', r.data.length === 1 && r.data[0].number === o1.number && r.data[0].tracking_token === o1.token, r.data);
  r = await b('GET', C + '/orders'); ok('outra cliente não vê pedidos alheios', r.data.length === 0);
  const tr = client(); r = await tr('GET', '/api/public/track/' + o1.token);
  ok('acompanhamento por link (sem login)', r.status === 200 && r.data.status === 'aguardando' && r.data.items.length === 3 && r.data.items[0].options.length === 2 && r.data.history.length === 1, r.data);
  ok('acompanhamento reenvia o WhatsApp enquanto aguarda confirmação', /^https:\/\/wa\.me\//.test(r.data.whatsappUrl || ''));
  const raw = JSON.stringify({ ...r.data, whatsappUrl: null }); ok('acompanhamento não expõe telefone, token nem ids internos', !/customer_phone|tracking_token|establishment_id|11988887777/.test(raw), raw.slice(0, 200));
  r = await tr('GET', '/api/public/track/zzzz'); ok('token em formato inválido', r.status === 404);
  r = await tr('GET', '/api/public/track/' + 'a'.repeat(32)); ok('token inexistente', r.status === 404);
  const page = await fetch(BASE + '/pedido/' + o1.token); ok('página /pedido/<token> abre', page.status === 200 && /Acompanhar|pedido/i.test(await page.text()));

  const id1 = (await adm('GET', '/api/orders')).data.find((o) => o.number === o1.number).id;
  for (const s of ['confirmado', 'preparo', 'pronto', 'saiu_entrega', 'concluido']) await adm('POST', `/api/orders/${id1}/status`, { status: s });
  r = await tr('GET', '/api/public/track/' + o1.token); ok('acompanhamento reflete o andamento e guarda o histórico', r.data.status === 'concluido' && r.data.history.map((h) => h.status).join() === 'aguardando,confirmado,preparo,pronto,saiu_entrega,concluido' && r.data.whatsappUrl === null, r.data);
  const idg = (await adm('GET', '/api/orders')).data.find((o) => o.number === og.number).id;
  await adm('POST', `/api/orders/${idg}/status`, { status: 'cancelado' });
  r = await tr('GET', '/api/public/track/' + og.token); ok('pedido cancelado aparece como cancelado', r.data.status === 'cancelado');
  r = await adm('GET', '/api/orders/' + id1); ok('painel mostra o token para a equipe enviar o link', r.data.tracking_token === o1.token);

  /* Pedir de novo */
  r = await a('POST', `${C}/orders/${(await a('GET', C + '/orders')).data[0].id}/reorder`);
  ok('pedir de novo remonta 3 itens com adicionais e combo', r.status === 200 && r.data.lines.length === 3 && r.data.skipped === 0 && r.data.lines[0].options.length === 2 && r.data.lines.some((l) => l.kind === 'combo'), r.data);
  const lines = r.data.lines;
  r = await a('POST', '/api/public/demo/orders', { ...base, items: lines.map((l) => ({ kind: l.kind, id: l.id, quantity: l.qty, options: l.options.map((o) => o.id), notes: l.notes })) });
  ok('as linhas do "pedir de novo" geram um pedido válido', r.status === 201, r.data);
  const prods = (await adm('GET', '/api/products')).data; const p3 = prods.find((p) => p.id === 3);
  await adm('PUT', '/api/products/3', { ...p3, available: false });
  const hist = (await a('GET', C + '/orders')).data;
  r = await a('POST', `${C}/orders/${hist[hist.length - 1].id}/reorder`); ok('item indisponível é ignorado e informado', r.status === 200 && r.data.lines.length === 2 && r.data.skipped === 1, r.data);
  await adm('PUT', '/api/products/3', { ...p3, available: true });
  r = await b('POST', `${C}/orders/${hist[0].id}/reorder`); ok('não dá para repetir pedido de outro cliente', r.status === 404);

  /* Senha */
  r = await a('POST', C + '/password', { current: 'errada', password: 'nova2026x', confirm: 'nova2026x' }); ok('troca de senha exige a senha atual', r.status === 400 && r.data.field === 'current', r.data);
  r = await a('POST', C + '/password', { current: 'doce2026', password: '123', confirm: '123' }); ok('nova senha fraca é recusada', r.status === 400 && r.data.field === 'password');
  r = await a('POST', C + '/password', { current: 'doce2026', password: 'nova2026x', confirm: 'nova2026x' }); ok('troca de senha', r.status === 200, r.data);
  r = await client()('POST', C + '/login', { phone: '11988887777', password: 'doce2026' }); ok('senha antiga deixa de funcionar', r.status === 401);
  r = await client()('POST', C + '/login', { phone: '11988887777', password: 'nova2026x' }); ok('senha nova funciona', r.status === 200);

  /* Painel: clientes e recuperação de acesso */
  r = await adm('GET', '/api/customers'); const row = r.data.find((c) => c.phone === '11988887777');
  ok('painel lista clientes com pedidos, total gasto e conta', r.status === 200 && row && row.orders >= 2 && row.spent > 0 && row.account_id, r.data);
  r = await lb('GET', '/api/customers'); ok('loja B não vê clientes da loja demo', r.status === 200 && !r.data.some((c) => c.phone === '11988887777' && c.orders > 0), r.data);
  r = await lb('POST', `/api/customers/${row.account_id}/reset-link`); ok('loja B não gera link para cliente da demo', r.status === 404, r.data);
  await adm('POST', '/api/users', { name: 'Cozinha', email: 'coz@demo.local', role: 'cozinha', password: 'senha-12345' });
  const k = client(); await k('POST', '/api/auth/login', { email: 'coz@demo.local', password: 'senha-12345' }); r = await k('GET', '/api/customers'); ok('cozinha não acessa clientes', r.status === 403);
  r = await adm('POST', `/api/customers/${row.account_id}/reset-link`); const tok = (r.data.path || '').split('reset=')[1]; ok('admin gera link de nova senha', /^\/m\/demo\?reset=[a-f0-9]{64}$/.test(r.data.path || ''), r.data);
  r = await client()('POST', C + '/reset', { token: tok, password: '123' }); ok('reset com senha fraca é recusado', r.status === 400);
  r = await client()('POST', '/api/customer/loja-b/reset', { token: tok, password: 'reset2026ok' }); ok('link de uma loja não vale em outra', r.status === 400);
  r = await client()('POST', C + '/reset', { token: tok, password: 'reset2026ok' }); ok('cliente define nova senha pelo link', r.status === 200, r.data);
  r = await client()('POST', C + '/login', { phone: '11988887777', password: 'reset2026ok' }); ok('login com a senha definida pelo link', r.status === 200);
  r = await client()('POST', C + '/reset', { token: tok, password: 'outra2026ok' }); ok('link é de uso único', r.status === 400);

  /* Limite de tentativas */
  if (BASE2) { const l = client(BASE2); const codes = []; for (let i = 0; i < 5; i++) codes.push((await l('POST', C + '/login', { phone: '11988887777', password: 'x' })).status); ok('limite de tentativas de login (429 após 3)', codes.slice(0, 3).every((s) => s === 401 || s === 404) && codes.slice(3).every((s) => s === 429), codes); }
  console.log(fails ? `\n${fails} FALHA(S)` : '\nÁrea do cliente OK.'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
