// Tela "Importar e exportar" (jsdom): links de exportação, análise com prévia, erros por linha, confirmação e histórico.
const fs = require('fs'), path = require('path'), vm = require('vm');
const { JSDOM, VirtualConsole } = require('jsdom');
const { toCsv } = require('../src/utils/csvio'); const { exampleZip } = require('../src/utils/example-package'); const F = require('../src/utils/catalog-format');
const BASE = process.env.BASE || 'http://localhost:3000';
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
let fails = 0; const errors = [];
const ok = (n, c, x = '') => { console.log(c ? 'OK   ' : 'FALHA', n, c ? '' : JSON.stringify(x).slice(0, 600)); if (!c) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const jar = { c: '' };
  const vc = new VirtualConsole(); vc.on('jsdomError', (e) => errors.push(e.message)); vc.on('error', (...a) => errors.push(a.join(' ')));
  const dom = new JSDOM(read('public/admin.html').replace(/<script[^>]*src="[^>]*><\/script>/g, ''), { url: BASE + '/admin', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window, ctx = dom.getInternalVMContext(), d = w.document;
  const readFile = (file) => new Promise((res, rej) => { const fr = new w.FileReader(); fr.onload = () => res(Buffer.from(fr.result)); fr.onerror = rej; fr.readAsArrayBuffer(file); });
  w.fetch = async (u, o = {}) => {
    let body = o.body;
    if (body && body.constructor && body.constructor.name === 'FormData') { const nf = new FormData(); for (const [k, v] of body.entries()) { if (typeof v === 'string') nf.append(k, v); else nf.append(k, new Blob([await readFile(v)]), v.name); } body = nf; }
    const r = await fetch(new URL(u, BASE), { ...o, body, headers: { ...(o.headers || {}), cookie: jar.c } }); const sc = r.headers.get('set-cookie'); if (sc) jar.c = sc.split(';')[0]; return r;
  };
  w.alert = (m) => errors.push('alert: ' + m); w.confirm = () => true;
  const Cls = class { constructor(el) { this.el = el; } show() { this.el.classList.add('show'); } hide() { this.el.classList.remove('show'); this.el.dispatchEvent(new w.Event('hidden.bs.modal')); } dispose() {} static getOrCreateInstance(el) { return new this(el); } static getInstance(el) { return new this(el); } };
  w.bootstrap = { Modal: Cls, Offcanvas: Cls, Toast: class { constructor() {} show() {} } }; w.Chart = class { constructor() { this.data = { labels: [], datasets: [{}] }; } update() {} destroy() {} };
  w.navigator.clipboard = { writeText: async () => {} };
  const run = (f) => new vm.Script(read(f), { filename: f }).runInContext(ctx);
  run('public/js/api.js');
  await w.api('/api/auth/login', { method: 'POST', body: { email: 'admin@demo.local', password: process.env.ADMIN_PASS } });
  new vm.Script('csrfToken = null').runInContext(ctx);
  ['public/js/br.js', 'public/js/pix.js', 'public/js/admin-neworder.js', 'public/js/admin-core.js', 'public/js/admin-io.js', 'public/js/admin-views.js'].forEach(run); await sleep(600);

  const click = (el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
  const change = (el) => el.dispatchEvent(new w.Event('change', { bubbles: true }));
  const txt = (sel) => (d.querySelector(sel) || { textContent: '' }).textContent.replace(/\s+/g, ' ').trim();
  const pick = (name, buf) => { const f = new w.File([buf], name); Object.defineProperty(d.getElementById('ioFiles'), 'files', { value: [f], configurable: true }); change(d.getElementById('ioFiles')); };
  const go = async (v) => { w.location.hash = '#/' + v; await sleep(700); };

  ok('"Importar e exportar" aparece no menu (grupo Cardápio)', [...d.querySelectorAll('#nav a')].some((a) => /Importar e exportar/.test(a.textContent)));
  await go('io');
  ok('tela abre com explicação, exportação e importação', /Nada é apagado/.test(txt('#view')) && !!d.getElementById('exGo') && !!d.getElementById('ioAnalyze'), txt('#view').slice(0, 150));

  /* Exportação: o link acompanha as opções */
  const href = () => d.getElementById('exGo').getAttribute('href');
  ok('link padrão exporta tudo', href() === '/api/io/export');
  d.getElementById('exStock').checked = true; change(d.getElementById('exStock')); ok('incluir estoque', href() === '/api/io/export?estoque=1', href());
  d.getElementById('exImg').checked = false; change(d.getElementById('exImg')); ok('sem imagens', /estoque=1/.test(href()) && /imagens=0/.test(href()), href());
  d.getElementById('scCat').checked = true; change(d.getElementById('scCat'));
  ok('modo "categorias": mostra a lista e bloqueia o botão até escolher uma', !d.getElementById('catBox').classList.contains('d-none') && d.getElementById('exGo').classList.contains('disabled'));
  const pk = d.querySelector('.catpick'); pk.checked = true; change(pk); ok('categoria escolhida entra no link', new RegExp(`categorias=${pk.value}`).test(href()) && !d.getElementById('exGo').classList.contains('disabled'), href());
  ok('link do modelo de exemplo', d.getElementById('exModel').getAttribute('href') === '/api/io/modelo');
  d.getElementById('scAll').checked = true; change(d.getElementById('scAll'));

  /* Importação inválida: erros por arquivo, linha e coluna, sem botão de confirmar */
  click(d.getElementById('ioAnalyze')); await sleep(200); ok('sem arquivo: pede para escolher', /Escolha pelo menos um arquivo/.test(txt('#ioErr')));
  const bad = Buffer.from(toCsv(F.FILES.produtos.columns, [{ produto_id: 'p1', nome: 'Misto', preco: 'abc' }]), 'utf8');
  pick('produtos.csv', bad); click(d.getElementById('ioAnalyze')); await sleep(1200);
  ok('erros listados com arquivo, linha, coluna e o que corrigir; nada gravado', /Foram encontrados erros: nada foi gravado/.test(txt('#ioReport')) && /produtos\.csv/.test(txt('#ioReport')) && /preco/.test(txt('#ioReport')) && /valor numérico inválido/.test(txt('#ioReport')), txt('#ioReport').slice(0, 300));
  ok('com erros não há botão de confirmar', d.getElementById('ioConfirm').classList.contains('d-none'));

  /* Importação válida: simulação -> confirmar */
  const before = (await w.api('/api/products')).length;
  pick('modelo.zip', exampleZip()); click(d.getElementById('ioAnalyze')); await sleep(1800);
  ok('simulação: resumo por tipo de registro, prévia e botão de confirmar', /Simulação concluída: nada foi gravado ainda/.test(txt('#ioReport')) && /Produtos/.test(txt('#ioReport')) && /Prévia dos registros/.test(txt('#ioReport')) && !d.getElementById('ioConfirm').classList.contains('d-none'), txt('#ioReport').slice(0, 300));
  ok('a simulação não gravou nada', (await w.api('/api/products')).length === before);
  d.getElementById('ioAcao').value = 'inserir'; change(d.getElementById('ioAcao'));
  ok('mudar uma opção depois de analisar exige analisar de novo', d.getElementById('ioConfirm').classList.contains('d-none') && /analise de novo/.test(txt('#ioReport')));
  d.getElementById('ioAcao').value = 'ambos'; change(d.getElementById('ioAcao')); click(d.getElementById('ioAnalyze')); await sleep(1800);
  d.getElementById('ioSource').value = 'zapermenu'; d.getElementById('ioSource').dispatchEvent(new w.Event('input', { bubbles: true }));
  ok('mudar a plataforma de origem também invalida a análise', d.getElementById('ioConfirm').classList.contains('d-none'));
  click(d.getElementById('ioAnalyze')); await sleep(1800); ok('analisado de novo: confirmar disponível e origem mostrada', !d.getElementById('ioConfirm').classList.contains('d-none') && /Origem: zapermenu/.test(txt('#ioReport')), txt('#ioReport').slice(0, 200));
  click(d.getElementById('ioConfirm')); await sleep(2500);
  ok('importação concluída', /Importação concluída/.test(txt('#ioReport')), txt('#ioReport').slice(0, 200));
  const after = await w.api('/api/products');
  ok('produtos do pacote existem de verdade', after.some((p) => p.name === 'Misto Quente') && after.length > before, after.map((p) => p.name));
  ok('histórico mostra a importação aplicada com a origem', /Aplicada/.test(txt('#ioRuns')) && /zapermenu/.test(txt('#ioRuns')), txt('#ioRuns'));
  ok('botão de confirmar some depois de aplicar', d.getElementById('ioConfirm').classList.contains('d-none'));

  /* Estoque mostra os insumos importados */
  await go('stock'); ok('tela de estoque lista os insumos importados', /Carne moída/.test(txt('#ingr')) && /12.5 kg/.test(txt('#ingr')), txt('#ingr').slice(0, 200));

  const real = errors.filter((e) => !/Not implemented: navigation/i.test(e));
  ok('sem erros de JavaScript', real.length === 0, real.slice(0, 5));
  console.log(fails ? `\n${fails} FALHA(S)` : '\nTela de importação/exportação OK.'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
