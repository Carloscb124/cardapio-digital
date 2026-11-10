// Importação/exportação de cardápio em CSV (API). Uso: BASE=... ADMIN_PASS=... node test/catalog-io.js
const AdmZip = require('adm-zip');
const { parseCsv, toCsv } = require('../src/utils/csvio');
const { exampleZip, placeholderPng } = require('../src/utils/example-package');
const F = require('../src/utils/catalog-format');
const BASE = process.env.BASE || 'http://localhost:3000';
let fails = 0; const ok = (n, c, x = '') => { console.log(c ? 'OK   ' : 'FALHA', n, c ? '' : JSON.stringify(x).slice(0, 700)); if (!c) fails++; };

function client() {
  let cookie = '', csrf = '';
  const call = async (method, path, body, form, opts = {}) => {
    const h = {}; if (body !== undefined) h['Content-Type'] = 'application/json';
    if (method !== 'GET' && !opts.noCsrf) { if (!csrf) { const r = await fetch(BASE + '/api/csrf', { headers: { cookie } }); const c = r.headers.get('set-cookie'); if (c) cookie = c.split(';')[0]; csrf = (await r.json()).token; } h['x-csrf-token'] = csrf; }
    h.cookie = cookie;
    const r = await fetch(BASE + path, { method, headers: h, body: form || (body !== undefined ? JSON.stringify(body) : undefined) });
    const c = r.headers.get('set-cookie'); if (c) { cookie = c.split(';')[0]; csrf = ''; }
    const buf = Buffer.from(await r.arrayBuffer()); const text = buf.toString('utf8'); let data; try { data = JSON.parse(text); } catch { data = text; }
    return { status: r.status, data, buf, headers: r.headers };
  };
  return call;
}
let n = 0;
async function newStore(tag) {
  const c = client(); n++;
  const r = await c('POST', '/api/signup', { name: `Loja ${tag}`, slug: `loja-${tag}-${n}`, whatsapp: '11999998888', owner: 'Dono', email: `dono${tag}${n}@teste.com.br`, password: 'Senha2026ok', confirm: 'Senha2026ok' });
  if (r.status !== 201) throw new Error('signup falhou ' + JSON.stringify(r.data));
  return c;
}
const csv = (entity, rows) => ({ name: F.FILES[entity].file, buffer: Buffer.from(toCsv(F.FILES[entity].columns, rows), 'utf8') });
const raw = (name, text) => ({ name, buffer: Buffer.from(text, 'utf8') });
const zipOf = (entries) => { const z = new AdmZip(); for (const [k, v] of Object.entries(entries)) z.addFile(k, Buffer.isBuffer(v) ? v : Buffer.from(v, 'utf8')); return z.toBuffer(); };
async function imp(c, files, o = {}) {
  const fd = new FormData(); fd.append('modo', o.modo || 'simular');
  for (const k of ['acao', 'duplicatas', 'sistema_origem']) if (o[k]) fd.append(k, o[k]);
  for (const f of files) fd.append('files', new Blob([f.buffer]), f.name);
  return c('POST', '/api/io/import', undefined, fd);
}
const sim = (c, f, o) => imp(c, f, { ...o, modo: 'simular' }), apply = (c, f, o) => imp(c, f, { ...o, modo: 'aplicar' });
const errs = (r) => (r.data.erros || []).map((e) => `${e.arquivo}:${e.linha}:${e.coluna}:${e.mensagem}`);
const rd = (zipBuf, name) => parseCsv(new AdmZip(zipBuf).getEntry(name).getData());
const list = async (c, p) => (await c('GET', p)).data;

