// Pix: gerador de BR Code (unitário), validação de chaves, QR Code decodificado e integração com pedidos. BASE=... ADMIN_PASS=... node test/pix.js
const { PNG } = require('pngjs'); const jsQR = require('jsqr');
const { buildPix, crc16, clean, validCpf, validCnpj } = require('../src/utils/pix');
const BASE = process.env.BASE || 'http://localhost:3000';
let fails = 0;
const ok = (n, c, x = '') => { console.log(c ? 'OK   ' : 'FALHA', n, c ? '' : JSON.stringify(x)); if (!c) fails++; };
const parse = (s) => { const o = {}; for (let i = 0; i < s.length;) { const id = s.slice(i, i + 2), len = Number(s.slice(i + 2, i + 4)); o[id] = s.slice(i + 4, i + 4 + len); i += 4 + len; } return o; };
const decodeQr = (dataUrl) => { const png = PNG.sync.read(Buffer.from(dataUrl.split(',')[1], 'base64')); const r = jsQR(new Uint8ClampedArray(png.data), png.width, png.height); return r && r.data; };

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

(async () => {
  /* ---- Gerador (unitário) ---- */
  const bcb = '00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***6304';
  ok('CRC16 confere com o exemplo oficial do Banco Central (1D3D)', crc16(bcb) === '1D3D', crc16(bcb));
  const p = buildPix({ key: 'loja@exemplo.com.br', name: 'Lanchonete do Zé!', city: 'São Miguel Arcanjo', amount: 54.9, txid: 'PED12' });
  const f = parse(p), acct = parse(f['26']);
  ok('estrutura do BR Code: formato, tipo, moeda, país, MCC', f['00'] === '01' && f['01'] === '11' && f['53'] === '986' && f['58'] === 'BR' && f['52'] === '0000', f);
  ok('conta Pix, chave e valor', acct['00'] === 'br.gov.bcb.pix' && acct['01'] === 'loja@exemplo.com.br' && f['54'] === '54.90', { acct, f54: f['54'] });
  ok('nome e cidade sem acento, maiúsculos e nos limites (25 e 15)', f['59'] === 'LANCHONETE DO ZE' && f['60'] === 'SAO MIGUEL ARCA' && f['59'].length <= 25 && f['60'].length <= 15, { n: f['59'], c: f['60'] });
  ok('identificador da transação (txid)', parse(f['62'])['05'] === 'PED12');
  ok('CRC do código gerado é válido', crc16(p.slice(0, -4)) === p.slice(-4) && /^[0-9A-F]{4}$/.test(p.slice(-4)));
  ok('valor sempre com 2 casas (5 → 5.00; 0,1+0,2 arredondado)', parse(buildPix({ key: 'a@b.co', name: 'X Y', city: 'SP', amount: 5 }))['54'] === '5.00' && parse(buildPix({ key: 'a@b.co', name: 'X Y', city: 'SP', amount: 0.1 + 0.2 }))['54'] === '0.30');
  ok('sem valor, o campo 54 não existe e o txid padrão é ***', (() => { const q = parse(buildPix({ key: 'a@b.co', name: 'X Y', city: 'SP' })); return !('54' in q) && parse(q['62'])['05'] === '***'; })());
  ok('CPF e CNPJ: válidos e inválidos', validCpf('529.982.247-25') && !validCpf('111.111.111-11') && !validCpf('529.982.247-26') && validCnpj('11.222.333/0001-81') && !validCnpj('11.222.333/0001-82') && !validCnpj('00000000000000'));
  ok('limpeza de texto', clean('  Açaí & Cia — Ltda. ', 25) === 'ACAI CIA LTDA');

  /* ---- API ---- */
  const adm = client(), at = client(), kz = client(), anon = client(), lb = client(), pub = client();
  await adm('POST', '/api/auth/login', { email: 'admin@demo.local', password: process.env.ADMIN_PASS });
  await adm('POST', '/api/users', { name: 'Atendente', email: 'at@demo.local', role: 'atendente', password: 'senha-12345' });
  await at('POST', '/api/auth/login', { email: 'at@demo.local', password: 'senha-12345' });
  let r = await anon('GET', '/api/pix'); ok('Pix exige login', r.status === 401);
  r = await at('GET', '/api/pix'); ok('atendente não acessa a configuração do Pix', r.status === 403);
  r = await at('PUT', '/api/pix', {}); ok('atendente não altera a chave Pix', r.status === 403);
  r = await adm('GET', '/api/pix'); ok('Pix começa desativado, sem prévia', r.status === 200 && r.data.configured === false && r.data.preview === null, r.data);

  const base = { pix_key_type: 'email', pix_key: 'Loja@Exemplo.com.br', pix_name: 'Lanchonete Demo', pix_city: 'Sao Paulo' };
  const put = async (n, patch, field, rx) => { const x = await adm('PUT', '/api/pix', { ...base, ...patch }); ok(n, x.status === 400 && x.data.field === field && (!rx || rx.test(x.data.error)), x.data); };
  await put('tipo de chave ausente', { pix_key_type: '' }, 'pix_key_type'); await put('tipo de chave inválido', { pix_key_type: 'cartao' }, 'pix_key_type');
  await put('CPF inválido', { pix_key_type: 'cpf', pix_key: '111.111.111-11' }, 'pix_key', /CPF/); await put('CNPJ inválido', { pix_key_type: 'cnpj', pix_key: '11.222.333/0001-82' }, 'pix_key', /CNPJ/);
  await put('telefone inválido', { pix_key_type: 'telefone', pix_key: '123' }, 'pix_key', /Telefone/); await put('e-mail inválido', { pix_key: 'sem-arroba' }, 'pix_key', /E-mail/);
  await put('chave aleatória inválida', { pix_key_type: 'aleatoria', pix_key: 'abc' }, 'pix_key', /aleatória/);
  await put('nome do recebedor ausente', { pix_name: '' }, 'pix_name'); await put('nome com mais de 25 caracteres', { pix_name: 'x'.repeat(26) }, 'pix_name', /25/);
  await put('cidade ausente', { pix_city: '' }, 'pix_city'); await put('cidade com mais de 15 caracteres', { pix_city: 'x'.repeat(16) }, 'pix_city', /15/);
  let cfg = (await adm('GET', '/api/pix')).data; ok('validações não alteram a configuração', cfg.configured === false);

  r = await adm('PUT', '/api/pix', base); ok('salva Pix com e-mail (normalizado para minúsculas, nome em maiúsculas)', r.status === 200 && r.data.configured && r.data.pix_key === 'loja@exemplo.com.br' && r.data.pix_name === 'LANCHONETE DEMO' && r.data.pix_city === 'SAO PAULO', r.data);
  const pv = r.data.preview; ok('prévia: QR Code de R$ 1,00 que decodifica exatamente para o código copia e cola', pv && decodeQr(pv.qr) === pv.payload && parse(pv.payload)['54'] === '1.00' && crc16(pv.payload.slice(0, -4)) === pv.payload.slice(-4), pv && pv.payload);
  r = await adm('PUT', '/api/pix', { ...base, pix_key_type: 'cpf', pix_key: '529.982.247-25' }); ok('CPF salvo só com dígitos', r.data.pix_key === '52998224725', r.data);
  r = await adm('PUT', '/api/pix', { ...base, pix_key_type: 'cnpj', pix_key: '11.222.333/0001-81' }); ok('CNPJ salvo só com dígitos', r.data.pix_key === '11222333000181', r.data);
  r = await adm('PUT', '/api/pix', { ...base, pix_key_type: 'telefone', pix_key: '(11) 99999-8888' }); ok('telefone salvo no formato +55…', r.data.pix_key === '+5511999998888', r.data);
  r = await adm('PUT', '/api/pix', { ...base, pix_key_type: 'aleatoria', pix_key: '123E4567-E12B-12D1-A456-426655440000' }); ok('chave aleatória salva em minúsculas', r.data.pix_key === '123e4567-e12b-12d1-a456-426655440000', r.data);
  r = await adm('PUT', '/api/pix', base); ok('volta para e-mail', r.status === 200);

  /* ---- Pedidos ---- */
  const o = { customer_name: 'Ana', customer_phone: '11988887777', type: 'entrega', address: 'Rua das Flores, 123', neighborhood: 'Centro', payment_method: 'pix', items: [{ kind: 'product', id: 2, quantity: 2 }], coupon: 'BEMVINDO10' };
  r = await pub('POST', '/api/public/demo/orders', o);
  const pr = r.data.pix, pf = pr && parse(pr.payload);
  ok('pedido com Pix devolve QR Code e código copia e cola', r.status === 201 && pr && pr.qr.startsWith('data:image/png;base64,') && pr.name === 'LANCHONETE DEMO', r.data);
  ok('valor do Pix = total do pedido já com entrega e cupom (44 + 5 − 4,40 de cupom = 44,60)', pf['54'] === r.data.total.toFixed(2) && pf['54'] !== '44.00' && Math.abs(r.data.total - 44.6) < 0.001, { total: r.data.total, f54: pf && pf['54'] });
  ok('txid identifica o pedido e o QR decodifica para o mesmo código', parse(pf['62'])['05'] === 'PED' + r.data.number && decodeQr(pr.qr) === pr.payload);
  const tok = r.data.token, num1 = r.data.number;
  r = await pub('POST', '/api/public/demo/orders', { ...o, payment_method: 'dinheiro', coupon: undefined }); ok('pedido em dinheiro não gera Pix', r.status === 201 && r.data.pix === null, r.data.pix);
  const tokCash = r.data.token;

  r = await pub('GET', '/api/public/track/' + tok); ok('acompanhamento informa que há Pix a pagar', r.status === 200 && r.data.pix === true, r.data.pix);
  const tp = await pub('GET', `/api/public/track/${tok}/pix`); ok('acompanhamento entrega o mesmo QR e código', tp.status === 200 && tp.data.payload === pr.payload && decodeQr(tp.data.qr) === pr.payload, tp.data.payload);
  r = await pub('GET', `/api/public/track/${tokCash}/pix`); ok('pedido em dinheiro não tem Pix no acompanhamento', r.status === 404);
  r = await pub('GET', `/api/public/track/${'a'.repeat(32)}/pix`); ok('token desconhecido', r.status === 404); r = await pub('GET', '/api/public/track/zzz/pix'); ok('token inválido', r.status === 404);

  r = await at('POST', '/api/orders', { customer_name: 'Balcão', type: 'retirada', payment_method: 'pix', status: 'confirmado', items: [{ kind: 'product', id: 3, quantity: 2 }] });
  ok('pedido criado pela equipe com Pix também gera o QR (para mostrar no balcão)', r.status === 201 && r.data.pix && parse(r.data.pix.payload)['54'] === '12.00' && decodeQr(r.data.pix.qr) === r.data.pix.payload, r.data);

  const id = (await adm('GET', '/api/orders')).data.find((x) => x.number === num1).id;
  for (const s of ['confirmado', 'preparo', 'pronto', 'saiu_entrega', 'concluido']) await adm('POST', `/api/orders/${id}/status`, { status: s });
  r = await pub('GET', '/api/public/track/' + tok); ok('depois de concluído, o acompanhamento não oferece mais o Pix', r.data.pix === false);
  r = await pub('GET', `/api/public/track/${tok}/pix`); ok('...e a rota do Pix responde 404', r.status === 404);

  /* ---- Desativar e outra loja ---- */
  r = await lb('POST', '/api/signup', { name: 'Loja B', slug: 'loja-b', whatsapp: '11999998888', owner: 'Dona B', email: 'b@lojab.com.br', password: 'LojaB2026ok', confirm: 'LojaB2026ok' });
  r = await lb('GET', '/api/pix'); ok('loja B não herda a chave da loja demo', r.data.configured === false && r.data.pix_key === null, r.data);
  await lb('POST', '/api/categories', { name: 'X' }); const cat = (await lb('GET', '/api/categories')).data[0].id;
  const pb = (await lb('POST', '/api/products', { name: 'Item B', price: 10, category_id: cat })).data.id;
  r = await pub('POST', '/api/public/loja-b/orders', { ...o, neighborhood: '', type: 'retirada', coupon: undefined, items: [{ kind: 'product', id: pb, quantity: 1 }] }); ok('loja sem chave Pix não gera QR (pedido segue normal)', r.status === 201 && r.data.pix === null, r.data);
  r = await adm('PUT', '/api/pix', { pix_key: '' }); ok('limpar a chave desativa o Pix', r.status === 200 && r.data.configured === false && r.data.pix_name === null && r.data.preview === null, r.data);
  r = await pub('POST', '/api/public/demo/orders', { ...o, coupon: undefined }); ok('com o Pix desativado o pedido não traz QR', r.status === 201 && r.data.pix === null);
  console.log(fails ? `\n${fails} FALHA(S)` : '\nPix OK.'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
