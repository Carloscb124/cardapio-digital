// Importação/exportação: modelo de exemplo, estoque e ficha técnica, disponibilidade, imagens e efeito no cardápio. Uso: BASE=... ADMIN_PASS=... node test/catalog-io2.js
const fs = require('fs'); const path = require('path');
const AdmZip = require('adm-zip');
const { parseCsv, toCsv } = require('../src/utils/csvio');
const { exampleZip, exampleFiles, placeholderPng } = require('../src/utils/example-package');
const F = require('../src/utils/catalog-format');
const BASE = process.env.BASE || 'http://localhost:3000';
let fails = 0; const ok = (n, c, x = '') => { console.log(c ? 'OK   ' : 'FALHA', n, c ? '' : JSON.stringify(x).slice(0, 800)); if (!c) fails++; };
function client() {
  let cookie = '', csrf = '';
  return async (method, path, body, form) => {
    const h = {}; if (body !== undefined) h['Content-Type'] = 'application/json';
    if (method !== 'GET') { if (!csrf) { const r = await fetch(BASE + '/api/csrf', { headers: { cookie } }); const c = r.headers.get('set-cookie'); if (c) cookie = c.split(';')[0]; csrf = (await r.json()).token; } h['x-csrf-token'] = csrf; }
    h.cookie = cookie; const r = await fetch(BASE + path, { method, headers: h, body: form || (body !== undefined ? JSON.stringify(body) : undefined) });
    const c = r.headers.get('set-cookie'); if (c) { cookie = c.split(';')[0]; csrf = ''; }
    const buf = Buffer.from(await r.arrayBuffer()); let data; try { data = JSON.parse(buf.toString('utf8')); } catch { data = buf.toString('utf8'); } return { status: r.status, data, buf, headers: r.headers };
  };
}
let n = 0; const slugs = new Map();
async function newStore(tag) { const c = client(); n++; const slug = `io2-${tag}-${n}`; const r = await c('POST', '/api/signup', { name: `Loja ${tag}`, slug, whatsapp: '11999998888', owner: 'Dono', email: `io2${tag}${n}@teste.com.br`, password: 'Senha2026ok', confirm: 'Senha2026ok' }); if (r.status !== 201) throw new Error('signup ' + JSON.stringify(r.data)); slugs.set(c, slug); return c; }
const csv = (entity, rows) => ({ name: F.FILES[entity].file, buffer: Buffer.from(toCsv(F.FILES[entity].columns, rows), 'utf8') });
const zipOf = (entries) => { const z = new AdmZip(); for (const [k, v] of Object.entries(entries)) z.addFile(k, Buffer.isBuffer(v) ? v : Buffer.from(v, 'utf8')); return z.toBuffer(); };
async function imp(c, files, o = {}) { const fd = new FormData(); fd.append('modo', o.modo || 'simular'); for (const k of ['acao', 'duplicatas', 'sistema_origem']) if (o[k]) fd.append(k, o[k]); for (const f of files) fd.append('files', new Blob([f.buffer]), f.name); return c('POST', '/api/io/import', undefined, fd); }
const sim = (c, f, o) => imp(c, f, { ...o, modo: 'simular' }), apply = (c, f, o) => imp(c, f, { ...o, modo: 'aplicar' });
const errs = (r) => (r.data.erros || []).map((e) => `${e.arquivo}:${e.linha}:${e.coluna}:${e.mensagem}`);
const list = async (c, p) => (await c('GET', p)).data; const rd = (buf, name) => parseCsv(new AdmZip(buf).getEntry(name).getData());
const asZip = (buf) => [{ name: 'p.zip', buffer: buf }];
const menu = async (c) => (await client()('GET', `/api/public/${slugs.get(c)}/menu`)).data;
const order = (c, items, extra = {}) => client()('POST', `/api/public/${slugs.get(c)}/orders`, { customer_name: 'Ana', customer_phone: '11988887777', type: 'retirada', payment_method: 'pix', items, ...extra });

