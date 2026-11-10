// Importação de cardápio por CSV/ZIP: validação, prévia, simulação e gravação em uma única transação.
const crypto = require('crypto');
const AdmZip = require('adm-zip');
const db = require('../config/db');
const { parseCsv, unguard } = require('../utils/csvio');
const F = require('../utils/catalog-format');
const { HttpError } = require('../utils/http');

const MAX_ERRORS = 500, PREVIEW = 25, ZIP = { entries: 300, each: 8 * 1024 * 1024, total: 24 * 1024 * 1024 }, IMG_MAX = 2 * 1024 * 1024;
const SKIP = Symbol('skip'), BAD = Symbol('bad');
const ci = (s) => String(s || '').trim().toLowerCase();
const noAccent = (s) => ci(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/* ---------- Relatório e leitura tipada ---------- */
function makeOut() {
  const o = { errors: [], warnings: [], errorCount: 0, truncated: false, bad: {} };
  F.ORDER.forEach((e) => { o.bad[e] = new Set(); });
  o.err = (arquivo, linha, coluna, mensagem) => { o.errorCount++; if (o.errors.length < MAX_ERRORS) o.errors.push({ arquivo, linha, coluna, mensagem }); else o.truncated = true; };
  o.warn = (arquivo, linha, coluna, mensagem) => { if (o.warnings.length < MAX_ERRORS) o.warnings.push({ arquivo, linha, coluna, mensagem }); };
  return o;
}

function parseDecimal(v, dec, min, max) {
  let s = v.replace(/\s/g, '').replace(/^R\$/i, ''), note = null;
  if (/^\d{1,3}(\.\d{3})+,\d+$/.test(s)) { s = s.replace(/\./g, '').replace(',', '.'); note = 'vírgula decimal convertida para ponto'; }
  else if (/^\d+,\d+$/.test(s)) { s = s.replace(',', '.'); note = 'vírgula decimal convertida para ponto'; }
  if (!/^\d+(\.\d+)?$/.test(s)) return { error: `valor numérico inválido ("${v}"): use apenas números e ponto decimal, ex.: 17.00` };
  if ((s.split('.')[1] || '').length > dec) return { error: `use no máximo ${dec} casas decimais ("${v}")` };
  const n = Number(s);
  if (n < min || n > max) return { error: `valor fora do permitido ("${v}")` };
  return { value: n, note };
}
const BOOL = { true: true, false: false, 1: true, 0: false, sim: true, nao: false, não: false, s: true, n: false, yes: true, no: false };

function reader(row, file, out) {
  const E = (c, m) => out.err(file, row._line, c, m), W = (c, m) => out.warn(file, row._line, c, m);
  const raw = (c) => { const v = row[c]; if (v === undefined || v === null) return null; const t = String(v).trim(); return t === '' ? null : unguard(t); };
  const absent = (c, req) => { if (req) E(c, 'campo obrigatório'); return req ? undefined : null; };
  return {
    E, W, raw,
    str(c, { req = false, max = 255 } = {}) { const v = raw(c); if (v === null) return absent(c, req); if (v.length > max) { E(c, `máximo de ${max} caracteres`); return undefined; } return v; },
    num(c, { req = false, dec = 2, min = 0, max = 99999999 } = {}) { const v = raw(c); if (v === null) return absent(c, req); const r = parseDecimal(v, dec, min, max); if (r.error) { E(c, r.error); return undefined; } if (r.note) W(c, r.note); return r.value; },
    int(c, { req = false, min = 0, max = 1000000 } = {}) { const v = raw(c); if (v === null) return absent(c, req); if (!/^\d+$/.test(v) || Number(v) < min || Number(v) > max) { E(c, `número inteiro inválido ("${v}")`); return undefined; } return Number(v); },
    bool(c, { req = false } = {}) { const v = raw(c); if (v === null) return absent(c, req); const b = BOOL[noAccent(v)]; if (b === undefined) { E(c, `use true ou false ("${v}")`); return undefined; } return b; },
    enm(c, list, { req = false } = {}) { const v = raw(c); if (v === null) return absent(c, req); const l = noAccent(v); if (!list.includes(l)) { E(c, `valor inválido ("${v}"); use: ${list.join(', ')}`); return undefined; } return l; },
    unit(c, { req = false } = {}) { const v = raw(c); if (v === null) return absent(c, req); const u = F.UNITS[ci(v)]; if (!u) { E(c, `unidade inválida ("${v}"); use kg, g, L, ml ou unidade`); return undefined; } return u; },
    time(c) { const v = raw(c); if (v === null) return absent(c, true); const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(v); if (!m) { E(c, `horário inválido ("${v}"); use HH:MM`); return undefined; } return `${m[1].padStart(2, '0')}:${m[2]}`; },
    url(c) { const v = raw(c); if (v === null) return null; if (!/^https?:\/\/\S+$/i.test(v) || v.length > 255) { E(c, 'endereço de imagem inválido: use http:// ou https:// (até 255 caracteres)'); return undefined; } return v; },
  };
}

/* ---------- Pacote (CSVs soltos e/ou ZIP) ---------- */
function readPackage(uploads, out) {
  const pkg = { csv: new Map(), images: new Map(), manifest: null };
  const addCsv = (name, buf, origin) => { if (pkg.csv.has(name)) out.err(origin, null, null, `arquivo "${name}" enviado mais de uma vez`); else pkg.csv.set(name, buf); };
  for (const up of uploads) {
    const base = up.name.split(/[\\/]/).pop().toLowerCase(), b = up.buffer;
    if (b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b) {
      let zip; try { zip = new AdmZip(b); } catch { out.err(up.name, null, null, 'ZIP inválido ou corrompido'); continue; }
      const entries = zip.getEntries();
      if (entries.length > ZIP.entries) { out.err(up.name, null, null, `ZIP com arquivos demais (máx. ${ZIP.entries})`); continue; }
      let total = 0;
      for (const en of entries) {
        if (en.isDirectory) continue;
        const n = en.entryName.replace(/\\/g, '/');
        if (n.includes('..') || n.startsWith('/')) { out.warn(up.name, null, null, `entrada ignorada por segurança: ${n}`); continue; }
        const size = en.header.size; total += size;
        if (size > ZIP.each || total > ZIP.total) { out.err(up.name, null, null, 'ZIP descompactado grande demais'); break; }
        const eb = ci(n.split('/').pop());
        if (/^imagens\//i.test(n) || /\/imagens\//i.test(n)) pkg.images.set(eb, en.getData());
        else if (eb === 'manifesto.json') { try { pkg.manifest = JSON.parse(en.getData().toString('utf8')); } catch { out.err(up.name, null, null, 'manifesto.json inválido'); } }
        else if (eb.endsWith('.csv')) addCsv(eb, en.getData(), up.name);
        else out.warn(up.name, null, null, `arquivo ignorado: ${n}`);
      }
    } else if (base.endsWith('.csv')) addCsv(base, b, up.name);
    else if (base === 'manifesto.json') { try { pkg.manifest = JSON.parse(b.toString('utf8')); } catch { out.err(up.name, null, null, 'manifesto.json inválido'); } }
    else out.err(up.name, null, null, 'envie arquivos .csv ou um .zip');
  }
  const m = pkg.manifest;
  if (m) {
    if (m.formato !== F.FORMAT) out.err('manifesto.json', null, null, `formato desconhecido ("${m.formato}")`);
    else if (String(m.versao || '').split('.')[0] !== F.VERSION.split('.')[0]) out.err('manifesto.json', null, null, `versão do formato não suportada (${m.versao}); esta instalação lê a versão ${F.VERSION}`);
  }
  return pkg;
}

/* ---------- Fase A: validação dos arquivos (sem banco) ---------- */
const part = (it, key) => it[key];
function build(entity, rows, file, out, fn) {
  const items = [];
  for (const row of rows) {
    const rd = reader(row, file, out), before = out.errorCount;
    const item = fn(rd, row);
    if (out.errorCount > before) { const k = rd.raw(F.FILES[entity].columns[0]); if (k) out.bad[entity].add(k); } else items.push({ ...item, _line: row._line, _file: file });
  }
  return items;
}
function dedupe(entity, items, out, keyOf = (i) => i.local) {
  const seen = new Map();
  return items.filter((it) => {
    const keys = [['local', keyOf(it)], ['ext', it.ext]].filter(([, v]) => v);
    for (const [kind, v] of keys) {
      const k = `${kind}|${v}`;
      if (seen.has(k)) { out.err(it._file, it._line, kind === 'local' ? F.FILES[entity].columns[0] : 'id_externo', `identificador duplicado "${v}" (já usado na linha ${seen.get(k)})`); return false; }
      seen.set(k, it._line);
    }
    return true;
  });
}

const BUILD = {
  categorias: (rows, f, out) => dedupe('categorias', build('categorias', rows, f, out, (rd) => ({
    local: rd.str('categoria_id', { req: true, max: 100 }), ext: rd.str('id_externo', { max: 100 }), name: rd.str('nome', { req: true, max: 80 }),
    description: rd.str('descricao', { max: 255 }), sort_order: rd.int('ordem_exibicao'), active: rd.bool('disponivel'),
  })), out),
  insumos: (rows, f, out) => dedupe('insumos', build('insumos', rows, f, out, (rd) => ({
    local: rd.str('insumo_id', { req: true, max: 100 }), ext: rd.str('id_externo', { max: 100 }), name: rd.str('nome', { req: true, max: 120 }), category: rd.str('categoria_insumo', { max: 60 }),
    unit: rd.unit('unidade_medida', { req: true }), qty: rd.num('quantidade_estoque', { dec: 3 }), min: rd.num('estoque_minimo', { dec: 3 }), cost: rd.num('custo_unitario', { dec: 4 }), available: rd.bool('disponivel'),
  })), out),
  etapas: (rows, f, out) => dedupe('etapas', build('etapas', rows, f, out, (rd) => {
    const it = { local: rd.str('etapa_id', { req: true, max: 100 }), ext: rd.str('id_externo', { max: 100 }), name: rd.str('nome', { req: true, max: 80 }), min: rd.int('quantidade_minima'), max: rd.int('quantidade_maxima', { min: 1 }),
      tipo: rd.enm('tipo_selecao', ['unica', 'multipla']), obrig: rd.bool('obrigatoria'), sort_order: rd.int('ordem_exibicao'), available: rd.bool('disponivel') };
    if (it.tipo === 'unica' && it.max != null && it.max !== 1) rd.E('tipo_selecao', 'tipo "unica" exige quantidade_maxima 1');
    if (it.tipo === 'unica' && it.max == null) it.max = 1;
    if (it.min != null && it.max != null && it.min > it.max) rd.E('quantidade_minima', `maior que a quantidade_maxima (${it.max})`);
    if (it.obrig === true && !it.min) { it.min = 1; rd.W('obrigatoria', 'obrigatoria=true com quantidade_minima 0: mínimo ajustado para 1'); }
    if (it.obrig === false && it.min > 0) rd.W('obrigatoria', 'obrigatoria=false ignorada: quantidade_minima maior que 0 prevalece');
    return it;
  }), out),
  produtos: (rows, f, out) => dedupe('produtos', build('produtos', rows, f, out, (rd) => {
    const it = { local: rd.str('produto_id', { req: true, max: 100 }), ext: rd.str('id_externo', { max: 100 }), name: rd.str('nome', { req: true, max: 120 }), cat: rd.str('categoria_id', { max: 100 }), description: rd.str('descricao', { max: 1000 }),
      preco: rd.num('preco'), antigo: rd.num('preco_antigo'), price_from: rd.num('preco_a_partir_de'), cost: rd.num('custo'), available: rd.bool('disponivel'), show_digital: rd.bool('exibir_cardapio_digital'), show_tablet: rd.bool('exibir_tablet'),
      redeem_points: rd.bool('troca_por_pontos'), imagem: rd.str('imagem_arquivo', { max: 150 }), sale_type: rd.str('tipo_venda', { max: 20 }), sort_order: rd.int('ordem_exibicao'), availability_type: rd.enm('tipo_disponibilidade', ['sempre', 'agendada']) };
    if (it.sale_type && !/^[a-z_]{1,20}$/i.test(it.sale_type)) rd.E('tipo_venda', 'use apenas letras e _ (ex.: unitaria)');
    if (it.antigo != null && it.preco == null) rd.W('preco_antigo', 'preco_antigo ignorado porque "preco" está vazio');
    if (it.preco != null) {
      if (it.antigo != null && it.antigo > it.preco) { it.price = it.antigo; it.promo = it.preco; }
      else { it.price = it.preco; it.promo = null; if (it.antigo != null) rd.W('preco_antigo', 'preço antigo menor ou igual ao preço: ignorado (sem promoção)'); }
    }
    return it;
  }), out),
  opcoes: (rows, f, out) => dedupe('opcoes', build('opcoes', rows, f, out, (rd) => {
    const it = { local: rd.str('opcao_id', { req: true, max: 100 }), ext: rd.str('id_externo', { max: 100 }), etapa: rd.str('etapa_id', { req: true, max: 100 }), ref: rd.str('produto_referenciado_id', { max: 100 }), name: rd.str('nome', { req: true, max: 80 }),
      description: rd.str('descricao', { max: 255 }), price: rd.num('preco_adicional'), cost: rd.num('custo_adicional'), available: rd.bool('disponivel'), sort_order: rd.int('ordem_exibicao'), min_qty: rd.int('quantidade_minima'), max_qty: rd.int('quantidade_maxima') };
    if (it.min_qty != null && it.max_qty != null && it.min_qty > it.max_qty) rd.E('quantidade_minima', 'maior que a quantidade_maxima');
    return it;
  }), out),
  produto_etapas: (rows, f, out) => {
    const items = build('produto_etapas', rows, f, out, (rd) => {
      const it = { prod: rd.str('produto_id', { req: true, max: 100 }), etapa: rd.str('etapa_id', { req: true, max: 100 }), sort_order: rd.int('ordem_exibicao'), min: rd.int('quantidade_minima'), max: rd.int('quantidade_maxima', { min: 1 }), available: rd.bool('disponivel') };
      if (it.min != null && it.max != null && it.min > it.max) rd.E('quantidade_minima', 'maior que a quantidade_maxima');
      return it;
    });
    return dedupe('produto_etapas', items, out, (i) => `${i.prod}|${i.etapa}`);
  },
  imagens: (rows, f, out) => build('imagens', rows, f, out, (rd) => {
    const it = { prod: rd.str('produto_id', { req: true, max: 100 }), file: rd.str('nome_arquivo', { max: 150 }), url: rd.url('url_original'), sort_order: rd.int('ordem_exibicao') };
    if (!it.file && !it.url) rd.E('nome_arquivo', 'informe nome_arquivo (dentro do ZIP) ou url_original');
    return it;
  }),
  disponibilidade: (rows, f, out) => build('disponibilidade', rows, f, out, (rd) => {
    const w = rd.raw('dia_semana'); let day;
    if (w === null) rd.E('dia_semana', 'campo obrigatório'); else { day = /^[0-6]$/.test(w) ? Number(w) : F.WEEKDAYS[noAccent(w)]; if (day === undefined) rd.E('dia_semana', `dia inválido ("${w}"); use 0 (domingo) a 6 (sábado) ou dom, seg, ter...`); }
    return { prod: rd.str('produto_id', { req: true, max: 100 }), day, start: rd.time('hora_inicio'), end: rd.time('hora_fim') };
  }),
  ficha_tecnica: (rows, f, out) => {
    const items = build('ficha_tecnica', rows, f, out, (rd) => ({ prod: rd.str('produto_id', { req: true, max: 100 }), ing: rd.str('insumo_id', { req: true, max: 100 }), qty: rd.num('quantidade_por_unidade', { req: true, dec: 4, min: 0.0001 }),
      unit: rd.unit('unidade_medida', { req: true }), loss: rd.num('perda_percentual', { max: 100 }), notes: rd.str('observacao', { max: 255 }) }));
    return dedupe('ficha_tecnica', items, out, (i) => `${i.prod}|${i.ing}`);
  },
};

function parseTables(pkg, out) {
  const tables = {}, files = [];
  for (const entity of F.ORDER) {
    const spec = F.FILES[entity], buf = pkg.csv.get(spec.file);
    if (!buf) continue;
    let parsed;
    try { parsed = parseCsv(buf); } catch (e) { out.err(spec.file, e.line || null, null, e.message); continue; }
    files.push({ nome: spec.file, registros: parsed.rows.length });
    const headers = parsed.headers.map((h) => h.toLowerCase());
    const missing = spec.required.filter((c) => !headers.includes(c));
    if (missing.length) { missing.forEach((c) => out.err(spec.file, 1, c, 'coluna obrigatória ausente no cabeçalho')); continue; }
    const unknown = headers.filter((h) => !spec.columns.includes(h));
    if (unknown.length) out.warn(spec.file, 1, unknown.join(', '), 'colunas desconhecidas serão ignoradas');
    const rows = parsed.rows.map((r) => { const o = { _line: r._line }; Object.keys(r).forEach((k) => { if (k !== '_line') o[k.toLowerCase()] = r[k]; }); return o; });
    tables[entity] = BUILD[entity](rows, spec.file, out);
  }
  const known = new Set(Object.values(F.FILES).map((s) => s.file));
  for (const name of pkg.csv.keys()) if (!known.has(name)) out.warn(name, null, null, 'arquivo CSV não reconhecido: ignorado');
  return { tables, files };
}

/* ---------- Fase B: gravação (dentro de uma transação) ---------- */
const TBL = { categorias: 'categories', etapas: 'option_groups', produtos: 'products', insumos: 'ingredients', opcoes: 'options' };
const OWN_SCOPED = { categorias: true, etapas: true, produtos: true, insumos: true, opcoes: false };
const norm = (v) => (v === null || v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : typeof v === 'number' ? Math.round(v * 10000) / 10000 : typeof v === 'string' && v !== '' && !Number.isNaN(Number(v)) && /^\d+(\.\d+)?$/.test(v) ? Math.round(Number(v) * 10000) / 10000 : v);
const defined = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
const u = (v) => (v === null || v === undefined ? undefined : v);
const tf = (v) => (v === null || v === undefined ? undefined : v ? 1 : 0);

async function applyImport(conn, c) {
  const { est, own, acao, dup, out, tables, pkg } = c;
  const q = async (sql, p) => (await conn.query(sql, p))[0];
  const ex = {
    categorias: new Map((await q('SELECT * FROM categories WHERE establishment_id=?', [est])).map((r) => [r.id, r])),
    etapas: new Map((await q('SELECT * FROM option_groups WHERE establishment_id=?', [est])).map((r) => [r.id, r])),
    produtos: new Map((await q('SELECT * FROM products WHERE establishment_id=?', [est])).map((r) => [r.id, r])),
    insumos: new Map((await q('SELECT * FROM ingredients WHERE establishment_id=?', [est])).map((r) => [r.id, r])),
    opcoes: new Map((await q('SELECT o.* FROM options o JOIN option_groups g ON g.id=o.group_id WHERE g.establishment_id=?', [est])).map((r) => [r.id, r])),
  };
  const linkMap = new Map((await q('SELECT l.* FROM product_option_groups l JOIN products p ON p.id=l.product_id WHERE p.establishment_id=?', [est])).map((r) => [`${r.product_id}|${r.group_id}`, r]));
  const fichaMap = new Map((await q('SELECT pi.* FROM product_ingredients pi JOIN products p ON p.id=pi.product_id WHERE p.establishment_id=?', [est])).map((r) => [`${r.product_id}|${r.ingredient_id}`, r]));
  const mapping = new Map((await q('SELECT entity, external_id, internal_id FROM import_mappings WHERE establishment_id=? AND source_system=?', [est, c.source])).map((r) => [`${r.entity}|${r.external_id}`, r.internal_id]));
  const pendingMap = [], localMap = {}, created = {};
  F.ORDER.forEach((e) => { localMap[e] = new Map(); created[e] = new Set(); });

  const rec = (entity, it, action, extra = {}) => {
    c.stats[entity][action]++;
    const list = c.preview[entity];
    if (list.length < PREVIEW) list.push({ arquivo: it._file, linha: it._line, chave: it.ext || it.local || null, nome: extra.nome || it.name || null, acao: action, motivo: extra.motivo || null, mudancas: extra.mudancas ? extra.mudancas.slice(0, 8) : null });
  };
  const fail = (it, col, msg) => out.err(it._file, it._line, col, msg);
  const lookup = (entity, key) => {
    if (own) { const m = new RegExp(`^${F.PREFIX[entity]}_(\\d+)$`).exec(key); if (m && ex[entity].has(Number(m[1]))) return Number(m[1]); }
    const id = mapping.get(`${entity}|${key}`);
    return id && ex[entity].has(id) ? id : null;
  };
  const resolve = (entity, key, it, col) => {
    if (out.bad[entity].has(key)) return SKIP;
    if (localMap[entity].has(key)) return localMap[entity].get(key);
    const id = lookup(entity, key);
    if (id) return id;
    fail(it, col, `referência "${key}" não encontrada (nem nos arquivos enviados nem em importações anteriores)`);
    return BAD;
  };
  const remember = (entity, it, id, via) => { localMap[entity].set(it.local, id); if (via !== 'proprio') pendingMap.push([entity, it.local, it.ext, id]); };
  const diff = (row, values) => Object.entries(values).filter(([k, v]) => v !== undefined && norm(row[k]) !== norm(v)).map(([k, v]) => ({ campo: k, de: row[k] ?? null, para: v }));

  async function upsert(entity, it, values, o = {}) {
    const table = TBL[entity];
    let found = null;
    for (const key of [it.ext, it.local]) { if (!key || found) continue; const id = lookup(entity, key); if (id) found = { row: ex[entity].get(id), via: (own && new RegExp(`^${F.PREFIX[entity]}_\\d+$`).test(key)) ? 'proprio' : 'vinculo' }; }
    if (!found && o.nameMatch) { const row = o.nameMatch(); if (row) found = { row, via: 'nome' }; }
    if (found && found.via === 'nome') {
      if (dup === 'ignorar') {
        rec(entity, it, 'ignorados', { motivo: `já existe um registro com o mesmo nome (#${found.row.id}); nada foi alterado` });
        // Categorias, etapas e insumos existentes continuam servindo de "pai" para os registros do arquivo; produtos e opções ignorados levam seus dependentes junto.
        if (['categorias', 'etapas', 'insumos'].includes(entity)) { localMap[entity].set(it.local, found.row.id); return found.row.id; }
        localMap[entity].set(it.local, SKIP); return SKIP;
      }
      if (dup === 'criar' && !o.unique) found = null;
    }
    if (found) {
      const row = found.row;
      if (o.onFound) o.onFound(row, it);
      if (acao === 'inserir') { rec(entity, it, 'ignorados', { motivo: 'já existe (esta importação só insere registros novos)' }); localMap[entity].set(it.local, row.id); return row.id; }
      const changes = diff(row, values);
      if (o.guard) { const msg = o.guard(row, values); if (msg) { fail(it, msg[0], msg[1]); return BAD; } }
      if (found.via !== 'proprio') pendingMap.push([entity, it.local, it.ext, row.id]);
      localMap[entity].set(it.local, row.id);
      if (!changes.length) { rec(entity, it, 'sem_alteracao', { motivo: found.via === 'nome' ? 'vinculado pelo nome' : null }); return row.id; }
      await conn.query(`UPDATE \`${table}\` SET ${changes.map((x) => `\`${x.campo}\`=?`).join(', ')} WHERE id=?`, [...changes.map((x) => x.para), row.id]);
      changes.forEach((x) => { row[x.campo] = x.para; });
      rec(entity, it, 'atualizados', { mudancas: changes, motivo: found.via === 'nome' ? 'vinculado pelo nome' : null });
      return row.id;
    }
    if (acao === 'atualizar') { rec(entity, it, 'ignorados', { motivo: 'não existe (esta importação só atualiza registros existentes)' }); localMap[entity].set(it.local, SKIP); return SKIP; }
    for (const [col, csvCol] of o.required || []) if (values[col] === undefined || values[col] === null) { fail(it, csvCol, 'obrigatório para cadastrar um registro novo'); return BAD; }
    const data = { ...(OWN_SCOPED[entity] ? { establishment_id: est } : {}), ...o.defaults, ...defined(values), ...o.insertOnly };
    const cols = Object.keys(data);
    const [r] = await conn.query(`INSERT INTO \`${table}\` (${cols.map((x) => `\`${x}\``).join(',')}) VALUES (${cols.map(() => '?').join(',')})`, cols.map((x) => data[x]));
    ex[entity].set(r.insertId, { id: r.insertId, ...data });
    created[entity].add(r.insertId); pendingMap.push([entity, it.local, it.ext, r.insertId]); localMap[entity].set(it.local, r.insertId);
    rec(entity, it, 'novos');
    return r.insertId;
  }
  const depSkip = (entity, it) => rec(entity, it, 'ignorados', { motivo: 'depende de um registro ignorado' });
  const rows = (e) => tables[e] || [];

  /* categorias */
  for (const it of rows('categorias')) await upsert('categorias', it, { name: it.name, description: u(it.description), sort_order: u(it.sort_order), active: tf(it.active) },
    { defaults: { sort_order: 0, active: 1 }, nameMatch: () => [...ex.categorias.values()].find((r) => ci(r.name) === ci(it.name)) });

  /* insumos: o saldo físico só é definido ao CRIAR; um insumo existente mantém o saldo (movimentações são feitas no estoque) */
  for (const it of rows('insumos')) await upsert('insumos', it, { name: it.name, category: u(it.category), unit: it.unit, stock_min: u(it.min), unit_cost: u(it.cost), available: tf(it.available) }, {
    unique: true, defaults: { stock_min: 0, available: 1 }, insertOnly: { stock_qty: it.qty ?? 0 }, nameMatch: () => [...ex.insumos.values()].find((r) => ci(r.name) === ci(it.name)),
    onFound: (row) => { if (it.qty != null && Number(row.stock_qty) !== it.qty) out.warn(it._file, it._line, 'quantidade_estoque', `saldo de "${row.name}" mantido em ${Number(row.stock_qty)} (a importação não altera o estoque físico)`); },
    guard: (row, v) => (v.unit && row.unit !== v.unit && Number(row.stock_qty) !== 0 ? ['unidade_medida', `não é possível trocar a unidade de "${row.name}" (${row.unit} → ${v.unit}) enquanto houver saldo em estoque`] : null),
  });

  /* etapas (grupos de opções) */
  for (const it of rows('etapas')) await upsert('etapas', it, { name: it.name, min_select: u(it.min), max_select: u(it.max), sort_order: u(it.sort_order), available: tf(it.available) },
    { defaults: { min_select: 0, max_select: 1, sort_order: 0, available: 1 }, required: it.tipo === 'multipla' ? [['max_select', 'quantidade_maxima']] : [], nameMatch: () => [...ex.etapas.values()].find((r) => ci(r.name) === ci(it.name)) });

  /* produtos */
  for (const it of rows('produtos')) {
    let catId;
    if (it.cat) { catId = resolve('categorias', it.cat, it, 'categoria_id'); if (catId === BAD) continue; if (catId === SKIP) { rec('produtos', it, 'ignorados', { motivo: 'a categoria foi ignorada' }); localMap.produtos.set(it.local, SKIP); continue; } }
    await upsert('produtos', it, {
      name: it.name, description: u(it.description), category_id: catId, price: it.price, promo_price: it.price === undefined ? undefined : it.promo, price_from: u(it.price_from), cost: u(it.cost),
      available: tf(it.available), show_digital: tf(it.show_digital), show_tablet: tf(it.show_tablet), redeem_points: tf(it.redeem_points), sale_type: it.sale_type ? it.sale_type.toLowerCase() : undefined, sort_order: u(it.sort_order), availability_type: u(it.availability_type),
    }, { defaults: { available: 1, show_digital: 1, show_tablet: 1, redeem_points: 0, sale_type: 'unitaria', sort_order: 0, availability_type: 'sempre' }, required: [['price', 'preco']],
      nameMatch: () => [...ex.produtos.values()].find((r) => ci(r.name) === ci(it.name) && (catId === undefined || (r.category_id || null) === catId)) });
  }

  /* opções */
  for (const it of rows('opcoes')) {
    const gid = resolve('etapas', it.etapa, it, 'etapa_id'); if (gid === BAD) continue; if (gid === SKIP) { depSkip('opcoes', it); localMap.opcoes.set(it.local, SKIP); continue; }
    let ref;
    if (it.ref) { ref = resolve('produtos', it.ref, it, 'produto_referenciado_id'); if (ref === BAD) continue; if (ref === SKIP) { out.warn(it._file, it._line, 'produto_referenciado_id', 'produto referenciado ignorado: a referência não foi gravada'); ref = undefined; } }
    await upsert('opcoes', it, { group_id: gid, ref_product_id: ref, name: it.name, description: u(it.description), price_delta: u(it.price), cost: u(it.cost), available: tf(it.available), sort_order: u(it.sort_order), min_qty: u(it.min_qty), max_qty: u(it.max_qty) },
      { defaults: { price_delta: 0, available: 1, sort_order: 0 }, nameMatch: () => [...ex.opcoes.values()].find((r) => r.group_id === gid && ci(r.name) === ci(it.name)) });
  }

  /* produtos × etapas */
  for (const it of rows('produto_etapas')) {
    const pid = resolve('produtos', it.prod, it, 'produto_id'), gid = resolve('etapas', it.etapa, it, 'etapa_id');
    if (pid === BAD || gid === BAD) continue; if (pid === SKIP || gid === SKIP) { depSkip('produto_etapas', it); continue; }
    // Limites iguais aos da etapa não são ajustes por produto: ficam em branco (a etapa manda), como na exportação.
    const grp = ex.etapas.get(gid), over = (v, base) => (v === null || v === undefined ? undefined : v === base ? null : v);
    const key = `${pid}|${gid}`, row = linkMap.get(key), values = { sort_order: u(it.sort_order), min_select: over(it.min, grp.min_select), max_select: over(it.max, grp.max_select), available: tf(it.available) };
    it.name = `${ex.produtos.get(pid).name} × ${ex.etapas.get(gid).name}`;
    if (row) {
      if (acao === 'inserir') { rec('produto_etapas', it, 'ignorados', { motivo: 'ligação já existe' }); continue; }
      const changes = diff(row, values);
      if (!changes.length) { rec('produto_etapas', it, 'sem_alteracao'); continue; }
      await conn.query(`UPDATE product_option_groups SET ${changes.map((x) => `\`${x.campo}\`=?`).join(', ')} WHERE product_id=? AND group_id=?`, [...changes.map((x) => x.para), pid, gid]);
      changes.forEach((x) => { row[x.campo] = x.para; }); rec('produto_etapas', it, 'atualizados', { mudancas: changes });
    } else {
      if (acao === 'atualizar') { rec('produto_etapas', it, 'ignorados', { motivo: 'ligação não existe (esta importação só atualiza)' }); continue; }
      const data = { product_id: pid, group_id: gid, sort_order: 0, available: 1, ...defined(values) }, cols = Object.keys(data);
      await conn.query(`INSERT INTO product_option_groups (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, cols.map((x) => data[x]));
      linkMap.set(key, data); rec('produto_etapas', it, 'novos');
    }
  }

  /* disponibilidade programada (substitui os horários dos produtos que aparecem no arquivo) */
  const byProd = new Map();
  for (const it of rows('disponibilidade')) { if (!byProd.has(it.prod)) byProd.set(it.prod, []); byProd.get(it.prod).push(it); }
  for (const [local, list] of byProd) {
    const pid = resolve('produtos', local, list[0], 'produto_id'); const head = { ...list[0], name: null };
    if (pid === BAD) continue; if (pid === SKIP) { depSkip('disponibilidade', head); continue; }
    head.name = ex.produtos.get(pid).name;
    const want = list.map((x) => `${x.day}|${x.start}|${x.end}`).sort(), cur = (await q('SELECT weekday, start_time, end_time FROM product_schedules WHERE product_id=?', [pid])).map((x) => `${x.weekday}|${String(x.start_time).slice(0, 5)}|${String(x.end_time).slice(0, 5)}`).sort();
    if (ex.produtos.get(pid).availability_type !== 'agendada') out.warn(head._file, head._line, 'tipo_disponibilidade', `"${head.name}" tem horários, mas o tipo de disponibilidade é "${ex.produtos.get(pid).availability_type}": os horários só valem com "agendada"`);
    if (want.join() === cur.join()) { rec('disponibilidade', head, 'sem_alteracao'); continue; }
    if (acao === 'inserir' && !created.produtos.has(pid)) { rec('disponibilidade', head, 'ignorados', { motivo: 'produto já existe (esta importação só insere)' }); continue; }
    if (acao === 'atualizar' && !cur.length) { rec('disponibilidade', head, 'ignorados', { motivo: 'sem horários anteriores (esta importação só atualiza)' }); continue; }
    await conn.query('DELETE FROM product_schedules WHERE product_id=?', [pid]);
    await conn.query('INSERT INTO product_schedules (product_id, weekday, start_time, end_time) VALUES ?', [list.map((x) => [pid, x.day, x.start, x.end])]);
    rec('disponibilidade', head, cur.length ? 'atualizados' : 'novos', { motivo: `${list.length} horário(s)` });
  }

  /* ficha técnica */
  for (const it of rows('ficha_tecnica')) {
    const pid = resolve('produtos', it.prod, it, 'produto_id'), iid = resolve('insumos', it.ing, it, 'insumo_id');
    if (pid === BAD || iid === BAD) continue; if (pid === SKIP || iid === SKIP) { depSkip('ficha_tecnica', it); continue; }
    const ing = ex.insumos.get(iid); it.name = `${ex.produtos.get(pid).name} → ${ing.name}`;
    if (F.UNIT_KIND[it.unit] !== F.UNIT_KIND[ing.unit]) { fail(it, 'unidade_medida', `unidade incompatível com o insumo "${ing.name}" (${ing.unit}): ${it.unit} mede outra grandeza`); continue; }
    const key = `${pid}|${iid}`, row = fichaMap.get(key), values = { qty_per_unit: it.qty, unit: it.unit, loss_pct: u(it.loss), notes: u(it.notes) };
    if (row) {
      if (acao === 'inserir') { rec('ficha_tecnica', it, 'ignorados', { motivo: 'já existe' }); continue; }
      const changes = diff(row, values);
      if (!changes.length) { rec('ficha_tecnica', it, 'sem_alteracao'); continue; }
      await conn.query(`UPDATE product_ingredients SET ${changes.map((x) => `\`${x.campo}\`=?`).join(', ')} WHERE product_id=? AND ingredient_id=?`, [...changes.map((x) => x.para), pid, iid]);
      changes.forEach((x) => { row[x.campo] = x.para; }); rec('ficha_tecnica', it, 'atualizados', { mudancas: changes });
    } else {
      if (acao === 'atualizar') { rec('ficha_tecnica', it, 'ignorados', { motivo: 'não existe (esta importação só atualiza)' }); continue; }
      const data = { product_id: pid, ingredient_id: iid, loss_pct: 0, ...defined(values) }, cols = Object.keys(data);
      await conn.query(`INSERT INTO product_ingredients (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, cols.map((x) => data[x]));
      fichaMap.set(key, data); rec('ficha_tecnica', it, 'novos');
    }
  }

  /* imagens: arquivo dentro do ZIP (gravado no banco) ou endereço público (sem baixar nada) */
  const imgFor = new Map();
  for (const it of rows('produtos')) if (it.imagem) imgFor.set(it.local, { _file: it._file, _line: it._line, file: it.imagem, sort: 0 });
  for (const it of rows('imagens')) { const cur = imgFor.get(it.prod); if (!cur || cur.sort > (it.sort_order ?? 0) || !cur.url) { if (cur && cur.fromCsv) out.warn(it._file, it._line, 'ordem_exibicao', 'o produto só tem uma imagem: as demais linhas foram ignoradas'); imgFor.set(it.prod, { ...it, sort: it.sort_order ?? 0, fromCsv: true }); } else out.warn(it._file, it._line, 'ordem_exibicao', 'o produto só tem uma imagem: linha ignorada'); }
  for (const [local, im] of imgFor) {
    const pid = resolve('produtos', local, im, 'produto_id');
    if (pid === BAD) continue; if (pid === SKIP) { depSkip('imagens', im); continue; }
    const prod = ex.produtos.get(pid); im.name = prod.name;
    if (acao === 'inserir' && !created.produtos.has(pid)) { rec('imagens', im, 'ignorados', { motivo: 'produto já existe (esta importação só insere)' }); continue; }
    let url = null;
    const buf = im.file ? pkg.images.get(ci(im.file.split(/[\\/]/).pop())) : null;
    if (buf) {
      const mime = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff ? 'image/jpeg' : buf.slice(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])) ? 'image/png' : buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP' ? 'image/webp' : null;
      if (!mime) { fail(im, 'nome_arquivo', `"${im.file}" não é uma imagem JPG, PNG ou WebP válida`); continue; }
      if (buf.length > IMG_MAX) { fail(im, 'nome_arquivo', `"${im.file}" tem mais de 2 MB`); continue; }
      const name = crypto.createHash('sha1').update(buf).digest('hex').slice(0, 32) + { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' }[mime];
      await conn.query('INSERT IGNORE INTO uploads (name, mime, data) VALUES (?,?,?)', [name, mime, buf]);
      url = `/uploads/${name}`;
    } else if (im.url) url = im.url;
    else { out.warn(im._file, im._line, 'nome_arquivo', `arquivo de imagem "${im.file}" não encontrado no pacote: o produto "${prod.name}" ficou sem imagem nova`); continue; }
    if (norm(prod.image_url) === url) { rec('imagens', im, 'sem_alteracao'); continue; }
    await conn.query('UPDATE products SET image_url=? WHERE id=?', [url, pid]);
    rec('imagens', im, 'atualizados', { mudancas: [{ campo: 'image_url', de: prod.image_url ?? null, para: url }] }); prod.image_url = url;
  }

  // Vínculos com os ids da plataforma de origem: permitem atualizar em vez de duplicar em novas importações.
  const maprows = [], seen = new Set();
  for (const [entity, local, ext, id] of pendingMap) {
    for (const [key, isExt] of [[ext, 1], [local, 0]]) { if (!key) continue; const k = `${entity}|${key}`; if (seen.has(k)) continue; seen.add(k); maprows.push([est, c.source, entity, key, id, isExt]); }
  }
  for (let i = 0; i < maprows.length; i += 500) await conn.query('INSERT INTO import_mappings (establishment_id, source_system, entity, external_id, internal_id, is_ext) VALUES ? ON DUPLICATE KEY UPDATE internal_id=VALUES(internal_id), is_ext=GREATEST(is_ext, VALUES(is_ext))', [maprows.slice(i, i + 500)]);
}

