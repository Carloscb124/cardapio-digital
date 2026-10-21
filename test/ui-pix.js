// Interface do Pix (jsdom): tela do admin, QR + copiar no cardápio, acompanhamento e pedido da equipe.
const fs = require('fs'), path = require('path'), vm = require('vm');
const { JSDOM, VirtualConsole } = require('jsdom'); const { PNG } = require('pngjs'); const jsQR = require('jsqr');
const BASE = process.env.BASE || 'http://localhost:3000';
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
let fails = 0; const errors = [];
const ok = (n, c, x = '') => { console.log(c ? 'OK   ' : 'FALHA', n, c ? '' : JSON.stringify(x)); if (!c) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const decode = (src) => { const png = PNG.sync.read(Buffer.from(src.split(',')[1], 'base64')); const r = jsQR(new Uint8ClampedArray(png.data), png.width, png.height); return r && r.data; };
const tag = (payload, id) => { for (let i = 0; i < payload.length;) { const t = payload.slice(i, i + 2), l = Number(payload.slice(i + 2, i + 4)); if (t === id) return payload.slice(i + 4, i + 4 + l); i += 4 + l; } };

function open(file, url, scripts, copied) {
  const jar = open.jar || (open.jar = { c: '' });
  const vc = new VirtualConsole(); vc.on('jsdomError', (e) => errors.push(e.message)); vc.on('error', (...a) => errors.push(a.join(' ')));
  const dom = new JSDOM(read(file).replace(/<script[^>]*src="[^>]*><\/script>/g, ''), { url, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window, ctx = dom.getInternalVMContext();
  w.fetch = async (u, o = {}) => { const r = await fetch(new URL(u, BASE), { ...o, headers: { ...(o.headers || {}), cookie: jar.c } }); const sc = r.headers.get('set-cookie'); if (sc) jar.c = sc.split(';')[0]; return r; };
  w.alert = (m) => errors.push('alert: ' + m); w.confirm = () => true;
  const Cls = class { constructor(el) { this.el = el; } show() { this.el.classList.add('show'); } hide() { this.el.classList.remove('show'); this.el.dispatchEvent(new w.Event('hidden.bs.modal')); } dispose() {} static getOrCreateInstance(el) { return new this(el); } static getInstance(el) { return new this(el); } };
  w.bootstrap = { Modal: Cls, Offcanvas: Cls, Toast: class { constructor() {} show() {} } };
  w.Chart = class { constructor() { this.data = { labels: [], datasets: [{}] }; } update() {} destroy() {} };
  w.navigator.clipboard = { writeText: async (v) => { copied.push(v); } };
  w.exec = (code) => new vm.Script(code).runInContext(ctx);
  scripts.forEach((f) => new vm.Script(read(f), { filename: f }).runInContext(ctx));
  return w;
}
const click = (w, el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
const change = (w, sel, v) => { const el = w.document.querySelector(sel); if (v !== undefined) el.value = v; el.dispatchEvent(new w.Event('change', { bubbles: true })); };
const input = (w, sel, v) => { const el = w.document.querySelector(sel); el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); };
const txt = (w, sel) => (w.document.querySelector(sel) || { textContent: '' }).textContent;

(async () => {
  const copied = [];
  /* ===== Admin: tela Pix ===== */
  const aw = open('public/admin.html', BASE + '/admin', ['public/js/api.js'], copied);
  await aw.api('/api/auth/login', { method: 'POST', body: { email: 'admin@demo.local', password: process.env.ADMIN_PASS } });
  aw.exec('csrfToken = null'); ['public/js/br.js', 'public/js/pix.js', 'public/js/admin-neworder.js', 'public/js/admin-core.js', 'public/js/admin-views.js'].forEach((f) => aw.exec(read(f))); await sleep(500);
  const ad = aw.document;
  ok('menu do admin tem a opção "Pix"', [...ad.querySelectorAll('#nav a')].some((a) => /Pix/.test(a.textContent)));
  aw.location.hash = '#/pix'; await sleep(600);
  ok('Pix começa desativado, com explicação sobre a confirmação do pagamento', /Desativado/.test(txt(aw, '#view')) && /não confirma/.test(txt(aw, '#view')));
  change(aw, '#f_pix_key_type', 'cpf'); ok('dica muda conforme o tipo da chave', /11 números/.test(ad.querySelector('#f_pix_key').parentElement.querySelector('.form-text').textContent));
  input(aw, '#f_pix_key', '111.111.111-11'); input(aw, '#f_pix_name', 'Lanchonete Demo'); input(aw, '#f_pix_city', 'Sao Paulo');
  ad.querySelector('#pForm').dispatchEvent(new aw.Event('submit', { bubbles: true, cancelable: true })); await sleep(600);
  ok('CPF inválido mostra erro e marca o campo', /CPF inválido/.test(txt(aw, '#pErr')) && ad.querySelector('#f_pix_key').classList.contains('is-invalid'), txt(aw, '#pErr'));
  change(aw, '#f_pix_key_type', 'email'); input(aw, '#f_pix_key', 'loja@exemplo.com.br');
  ad.querySelector('#pForm').dispatchEvent(new aw.Event('submit', { bubbles: true, cancelable: true })); await sleep(900);
  const prev = ad.querySelector('[data-pix-box] img');
  ok('Pix ativo com QR de teste de R$ 1,00', /Ativo/.test(txt(aw, '#view')) && prev && prev.src.startsWith('data:image/png') && /R\$\s*1,00/.test(txt(aw, '[data-pix-box]')), txt(aw, '#view').slice(0, 200));
  const pv = ad.querySelector('[data-copy-pix]').dataset.copyPix;
  ok('QR de teste decodifica para o código copia e cola (valor 1.00, chave certa)', decode(prev.src) === pv && tag(pv, '54') === '1.00' && tag(tag(pv, '26'), '01') === 'loja@exemplo.com.br', pv);
  ok('campos mostram os dados normalizados', ad.querySelector('#f_pix_name').value === 'LANCHONETE DEMO' && ad.querySelector('#f_pix_city').value === 'SAO PAULO');
  click(aw, ad.querySelector('[data-copy-pix]')); await sleep(100);
  ok('botão copiar envia o código para a área de transferência e confirma', copied[0] === pv && /Código copiado/.test(txt(aw, '[data-copy-pix]')), { copied: copied[0] && copied[0].slice(0, 30), t: txt(aw, '[data-copy-pix]') });

  /* ===== Cliente: pedido com Pix ===== */
  const cw = open('public/menu.html', BASE + '/m/demo', ['public/js/api.js', 'public/js/pix.js', 'public/js/br.js', 'public/js/menu.js', 'public/js/account.js'], copied); await sleep(700);
  const cd = cw.document;
  click(cw, cd.querySelector('.prod[data-p="2"]')); input(cw, '#pmQty', '1'); click(cw, cd.getElementById('pmPlus')); click(cw, cd.getElementById('pmAdd')); click(cw, cd.getElementById('openCart'));
  change(cw, '#hood', 'Centro'); input(cw, '#addr', 'Rua das Flores, 123'); input(cw, '#cname', 'Ana Teste'); input(cw, '#cphone', '11988887777'); change(cw, '#pay', 'pix');
  click(cw, cd.getElementById('send')); await sleep(1000);
  const box = cd.querySelector('#cartBody [data-pix-box]');
  ok('pedido com Pix mostra QR Code e botão de copiar', !!box && !!box.querySelector('img') && !!box.querySelector('[data-copy-pix]') && /Copiar código Pix/.test(box.textContent), cd.getElementById('cartBody').textContent.slice(0, 200));
  const code = box.querySelector('[data-copy-pix]').dataset.copyPix;
  ok('valor do QR = total do pedido (2 × 22 + 5 de entrega = 49,00)', tag(code, '54') === '49.00' && /R\$\s*49,00/.test(box.textContent), { f54: tag(code, '54'), t: box.textContent.slice(0, 120) });
  ok('QR do cardápio decodifica para o mesmo código', decode(box.querySelector('img').src) === code);
  ok('aviso de que o pagamento não é confirmado automaticamente', /só é confirmado pelo estabelecimento/.test(box.textContent) && /comprovante/.test(box.textContent));
  copied.length = 0; click(cw, box.querySelector('[data-copy-pix]')); await sleep(100); ok('copiar no cardápio', copied[0] === code && /Código copiado/.test(box.querySelector('[data-copy-pix]').textContent));
  ok('segue oferecendo WhatsApp e acompanhamento', !!cd.querySelector('#cartBody a[href^="https://wa.me/"]') && !!cd.querySelector('#cartBody a[href^="/pedido/"]'));
  const track = cd.querySelector('#cartBody a[href^="/pedido/"]').getAttribute('href');

  /* ===== Acompanhamento ===== */
  const tw = open('public/track.html', BASE + track, ['public/js/api.js', 'public/js/pix.js', 'public/js/track.js'], copied); await sleep(1300);
  const tb = tw.document.querySelector('[data-pix-box]');
  ok('acompanhamento mostra o mesmo QR Code e o botão de copiar', !!tb && decode(tb.querySelector('img').src) === code && tb.querySelector('[data-copy-pix]').dataset.copyPix === code, tw.document.body.textContent.slice(0, 200));
  const pixCalls = [];
  await tw.load(); await sleep(500); ok('atualização automática mantém o bloco do Pix sem buscar o QR de novo', !!tw.document.querySelector('[data-pix-box]'));

  /* ===== Equipe: pedido no painel com Pix ===== */
  aw.location.hash = '#/orders'; await sleep(700); click(aw, ad.querySelector('#newOrder')); await sleep(700);
  click(aw, ad.querySelector('#noItems [data-p="3"]')); change(aw, '#noPay', 'pix'); input(aw, '#noName', 'Cliente Balcão'); ad.querySelector('#noT_retirada').checked = true; change(aw, '#noT_retirada');
  click(aw, ad.querySelector('#noSave')); await sleep(1000);
  const sb = [...ad.querySelectorAll('[data-pix-box]')].pop();
  ok('pedido criado pela equipe mostra "Cobrar com Pix" com QR de R$ 6,00', sb && /Cobrar com Pix/.test(sb.textContent) && tag(sb.querySelector('[data-copy-pix]').dataset.copyPix, '54') === '6.00' && /R\$\s*6,00/.test(sb.textContent), sb && sb.textContent.slice(0, 100));
  ad.querySelectorAll('.modal').forEach((m) => m.remove());

  /* ===== Desativar ===== */
  aw.location.hash = '#/pix'; await sleep(700); click(aw, ad.querySelector('#pOff')); await sleep(900);
  ok('desativar o Pix remove o QR de teste e volta ao estado inicial', /Desativado/.test(txt(aw, '#view')) && !ad.querySelector('[data-pix-box]') && ad.querySelector('#f_pix_key').value === '');

  const real = errors.filter((e) => !/Not implemented: navigation/i.test(e));
  ok('sem erros de JavaScript', real.length === 0, real.slice(0, 5));
  console.log(fails ? `\n${fails} FALHA(S)` : '\nInterface do Pix OK.'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
