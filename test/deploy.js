// Testes de implantação (Vercel): imagens no banco, sessões persistentes, proxy/HTTPS, limite por IP e chave de cadastro.
// Modos: before | after (com reinício do servidor entre eles) | proxy | gate
const fs = require('fs');
const BASE = process.env.BASE || 'http://localhost:3000', mode = process.argv[2];
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
let fails = 0;
const ok = (n, c, x = '') => { console.log(c ? 'OK   ' : 'FALHA', n, c ? '' : JSON.stringify(x)); if (!c) fails++; };

function client(extra = {}) {
  let cookie = '', csrf = '';
  const call = async (method, path, body, form) => {
    const h = { ...extra };
    if (body !== undefined) h['Content-Type'] = 'application/json';
    if (method !== 'GET') {
      if (!csrf) { const r = await fetch(BASE + '/api/csrf', { headers: { ...extra, cookie } }); const c = r.headers.get('set-cookie'); if (c) cookie = c.split(';')[0]; csrf = (await r.json()).token; }
      h['x-csrf-token'] = csrf;
    }
    h.cookie = cookie;
    const r = await fetch(BASE + path, { method, headers: h, body: form || (body !== undefined ? JSON.stringify(body) : undefined) });
    const c = r.headers.get('set-cookie'); if (c) { cookie = c.split(';')[0]; csrf = ''; }
    const t = await r.text(); let data; try { data = JSON.parse(t); } catch { data = t; }
    return { status: r.status, data, headers: r.headers, cookie: () => cookie };
  };
  return call;
}
const png = (buf, type = 'image/png', name = 'a.png') => { const f = new FormData(); f.append('image', new Blob([buf], { type }), name); return f; };

(async () => {
  if (mode === 'before') {
    const a = client();
    let r = await a('POST', '/api/uploads', undefined, png(PNG)); ok('upload sem login é recusado', r.status === 401, r.data);
    await a('POST', '/api/auth/login', { email: 'admin@demo.local', password: process.env.ADMIN_PASS });
    r = await a('POST', '/api/uploads', undefined, png(PNG)); ok('upload de PNG válido', r.status === 201 && /^\/uploads\/[a-f0-9]{32}\.png$/.test(r.data.url), r.data);
    const url = r.data.url;
    r = await fetch(BASE + url); const body = Buffer.from(await r.arrayBuffer());
    ok('imagem é servida do banco, sem login', r.status === 200 && r.headers.get('content-type') === 'image/png' && body.equals(PNG));
    ok('cabeçalhos de cache e segurança da imagem', /immutable/.test(r.headers.get('cache-control') || '') && r.headers.get('x-content-type-options') === 'nosniff', [...r.headers]);
    r = await a('POST', '/api/uploads', undefined, png(Buffer.from('<script>alert(1)</script>'))); ok('arquivo que finge ser PNG é recusado', r.status === 400 && /inválido/.test(r.data.error), r.data);
    r = await a('POST', '/api/uploads', undefined, png(PNG, 'image/gif', 'a.gif')); ok('formato não permitido', r.status === 400 && /Formato/.test(r.data.error), r.data);
    r = await a('POST', '/api/uploads', undefined, png(Buffer.concat([PNG, Buffer.alloc(3 * 1024 * 1024)]))); ok('imagem acima de 2 MB é recusada', r.status === 400 && /grande/.test(r.data.error), r.data);
    r = await a('POST', '/api/uploads', undefined, png(Buffer.from('RIFF0000XXXXdata'), 'image/webp', 'a.webp')); ok('WebP sem assinatura é recusado', r.status === 400, r.data);
    r = await fetch(BASE + '/uploads/' + 'a'.repeat(32) + '.png'); ok('imagem inexistente dá 404', r.status === 404);
    r = await fetch(BASE + '/uploads/..%2F..%2Fpackage.json'); ok('tentativa de path traversal dá 404', r.status === 404);
    fs.writeFileSync('/tmp/deploy-state.json', JSON.stringify({ cookie: a.length, url }));
    const me = await a('GET', '/api/auth/me'); fs.writeFileSync('/tmp/deploy-state.json', JSON.stringify({ cookie: me.cookie(), url }));
    ok('sessão criada antes do reinício', me.status === 200 && me.data.role === 'admin');
  } else if (mode === 'after') {
    const st = JSON.parse(fs.readFileSync('/tmp/deploy-state.json', 'utf8'));
    let r = await fetch(BASE + '/api/auth/me', { headers: { cookie: st.cookie } }); ok('a sessão sobreviveu ao reinício do servidor (sessões no banco)', r.status === 200 && (await r.json()).role === 'admin');
    r = await fetch(BASE + st.url); ok('a imagem sobreviveu ao reinício (imagens no banco)', r.status === 200);
    r = await fetch(BASE + '/api/auth/me', { headers: { cookie: 'sid=s%3Aforjado.assinatura' } }); ok('cookie de sessão forjado não vale', r.status === 401);
  } else if (mode === 'proxy') {
    const H = (ip) => ({ 'x-forwarded-proto': 'https', 'x-forwarded-for': ip });
    let r = await fetch(BASE + '/api/csrf', { headers: H('9.9.9.9') }); const sc = r.headers.get('set-cookie') || '';
    ok('atrás do proxy HTTPS o cookie sai Secure, HttpOnly e SameSite=Strict', /Secure/i.test(sc) && /HttpOnly/i.test(sc) && /SameSite=Strict/i.test(sc), sc);
    ok('HSTS ativo em produção', /max-age/.test(r.headers.get('strict-transport-security') || ''));
    const bad = { name: '', slug: 'x', whatsapp: '', owner: '', email: '', password: '', confirm: '' };
    const a = client(H('1.1.1.1')), b = client(H('2.2.2.2')), codes = [], codesB = [];
    for (let i = 0; i < 4; i++) codes.push((await a('POST', '/api/signup', bad)).status);
    codesB.push((await b('POST', '/api/signup', bad)).status);
    ok('limite de tentativas conta por IP real (X-Forwarded-For)', codes.join() === '400,400,400,429' && codesB[0] === 400, { codes, codesB });
    r = await fetch(BASE + '/api/public/demo/menu', { headers: H('3.3.3.3') }); ok('API responde com o banco migrado automaticamente na primeira requisição', r.status === 200 || r.status === 404, r.status);
  } else if (mode === 'gate') {
    const a = client();
    let r = await a('POST', '/api/signup', { name: 'Loja', slug: 'loja-x', whatsapp: '11999998888', owner: 'Dono', email: 'd@x.com.br', password: 'Senha2026ok', confirm: 'Senha2026ok' });
    ok('cadastro fechado pela variável SIGNUP_ENABLED=false', r.status === 403 && /fechado/.test(r.data.error), r.data);
    r = await a('GET', '/api/signup/slug/qualquer-coisa'); ok('verificação de endereço segue funcionando', r.status === 200);
  }
  console.log(fails ? `\n${fails} FALHA(S)` : '\nOK.'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