/* ---------- Entrada pública ---------- */
const normSource = (s) => { const v = ci(s).replace(/[^a-z0-9:_.-]/g, '-').slice(0, 60); return v || null; };

async function runImport({ est, slug, userId, uploads, options = {}, commit = false }) {
  const t0 = Date.now();
  const acao = options.acao || 'ambos', dup = options.duplicatas || 'vincular';
  if (!['inserir', 'atualizar', 'ambos'].includes(acao)) throw new HttpError(400, 'Ação inválida. Use inserir, atualizar ou ambos.');
  if (!['vincular', 'criar', 'ignorar'].includes(dup)) throw new HttpError(400, 'Opção de duplicidade inválida. Use vincular, criar ou ignorar.');
  const out = makeOut();
  if (!uploads.length) out.err(null, null, null, 'nenhum arquivo enviado');
  const pkg = readPackage(uploads, out);
  const source = normSource(options.sistema_origem) || normSource(pkg.manifest && pkg.manifest.sistema_origem) || 'importacao';
  const { tables, files } = parseTables(pkg, out);
  if (!pkg.csv.size && !out.errorCount) out.err(null, null, null, 'nenhum arquivo CSV reconhecido (esperado: categorias.csv, produtos.csv, etapas.csv, opcoes.csv...)');
  const stats = {}, preview = {};
  F.ORDER.forEach((e) => { stats[e] = { novos: 0, atualizados: 0, sem_alteracao: 0, ignorados: 0 }; preview[e] = []; });
  const ctx = { est, own: source === `${F.SYSTEM_ID}:${slug}`, source, acao, dup, out, tables, pkg, stats, preview };
  let applied = false;
  if (!out.errorCount) {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      try { await applyImport(conn, ctx); } catch (e) { out.err(null, null, null, `erro inesperado ao gravar: ${e.message}`); }
      if (!out.errorCount && commit) { await conn.commit(); applied = true; } else await conn.rollback();
    } catch (e) { try { await conn.rollback(); } catch { /* já encerrada */ } throw e; } finally { conn.release(); }
  }
  const shown = F.ORDER.filter((e) => tables[e] || Object.values(stats[e]).some((v) => v > 0)); // inclui imagens citadas só em produtos.csv
  const sum = (k) => Object.values(stats).reduce((s, x) => s + x[k], 0);
  const report = {
    modo: commit ? 'aplicar' : 'simulacao', aplicada: applied, sistema_origem: source, acao, duplicatas: dup,
    arquivos: files, totais: { novos: sum('novos'), atualizados: sum('atualizados'), sem_alteracao: sum('sem_alteracao'), ignorados: sum('ignorados'), erros: out.errorCount },
    resumo: Object.fromEntries(shown.map((e) => [e, { ...stats[e], rotulo: F.LABEL[e] }])), previa: Object.fromEntries(shown.map((e) => [e, preview[e]])),
    erros: out.errors, erros_truncados: out.truncated, avisos: out.warnings, duracao_ms: Date.now() - t0,
  };
  if (commit) {
    try { await db.query('INSERT INTO import_runs (establishment_id, user_id, source_system, action, duplicates, status, summary) VALUES (?,?,?,?,?,?,?)', [est, userId || null, source, acao, dup, applied ? 'aplicada' : 'rejeitada', JSON.stringify({ totais: report.totais, resumo: report.resumo, arquivos: files, erros: out.errors.slice(0, 20), duracao_ms: report.duracao_ms })]); } catch { /* o registro é só histórico */ }
  }
  return report;
}

async function listRuns(est) {
  const [rows] = await db.query('SELECT r.id, r.source_system, r.action, r.duplicates, r.status, r.summary, r.created_at, u.name AS user_name FROM import_runs r LEFT JOIN users u ON u.id=r.user_id WHERE r.establishment_id=? ORDER BY r.id DESC LIMIT 30', [est]);
  return rows.map((r) => { let s = {}; try { s = JSON.parse(r.summary); } catch { /* resumo antigo */ } return { id: r.id, sistema_origem: r.source_system, acao: r.action, duplicatas: r.duplicates, status: r.status, usuario: r.user_name, em: r.created_at, totais: s.totais || null, arquivos: s.arquivos || [] }; });
}

module.exports = { runImport, listRuns };
