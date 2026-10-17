const fs = require('fs');
const settings = require('../services/settings.service');
const users = require('../services/users.service');
const orders = require('../services/orders.service');
const stock = require('../services/stock.service');
const reports = require('../services/reports.service');
const ticket = require('../services/ticket.service');
const schemas = require('../config/schemas');
const toCsv = require('../utils/csv');
const { hasValidMagic } = require('../config/upload');
const { parse } = require('../utils/validate');
const { wrap, HttpError } = require('../utils/http');

const U = (req) => req.session.user;
const est = (req) => U(req).establishmentId;
const id = (req) => Number(req.params.id);

exports.settings = {
  get: wrap(async (req, res) => res.json(await settings.get(est(req)))),
  update: wrap(async (req, res) => {
    await settings.update(est(req), parse(req.body, schemas.settings), settings.cleanHours(req.body.opening_hours));
    req.session.user.establishmentName = req.body.name;
    res.json({ ok: true });
  }),
};

exports.users = {
  list: wrap(async (req, res) => res.json(await users.list(est(req)))),
  create: wrap(async (req, res) => res.status(201).json({ id: await users.create(est(req), req.body) })),
  update: wrap(async (req, res) => { await users.update(est(req), U(req).id, id(req), req.body); res.json({ ok: true }); }),
  resetLink: wrap(async (req, res) => res.json({ path: `/reset.html?token=${await users.createResetToken(est(req), id(req))}` })),
};

exports.orders = {
  list: wrap(async (req, res) => {
    const f = { ...req.query };
    if (U(req).role === 'cozinha') { f.status = 'confirmado,preparo'; f.from = f.to = f.q = undefined; }
    res.json(await orders.list(est(req), f));
  }),
  get: wrap(async (req, res) => {
    const o = await orders.get(est(req), id(req));
    if (U(req).role === 'cozinha' && !['confirmado', 'preparo'].includes(o.status)) throw new HttpError(403, 'Sem permissão.');
    res.json(o);
  }),
  counts: wrap(async (req, res) => res.json(await orders.counts(est(req)))),
  status: wrap(async (req, res) => { await orders.setStatus(est(req), id(req), req.body.status, U(req).role); res.json({ ok: true }); }),
  ticket: wrap(async (req, res) => res.json(ticket.build(await orders.get(est(req), id(req)), U(req).establishmentName))),
};

exports.stock = {
  list: wrap(async (req, res) => res.json(await stock.list(est(req)))),
  adjust: wrap(async (req, res) => { await stock.adjust(est(req), req.body); res.json({ ok: true }); }),
  movements: wrap(async (req, res) => res.json(await stock.movements(est(req)))),
};

exports.reports = {
  summary: wrap(async (req, res) => res.json(await reports.summary(est(req), req.query))),
  csv: wrap(async (req, res) => {
    const r = await reports.exportRows(est(req), req.query);
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${r.name}.csv"` });
    res.send(toCsv(r.header, r.rows));
  }),
};

exports.upload = (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Envie uma imagem JPG, PNG ou WebP.' });
  if (!hasValidMagic(req.file)) { fs.unlink(req.file.path, () => {}); return res.status(400).json({ error: 'Arquivo de imagem inválido.' }); }
  res.status(201).json({ url: `/uploads/${req.file.filename}` });
};
