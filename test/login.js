// Login do painel (API) e script de redefinição de senha. Uso (com servidor e banco ligados): BASE=... ADMIN_PASS=... node test/login.js
const { spawnSync } = require('child_process'); const fs = require('fs');
const BASE = process.env.BASE || 'http://localhost:3000';
function client() {
  let cookie = '', csrf = '';
  return async (method, path, body) => {
    const h = {}; if (body !== undefined) h['Content-Type'] = 'application/json';
    if (method !== 'GET') { if (!csrf) { const r = await fetch(BASE + '/api/csrf', { headers: { cookie } }); const c = r.headers.get('set-cookie'); if (c) cookie = c.split(';')[0]; csrf = (await r.json()).token; } h['x-csrf-token'] = csrf; }
    h.cookie = cookie; const r = await fetch(BASE + path, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
    const c = r.headers.get('set-cookie'); if (c) { cookie = c.split(';')[0]; csrf = ''; }
    const t = await r.text(); let data; try { data = JSON.parse(t); } catch { data = t; } return { status: r.status, data };
  };
}
let fails = 0; const ok = (n, c, x = '') => { console.log(c ? 'OK   ' : 'FALHA', n, c ? '' : JSON.stringify(x)); if (!c) fails++; };
const login = (email, password) => client()('POST', '/api/auth/login', { email, password });
const reset = (input) => { const r = spawnSync('node', ['scripts/reset-password.js', '.env.testfile'], { input, encoding: 'utf8', cwd: process.cwd() }); return { out: r.stdout + r.stderr, code: r.status }; };

(async () => {
  fs.copyFileSync('.env', '.env.testfile');
  const SPECIAL = 'Sênha#2026 çÁ!';
  let r = await client()('POST', '/api/signup', { name: 'Mais Sabor', slug: 'mais-sabor', whatsapp: '11999998888', owner: 'Carlos', email: 'Cb473355@Gmail.com', password: SPECIAL, confirm: SPECIAL });
  ok('cadastro com e-mail em maiúsculas e senha com acento, símbolo e espaço', r.status === 201, r.data);
  r = await login('cb473355@gmail.com', SPECIAL); ok('login com o e-mail em minúsculas', r.status === 200, r.data);
  r = await login('  CB473355@GMAIL.COM  ', SPECIAL); ok('login ignora maiúsculas e espaços ao redor do e-mail', r.status === 200, r.data);
  r = await login('cb473355@gmail.com', SPECIAL.slice(0, -1)); ok('senha diferente por 1 caractere é recusada', r.status === 401 && /incorretos/.test(r.data.error));
  r = await login('cb473355@gmail.com', SPECIAL.toLowerCase()); ok('a senha diferencia maiúsculas de minúsculas', r.status === 401);
  r = await login('outro@gmail.com', SPECIAL); ok('e-mail inexistente: mesma mensagem', r.status === 401 && /incorretos/.test(r.data.error));

  /* script de redefinição */
  let s = reset('\n'); ok('script: lista as contas existentes e sai com Enter', s.code === 0 && /admin@demo\.local/.test(s.out) && /cb473355@gmail\.com/.test(s.out) && /Banco:/.test(s.out), s.out);
  s = reset('naoexiste@x.com\n'); ok('script: e-mail fora da lista é avisado', s.code === 1 && /não está na lista/.test(s.out));
  s = reset('cb473355@gmail.com\nfraca\nfraca\n'); ok('script: senha fraca é recusada', s.code === 1 && /Senha fraca/.test(s.out)); r = await login('cb473355@gmail.com', SPECIAL); ok('...e a senha antiga continua valendo', r.status === 200);
  s = reset('cb473355@gmail.com\nNovaSenha2026\nOutraCoisa2026\n'); ok('script: confirmação diferente é recusada', s.code === 1 && /não conferem/.test(s.out));
  s = reset('CB473355@gmail.com\nNovaSenha2026\nNovaSenha2026\n'); ok('script: redefine a senha (aceita e-mail em maiúsculas)', s.code === 0 && /Pronto/.test(s.out), s.out);
  r = await login('cb473355@gmail.com', 'NovaSenha2026'); ok('login com a senha nova', r.status === 200); r = await login('cb473355@gmail.com', SPECIAL); ok('a senha antiga deixa de valer', r.status === 401);
  s = reset('cb473355@gmail.com\nNovaSenha2026\nNovaSenha2026\n'); ok('script: pode ser executado de novo', s.code === 0);
  fs.unlinkSync('.env.testfile');
  console.log(fails ? `\n${fails} FALHA(S)` : '\nLogin e redefinição OK.'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
