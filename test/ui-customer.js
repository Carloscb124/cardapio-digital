// Teste de interface da área do cliente (jsdom): conta, endereços, pedido logado, histórico, pedir de novo, reset e acompanhamento.
const fs = require('fs'), path = require('path'), vm = require('vm');
const { JSDOM, VirtualConsole } = require('jsdom');
const BASE = process.env.BASE || 'http://localhost:3000';
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
let fails = 0; const errors = [];
const ok = (n, c, x = '') => { console.log(c ? 'OK   ' : 'FALHA', n, c ? '' : JSON.stringify(x)); if (!c) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function open(html, url, scripts, jar = { c: '' }) {
  const vc = new VirtualConsole(); vc.on('jsdomError', (e) => errors.push(e.message)); vc.on('error', (...a) => errors.push(a.join(' ')));
  const dom = new JSDOM(read(html).replace(/<script[^>]*src="[^>]*><\/script>/g, ''), { url, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window, ctx = dom.getInternalVMContext();
  w.fetch = async (u, o = {}) => { const r = await fetch(new URL(u, BASE), { ...o, headers: { ...(o.headers || {}), cookie: jar.c } }); const sc = r.headers.get('set-cookie'); if (sc) jar.c = sc.split(';')[0]; return r; };
  w.alert = (m) => errors.push('alert: ' + m); w.confirm = () => true;
  const Cls = class { constructor(el) { this.el = el; } show() { this.el.classList.add('show'); } hide() { this.el.classList.remove('show'); this.el.dispatchEvent(new w.Event('hidden.bs.modal')); } dispose() {} static getOrCreateInstance(el) { return new this(el); } static getInstance(el) { return new this(el); } };
  w.bootstrap = { Modal: Cls, Offcanvas: Cls, Toast: class { constructor() {} show() {} } };
  w.Chart = class { constructor() { this.data = { labels: [], datasets: [{}] }; } update() {} destroy() {} };
  w.navigator.clipboard = { writeText: async () => {} };
  w.exec = (code) => new vm.Script(code).runInContext(ctx);
  scripts.forEach((f) => new vm.Script(read(f), { filename: f }).runInContext(ctx));
  return w;
}
const MENU = ['public/js/api.js', 'public/js/br.js', 'public/js/menu.js', 'public/js/account.js'];
const click = (w, el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
const change = (w, el) => el.dispatchEvent(new w.Event('change', { bubbles: true }));
const type = (w, id, v) => { const el = w.document.getElementById(id); el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); };
const submit = (w, id) => w.document.getElementById(id).dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
const txt = (w, sel) => (w.document.querySelector(sel) || { textContent: '' }).textContent;

(async () => {
  /* admin (HTTP) para mudar status e gerar links */
  let ck = '', cs = '';
  const adm = async (method, p, body) => {
    const h = { 'Content-Type': 'application/json' };
    if (method !== 'GET') { if (!cs) { const r = await fetch(BASE + '/api/csrf', { headers: { cookie: ck } }); const c = r.headers.get('set-cookie'); if (c) ck = c.split(';')[0]; cs = (await r.json()).token; } h['x-csrf-token'] = cs; }
    h.cookie = ck; const r = await fetch(BASE + p, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
    const c = r.headers.get('set-cookie'); if (c) { ck = c.split(';')[0]; cs = ''; } return { status: r.status, data: await r.json().catch(() => ({})) };
  };
  await adm('POST', '/api/auth/login', { email: 'admin@demo.local', password: process.env.ADMIN_PASS });

  /* ===== Cliente: criar conta ===== */
  const jar = { c: '' }; let w = open('public/menu.html', BASE + '/m/demo', MENU, jar); await sleep(600);
  ok('botões de conta no topo do cardápio', !!w.document.getElementById('acctBtn') && /Entrar/.test(txt(w, '#acctLabel')));
  click(w, w.document.getElementById('acctBtn'));
  ok('janela de conta abre no login', !!w.document.getElementById('fLogin'));
  click(w, w.document.querySelector('[data-tab="register"]'));
  submit(w, 'fRegister'); ok('cadastro vazio mostra erro no nome', w.document.getElementById('rgName').classList.contains('is-invalid'));
  type(w, 'rgName', 'Carla Dias'); type(w, 'rgPhone', '21977771234'); ok('máscara do WhatsApp', w.document.getElementById('rgPhone').value === '(21) 97777-1234', w.document.getElementById('rgPhone').value);
  type(w, 'rgPass', '123'); type(w, 'rgConfirm', '123'); submit(w, 'fRegister'); ok('senha curta recusada', w.document.getElementById('rgPass').classList.contains('is-invalid'));
  type(w, 'rgPass', 'carla2026'); type(w, 'rgConfirm', 'outra'); submit(w, 'fRegister'); ok('confirmação diferente recusada', w.document.getElementById('rgConfirm').classList.contains('is-invalid'));
  type(w, 'rgConfirm', 'carla2026'); submit(w, 'fRegister'); await sleep(900);
  ok('conta criada: topo mostra o nome e já entra logada', /Olá, Carla/.test(txt(w, '#acctLabel')) && /Carla Dias/.test(txt(w, '#acctBody')), txt(w, '#acctBody').slice(0, 150));
  ok('histórico vazio com mensagem', /ainda não tem pedidos/.test(txt(w, '#histBox')));

  /* endereço salvo */
  type(w, 'adLabel', 'Casa'); type(w, 'adAddr', 'Rua Azul, 45'); submit(w, 'fAddr'); await sleep(200);
  ok('endereço sem bairro é aceito (bairro é opcional na conta)', /Casa/.test(txt(w, '#acctBody')) && /Rua Azul, 45/.test(txt(w, '#acctBody')), txt(w, '#acctBody').slice(0, 250));
  type(w, 'adLabel', 'Trabalho'); type(w, 'adAddr', 'Av. Verde, 900'); w.document.getElementById('adHood').value = 'Jardim das Flores'; submit(w, 'fAddr'); await sleep(900);
  ok('segundo endereço com bairro salvo', /Trabalho/.test(txt(w, '#acctBody')) && /Jardim das Flores/.test(txt(w, '#acctBody')));
  type(w, 'adAddr', 'x'); type(w, 'adLabel', 'Curto'); submit(w, 'fAddr'); await sleep(700);
  ok('endereço curto mostra erro do servidor no campo', w.document.getElementById('adAddr').classList.contains('is-invalid'));
  w.document.getElementById('acctModal').classList.remove('show');

  /* ===== Pedido logado usando endereço salvo ===== */
  click(w, w.document.querySelector('.prod[data-p="2"]')); click(w, w.document.getElementById('pmAdd')); click(w, w.document.getElementById('openCart'));
  ok('checkout mostra que está logada e lista os endereços salvos', /entrou como Carla/.test(txt(w, '#cartBody')) && w.document.getElementById('savedAddr').options.length === 3);
  ok('nome e WhatsApp já preenchidos', w.document.getElementById('cname').value === 'Carla Dias' && w.document.getElementById('cphone').value === '(21) 97777-1234');
  const sa = w.document.getElementById('savedAddr'); sa.value = [...sa.options].find((o) => /Trabalho/.test(o.textContent)).value; change(w, sa);
  ok('escolher endereço salvo preenche endereço e bairro', w.document.getElementById('addr').value === 'Av. Verde, 900' && w.document.getElementById('hood').value === 'Jardim das Flores');
  w.document.getElementById('pay').value = 'pix'; change(w, w.document.getElementById('pay'));
  click(w, w.document.getElementById('send')); await sleep(900);
  ok('pedido registrado com botão de acompanhar', /Pedido #1 registrado/.test(txt(w, '#cartBody')) && !!w.document.querySelector('#cartBody a[href^="/pedido/"]'), txt(w, '#cartBody').slice(0, 200));
  const trackHref = w.document.querySelector('#cartBody a[href^="/pedido/"]').getAttribute('href');

  /* histórico + pedir de novo */
  click(w, w.document.getElementById('acctBtn')); await sleep(500);
  ok('histórico mostra o pedido com status', /Pedido #1/.test(txt(w, '#histBox')) && /Aguardando confirmação/.test(txt(w, '#histBox')) && !!w.document.querySelector('#histBox a[href="' + trackHref + '"]'), txt(w, '#histBox'));
  click(w, w.document.querySelector('[data-reorder]')); await sleep(600);
  ok('"pedir de novo" recoloca o item no carrinho', w.document.getElementById('cartCount').textContent === '1' && /X-Frango/.test(txt(w, '#cartBody')), txt(w, '#cartCount'));

  /* ===== Acompanhamento ===== */
  const tw = open('public/track.html', BASE + trackHref, ['public/js/api.js', 'public/js/track.js']); await sleep(700);
  ok('página de acompanhamento mostra o pedido e aguarda confirmação', /Pedido #1/.test(txt(tw, '#app')) && /Aguardando o estabelecimento confirmar/.test(txt(tw, '.status-box')), txt(tw, '#app').slice(0, 150));
  ok('mostra botão do WhatsApp enquanto não confirmado', !!tw.document.querySelector('a[href^="https://wa.me/"]') && /ainda não enviou/.test(txt(tw, '#app')));
  ok('linha do tempo com etapa atual', /Pedido registrado/.test(txt(tw, '.tl li.now')) && tw.document.querySelectorAll('.tl li').length === 6);
  const id = (await adm('GET', '/api/orders')).data[0].id;
  await adm('POST', `/api/orders/${id}/status`, { status: 'confirmado' }); await tw.load(); await sleep(300);
  ok('atualiza para confirmado e some o aviso do WhatsApp', /confirmou seu pedido/.test(txt(tw, '.status-box')) && !/ainda não enviou/.test(txt(tw, '#app')));
  for (const s of ['preparo', 'pronto', 'saiu_entrega', 'concluido']) await adm('POST', `/api/orders/${id}/status`, { status: s });
  await tw.load(); await sleep(300);
  ok('pedido concluído: todas as etapas marcadas e sem "atualiza sozinha"', tw.document.querySelectorAll('.tl li.done').length === 6 && /Bom apetite/.test(txt(tw, '.status-box')) && !/atualiza sozinha/.test(txt(tw, '#app')));
  const bw = open('public/track.html', BASE + '/pedido/' + 'a'.repeat(32), ['public/js/api.js', 'public/js/track.js']); await sleep(600);
  ok('link inválido mostra mensagem amigável', /Pedido não encontrado/.test(txt(bw, '#app')));

  /* ===== Sair, entrar, recuperar senha ===== */
  click(w, w.document.getElementById('acctBtn')); await sleep(300); click(w, w.document.getElementById('logoutBtn')); await sleep(600);
  ok('sair volta ao estado de visitante', /Entrar/.test(txt(w, '#acctLabel')) && !!w.document.getElementById('fLogin'));
  ok('pedidos feitos no aparelho continuam acessíveis ao visitante', /Pedido #1/.test(txt(w, '#acctBody')) && !!w.document.querySelector('#acctBody a[href="' + trackHref + '"]'));
  type(w, 'lgPhone', '21977771234'); type(w, 'lgPass', 'errada9'); submit(w, 'fLogin'); await sleep(600);
  ok('senha errada mostra mensagem', /incorretos/.test(txt(w, '#acctErr')) && !w.document.getElementById('acctErr').classList.contains('d-none'), txt(w, '#acctErr'));
  const cust = (await adm('GET', '/api/customers')).data.find((c) => c.phone === '21977771234');
  ok('painel lista a cliente com conta', cust && cust.account_id && cust.orders === 1, cust);
  const tok = (await adm('POST', `/api/customers/${cust.account_id}/reset-link`)).data.path;
  const rw = open('public/menu.html', BASE + tok, MENU); await sleep(900);
  ok('link de nova senha abre a tela de redefinição', !!rw.document.getElementById('fReset') && /Nova senha/.test(txt(rw, '#acctTitle')));
  type(rw, 'rsPass', '123'); type(rw, 'rsConfirm', '123'); submit(rw, 'fReset'); await sleep(500); ok('senha fraca recusada na redefinição', rw.document.getElementById('rsPass').classList.contains('is-invalid'), txt(rw, '#acctBody').slice(0, 120));
  type(rw, 'rsPass', 'novasenha9'); type(rw, 'rsConfirm', 'novasenha9'); submit(rw, 'fReset'); await sleep(700);
  ok('senha redefinida e volta ao login', /Senha definida/.test(txt(rw, '#acctBody')) && !!rw.document.getElementById('fLogin'), txt(rw, '#acctBody').slice(0, 150));
  type(rw, 'lgPhone', '21977771234'); type(rw, 'lgPass', 'novasenha9'); submit(rw, 'fLogin'); await sleep(900);
  ok('login com a nova senha', /Olá, Carla/.test(txt(rw, '#acctLabel')), txt(rw, '#acctLabel'));

  /* ===== Painel: Clientes ===== */
  const aj = { c: '' }; const aw = open('public/admin.html', BASE + '/admin', ['public/js/api.js'], aj);
  await aw.api('/api/auth/login', { method: 'POST', body: { email: 'admin@demo.local', password: process.env.ADMIN_PASS } });
  aw.exec('csrfToken = null'); ['public/js/br.js', 'public/js/admin-core.js', 'public/js/admin-views.js'].forEach((f) => aw.exec(read(f))); await sleep(500);
  aw.location.hash = '#/customers'; await sleep(700);
  ok('tela Clientes lista a cliente com total gasto', /Carla Dias/.test(txt(aw, '#view')) && /\(21\) 97777-1234/.test(txt(aw, '#view')));
  click(aw, aw.document.querySelector('[data-reset]')); await sleep(500);
  ok('admin gera link de nova senha do cliente', /\/m\/demo\?reset=/.test((aw.document.querySelector('#lnk') || {}).value || ''));
  aw.location.hash = '#/orders'; await sleep(700); click(aw, aw.document.querySelector('[data-tab="hist"]')); await sleep(700); click(aw, aw.document.querySelector('[data-det="0"]')); await sleep(500);
  ok('detalhe do pedido tem o link de acompanhamento para a equipe', /Link de acompanhamento/.test(aw.document.body.textContent) && !!aw.document.querySelector('[data-copy*="/pedido/"]'));

  const real = errors.filter((e) => !/Not implemented: navigation/i.test(e));
  ok('sem erros de JavaScript', real.length === 0, real.slice(0, 5));
  console.log(fails ? `\n${fails} FALHA(S)` : '\nInterface da área do cliente OK.'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
