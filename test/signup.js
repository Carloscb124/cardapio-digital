// Testes do cadastro (API). Uso: BASE=http://localhost:3000 BASE2=http://localhost:3998 node test/signup.js
// BASE2 = servidor iniciado com SIGNUP_RATE_LIMIT=3 (para testar o limite de tentativas).
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

const good = { name: 'Pizzaria Boa Massa', slug: 'boa-massa', whatsapp: '11999998888', owner: 'Carlos Silva', email: 'carlos@boamassa.com.br', password: 'Massa2026ok', confirm: 'Massa2026ok' };

(async () => {
  /* Páginas */
  let r = await fetch(BASE + '/'); let html = await r.text();
  ok('landing page (/) responde 200', r.status === 200 && /Seu cardápio online/.test(html));
  ok('landing tem CTA para /cadastro e /login', (html.match(/href="\/cadastro"/g) || []).length >= 3 && /href="\/login"/.test(html));
  const anchors = [...html.matchAll(/href="#([\w-]+)"/g)].map((m) => m[1]);
  ok('âncoras da landing existem', anchors.length === 3 && anchors.every((a) => html.includes(`id="${a}"`)), anchors);
  ok('comanda de exemplo bate (54,80 = 49,80 + 5,00)', /TOTAL\s+R\$ 54,80/.test(html) && /Subtotal\s+R\$ 49,80/.test(html));
  r = await fetch(BASE + '/cadastro'); ok('/cadastro responde 200', r.status === 200 && /Criar minha conta/.test(await r.text()));
  r = await fetch(BASE + '/login'); ok('/login responde 200 e tem link para criar conta', r.status === 200 && /href="\/cadastro"/.test(await r.text()));
  r = await fetch(BASE + '/admin', { redirect: 'manual' }); ok('/admin sem login redireciona', r.status === 302);

  /* Disponibilidade do endereço */
  const c = client();
  const slugCase = async (s, avail, rx) => { const x = await c('GET', '/api/signup/slug/' + encodeURIComponent(s)); ok(`endereço "${s}" ${avail ? 'disponível' : 'recusado'}`, x.status === 200 && x.data.available === avail && (!rx || rx.test(x.data.reason || '')), x.data); };
  await slugCase('boa-massa', true); await slugCase('ab', false, /3 a 40/); await slugCase('Meu Lanche', false, /minúsculas/);
  await slugCase('-abc', false, /hífen/); await slugCase('a--b', false, /hífen/); await slugCase('admin', false, /reservado/);
  await slugCase('demo', false, /em uso/); await slugCase('a'.repeat(41), false, /3 a 40/); await slugCase('café', false, /minúsculas/);

  /* Validações do formulário (servidor) */
  const bad = async (name, patch, status, field, rx) => {
    const x = await c('POST', '/api/signup', { ...good, ...patch });
    ok(name, x.status === status && x.data.field === field && (!rx || rx.test(x.data.error)), x.data);
  };
  await bad('nome vazio', { name: '' }, 400, 'name'); await bad('nome com 1 letra', { name: 'A' }, 400, 'name');
  await bad('nome muito longo', { name: 'x'.repeat(121) }, 400, 'name', /120/);
  await bad('endereço vazio', { slug: '' }, 400, 'slug'); await bad('endereço curto', { slug: 'ab' }, 400, 'slug');
  await bad('endereço com hífen repetido', { slug: 'a--b' }, 400, 'slug'); await bad('endereço reservado', { slug: 'login' }, 400, 'slug', /reservado/);
  await bad('endereço já existente', { slug: 'demo' }, 409, 'slug', /em uso/);
  await bad('WhatsApp vazio', { whatsapp: '' }, 400, 'whatsapp'); await bad('WhatsApp curto', { whatsapp: '123' }, 400, 'whatsapp');
  await bad('WhatsApp com DDD inexistente', { whatsapp: '00999998888' }, 400, 'whatsapp');
  await bad('celular sem o 9', { whatsapp: '11888887777' }, 400, 'whatsapp'); await bad('fixo começando com 9', { whatsapp: '1199998888' }, 400, 'whatsapp');
  await bad('seu nome vazio', { owner: '' }, 400, 'owner'); await bad('seu nome com 1 letra', { owner: 'C' }, 400, 'owner');
  await bad('e-mail sem @', { email: 'carlos.com' }, 400, 'email'); await bad('e-mail sem domínio', { email: 'carlos@x' }, 400, 'email');
  await bad('e-mail com espaço', { email: 'car los@x.com' }, 400, 'email'); await bad('e-mail já cadastrado', { email: 'admin@demo.local' }, 409, 'email', /já está cadastrado/);
  await bad('e-mail já cadastrado (maiúsculas)', { email: 'ADMIN@demo.local' }, 409, 'email');
  await bad('senha curta', { password: 'abc12', confirm: 'abc12' }, 400, 'password', /8 caracteres/);
  await bad('senha sem número', { password: 'abcdefghij', confirm: 'abcdefghij' }, 400, 'password', /letra e um número/);
  await bad('senha sem letra', { password: '1234567890', confirm: '1234567890' }, 400, 'password', /letra e um número/);
  await bad('senha comum', { password: 'senha1234', confirm: 'senha1234' }, 400, 'password', /fácil de adivinhar/);
  await bad('senha igual ao nome', { owner: 'Carlos1234', password: 'carlos1234', confirm: 'carlos1234' }, 400, 'password');
  await bad('senha longa demais', { password: 'a1' + 'x'.repeat(100), confirm: 'a1' + 'x'.repeat(100) }, 400, 'password', /100/);
  await bad('confirmação diferente', { confirm: 'Outra2026ok' }, 400, 'confirm', /não conferem/);
  await bad('campo isca (robô) bloqueado', { website: 'http://spam' }, 400, undefined);
  let x = await c('POST', '/api/signup', good, { noCsrf: true }); ok('sem token CSRF é recusado', x.status === 403, x.data);
  x = await c('POST', '/api/signup', { ...good, name: ['a'], email: { a: 1 }, password: 12345678 }); ok('tipos inesperados não quebram o servidor', x.status === 400, x.data);
  x = await c('GET', '/api/auth/me'); ok('cadastro inválido não cria sessão', x.status === 401);

  /* Cadastro válido */
  const a = client();
  x = await a('POST', '/api/signup', { ...good, slug: ' Boa-Massa ', email: ' Carlos@BoaMassa.com.br ' });
  ok('cadastro válido (endereço e e-mail normalizados)', x.status === 201 && x.data.slug === 'boa-massa', x.data);
  x = await a('GET', '/api/auth/me'); ok('já entra logado como administrador', x.status === 200 && x.data.role === 'admin' && x.data.establishmentName === 'Pizzaria Boa Massa', x.data);
  x = await a('GET', '/api/settings'); ok('configurações guardam o WhatsApp só com dígitos', x.data.whatsapp === '11999998888' && x.data.slug === 'boa-massa', x.data);
  x = await a('GET', '/api/dashboard'); ok('painel novo vem zerado com "primeiros passos"', x.status === 200 && x.data.todayOrders === 0 && x.data.setup.products === 0 && x.data.setup.categories === 0 && x.data.setup.slug === 'boa-massa', x.data);
  x = await a('GET', '/api/products'); ok('conta nova não vê produtos da loja demo', x.status === 200 && x.data.length === 0, x.data);
  x = await a('GET', '/api/users'); ok('conta nova só vê o próprio usuário', x.data.length === 1 && x.data[0].email === 'carlos@boamassa.com.br', x.data);
  x = await a('GET', '/api/public/boa-massa/menu'); ok('cardápio público da nova loja já existe e aceita pedidos', x.status === 200 && x.data.establishment.accepting === true && x.data.categories.length === 0, x.data);
  x = await a('POST', '/api/categories', { name: 'Pizzas' }); ok('consegue cadastrar categoria logo após o cadastro', x.status === 201, x.data);

  /* Duplicidade depois de cadastrado */
  x = await client()('POST', '/api/signup', { ...good, email: 'outro@boamassa.com.br' }); ok('mesmo endereço não pode ser cadastrado de novo', x.status === 409 && x.data.field === 'slug', x.data);
  x = await client()('POST', '/api/signup', { ...good, slug: 'boa-massa-2' }); ok('mesmo e-mail não pode ser cadastrado de novo', x.status === 409 && x.data.field === 'email', x.data);
  x = await client()('GET', '/api/signup/slug/boa-massa'); ok('endereço aparece como em uso', x.data.available === false);
  const race = await Promise.all([1, 2, 3].map((i) => client()('POST', '/api/signup', { ...good, slug: 'corrida', email: `corrida${i}@x.com.br` })));
  ok('3 cadastros simultâneos com o mesmo endereço: só 1 vence', race.filter((q) => q.status === 201).length === 1 && race.filter((q) => q.status === 409).length === 2, race.map((q) => q.status));

  /* Login com a conta criada e isolamento entre lojas */
  const l = client();
  x = await l('POST', '/api/auth/login', { email: 'carlos@boamassa.com.br', password: good.password }); ok('login com a conta criada funciona', x.status === 200, x.data);
  x = await l('POST', '/api/auth/login', { email: 'carlos@boamassa.com.br', password: 'errada123' }); ok('login com senha errada falha', x.status === 401);
  const pub = client();
  const o = await pub('POST', '/api/public/demo/orders', { customer_name: 'Maria', customer_phone: '11988887777', type: 'retirada', payment_method: 'pix', items: [{ kind: 'product', id: 2, quantity: 1 }] });
  ok('pedido na loja demo criado para o teste de isolamento', o.status === 201, o.data);
  x = await l('GET', '/api/orders/' + o.data.id); ok('conta nova não enxerga pedido de outra loja', x.status === 404, x.data);
  x = await l('POST', `/api/orders/${o.data.id}/status`, { status: 'confirmado' }); ok('conta nova não altera pedido de outra loja', x.status === 404, x.data);

  /* Limite de tentativas */
  if (BASE2) {
    const lim = client(BASE2); const codes = [];
    for (let i = 0; i < 5; i++) codes.push((await lim('POST', '/api/signup', { ...good, name: '' })).status);
    ok('limite de tentativas de cadastro (429 após 3)', codes.slice(0, 3).every((s) => s === 400) && codes.slice(3).every((s) => s === 429), codes);
  }
  console.log(fails ? `\n${fails} FALHA(S)` : '\nCadastro OK.'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
