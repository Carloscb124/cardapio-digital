// Interface do painel: criar pedido pela equipe e cadastrar/editar clientes (jsdom).
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
  ['public/js/br.js', 'public/js/pix.js', 'public/js/admin-neworder.js', 'public/js/admin-core.js', 'public/js/admin-views.js'].forEach(run); await sleep(600);

  const click = (el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
  const input = (sel, v) => { const el = d.querySelector(sel); el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); };
  const change = (sel, v) => { const el = d.querySelector(sel); if (v !== undefined) el.value = v; el.dispatchEvent(new w.Event('change', { bubbles: true })); };
  const txt = (sel) => (d.querySelector(sel) || { textContent: '' }).textContent;
  const closeAll = () => d.querySelectorAll('.modal').forEach((m) => m.remove());
  const submitForm = () => d.querySelector('.modal form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  const go = async (v) => { w.location.hash = '#/' + v; await sleep(600); };

  /* ===== Novo pedido (retirada, com opções, combo e dinheiro) ===== */
  await go('orders'); ok('botão "Novo pedido" na tela de pedidos', !!d.querySelector('#newOrder'));
  click(d.querySelector('#newOrder')); await sleep(700);
  ok('janela de novo pedido lista os produtos', !!d.querySelector('.modal-xl') && d.querySelectorAll('#noItems [data-p]').length === 3 && d.querySelectorAll('#noItems [data-c]').length === 1, txt('#noItems').slice(0, 100));
  input('#noSearch', 'frango'); ok('busca de produto filtra a lista', d.querySelectorAll('#noItems [data-p]').length === 1);
  click(d.querySelector('#noItems [data-p="2"]')); ok('produto com adicionais opcionais abre a escolha e libera "adicionar"', d.querySelectorAll('#noItems [data-g]').length === 1 && d.querySelector('#noPickAdd').disabled === false);
  click(d.querySelector('#noPickAdd')); ok('X-Frango no pedido (R$ 22,00)', /X-Frango/.test(txt('#noCart')) && /R\$\s*22,00/.test(txt('#noSummary')), txt('#noSummary'));
  input('#noSearch', 'refri'); click(d.querySelector('#noItems [data-p="3"]')); ok('produto sem opções entra direto no pedido', /Refrigerante/.test(txt('#noCart')) && /R\$\s*28,00/.test(txt('#noSummary')), txt('#noSummary'));
  input('#noSearch', ''); click(d.querySelector('#noItems [data-p="1"]'));
  ok('produto com opções abre a escolha de adicionais', d.querySelectorAll('#noItems [data-g]').length === 2 && d.querySelector('#noPickAdd').disabled === true);
  const ponto = d.querySelector('#noItems input[value="4"]'); ponto.checked = true; change('#noItems input[value="4"]');
  const bacon = d.querySelector('#noItems input[value="1"]'); bacon.checked = true; change('#noItems input[value="1"]');
  click(d.querySelector('#noPickPlus')); ok('"adicionar" libera ao escolher o obrigatório e soma o adicional ((21,90+4)×2)', d.querySelector('#noPickAdd').disabled === false && /51,80/.test(txt('#noPickAdd').replace(/\s/g, ' ')), txt('#noPickAdd'));
  click(d.querySelector('#noPickAdd')); ok('item com adicional no carrinho e lista de produtos de volta', /X-Burger/.test(txt('#noCart')) && /Bacon/.test(txt('#noCart')) && d.querySelectorAll('#noItems [data-p]').length === 3);
  click(d.querySelector('#noItems [data-c="1"]')); ok('combo adicionado', /Combo: X-Burger/.test(txt('#noCart')));
  input('#noName', 'Rita Mesa'); input('#noPhone', '11944443333'); ok('máscara do telefone', d.querySelector('#noPhone').value === '(11) 94444-3333');
  d.querySelector('#noT_retirada').checked = true; change('#noT_retirada'); ok('retirada esconde os campos de entrega', d.querySelector('#noDelivery').classList.contains('d-none'));
  click(d.querySelector('#noSave')); ok('exige forma de pagamento', /pagamento/.test(txt('#noErr')), txt('#noErr'));
  change('#noPay', 'dinheiro'); ok('dinheiro mostra o campo de troco', !d.querySelector('#noChangeBox').classList.contains('d-none')); input('#noChange', '200');
  click(d.querySelector('#noSave')); await sleep(900);
  ok('pedido criado e janela de confirmação com comanda, WhatsApp e link', /Pedido #1 criado/.test(d.body.textContent) && !!d.querySelector('a[href^="/print/"]') && !!d.querySelector('a[href^="https://wa.me/5511944443333"]') && !!d.querySelector('[data-copy*="/pedido/"]'), d.body.textContent.slice(-200));
  closeAll(); await sleep(400);
  ok('pedido aparece na lista com selo "Painel" e já confirmado', /#1/.test(txt('#view')) && /Painel/.test(txt('#view')) && /Confirmado/.test(txt('#view')), txt('#view').slice(0, 200));

  /* ===== Segundo pedido: cliente cadastrado + entrega ===== */
  click(d.querySelector('#newOrder')); await sleep(700);
  input('#noSearchCust', 'rita'); await sleep(700);
  ok('busca de cliente mostra o cadastro criado pelo pedido anterior', d.querySelectorAll('#noCustList [data-cust]').length === 1 && /Rita Mesa/.test(txt('#noCustList')), txt('#noCustList'));
  click(d.querySelector('[data-cust="0"]')); ok('escolher o cliente preenche nome e telefone', d.querySelector('#noName').value === 'Rita Mesa' && d.querySelector('#noPhone').value === '(11) 94444-3333');
  click(d.querySelector('#noItems [data-p="2"]')); click(d.querySelector('#noPickAdd')); d.querySelector('#noT_entrega').checked = true; change('#noT_entrega'); change('#noPay', 'pix');
  click(d.querySelector('#noSave')); ok('entrega exige o bairro', /bairro/i.test(txt('#noErr')), txt('#noErr'));
  change('#noHood', 'Centro'); ok('taxa de entrega entra no total (22 + 5)', /R\$\s*27,00/.test(txt('#noTotal')), txt('#noTotal'));
  click(d.querySelector('#noSave')); ok('entrega exige o endereço', /endereço/i.test(txt('#noErr')), txt('#noErr'));
  input('#noAddr', 'Rua das Mesas, 12'); change('#noStatus', 'aguardando');
  click(d.querySelector('#noSave')); await sleep(900); closeAll(); await sleep(400);
  ok('segundo pedido criado como "aguardando"', /#2/.test(txt('#view')) && /Aguardando confirmação/.test(txt('#view')), txt('#view').slice(0, 300));

  /* ===== Clientes ===== */
  await go('customers'); ok('tela Clientes lista o cliente criado pelos pedidos', /Rita Mesa/.test(txt('#view')) && /2/.test(txt('#view')));
  click(d.querySelector('#newCust')); await sleep(300);
  const f = d.querySelector('.modal form'); f.querySelector('#f_name').value = 'Zé Novo'; f.querySelector('#f_phone').value = '21977770000'; f.querySelector('#f_phone').dispatchEvent(new w.Event('input', { bubbles: true }));
  ok('máscara no cadastro de cliente', f.querySelector('#f_phone').value === '(21) 97777-0000'); f.querySelector('#f_address').value = 'Rua Z, 1'; submitForm(); await sleep(700);
  ok('cliente cadastrado pelo painel aparece na lista', /Zé Novo/.test(txt('#view')) && /Rua Z, 1/.test(txt('#view')), txt('#view').slice(0, 200));
  closeAll(); click(d.querySelector('#newCust')); await sleep(300);
  const f2 = d.querySelector('.modal form'); f2.querySelector('#f_name').value = 'Outro Zé'; f2.querySelector('#f_phone').value = '(21) 97777-0000'; submitForm(); await sleep(700);
  ok('WhatsApp repetido mostra erro no formulário', /Já existe/.test(txt('.modal .err')), txt('.modal .err')); closeAll();
  const ze = [...d.querySelectorAll('#tbl tbody tr')].findIndex((tr) => /Zé Novo/.test(tr.textContent));
  click(d.querySelector(`[data-edit="${ze}"]`)); await sleep(300);
  ok('edição abre com os dados do cliente', d.querySelector('#f_name').value === 'Zé Novo' && d.querySelector('#f_phone').value === '(21) 97777-0000' && d.querySelector('#f_address').value === 'Rua Z, 1');
  d.querySelector('#f_name').value = 'Zé Editado'; submitForm(); await sleep(700); closeAll();
  ok('edição salva', /Zé Editado/.test(txt('#view')));
  input('#cq', 'rita'); await sleep(700); ok('busca na tela de clientes', d.querySelectorAll('#tbl tbody tr').length === 1 && /Rita/.test(txt('#tbl')));
  input('#cq', 'zé'); await sleep(700); click(d.querySelector('[data-order="0"]')); await sleep(700);
  ok('"fazer pedido" abre o pedido com o cliente e o endereço preenchidos', d.querySelector('#noName').value === 'Zé Editado' && d.querySelector('#noAddr').value === 'Rua Z, 1' && d.querySelector('#noT_entrega').checked, [d.querySelector('#noName') && d.querySelector('#noName').value]);
  closeAll(); input('#cq', 'zé'); await sleep(700);
  click(d.querySelector('[data-del="0"]')); await sleep(700); ok('admin exclui cliente', !/Zé Editado/.test(txt('#tbl')), txt('#tbl').slice(0, 100));

  const real = errors.filter((e) => !/Not implemented: navigation/i.test(e));
  ok('sem erros de JavaScript', real.length === 0, real.slice(0, 5));
  console.log(fails ? `\n${fails} FALHA(S)` : '\nInterface da equipe OK.'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
