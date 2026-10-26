// Gestão de produtos separada por categoria (jsdom): chips, busca, "adicionar aqui", disponibilidade, exclusão, combos e estoque.
const fs = require('fs'), path = require('path'), vm = require('vm');
const { JSDOM, VirtualConsole } = require('jsdom');
const BASE = process.env.BASE || 'http://localhost:3000';
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
let fails = 0; const errors = [];
const ok = (n, c, x = '') => { console.log(c ? 'OK   ' : 'FALHA', n, c ? '' : JSON.stringify(x)); if (!c) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const jar = { c: '' };
  const vc = new VirtualConsole(); vc.on('jsdomError', (e) => errors.push(e.message)); vc.on('error', (...a) => errors.push(a.join(' ')));
  const dom = new JSDOM(read('public/admin.html').replace(/<script[^>]*src="[^>]*><\/script>/g, ''), { url: BASE + '/admin', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window, ctx = dom.getInternalVMContext(), d = w.document;
  w.fetch = async (u, o = {}) => { const r = await fetch(new URL(u, BASE), { ...o, headers: { ...(o.headers || {}), cookie: jar.c } }); const sc = r.headers.get('set-cookie'); if (sc) jar.c = sc.split(';')[0]; return r; };
  w.alert = (m) => errors.push('alert: ' + m); w.confirm = () => true;
  const Cls = class { constructor(el) { this.el = el; } show() { this.el.classList.add('show'); } hide() { this.el.classList.remove('show'); this.el.dispatchEvent(new w.Event('hidden.bs.modal')); } dispose() {} static getOrCreateInstance(el) { return new this(el); } static getInstance(el) { return new this(el); } };
  w.bootstrap = { Modal: Cls, Offcanvas: Cls, Toast: class { constructor() {} show() {} } };
  w.Chart = class { constructor() { this.data = { labels: [], datasets: [{}] }; } update() {} destroy() {} };
  w.navigator.clipboard = { writeText: async () => {} };
  const run = (f) => new vm.Script(read(f), { filename: f }).runInContext(ctx);
  run('public/js/api.js');
  await w.api('/api/auth/login', { method: 'POST', body: { email: 'admin@demo.local', password: process.env.ADMIN_PASS } });
  new vm.Script('csrfToken = null').runInContext(ctx);
  await w.api('/api/categories', { method: 'POST', body: { name: 'Sobremesas', sort_order: 3, active: true } });
  await w.api('/api/products', { method: 'POST', body: { name: 'Água mineral', price: 4 } });           // sem categoria
  new vm.Script('csrfToken = null').runInContext(ctx);
  ['public/js/br.js', 'public/js/pix.js', 'public/js/admin-neworder.js', 'public/js/admin-core.js', 'public/js/admin-views.js'].forEach(run); await sleep(500);

  const click = (el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
  const txt = (sel) => (d.querySelector(sel) || { textContent: '' }).textContent.replace(/\s+/g, ' ').trim();
  const rows = () => [...d.querySelectorAll('#pList tr[data-pid]')].map((r) => r.querySelector('strong').textContent);
  const groupNames = () => [...d.querySelectorAll('#pList .pgroup-head h2')].map((h) => h.childNodes[0].textContent.trim());
  const chip = (label) => [...d.querySelectorAll('#pChips .fchip')].find((c) => c.textContent.replace(/\s+/g, ' ').trim().startsWith(label));
  const go = async (v) => { w.location.hash = '#/' + v; await sleep(600); };
  const form = () => d.querySelector('.modal form');
  const submit = () => form().dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));

  await go('products');
  ok('chips de categoria com contagem, na ordem do cardápio', [...d.querySelectorAll('#pChips .fchip')].map((c) => c.textContent.replace(/\s+/g, ' ').trim()).join('|') === 'Todas 4|Lanches 2|Bebidas 1|Sobremesas 0|Sem categoria 1|Só indisponíveis', [...d.querySelectorAll('#pChips .fchip')].map((c) => c.textContent.trim()));
  ok('produtos agrupados por categoria (inclui categoria vazia e "Sem categoria")', groupNames().join('|') === 'Lanches|Bebidas|Sobremesas|Sem categoria', groupNames());
  ok('categoria vazia convida a cadastrar', /Nenhum produto nesta categoria/.test(txt('[data-group="' + d.querySelectorAll('.pgroup')[2].dataset.group + '"]')));
  click(chip('Lanches')); ok('filtrar por categoria mostra só os produtos dela', rows().join('|') === 'X-Burger|X-Frango' && groupNames().join() === 'Lanches', rows());
  click(chip('Todas')); d.querySelector('#pq').value = 'burger'; d.querySelector('#pq').dispatchEvent(new w.Event('input', { bubbles: true }));
  ok('busca atravessa as categorias e esconde os grupos sem resultado', rows().join() === 'X-Burger' && groupNames().join() === 'Lanches', { r: rows(), g: groupNames() });
  d.querySelector('#pq').value = 'zzz'; d.querySelector('#pq').dispatchEvent(new w.Event('input', { bubbles: true })); ok('busca sem resultado', /Nenhum produto encontrado/.test(txt('#pList')));
  d.querySelector('#pq').value = ''; d.querySelector('#pq').dispatchEvent(new w.Event('input', { bubbles: true }));

  /* "Adicionar aqui" já vem com a categoria escolhida */
  const bebidasId = d.querySelector('#pChips [data-cat]:nth-child(3)').dataset.cat;
  click(d.querySelector(`[data-add="${bebidasId}"]`)); await sleep(500);
  ok('"Adicionar aqui" abre o formulário com a categoria já escolhida', form() && d.querySelector('#f_category_id').selectedOptions[0].textContent === 'Bebidas', form() && d.querySelector('#f_category_id').value);
  d.querySelector('#f_name').value = 'Suco de laranja'; d.querySelector('#f_price').value = '7'; submit(); await sleep(800);
  d.querySelectorAll('.modal').forEach((m) => m.remove());
  click(chip('Bebidas')); ok('produto novo aparece na categoria certa e o contador sobe', rows().includes('Suco de laranja') && /Bebidas 2/.test(chip('Bebidas').textContent.replace(/\s+/g, ' ')), rows());

  /* Disponibilidade direto na lista */
  const suco = [...d.querySelectorAll('tr[data-pid]')].find((r) => /Suco/.test(r.textContent)); const sw = suco.querySelector('[data-toggle]'); sw.checked = false; sw.dispatchEvent(new w.Event('change', { bubbles: true })); await sleep(700);
  const all = await w.api('/api/products'); ok('interruptor de disponibilidade grava no servidor', all.find((p) => p.name === 'Suco de laranja').available === 0, all.map((p) => [p.name, p.available]));
  click(chip('Todas')); click(d.querySelector('.fchip-off')); ok('filtro "só indisponíveis" mostra apenas o que está fora do cardápio', rows().join() === 'Suco de laranja', rows());
  click(d.querySelector('.fchip-off'));

  /* Editar e excluir */
  click(d.querySelector('[data-edit]')); await sleep(500); ok('editar abre com os dados do produto', !!form() && d.querySelector('#f_name').value.length > 0); d.querySelectorAll('.modal').forEach((m) => m.remove());
  const sucoId = (await w.api('/api/products')).find((p) => p.name === 'Suco de laranja').id;
  click(d.querySelector(`[data-del="${sucoId}"]`)); await sleep(700); ok('excluir remove da lista', !rows().includes('Suco de laranja'));

  /* Combos: produtos separados por categoria no seletor */
  await go('combos'); click(d.querySelector('#new')); await sleep(600);
  const groups = [...d.querySelectorAll('.modal select[data-c="product_id"] optgroup')].map((g) => g.label);
  ok('seletor de produtos do combo vem agrupado por categoria', groups.join('|') === 'Lanches|Bebidas|Sem categoria', groups); d.querySelectorAll('.modal').forEach((m) => m.remove());

  /* Estoque mostra a categoria */
  await go('stock'); ok('estoque mostra a categoria de cada item', /Categoria/.test(txt('#items')) && /Bebidas/.test(txt('#items')), txt('#items').slice(0, 150));

  const real = errors.filter((e) => !/Not implemented: navigation/i.test(e));
  ok('sem erros de JavaScript', real.length === 0, real.slice(0, 5));
  console.log(fails ? `\n${fails} FALHA(S)` : '\nProdutos por categoria OK.'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
