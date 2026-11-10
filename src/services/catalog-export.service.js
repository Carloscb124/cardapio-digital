const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const db = require('../config/db');
const { toCsv } = require('../utils/csvio');
const F = require('../utils/catalog-format');

const money = (v) => (v === null || v === undefined ? null : Number(v).toFixed(2));
const hhmm = (t) => String(t).slice(0, 5);
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

async function loadImage(url) {
  const m = /^\/uploads\/([a-f0-9]{32}\.(jpg|png|webp))$/.exec(url || '');
  if (!m) return null;
  const [[row]] = await db.query('SELECT mime, data FROM uploads WHERE name=?', [m[1]]);
  if (row) return { mime: row.mime, data: row.data };
  try { return { mime: { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[m[2]], data: fs.readFileSync(path.join(__dirname, '..', '..', 'uploads', m[1])) }; } catch { return null; } // imagens antigas de instalações locais
}

// Monta o pacote ZIP (manifesto + CSVs [+ imagens]). opts: { categorias: [ids]|null, estoque: bool, imagens: bool }
async function exportPackage(est, opts = {}) {
  const [[store]] = await db.query('SELECT name, slug FROM establishments WHERE id=?', [est]);
  const wanted = Array.isArray(opts.categorias) ? opts.categorias.map(Number).filter((n) => Number.isInteger(n) && n > 0) : null;
  const avisos = [];

  const [allCats] = await db.query('SELECT * FROM categories WHERE establishment_id=? ORDER BY sort_order, name', [est]);
  const cats = wanted ? allCats.filter((c) => wanted.includes(c.id)) : allCats;
  const catIds = new Set(cats.map((c) => c.id));
  const [allProds] = await db.query('SELECT * FROM products WHERE establishment_id=? ORDER BY sort_order, name', [est]);
  const prods = wanted ? allProds.filter((p) => p.category_id && catIds.has(p.category_id)) : allProds;
  const prodIds = new Set(prods.map((p) => p.id));
  const [allLinks] = await db.query('SELECT l.* FROM product_option_groups l JOIN products p ON p.id=l.product_id WHERE p.establishment_id=? ORDER BY l.sort_order, l.group_id', [est]);
  const links = allLinks.filter((l) => prodIds.has(l.product_id));
  const [allGroups] = await db.query('SELECT * FROM option_groups WHERE establishment_id=? ORDER BY sort_order, name', [est]);
  const linkedGroups = new Set(links.map((l) => l.group_id));
  const groups = wanted ? allGroups.filter((g) => linkedGroups.has(g.id)) : allGroups;
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const [allOpts] = await db.query('SELECT o.* FROM options o JOIN option_groups g ON g.id=o.group_id WHERE g.establishment_id=? ORDER BY o.sort_order, o.id', [est]);
  const opts2 = allOpts.filter((o) => groupById.has(o.group_id));
  const [sched] = await db.query('SELECT s.* FROM product_schedules s JOIN products p ON p.id=s.product_id WHERE p.establishment_id=? ORDER BY s.product_id, s.weekday, s.start_time', [est]);
  const [maps] = await db.query('SELECT entity, internal_id, external_id FROM import_mappings WHERE establishment_id=? AND is_ext=1 ORDER BY id', [est]);
  const ext = new Map(maps.map((m) => [`${m.entity}|${m.internal_id}`, m.external_id])); // o mais recente prevalece
  const x = (entity, id) => ext.get(`${entity}|${id}`) || null;
  const P = F.PREFIX;

  const tables = {};
  tables.categorias = cats.map((c) => ({ categoria_id: `${P.categorias}_${c.id}`, id_externo: x('categorias', c.id), nome: c.name, descricao: c.description, ordem_exibicao: c.sort_order, disponivel: !!c.active }));

  const images = []; const imageRows = []; const seenImg = new Set();
  tables.produtos = [];
  for (const p of prods) {
    let file = null;
    if (p.image_url) {
      const local = /^\/uploads\//.test(p.image_url);
      if (local && opts.imagens !== false) {
        const img = await loadImage(p.image_url);
        if (img) { file = `prod_${p.id}.${EXT[img.mime]}`; if (!seenImg.has(file)) { seenImg.add(file); images.push({ file, data: img.data }); } } else avisos.push(`Imagem do produto "${p.name}" não encontrada e não exportada.`);
      }
      if (file || !local) imageRows.push({ imagem_id: `img_${p.id}`, produto_id: `${P.produtos}_${p.id}`, nome_arquivo: file, caminho_arquivo: file ? `imagens/${file}` : null, url_original: local ? null : p.image_url, texto_alternativo: p.name, ordem_exibicao: 1 });
    }
    tables.produtos.push({
      produto_id: `${P.produtos}_${p.id}`, id_externo: x('produtos', p.id), nome: p.name, categoria_id: p.category_id && catIds.has(p.category_id) ? `${P.categorias}_${p.category_id}` : null, descricao: p.description,
      preco: money(p.promo_price != null ? p.promo_price : p.price), preco_antigo: p.promo_price != null ? money(p.price) : null, preco_a_partir_de: money(p.price_from), custo: money(p.cost),
      disponivel: !!p.available, exibir_cardapio_digital: !!p.show_digital, exibir_tablet: !!p.show_tablet, troca_por_pontos: !!p.redeem_points, imagem_arquivo: file, tipo_venda: p.sale_type, ordem_exibicao: p.sort_order, tipo_disponibilidade: p.availability_type,
    });
  }
  tables.etapas = groups.map((g) => ({ etapa_id: `${P.etapas}_${g.id}`, id_externo: x('etapas', g.id), nome: g.name, quantidade_minima: g.min_select, quantidade_maxima: g.max_select, tipo_selecao: g.max_select === 1 ? 'unica' : 'multipla', obrigatoria: g.min_select > 0, ordem_exibicao: g.sort_order, disponivel: !!g.available }));
  tables.produto_etapas = links.filter((l) => groupById.has(l.group_id)).map((l) => { const g = groupById.get(l.group_id); return { produto_id: `${P.produtos}_${l.product_id}`, etapa_id: `${P.etapas}_${l.group_id}`, ordem_exibicao: l.sort_order, quantidade_minima: l.min_select ?? g.min_select, quantidade_maxima: l.max_select ?? g.max_select, disponivel: !!l.available }; });
  let dropped = 0;
  tables.opcoes = opts2.map((o) => {
    let ref = null;
    if (o.ref_product_id) { if (prodIds.has(o.ref_product_id)) ref = `${P.produtos}_${o.ref_product_id}`; else dropped++; }
    return { opcao_id: `${P.opcoes}_${o.id}`, id_externo: x('opcoes', o.id), etapa_id: `${P.etapas}_${o.group_id}`, produto_referenciado_id: ref, nome: o.name, descricao: o.description, preco_adicional: money(o.price_delta), custo_adicional: money(o.cost), disponivel: !!o.available, ordem_exibicao: o.sort_order, quantidade_minima: o.min_qty, quantidade_maxima: o.max_qty };
  });
  if (dropped) avisos.push(`${dropped} opção(ões) referenciavam produtos fora do escopo exportado; a referência foi omitida.`);
  tables.imagens = imageRows;
  tables.disponibilidade = sched.filter((s) => prodIds.has(s.product_id)).map((s) => ({ produto_id: `${P.produtos}_${s.product_id}`, dia_semana: s.weekday, hora_inicio: hhmm(s.start_time), hora_fim: hhmm(s.end_time) }));

  const includeStock = !!opts.estoque;
  if (includeStock) {
    const [ings] = await db.query('SELECT * FROM ingredients WHERE establishment_id=? ORDER BY name', [est]);
    const [ficha] = await db.query('SELECT pi.* FROM product_ingredients pi JOIN products p ON p.id=pi.product_id WHERE p.establishment_id=? ORDER BY pi.product_id, pi.ingredient_id', [est]);
    tables.insumos = ings.map((i) => ({ insumo_id: `${P.insumos}_${i.id}`, id_externo: x('insumos', i.id), nome: i.name, categoria_insumo: i.category, unidade_medida: i.unit, quantidade_estoque: Number(i.stock_qty), estoque_minimo: Number(i.stock_min), custo_unitario: i.unit_cost == null ? null : Number(i.unit_cost), disponivel: !!i.available }));
    tables.ficha_tecnica = ficha.filter((f) => prodIds.has(f.product_id)).map((f) => ({ produto_id: `${P.produtos}_${f.product_id}`, insumo_id: `${P.insumos}_${f.ingredient_id}`, quantidade_por_unidade: Number(f.qty_per_unit), unidade_medida: f.unit, perda_percentual: Number(f.loss_pct), observacao: f.notes }));
  }

  const zip = new AdmZip(); const arquivos = [];
  for (const entity of F.ORDER) {
    if (!tables[entity]) continue;
    const spec = F.FILES[entity];
    zip.addFile(spec.file, Buffer.from(toCsv(spec.columns, tables[entity]), 'utf8'));
    arquivos.push({ nome: spec.file, registros: tables[entity].length });
  }
  for (const img of images) zip.addFile(`imagens/${img.file}`, img.data);
  const manifest = {
    formato: F.FORMAT, versao: F.VERSION, exportado_em: new Date().toISOString(), sistema_origem: `${F.SYSTEM_ID}:${store.slug}`, loja: { nome: store.name, slug: store.slug },
    escopo: { tipo: wanted ? 'categorias' : 'tudo', categorias: wanted ? cats.map((c) => c.name) : [] }, inclui_estoque: includeStock, inclui_imagens: images.length > 0, imagens: images.length, arquivos, avisos,
  };
  zip.addFile('manifesto.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'));
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return { buffer: zip.toBuffer(), filename: `cardapio-${store.slug}-${stamp}.zip`, manifest };
}

module.exports = { exportPackage };