(async () => {
  /* ===== Modelo de exemplo ===== */
  const onDisk = Object.entries(exampleFiles()).every(([name, buf]) => fs.existsSync(path.join(__dirname, '..', 'exemplos', name)) && fs.readFileSync(path.join(__dirname, '..', 'exemplos', name)).equals(buf));
  ok('a pasta exemplos/ do projeto está igual ao pacote de exemplo atual', onDisk);
  const M = await newStore('m');
  let r = await sim(M, asZip(exampleZip()));
  ok('o pacote de exemplo é 100% válido (zero erros)', r.data.totais.erros === 0 && r.data.totais.novos > 20, errs(r));
  ok('pacote de exemplo: avisos esperados (horários e vírgulas) sem bloquear', r.data.erros.length === 0);
  r = await apply(M, asZip(exampleZip()));
  ok('exemplo aplicado: 3 categorias, 5 produtos, 3 etapas, 7 opções, 4 ligações, 3 insumos, 3 fichas', r.data.aplicada && r.data.resumo.categorias.novos === 3 && r.data.resumo.produtos.novos === 5 && r.data.resumo.etapas.novos === 3 && r.data.resumo.opcoes.novos === 7 && r.data.resumo.produto_etapas.novos === 4 && r.data.resumo.insumos.novos === 3 && r.data.resumo.ficha_tecnica.novos === 3, r.data.resumo);
  const prods = await list(M, '/api/products'), groups = await list(M, '/api/option-groups');
  const misto = prods.find((p) => p.name === 'Misto Quente'), refri = prods.find((p) => p.name === 'Refrigerante lata'), batata = prods.find((p) => p.name === 'Batata frita'), suco = prods.find((p) => p.name === 'Suco de laranja');
  ok('Misto Quente igual ao exemplo da especificação (R$ 17,00, descrição, disponível)', misto.price === 17 && misto.promo_price === null && misto.description === 'Mussarela, Cheddar, Presunto, Catchup. Maionese da Casa' && misto.available === 1 && misto.show_digital === 1 && misto.show_tablet === 1 && misto.redeem_points === 0, misto);
  ok('Misto Quente tem as duas etapas da especificação: "Transforme seu pedido em combo" e "Adicionais" (0 a 10)', misto.group_ids.length === 2 && groups.filter((g) => ['Transforme seu pedido em combo', 'Adicionais'].includes(g.name)).every((g) => g.min_select === 0 && g.max_select === 10));
  ok('Batata frita: preço "a partir de", só no digital e disponibilidade agendada', batata.price_from === 18.9 && batata.show_tablet === 0 && batata.availability_type === 'agendada', batata);
  ok('Refrigerante: custo, troca por pontos e imagem gravada no banco', refri.cost === 2.8 && refri.redeem_points === 1 && /^\/uploads\/[a-f0-9]{32}\.png$/.test(refri.image_url), refri);
  const im = await fetch(BASE + refri.image_url); ok('a imagem do pacote é servida', im.status === 200 && im.headers.get('content-type') === 'image/png' && Buffer.from(await im.arrayBuffer()).equals(placeholderPng()));
  const combo = groups.find((g) => g.name === 'Transforme seu pedido em combo');
  let exp = await M('GET', '/api/io/export?estoque=1'); const ob = rd(exp.buf, 'opcoes.csv').rows;
  ok('opção que referencia outro produto: referência preservada na exportação', ob.find((x) => x.nome === 'Refrigerante lata').produto_referenciado_id === `prod_${refri.id}` && ob.find((x) => x.nome === 'Batata frita').produto_referenciado_id === `prod_${batata.id}`, ob);
  ok('id_externo da plataforma de origem volta na exportação (orig_123 etc.)', rd(exp.buf, 'produtos.csv').rows.find((x) => x.nome === 'Misto Quente').id_externo === 'orig_123' && rd(exp.buf, 'etapas.csv').rows.find((x) => x.nome === 'Adicionais').id_externo === 'orig_etapa_02');
  r = await sim(M, asZip(exp.buf)); ok('exportar e reimportar na mesma loja: tudo "sem alteração"', r.data.totais.erros === 0 && r.data.totais.novos === 0 && r.data.totais.atualizados === 0, { t: r.data.totais, m: Object.entries(r.data.previa).flatMap(([e, l]) => l.filter((x) => x.acao === 'atualizados').map((x) => [e, x.nome, x.mudancas])) });
  r = await sim(M, asZip(exampleZip())); ok('reimportar o exemplo original após a exportação também não duplica', r.data.totais.novos === 0, r.data.resumo);

  /* ===== Estoque e ficha técnica ===== */
  let ing = await list(M, '/api/ingredients');
  ok('insumos criados com saldo, unidade e custo', ing.length === 3 && ing.find((i) => i.name === 'Carne moída').stock_qty === 12.5 && ing.find((i) => i.name === 'Carne moída').unit === 'kg' && ing.find((i) => i.name === 'Pão de hambúrguer').stock_qty === 40, ing);
  const estoque = (o) => csv('insumos', [{ insumo_id: 'insumo_002', nome: 'Carne moída', unidade_medida: 'kg', quantidade_estoque: 5, custo_unitario: 40, ...o }]);
  r = await apply(M, asZip(zipOf({ 'estoque.csv': estoque({}).buffer })), { sistema_origem: 'exemplo' });
  ing = await list(M, '/api/ingredients');
  ok('importar insumo existente NÃO altera o saldo físico (avisa), mas atualiza o custo', ing.find((i) => i.name === 'Carne moída').stock_qty === 12.5 && ing.find((i) => i.name === 'Carne moída').unit_cost === 40 && r.data.avisos.some((a) => /saldo .* mantido em 12.5/.test(a.mensagem)), { r: r.data.avisos, ing });
  r = await sim(M, [estoque({ unidade_medida: 'g' })], { sistema_origem: 'exemplo' }); ok('não permite trocar a unidade de um insumo que tem saldo', errs(r).some((e) => /estoque\.csv:2:unidade_medida:não é possível trocar a unidade/.test(e)), errs(r));
  r = await sim(M, [estoque({ unidade_medida: 'caixa' })], { sistema_origem: 'exemplo' }); ok('unidade inválida', errs(r).some((e) => /unidade inválida/.test(e)));
  const E2 = await newStore('e2');
  r = await apply(E2, [csv('insumos', [{ insumo_id: 'a', nome: 'Leite', unidade_medida: 'LITROS', quantidade_estoque: '2.5', estoque_minimo: 5 }, { insumo_id: 'b', nome: 'Ovos', unidade_medida: 'un', quantidade_estoque: 30 }, { insumo_id: 'c', nome: 'Farinha', unidade_medida: 'KG', quantidade_estoque: '10,5' }])]);
  ing = await list(E2, '/api/ingredients'); ok('unidades normalizadas (LITROS→L, un→unidade, KG→kg), vírgula decimal aceita e alerta de estoque baixo', r.data.aplicada && ing.find((i) => i.name === 'Leite').unit === 'L' && ing.find((i) => i.name === 'Ovos').unit === 'unidade' && ing.find((i) => i.name === 'Farinha').stock_qty === 10.5 && ing.find((i) => i.name === 'Leite').low === true && ing.find((i) => i.name === 'Ovos').low === false, ing);
  r = await sim(E2, [csv('insumos', [{ insumo_id: 'a', nome: 'Leite', unidade_medida: 'L' }, { insumo_id: 'z', nome: 'leite', unidade_medida: 'L', quantidade_estoque: 9 }])]); ok('dois insumos com o mesmo nome no arquivo não geram erro de banco (nome é único)', r.data.totais.erros === 0, r.data);
  const base = { insumo_id: 'a', nome: 'Leite', unidade_medida: 'L' };
  const fi = (o) => csv('ficha_tecnica', [{ produto_id: 'p1', insumo_id: 'a', quantidade_por_unidade: 0.2, unidade_medida: 'L', ...o }]);
  const pc = [csv('categorias', [{ categoria_id: 'c1', nome: 'Doces' }]), csv('produtos', [{ produto_id: 'p1', nome: 'Pudim', categoria_id: 'c1', preco: '8.00' }]), csv('insumos', [base])];
  r = await apply(E2, [...pc, fi({})]); ok('ficha técnica criada (produto × insumo)', r.data.resumo.ficha_tecnica.novos === 1 && r.data.aplicada, r.data);
  r = await sim(E2, [...pc, fi({ unidade_medida: 'kg' })]); ok('unidade da ficha incompatível com a do insumo (kg × L)', errs(r).some((e) => /ficha_tecnica\.csv:2:unidade_medida:unidade incompatível/.test(e)), errs(r));
  r = await sim(E2, [...pc, fi({ unidade_medida: 'ml', quantidade_por_unidade: 200 })]); ok('ml × L são da mesma grandeza (volume)', r.data.totais.erros === 0);
  r = await sim(E2, [...pc, fi({ insumo_id: 'nada' })]); ok('ficha com insumo inexistente', errs(r).some((e) => /insumo_id:referência "nada"/.test(e)));
  r = await sim(E2, [...pc, fi({ quantidade_por_unidade: 0 })]); ok('quantidade zero na ficha', errs(r).some((e) => /quantidade_por_unidade/.test(e)));
  r = await sim(E2, [...pc, fi({ perda_percentual: 120 })]); ok('perda acima de 100%', errs(r).some((e) => /perda_percentual/.test(e)));
  r = await apply(E2, [...pc, fi({ quantidade_por_unidade: 0.25, observacao: 'revisado' })]); ok('ficha técnica atualizada', r.data.resumo.ficha_tecnica.atualizados === 1);
  r = await E2('GET', '/api/io/export?estoque=1'); const fr = rd(r.buf, 'ficha_tecnica.csv').rows[0], er = rd(r.buf, 'estoque.csv').rows;
  ok('exportação de estoque: insumos com saldo/unidade e ficha com perda e observação', fr.quantidade_por_unidade === '0.25' && fr.unidade_medida === 'L' && fr.observacao === 'revisado' && er.find((x) => x.nome === 'Ovos').quantidade_estoque === '30' && er.find((x) => x.nome === 'Leite').estoque_minimo === '5', { fr, er });

  /* ===== Disponibilidade programada ===== */
  const sched = rd((await M('GET', '/api/io/export')).buf, 'disponibilidade.csv').rows;
  ok('disponibilidade exportada: 11 faixas de horário (HH:MM), dias 1 a 6', sched.length === 11 && sched.every((x) => /^\d{2}:\d{2}$/.test(x.hora_inicio) && /^[1-6]$/.test(x.dia_semana)), sched.slice(0, 3));
  const Dx = await newStore('dx');
  const dpf = [csv('categorias', [{ categoria_id: 'c1', nome: 'X' }]), csv('produtos', [{ produto_id: 'p1', nome: 'Prato do dia', categoria_id: 'c1', preco: '25.00', tipo_disponibilidade: 'agendada' }])];
  r = await apply(Dx, [...dpf, csv('disponibilidade', [{ produto_id: 'p1', dia_semana: 'seg', hora_inicio: '11:00', hora_fim: '15:00' }, { produto_id: 'p1', dia_semana: 'Sábado', hora_inicio: '18:00', hora_fim: '23:30' }])]);
  ok('dias por nome (seg, Sábado) e horários gravados', r.data.aplicada && r.data.resumo.disponibilidade.novos === 1 && r.data.previa.disponibilidade[0].motivo === '2 horário(s)', r.data);
  r = await sim(Dx, [...dpf, csv('disponibilidade', [{ produto_id: 'p1', dia_semana: '1', hora_inicio: '11:00', hora_fim: '15:00' }, { produto_id: 'p1', dia_semana: '6', hora_inicio: '18:00', hora_fim: '23:30' }])]); ok('os mesmos horários: sem alteração', r.data.resumo.disponibilidade.sem_alteracao === 1);
  r = await apply(Dx, [...dpf, csv('disponibilidade', [{ produto_id: 'p1', dia_semana: '1', hora_inicio: '12:00', hora_fim: '15:00' }])]); ok('horários diferentes substituem os do produto', r.data.resumo.disponibilidade.atualizados === 1 && rd((await Dx('GET', '/api/io/export')).buf, 'disponibilidade.csv').rows.length === 1);
  r = await sim(Dx, [...dpf, csv('disponibilidade', [{ produto_id: 'p1', dia_semana: 'xyz', hora_inicio: '11:00', hora_fim: '15:00' }])]); ok('dia da semana inválido', errs(r).some((e) => /dia_semana:dia inválido/.test(e)));
  r = await sim(Dx, [...dpf, csv('disponibilidade', [{ produto_id: 'p1', dia_semana: '1', hora_inicio: '25:00', hora_fim: '15:00' }])]); ok('horário inválido', errs(r).some((e) => /hora_inicio:horário inválido/.test(e)));
  const Dy = await newStore('dy');
  r = await sim(Dy, [csv('categorias', [{ categoria_id: 'c1', nome: 'X' }]), csv('produtos', [{ produto_id: 'p1', nome: 'Prato do dia', categoria_id: 'c1', preco: '25.00' }]), csv('disponibilidade', [{ produto_id: 'p1', dia_semana: '1', hora_inicio: '11:00', hora_fim: '15:00' }])]); ok('aviso quando há horários mas o tipo é "sempre"', r.data.totais.erros === 0 && r.data.avisos.some((a) => /só valem com "agendada"/.test(a.mensagem)), r.data.avisos);

  /* ===== Imagens ===== */
  const I = await newStore('i'); const png = placeholderPng();
  const ip = (o) => csv('produtos', [{ produto_id: 'p1', nome: 'Pizza', categoria_id: 'c1', preco: '40.00', imagem_arquivo: 'foto.png', ...o }]), ic = csv('categorias', [{ categoria_id: 'c1', nome: 'Pizzas' }]);
  r = await apply(I, asZip(zipOf({ 'categorias.csv': ic.buffer, 'produtos.csv': ip({}).buffer, 'imagens/foto.png': png }))); const pz = (await list(I, '/api/products'))[0];
  ok('imagem do ZIP gravada e servida (nome por conteúdo)', r.data.aplicada && /^\/uploads\/[a-f0-9]{32}\.png$/.test(pz.image_url) && (await fetch(BASE + pz.image_url)).status === 200, pz);
  r = await apply(I, asZip(zipOf({ 'categorias.csv': ic.buffer, 'produtos.csv': ip({}).buffer, 'imagens/foto.png': png }))); ok('reimportar a mesma imagem: sem alteração e mesmo endereço (sem duplicar)', r.data.resumo.imagens.sem_alteracao === 1 && (await list(I, '/api/products'))[0].image_url === pz.image_url, r.data.resumo.imagens);
  r = await sim(I, asZip(zipOf({ 'categorias.csv': ic.buffer, 'produtos.csv': ip({}).buffer, 'imagens/foto.png': Buffer.from('isto não é uma imagem') }))); ok('arquivo que não é imagem é recusado', errs(r).some((e) => /não é uma imagem JPG, PNG ou WebP válida/.test(e)), errs(r));
  r = await sim(I, asZip(zipOf({ 'categorias.csv': ic.buffer, 'produtos.csv': ip({}).buffer, 'imagens/foto.png': Buffer.concat([png, Buffer.alloc(2 * 1024 * 1024)]) }))); ok('imagem acima de 2 MB é recusada', errs(r).some((e) => /mais de 2 MB/.test(e)));
  r = await sim(I, [ic, ip({ imagem_arquivo: 'sumiu.png' })]); ok('imagem citada mas ausente do pacote: aviso, sem bloquear', r.data.totais.erros === 0 && r.data.avisos.some((a) => /não encontrado no pacote/.test(a.mensagem)), r.data);
  const U = await newStore('u');
  r = await apply(U, [ic, ip({ imagem_arquivo: null }), csv('imagens', [{ produto_id: 'p1', url_original: 'https://exemplo.com.br/pizza.jpg' }])]); ok('imagem por endereço público: gravada sem baixar nada', (await list(U, '/api/products'))[0].image_url === 'https://exemplo.com.br/pizza.jpg', r.data);
  for (const bad of ['javascript:alert(1)', 'ftp://x.com/a.jpg', 'data:image/png;base64,AAAA']) { r = await sim(U, [ic, ip({ imagem_arquivo: null }), csv('imagens', [{ produto_id: 'p1', url_original: bad }])]); ok(`endereço de imagem inseguro recusado: ${bad.slice(0, 22)}`, errs(r).some((e) => /endereço de imagem inválido/.test(e))); }
  r = await I('GET', '/api/io/export'); ok('exportação inclui o arquivo de imagem idêntico e a referência no CSV', new AdmZip(r.buf).getEntries().some((e) => /^imagens\/prod_\d+\.png$/.test(e.entryName) && e.getData().equals(png)) && /^prod_\d+\.png$/.test(rd(r.buf, 'produtos.csv').rows[0].imagem_arquivo) && rd(r.buf, 'imagens.csv').rows.length === 1);
  r = await I('GET', '/api/io/export?imagens=0'); ok('exportar sem imagens: sem pasta de imagens e o CSV continua importável', !new AdmZip(r.buf).getEntries().some((e) => /^imagens\//.test(e.entryName)) && rd(r.buf, 'produtos.csv').rows[0].imagem_arquivo === '' && (await sim(I, asZip(r.buf))).data.totais.erros === 0);
  const B2 = await newStore('i2'); r = await apply(B2, asZip((await I('GET', '/api/io/export')).buf)); ok('exportação com imagem importada em outra loja: a imagem vai junto', (await list(B2, '/api/products'))[0].image_url === pz.image_url);

  /* ===== Efeito no cardápio e nos pedidos ===== */
  const gOps = (name) => groups.find((g) => g.name === name).options;
  const adicionais = groups.find((g) => g.name === 'Adicionais');
  const menu0 = await menu(M);
  const mm = menu0.categories.flatMap((c) => c.products).find((p) => p.name === 'Misto Quente');
  ok('cardápio público: Suco (indisponível) não aparece; Batata mostra "a partir de"; Misto traz as duas etapas', !menu0.categories.flatMap((c) => c.products).some((p) => p.name === 'Suco de laranja') && menu0.categories.flatMap((c) => c.products).find((p) => p.name === 'Batata frita').price_from === 18.9 && mm.groups.map((g) => g.name).join() === 'Transforme seu pedido em combo,Adicionais', mm.groups.map((g) => g.name));
  ok('opções na ordem de exibição', mm.groups[1].options.map((o) => o.name).join() === 'Bacon,Ovo,Queijo extra');
  const exportRows = (e) => rd(exp.buf, e).rows;
  const prodRows = exportRows('produtos.csv').map((x) => (x.nome === 'Misto Quente' ? { ...x, exibir_cardapio_digital: 'false' } : x));
  r = await apply(M, [{ name: 'produtos.csv', buffer: Buffer.from(toCsv(F.FILES.produtos.columns, prodRows), 'utf8') }], { sistema_origem: `cardapio-digital:${slugs.get(M)}` }); ok('"exibir no cardápio digital = false" é aplicado', r.data.aplicada && r.data.resumo.produtos.atualizados === 1);
  const menu1 = await menu(M); ok('produto fora do cardápio digital some do cardápio público', !menu1.categories.flatMap((c) => c.products).some((p) => p.name === 'Misto Quente'));
  r = await order(M, [{ kind: 'product', id: misto.id, quantity: 1 }]); ok('...e não pode ser pedido pelo cliente online', r.status === 400, r.data);
  r = await M('POST', '/api/orders', { customer_name: 'Balcão', type: 'retirada', payment_method: 'pix', status: 'confirmado', items: [{ kind: 'product', id: misto.id, quantity: 1 }] }); ok('...mas a equipe consegue vender (painel/balcão)', r.status === 201, r.data);
  await M('PUT', `/api/products/${misto.id}`, { ...misto, show_digital: true, group_ids: misto.group_ids });
  const linkRows = exportRows('produto_etapas.csv').map((x) => (x.produto_id === `prod_${misto.id}` && x.etapa_id === `etapa_${combo.id}` ? { ...x, quantidade_minima: '1' } : x));
  r = await apply(M, [{ name: 'produto_etapas.csv', buffer: Buffer.from(toCsv(F.FILES.produto_etapas.columns, linkRows), 'utf8') }], { sistema_origem: `cardapio-digital:${slugs.get(M)}` }); ok('limite por produto na etapa (mínimo 1 só no Misto) é gravado', r.data.resumo.produto_etapas.atualizados === 1, r.data.resumo);
  const m2 = (await menu(M)).categories.flatMap((c) => c.products).find((p) => p.name === 'Misto Quente');
  ok('o limite por produto aparece no cardápio e não muda a etapa global', m2.groups.find((g) => g.name === 'Transforme seu pedido em combo').min === 1 && (await list(M, '/api/option-groups')).find((g) => g.name === 'Transforme seu pedido em combo').min_select === 0, m2.groups.map((g) => [g.name, g.min]));
  const opcCombo = gOps('Transforme seu pedido em combo')[0].id;
  r = await order(M, [{ kind: 'product', id: misto.id, quantity: 1 }]); ok('pedido sem escolher o que agora é obrigatório para esse produto é recusado', r.status === 400 && /Transforme seu pedido em combo/.test(r.data.error), r.data);
  r = await order(M, [{ kind: 'product', id: misto.id, quantity: 1, options: [opcCombo] }]); ok('...e com a escolha é aceito', r.status === 201, r.data);
  await M('PUT', `/api/products/${misto.id}`, { ...misto, group_ids: misto.group_ids });
  const afterEdit = rd((await M('GET', '/api/io/export')).buf, 'produto_etapas.csv').rows.find((x) => x.produto_id === `prod_${misto.id}` && x.etapa_id === `etapa_${combo.id}`);
  ok('editar o produto no painel NÃO apaga os ajustes por produto das etapas', afterEdit.quantidade_minima === '1', afterEdit);
  const etRows = rd((await M('GET', '/api/io/export')).buf, 'etapas.csv').rows.map((x) => (x.nome === 'Adicionais' ? { ...x, disponivel: 'false' } : x));
  r = await apply(M, [{ name: 'etapas.csv', buffer: Buffer.from(toCsv(F.FILES.etapas.columns, etRows), 'utf8') }], { sistema_origem: `cardapio-digital:${slugs.get(M)}` });
  const m3 = (await menu(M)).categories.flatMap((c) => c.products).find((p) => p.name === 'Misto Quente');
  ok('etapa indisponível some do cardápio', !m3.groups.some((g) => g.name === 'Adicionais') && m3.groups.length === 1, m3.groups.map((g) => g.name));
  r = await order(M, [{ kind: 'product', id: misto.id, quantity: 1, options: [opcCombo, adicionais.options[0].id] }]); ok('...e as opções dela não são aceitas em pedidos', r.status === 400, r.data);

  /* ===== Origem diferente ===== */
  const O = await newStore('o'); const pf = [csv('categorias', [{ categoria_id: 'c1', nome: 'Lanches' }]), csv('produtos', [{ produto_id: 'p1', nome: 'Misto', categoria_id: 'c1', preco: '10.00' }])];
  await apply(O, pf, { sistema_origem: 'plataforma-a' });
  r = await sim(O, pf, { sistema_origem: 'plataforma-b' }); ok('outra plataforma de origem sem vínculo: casa pelo nome (vincular) e não duplica', r.data.resumo.produtos.novos === 0 && r.data.resumo.produtos.sem_alteracao === 1, r.data.resumo.produtos);
  r = await sim(O, pf, { sistema_origem: 'plataforma-b', duplicatas: 'criar' }); ok('...ou duplica se o usuário escolher "criar"', r.data.resumo.produtos.novos === 1);
  console.log(fails ? `\n${fails} FALHA(S)` : '\nImportação/exportação (estoque, horários, imagens, cardápio) OK.'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
