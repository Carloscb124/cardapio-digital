// Tela de login (jsdom): mostrar senha, erro com dica, e-mail com espaços/maiúsculas e entrada bem-sucedida.
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
  const dom = new JSDOM(read('public/login.html').replace(/<script[^>]*src="[^>]*><\/script>/g, ''), { url: BASE + '/login.html', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window, ctx = dom.getInternalVMContext(), d = w.document;
  w.fetch = async (u, o = {}) => { const r = await fetch(new URL(u, BASE), { ...o, headers: { ...(o.headers || {}), cookie: jar.c } }); const sc = r.headers.get('set-cookie'); if (sc) jar.c = sc.split(';')[0]; return r; };
  ['public/js/api.js', 'public/js/login.js'].forEach((f) => new vm.Script(read(f), { filename: f }).runInContext(ctx));
  const set = (id, v) => { d.getElementById(id).value = v; };
  const submit = async () => { d.getElementById('form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await sleep(900); };

  set('password', 'segredo123'); d.getElementById('toggle').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  ok('botão "Mostrar" revela a senha', d.getElementById('password').type === 'text' && d.getElementById('toggle').textContent === 'Ocultar');
  d.getElementById('toggle').dispatchEvent(new w.MouseEvent('click', { bubbles: true })); ok('...e "Ocultar" esconde de novo', d.getElementById('password').type === 'password');
  ok('dica começa escondida', d.getElementById('hint').classList.contains('d-none'));
  set('email', 'admin@demo.local'); set('password', 'senha-errada-1'); await submit();
  ok('senha errada: mostra o erro e a dica de ajuda', !d.getElementById('error').classList.contains('d-none') && /incorretos/.test(d.getElementById('error').textContent) && !d.getElementById('hint').classList.contains('d-none'));
  ok('botão volta a ficar utilizável', !d.getElementById('submit').disabled && d.getElementById('submit').textContent === 'Entrar');
  set('email', '  ADMIN@Demo.Local '); set('password', process.env.ADMIN_PASS); await submit();
  ok('e-mail com espaços e maiúsculas + senha certa: entra', d.getElementById('error').classList.contains('d-none') && /Entrando/.test(d.getElementById('submit').textContent), d.getElementById('error').textContent);
  const me = await w.api('/api/auth/me').catch((e) => ({ erro: e.message })); ok('sessão aberta no servidor', me.role === 'admin', me);
  const real = errors.filter((e) => !/Not implemented: navigation/i.test(e)); ok('sem erros de JavaScript', real.length === 0, real.slice(0, 5));
  console.log(fails ? `\n${fails} FALHA(S)` : '\nTela de login OK.'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
