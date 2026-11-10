const multer = require('multer');
const db = require('../config/db');
const exporter = require('../services/catalog-export.service');
const importer = require('../services/catalog-import.service');
const { exampleZip } = require('../utils/example-package');
const { wrap } = require('../utils/http');

// Importação: até 12 arquivos de 4 MB (limite de corpo da hospedagem serverless: ~4,5 MB por envio).
exports.upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 4 * 1024 * 1024, files: 12 } }).array('files', 12);

const est = (req) => req.session.user.establishmentId;
const flag = (v) => v === '1' || v === 'true';

exports.export = wrap(async (req, res) => {
  const cats = req.query.categorias ? String(req.query.categorias).split(',') : null;
  const r = await exporter.exportPackage(est(req), { categorias: cats, estoque: flag(req.query.estoque), imagens: req.query.imagens !== '0' });
  res.set({ 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${r.filename}"` });
  res.send(r.buffer);
});

exports.example = (req, res) => {
  res.set({ 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="modelo-cardapio-csv.zip"' });
  res.send(exampleZip());
};

exports.import = wrap(async (req, res) => {
  const [[s]] = await db.query('SELECT slug FROM establishments WHERE id=?', [est(req)]);
  const uploads = (req.files || []).map((f) => ({ name: f.originalname, buffer: f.buffer }));
  const b = req.body || {};
  res.json(await importer.runImport({ est: est(req), slug: s.slug, userId: req.session.user.id, uploads, commit: b.modo === 'aplicar', options: { acao: b.acao, duplicatas: b.duplicatas, sistema_origem: b.sistema_origem } }));
});

exports.runs = wrap(async (req, res) => res.json(await importer.listRuns(est(req))));

exports.ingredients = wrap(async (req, res) => {
  const [rows] = await db.query('SELECT id, name, category, unit, stock_qty, stock_min, unit_cost, available FROM ingredients WHERE establishment_id=? ORDER BY name', [est(req)]);
  res.json(rows.map((r) => ({ ...r, low: Number(r.stock_qty) <= Number(r.stock_min) })));
});
