// Teste de interface com jsdom (sem navegador). Uso: ADMIN_PASS=... BASE=http://localhost:3000 node test/ui-smoke.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const { JSDOM, VirtualConsole } = require('jsdom');
const BASE = process.env.BASE || 'http://localhost:3000';
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
let fails = 0; const errors = [];
const ok = (n, c, x = '') => { console.log(c ? 'OK   ' : 'FALHA', n, c ? '' : x); if (!c) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function makeWindow(htmlFile, url, jar) {
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errors.push('jsdomError: ' + e.message));
  vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));
  const dom = new JSDOM(read(htmlFile).replace(/<script[^>]*src="https:[^>]*><\/script>/g, '').replace(/<script[^>]*src="\/[^>]*><\/script>/g, ''), { url, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window;
  w.fetch = async (u, o = {}) => {
    const r = await fetch(new URL(u, BASE), { ...o, headers: { ...(o.headers || {}), cookie: jar.c } });
    const sc = r.headers.get('set-cookie'); if (sc) jar.c = sc.split(';')[0];
    return r;
  };
  w.alert = (m) => errors.push('alert: ' + m); w.confirm = () => true;
  const Cls = class { constructor(el) { this.el = el; } show() { this.el.classList.add('show'); } hide() { this.el.classList.remove('show'); this.el.dispatchEvent(new w.Event('hidden.bs.modal')); } dispose() {} static getOrCreateInstance(el) { return new this(el); } static getInstance(el) { return new this(el); } };
  w.bootstrap = { Modal: Cls, Offcanvas: Cls, Toast: class { constructor() {} show() {} } };
  w.Chart = class { constructor() { this.data = { labels: [], datasets: [{}] }; } update() {} destroy() {} };
  w.navigator.clipboard = { writeText: async () => {} };
  const ctx = dom.getInternalVMContext();
  w.run = (file) => new vm.Script(read(file), { filename: file }).runInContext(ctx);
  w.exec = (code) => new vm.Script(code).runInContext(ctx);
  return w;
}
const click = (w, el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
const change = (w, el) => el.dispatchEvent(new w.Event('change', { bubbles: true }));

(async () => {
  /* ===== Cliente: cardápio público ===== */
  let jar = { c: '' };
  let w = makeWindow('public/menu.html', BASE + '/m/demo', jar);
  w.run('public/js/api.js'); w.run('public/js/br.js'); w.run('public/js/menu.js'); w.run('public/js/account.js'); await sleep(600);
  const $ = (s) => w.document.querySelector(s);
  ok('menu renderiza produtos', w.document.querySelectorAll('#list .prod').length >= 4, $('#list').textContent.slice(0, 100));
  ok('nome da loja', /Lanchonete Demo/.test($('#head').textContent));
  $('#search').value = 'frango'; $('#search').dispatchEvent(new w.Event('input', { bubbles: true }));
  ok('busca filtra', w.document.querySelectorAll('#list .prod').length === 1);
  $('#search').value = ''; $('#search').dispatchEvent(new w.Event('input', { bubbles: true }));
  click(w, $('.prod[data-p="1"]'));
  ok('modal do produto mostra grupos', w.document.querySelectorAll('#pmBody [data-g]').length === 2);
  ok('adicionar bloqueado até escolher obrigatório', $('#pmAdd').disabled === true);
  const ponto = $('#pmBody [data-g] input[value="4"]'); ponto.checked = true; change(w, ponto);
  ok('habilita ao escolher', $('#pmAdd').disabled === false);
  const bacon = $('#pmBody input[value="1"]'); bacon.checked = true; change(w, bacon);
  ok('preço com adicional (21,90+4)', /25,90/.test($('#pmAdd').textContent.replace(/\s/g, ' ')), $('#pmAdd').textContent);
  click(w, $('#pmPlus')); click(w, $('#pmAdd'));
  ok('barra do carrinho aparece', !$('#cartBar').classList.contains('d-none') && $('#cartCount').textContent === '2', $('#cartCount').textContent);
  click(w, $('#openCart'));
  ok('carrinho lista item', /X-Burger/.test($('#cartBody').textContent));
  $('#hood').value = 'Centro'; change(w, $('#hood'));
  $('#pay').value = 'pix'; change(w, $('#pay'));
  $('#addr').value = 'Rua das Flores, 123'; $('#cname').value = 'Ana Teste'; $('#cphone').value = '11977776666';
  $('#cup').value = 'bemvindo10'; click(w, $('#applyCup')); await sleep(300);
  ok('cupom aplicado', /Desconto/.test($('#cartBody').textContent), $('#cartBody').textContent.slice(-300));
  click(w, $('#send')); await sleep(600);
  ok('pedido registrado com link do WhatsApp', /Pedido #1 registrado/.test($('#cartBody').textContent) && !!$('#cartBody a[href^="https://wa.me/"]'), $('#cartBody').textContent.slice(0, 200));
  ok('aviso de que falta enviar pelo WhatsApp', /enviar a mensagem pelo WhatsApp/.test($('#cartBody').textContent));
  ok('carrinho esvaziado', $('#cartBar').classList.contains('d-none'));

  /* ===== Painel administrativo ===== */
  jar = { c: '' };
  w = makeWindow('public/admin.html', BASE + '/admin', jar);
  w.run('public/js/api.js');
  await w.api('/api/auth/login', { method: 'POST', body: { email: 'admin@demo.local', password: process.env.ADMIN_PASS } });
  w.exec('csrfToken = null'); // a sessão foi renovada pelo login (no navegador a página recarrega)
  w.run('public/js/br.js'); w.run('public/js/admin-core.js'); w.run('public/js/admin-views.js'); await sleep(500);
  const V = () => w.document.querySelector('#view');
  const go = async (v) => { w.location.hash = '#/' + v; await sleep(500); };
  ok('menu lateral montado', w.document.querySelectorAll('#nav a').length === 13, w.document.querySelectorAll('#nav a').length);
  ok('badge de pedidos novos', /1/.test(w.document.querySelector('#navbadge').textContent));
  for (const v of ['dashboard', 'orders', 'customers', 'products', 'categories', 'groups', 'combos', 'coupons', 'zones', 'stock', 'reports', 'users', 'settings']) {
    await go(v); ok('tela ' + v, V().textContent.trim().length > 20, V().innerHTML.slice(0, 120));
  }
  await go('orders');
  ok('pedido aparece na lista', /#1/.test(V().textContent) && /Ana Teste/.test(V().textContent));
  click(w, V().querySelector('[data-det="0"]')); await sleep(300);
  ok('detalhes do pedido', /Rua das Flores/.test(w.document.body.textContent) && /Bacon/.test(w.document.body.textContent));
  w.document.querySelectorAll('.modal').forEach((m) => m.remove());
  click(w, V().querySelector('[data-st^="0:confirmado"]')); await sleep(500);
  ok('confirma pedido', /Confirmado/.test(V().textContent), V().textContent.slice(0, 200));

  await go('categories'); click(w, V().querySelector('#new')); await sleep(300);
  let form = w.document.querySelector('.modal form'); form.querySelector('#f_name').value = 'Sobremesas';
  form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await sleep(500);
  ok('cria categoria pela interface', /Sobremesas/.test(V().textContent));

  await go('products'); click(w, V().querySelector('#new')); await sleep(500);
  form = w.document.querySelector('.modal form');
  form.querySelector('#f_name').value = 'Pudim'; form.querySelector('#f_price').value = '8.5';
  form.querySelector('#f_category_id').value = [...form.querySelector('#f_category_id').options].find((o) => o.textContent === 'Sobremesas').value;
  form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await sleep(600);
  ok('cria produto pela interface', /Pudim/.test(V().textContent) && /Sobremesas/.test(V().textContent), V().textContent.slice(0, 200));

  await go('groups'); click(w, V().querySelector('[data-edit="0"]')); await sleep(400);
  ok('edição de grupo carrega opções', w.document.querySelectorAll('.modal .row-item').length >= 2);
  w.document.querySelector('.modal [data-bs-dismiss="modal"]').click();

  await go('reports'); ok('relatório com vendas', /R\$/.test(V().querySelector('#rCards').textContent) && /CSV/.test(V().textContent));
  await go('settings'); ok('configurações mostram link', /\/m\/demo/.test(V().querySelector('#pubLink').value));
  V().querySelector('#sForm').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await sleep(500);
  ok('salva configurações', !V().querySelector('#sErr').textContent, V().querySelector('#sErr').textContent);
  await go('users'); click(w, V().querySelector('[data-link]')); await sleep(500);
  ok('gera link de redefinição', /reset\.html\?token=/.test(w.document.querySelector('#lnk')?.value || ''));

  const real = errors.filter((e) => !/Not implemented|navigation/i.test(e));
  ok('sem erros de JavaScript', real.length === 0, real.slice(0, 5));
  console.log(fails ? `\n${fails} FALHA(S)` : '\nInterface OK.'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