(async () => {
  const adm = client(); await adm('POST', '/api/auth/login', { email: 'admin@demo.local', password: process.env.ADMIN_PASS });
  await adm('POST', '/api/users', { name: 'Atend', email: 'at@demo.local', role: 'atendente', password: 'senha-12345' });
  await adm('POST', '/api/users', { name: 'Coz', email: 'coz@demo.local', role: 'cozinha', password: 'senha-12345' });
  const at = client(), kz = client(), anon = client();
  await at('POST', '/api/auth/login', { email: 'at@demo.local', password: 'senha-12345' }); await kz('POST', '/api/auth/login', { email: 'coz@demo.local', password: 'senha-12345' });

  /* ===== A) Permissões ===== */
  let r = await anon('GET', '/api/io/export'); ok('exportar exige login', r.status === 401);
  r = await at('GET', '/api/io/export'); ok('atendente não exporta', r.status === 403); r = await kz('GET', '/api/io/export'); ok('cozinha não exporta', r.status === 403);
  r = await imp(at, [raw('a.csv', 'x')]); ok('atendente não importa', r.status === 403);
  r = await adm('POST', '/api/io/import', undefined, (() => { const fd = new FormData(); fd.append('modo', 'simular'); return fd; })(), { noCsrf: true }); ok('importar sem CSRF é recusado', r.status === 403);
  r = await adm('GET', '/api/io/modelo'); ok('modelo de exemplo é um ZIP com os arquivos do formato', r.status === 200 && /zip/.test(r.headers.get('content-type')) && ['manifesto.json', 'produtos.csv', 'categorias.csv', 'etapas.csv', 'opcoes.csv', 'produto_etapas.csv', 'imagens/refrigerante.png'].every((f) => new AdmZip(r.buf).getEntry(f)));

  /* ===== B) Exportação ===== */
  await adm('POST', '/api/products', { name: 'Pão "Especial", com acentuação', description: 'Linha 1\nLinha 2: ção, ã, é, ü; com vírgula, e "aspas"', price: 9.5, cost: 3.2, price_from: 9, show_tablet: false, redeem_points: true });
  await adm('POST', '/api/products', { name: '=1+1', description: '-ou @ripa', price: 3 });
  r = await adm('GET', '/api/io/export'); const zipDemo = r.buf;
  ok('exporta um ZIP (Content-Disposition com nome da loja e data)', r.status === 200 && /attachment; filename="cardapio-demo-\d{8}\.zip"/.test(r.headers.get('content-disposition')), r.headers.get('content-disposition'));
  const names = new AdmZip(zipDemo).getEntries().map((e) => e.entryName);
  ok('contém manifesto e os CSVs do catálogo (sem estoque por padrão)', ['manifesto.json', 'categorias.csv', 'produtos.csv', 'etapas.csv', 'produto_etapas.csv', 'opcoes.csv', 'imagens.csv', 'disponibilidade.csv'].every((f) => names.includes(f)) && !names.includes('estoque.csv'), names);
  const man = JSON.parse(new AdmZip(zipDemo).getEntry('manifesto.json').getData().toString('utf8'));
  ok('manifesto: formato, versão, data, sistema de origem e contagem de registros', man.formato === 'cardapio-csv' && man.versao === '1.0' && !Number.isNaN(Date.parse(man.exportado_em)) && man.sistema_origem === 'cardapio-digital:demo' && man.arquivos.find((a) => a.nome === 'produtos.csv').registros === 5, man);
  const P = rd(zipDemo, 'produtos.csv');
  ok('cabeçalho de produtos.csv na ordem da especificação', P.headers.join() === F.FILES.produtos.columns.join(), P.headers);
  const xb = P.rows.find((x) => x.nome === 'X-Burger'), refri = P.rows.find((x) => x.nome === 'Refrigerante lata');
  ok('preço antigo: X-Burger (24,00 por 21,90 promocional) sai como preco=21.90 e preco_antigo=24.00', xb.preco === '21.90' && xb.preco_antigo === '24.00' && refri.preco === '6.00' && refri.preco_antigo === '', xb);
  ok('booleanos true/false, ids estáveis e categoria referenciada', xb.disponivel === 'true' && xb.exibir_cardapio_digital === 'true' && /^prod_\d+$/.test(xb.produto_id) && /^cat_\d+$/.test(xb.categoria_id));
  const pao = P.rows.find((x) => x.nome.startsWith('Pão'));
  ok('caracteres especiais preservados (vírgula, aspas, quebra de linha, acentos)', pao.nome === 'Pão "Especial", com acentuação' && pao.descricao === 'Linha 1\nLinha 2: ção, ã, é, ü; com vírgula, e "aspas"', pao);
  ok('campos novos exportados: a partir de, custo, tablet e pontos', pao.preco_a_partir_de === '9.00' && pao.custo === '3.20' && pao.exibir_tablet === 'false' && pao.troca_por_pontos === 'true', pao);
  ok('fórmulas de planilha ficam protegidas com apóstrofo', P.rows.some((x) => x.nome === "'=1+1") && P.rows.some((x) => x.descricao === "'-ou @ripa"));
  const E = rd(zipDemo, 'etapas.csv'), ad = E.rows.find((x) => x.nome === 'Adicionais'), pc = E.rows.find((x) => x.nome === 'Ponto da carne');
  ok('etapas: mínimo/máximo, tipo de seleção e obrigatoriedade', ad.quantidade_minima === '0' && ad.quantidade_maxima === '3' && ad.tipo_selecao === 'multipla' && ad.obrigatoria === 'false' && pc.quantidade_minima === '1' && pc.tipo_selecao === 'unica' && pc.obrigatoria === 'true', [ad, pc]);
  ok('produto_etapas e opções (com preço adicional) exportados', rd(zipDemo, 'produto_etapas.csv').rows.length === 3 && rd(zipDemo, 'opcoes.csv').rows.find((x) => x.nome === 'Bacon').preco_adicional === '4.00' && rd(zipDemo, 'opcoes.csv').rows.length === 5);
  const bebidas = (await list(adm, '/api/categories')).find((c) => c.name === 'Bebidas').id;
  r = await adm('GET', `/api/io/export?categorias=${bebidas}`); const zc = r.buf;
  ok('exportar só uma categoria: apenas ela, seus produtos e o escopo no manifesto', rd(zc, 'categorias.csv').rows.length === 1 && rd(zc, 'produtos.csv').rows.map((x) => x.nome).join() === 'Refrigerante lata' && JSON.parse(new AdmZip(zc).getEntry('manifesto.json').getData()).escopo.tipo === 'categorias' && rd(zc, 'etapas.csv').rows.length === 0);
  r = await adm('GET', '/api/io/export?estoque=1'); ok('com estoque: inclui estoque.csv e ficha_tecnica.csv', ['estoque.csv', 'ficha_tecnica.csv'].every((f) => new AdmZip(r.buf).getEntry(f)));

  /* ===== C) Ida e volta na mesma loja ===== */
  const before = (await list(adm, '/api/products')).length;
  r = await sim(adm, [{ name: 'pacote.zip', buffer: zipDemo }]); const t = r.data.totais;
  ok('reimportar o próprio pacote: nada novo, tudo "sem alteração", zero erros', r.status === 200 && t.erros === 0 && t.novos === 0 && t.atualizados === 0 && t.sem_alteracao > 10, { t, mudou: Object.entries(r.data.previa).flatMap(([e, l]) => l.filter((x) => x.acao === 'atualizados').map((x) => [e, x.nome, x.mudancas])) });
  r = await apply(adm, [{ name: 'pacote.zip', buffer: zipDemo }]); ok('...e aplicar também não duplica nem altera nada', r.data.aplicada === true && r.data.totais.novos === 0 && (await list(adm, '/api/products')).length === before, r.data.totais);

  /* ===== D) Importar para outra loja (vazia) ===== */
  const B = await newStore('b');
  r = await sim(B, [{ name: 'pacote.zip', buffer: zipDemo }]);
  ok('simulação em loja vazia: mostra o que seria criado e não grava nada', r.data.totais.novos > 10 && r.data.totais.erros === 0 && r.data.aplicada === false && r.data.modo === 'simulacao' && (await list(B, '/api/products')).length === 0, r.data.totais);
  ok('prévia traz amostra por tipo de registro', r.data.previa.produtos.length > 0 && r.data.previa.produtos[0].acao === 'novos' && r.data.resumo.produtos.novos === before, r.data.resumo);
  r = await apply(B, [{ name: 'pacote.zip', buffer: zipDemo }]); ok('aplicar cria o catálogo', r.data.aplicada === true && r.data.totais.erros === 0, r.data);
  const bp = await list(B, '/api/products'), bg = await list(B, '/api/option-groups'), bc = await list(B, '/api/categories');
  ok('produtos, categorias, etapas e opções criados', bp.length === before && bc.length === 2 && bg.length === 2 && bg.find((g) => g.name === 'Adicionais').options.length === 3, { p: bp.length, c: bc.length, g: bg.length });
  const bxb = bp.find((p) => p.name === 'X-Burger');
  ok('preço antigo convertido: price=24 (normal) e promo_price=21.9', bxb.price === 24 && bxb.promo_price === 21.9, bxb);
  ok('categoria e etapas ligadas ao produto', bxb.category_name === 'Lanches' && bxb.group_ids.length === 2, bxb);
  const pao2 = bp.find((p) => p.name.startsWith('Pão'));
  ok('campos novos gravados e texto idêntico (aspas, vírgulas, quebra de linha)', pao2.cost === 3.2 && pao2.price_from === 9 && pao2.show_tablet === 0 && pao2.redeem_points === 1 && pao2.description === 'Linha 1\nLinha 2: ção, ã, é, ü; com vírgula, e "aspas"', pao2);
  ok('fórmula protegida volta ao texto original', bp.some((p) => p.name === '=1+1' && p.description === '-ou @ripa'));
  const countsB = [bp.length, bc.length, bg.length];
  r = await apply(B, [{ name: 'pacote.zip', buffer: zipDemo }]); ok('importar de novo o mesmo pacote não cria duplicatas (reconhece pelos ids de origem)', r.data.totais.novos === 0 && r.data.totais.erros === 0 && [(await list(B, '/api/products')).length, (await list(B, '/api/categories')).length, (await list(B, '/api/option-groups')).length].join() === countsB.join(), r.data.totais);
  const z2 = new AdmZip(zipDemo); const prows = parseCsv(z2.getEntry('produtos.csv').getData()).rows; prows.find((x) => x.nome === 'X-Burger').preco = '20.00';
  z2.updateFile('produtos.csv', Buffer.from(toCsv(F.FILES.produtos.columns, prows), 'utf8'));
  r = await apply(B, [{ name: 'p.zip', buffer: z2.toBuffer() }]);
  ok('mudar um preço no CSV atualiza só esse produto (e mostra a diferença)', r.data.resumo.produtos.atualizados === 1 && r.data.totais.novos === 0 && r.data.previa.produtos.find((x) => x.acao === 'atualizados').mudancas.some((m) => m.campo === 'promo_price' && m.para === 20), r.data.resumo.produtos);
  ok('...e o preço novo vale no cardápio da loja', (await list(B, '/api/products')).find((p) => p.name === 'X-Burger').promo_price === 20);
  r = await B('GET', '/api/io/runs'); ok('histórico de importações registra as aplicadas, com totais', r.data.length === 3 && r.data[0].status === 'aplicada' && r.data[0].totais && r.data[0].arquivos.length > 5, r.data);
  r = await adm('GET', '/api/io/runs'); ok('cada loja vê só o próprio histórico', r.data.every((x) => x.sistema_origem === 'cardapio-digital:demo') && r.data.length === 1, r.data.length);

  /* ===== E) Validações ===== */
  const C = await newStore('c');
  const cat = { categoria_id: 'c1', nome: 'Lanches' }, prod = (o) => ({ produto_id: 'p1', nome: 'Misto', categoria_id: 'c1', preco: '17.00', ...o });
  r = await sim(C, [raw('produtos.csv', 'produto_id,preco\np1,10\n')]); ok('coluna obrigatória ausente', errs(r).some((e) => /produtos\.csv:1:nome:coluna obrigatória/.test(e)), errs(r));
  r = await sim(C, [csv('categorias', [cat]), csv('produtos', [prod({ preco: 'abc' })])]); ok('preço inválido: erro com arquivo, linha e coluna', errs(r).some((e) => /produtos\.csv:2:preco:valor numérico inválido/.test(e)), errs(r));
  r = await sim(C, [csv('categorias', [cat]), csv('produtos', [prod({ preco: '17,50' })])]); ok('preço com vírgula é aceito e convertido (com aviso)', r.data.totais.erros === 0 && r.data.avisos.some((a) => /vírgula decimal/.test(a.mensagem)), r.data);
  r = await sim(C, [csv('categorias', [cat]), csv('produtos', [prod({ preco: '1.234,50' })])]); ok('milhar com ponto e vírgula decimal (1.234,50)', r.data.totais.erros === 0);
  r = await sim(C, [csv('categorias', [cat]), csv('produtos', [prod({ preco: '17.001' })])]); ok('mais de 2 casas decimais é erro', errs(r).some((e) => /casas decimais/.test(e)));
  r = await sim(C, [csv('categorias', [cat]), csv('produtos', [prod({ preco: '-5' })])]); ok('preço negativo é erro', r.data.totais.erros === 1);
  r = await sim(C, [csv('categorias', [cat]), csv('produtos', [prod({ disponivel: 'talvez' })])]); ok('booleano inválido', errs(r).some((e) => /produtos\.csv:2:disponivel:use true ou false/.test(e)));
  r = await sim(C, [csv('categorias', [cat]), csv('produtos', [prod({}), prod({ nome: 'Outro' })])]); ok('id duplicado no arquivo: aponta a linha original', errs(r).some((e) => /produtos\.csv:3:produto_id:identificador duplicado "p1" \(já usado na linha 2\)/.test(e)), errs(r));
  r = await sim(C, [csv('categorias', [cat]), csv('produtos', [prod({ categoria_id: 'nao-existe' })])]); ok('categoria inexistente: erro de referência legível', errs(r).some((e) => /produtos\.csv:2:categoria_id:referência "nao-existe" não encontrada/.test(e)), errs(r));
  r = await sim(C, [csv('categorias', [cat]), csv('produtos', [prod({})]), csv('opcoes', [{ opcao_id: 'o1', etapa_id: 'zzz', nome: 'Bacon' }])]); ok('opção com etapa inexistente', errs(r).some((e) => /opcoes\.csv:2:etapa_id:referência "zzz"/.test(e)));
  r = await sim(C, [csv('etapas', [{ etapa_id: 'e1', nome: 'X', quantidade_minima: 5, quantidade_maxima: 2 }])]); ok('mínimo maior que máximo', errs(r).some((e) => /quantidade_minima:maior que a quantidade_maxima/.test(e)));
  r = await sim(C, [csv('etapas', [{ etapa_id: 'e1', nome: 'X', quantidade_minima: 0, quantidade_maxima: 5, tipo_selecao: 'unica' }])]); ok('tipo "unica" com máximo 5 é inconsistente', errs(r).some((e) => /tipo "unica" exige quantidade_maxima 1/.test(e)));
  r = await sim(C, [csv('etapas', [{ etapa_id: 'e1', nome: 'X', tipo_selecao: 'multipla' }])]); ok('etapa múltipla nova sem quantidade_maxima', errs(r).some((e) => /quantidade_maxima:obrigatório para cadastrar/.test(e)));
  r = await sim(C, [raw('produtos.csv', 'produto_id,nome,preco\np1,Misto,10\np2,Outro,10,extra\n')]); ok('linha com colunas a mais: erro com número da linha', errs(r).some((e) => /produtos\.csv:3:(null)?:número de colunas/.test(e)), errs(r));
  r = await sim(C, [{ name: 'produtos.csv', buffer: Buffer.from('produto_id,nome,preco\np1,Caf\xE9,10\n', 'latin1') }]); ok('arquivo Latin-1 é recusado com instrução', errs(r).some((e) => /UTF-8/.test(e)));
  r = await sim(C, [raw('categorias.csv', 'categoria_id,nome,coluna_estranha\nc1,Lanches,x\n')]); ok('colunas desconhecidas viram aviso, não erro', r.data.totais.erros === 0 && r.data.avisos.some((a) => /desconhecidas/.test(a.mensagem)));
  r = await sim(C, [raw('categorias.csv', 'categoria_id,nome\n')]); ok('arquivo só com cabeçalho é válido e vazio', r.data.totais.erros === 0 && r.data.resumo.categorias.novos === 0);
  r = await sim(C, [raw('categorias.csv', 'categoria_id;nome\nc1;Lanches\nc2;"Porções; grandes"\n')]); ok('ponto e vírgula (Excel em português) é detectado', r.data.totais.erros === 0 && r.data.resumo.categorias.novos === 2);
  r = await sim(C, [raw('notas.txt', 'oi')]); ok('arquivo que não é CSV/ZIP', errs(r).some((e) => /envie arquivos \.csv ou um \.zip/.test(e)));
  r = await sim(C, [{ name: 'x.zip', buffer: Buffer.concat([Buffer.from('PK'), Buffer.from('lixo que não é zip')]) }]); ok('ZIP corrompido', errs(r).some((e) => /ZIP inválido/.test(e)));
  r = await sim(C, [{ name: 'p.zip', buffer: zipOf({ 'manifesto.json': JSON.stringify({ formato: 'cardapio-csv', versao: '2.0' }), 'categorias.csv': toCsv(F.FILES.categorias.columns, [cat]) }) }]); ok('versão de formato não suportada', errs(r).some((e) => /versão do formato não suportada/.test(e)));
  r = await sim(C, [{ name: 'p.zip', buffer: zipOf({ 'manifesto.json': JSON.stringify({ formato: 'outra-coisa', versao: '1.0' }) }) }]); ok('manifesto com formato desconhecido', errs(r).some((e) => /formato desconhecido/.test(e)));
  r = await sim(C, [{ name: 'p.zip', buffer: zipOf({ '../evil.csv': 'a,b\n1,2\n', 'categorias.csv': toCsv(F.FILES.categorias.columns, [{ categoria_id: 'c1', nome: 'Lanches' }]) }) }]); ok('entradas de ZIP com ".." nunca são processadas (sem quebrar nem gravar fora do lugar)', r.data.totais.erros === 0 && r.data.arquivos.length === 1 && r.data.avisos.some((a) => /ignorada por segurança|não reconhecido/.test(a.mensagem)), r.data);
  r = await imp(C, []); ok('sem arquivos: erro claro', r.data.totais.erros >= 1 && /nenhum arquivo/.test(errs(r)[0]));
  r = await imp(C, [csv('categorias', [cat])], { acao: 'apagar' }); ok('ação inválida é recusada', r.status === 400);
  r = await imp(C, [{ name: 'g.csv', buffer: Buffer.alloc(4 * 1024 * 1024 + 10, 97) }]); ok('arquivo acima de 4 MB é recusado', r.status === 400 && /grande/.test(r.data.error), r.data);

  /* atomicidade: um erro no último arquivo impede TUDO */
  r = await apply(C, [csv('categorias', [cat]), csv('produtos', [prod({})]), csv('opcoes', [{ opcao_id: 'o1', etapa_id: 'zzz', nome: 'Bacon' }])]);
  ok('importação com 1 erro não grava nada (tudo ou nada)', r.data.aplicada === false && r.data.totais.erros === 1 && (await list(C, '/api/products')).length === 0 && (await list(C, '/api/categories')).length === 0, r.data.totais);
  ok('...e a tentativa rejeitada fica no histórico', (await C('GET', '/api/io/runs')).data[0].status === 'rejeitada');

  /* ===== F) Campos vazios, duplicidades, ações ===== */
  const D = await newStore('d');
  await apply(D, [csv('categorias', [cat]), csv('produtos', [prod({ descricao: 'Presunto e queijo', preco: '17.00', preco_antigo: '20.00', disponivel: 'false', id_externo: 'x-1' })])]);
  let dp = (await list(D, '/api/products'))[0];
  ok('1ª importação: descrição, indisponível e preço antigo (price 20 / promo 17)', dp.description === 'Presunto e queijo' && dp.available === 0 && dp.price === 20 && dp.promo_price === 17, dp);
  r = await apply(D, [csv('categorias', [cat]), csv('produtos', [prod({ descricao: '', disponivel: '', id_externo: 'x-1', preco: '19.00', preco_antigo: '' })])]); dp = (await list(D, '/api/products'))[0];
  ok('campos vazios = ausentes: descrição e disponibilidade são preservadas', dp.description === 'Presunto e queijo' && dp.available === 0, dp);
  ok('preço informado sem preço antigo remove a promoção (preço de venda manda)', dp.price === 19 && dp.promo_price === null, dp);
  r = await apply(D, [csv('categorias', [cat]), csv('produtos', [prod({ nome: 'Misto Renomeado', id_externo: 'x-1', produto_id: 'novo-id-local' })])]); ok('o id_externo mantém a identidade mesmo com nome e id local diferentes', r.data.resumo.produtos.atualizados === 1 && (await list(D, '/api/products')).length === 1 && (await list(D, '/api/products'))[0].name === 'Misto Renomeado', r.data.resumo.produtos);

  const Dn = await newStore('dn');
  await Dn('POST', '/api/categories', { name: 'Lanches' }); const lc = (await list(Dn, '/api/categories'))[0].id;
  await Dn('POST', '/api/products', { name: 'X-Burger', price: 20, category_id: lc });
  const dupFiles = [csv('categorias', [cat]), csv('produtos', [prod({ produto_id: 'zz', nome: 'X-Burger', preco: '25.00' })])];
  r = await sim(Dn, dupFiles, { duplicatas: 'ignorar' }); ok('duplicidade por nome (sem vínculo) + "ignorar": nada é tocado', r.data.resumo.produtos.ignorados === 1 && r.data.resumo.produtos.novos === 0 && /mesmo nome/.test(r.data.previa.produtos[0].motivo), r.data.resumo.produtos);
  r = await sim(Dn, dupFiles, { duplicatas: 'criar' }); ok('+ "criar": vira um produto novo', r.data.resumo.produtos.novos === 1);
  r = await sim(Dn, dupFiles, { duplicatas: 'vincular' }); ok('+ "vincular": atualiza o existente e avisa que foi pelo nome', r.data.resumo.produtos.atualizados === 1 && /vinculado pelo nome/.test(r.data.previa.produtos[0].motivo), r.data.previa.produtos);
  r = await apply(Dn, dupFiles, { duplicatas: 'vincular' }); ok('vinculado: preço atualizado e nenhuma duplicata', (await list(Dn, '/api/products')).length === 1 && (await list(Dn, '/api/products'))[0].price === 25);
  r = await apply(Dn, dupFiles, { duplicatas: 'criar' }); ok('depois do vínculo, reimportar reconhece pelo mapeamento (mesmo com "criar")', r.data.resumo.produtos.novos === 0 && (await list(Dn, '/api/products')).length === 1, r.data.resumo.produtos);

  const Ac = await newStore('ac');
  await apply(Ac, [csv('categorias', [cat]), csv('produtos', [prod({ id_externo: 'a' })])]);
  const mixed = [csv('categorias', [cat, { categoria_id: 'c2', nome: 'Bebidas' }]), csv('produtos', [prod({ id_externo: 'a', preco: '30.00' }), prod({ produto_id: 'p2', nome: 'Suco', categoria_id: 'c2', preco: '8.00' })]), csv('etapas', [{ etapa_id: 'e1', nome: 'Adicionais', quantidade_maxima: 3, tipo_selecao: 'multipla' }]), csv('produto_etapas', [{ produto_id: 'p2', etapa_id: 'e1' }])];
  r = await sim(Ac, mixed, { acao: 'inserir' }); ok('ação "inserir": existentes são ignorados e só o novo entra', r.data.resumo.produtos.ignorados === 1 && r.data.resumo.produtos.novos === 1 && r.data.resumo.produtos.atualizados === 0, r.data.resumo.produtos);
  r = await sim(Ac, mixed, { acao: 'atualizar' }); ok('ação "atualizar": o novo é ignorado e seus dependentes também, sem erros', r.data.resumo.produtos.atualizados === 1 && r.data.resumo.produtos.ignorados === 1 && r.data.totais.erros === 0 && r.data.resumo.produto_etapas.ignorados === 1, r.data);
  r = await apply(Ac, mixed, { acao: 'ambos' }); ok('ação "ambos": atualiza e cria', r.data.resumo.produtos.atualizados === 1 && r.data.resumo.produtos.novos === 1);
  const few = await newStore('few'); await apply(few, [csv('categorias', [cat, { categoria_id: 'c2', nome: 'B' }, { categoria_id: 'c3', nome: 'C' }])]);
  await apply(few, [csv('categorias', [cat])]); ok('importar menos registros NUNCA apaga os que não estão no arquivo', (await list(few, '/api/categories')).length === 3);

  /* ===== G) Isolamento entre lojas ===== */
  const demoBefore = JSON.stringify((await list(adm, '/api/products')).map((p) => [p.id, p.name, p.price]));
  const Iso = await newStore('iso');
  r = await apply(Iso, [{ name: 'pacote.zip', buffer: zipDemo }]); ok('pacote da loja demo importado em outra loja usa ids de origem (não mexe na demo)', r.data.aplicada === true && JSON.stringify((await list(adm, '/api/products')).map((p) => [p.id, p.name, p.price])) === demoBefore);
  r = await Iso('GET', '/api/io/export'); ok('a exportação traz só os dados da própria loja', rd(r.buf, 'produtos.csv').rows.length === before && JSON.parse(new AdmZip(r.buf).getEntry('manifesto.json').getData()).loja.slug.startsWith('loja-iso'));
  console.log(fails ? `\n${fails} FALHA(S)` : '\nImportação/exportação (núcleo) OK.'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
