const s = require('../services/catalog.service');
const schemas = require('../config/schemas');
const { parse } = require('../utils/validate');
const { wrap, HttpError } = require('../utils/http');

const est = (req) => req.session.user.establishmentId;
const pid = (req) => Number(req.params.id);
const rowsOf = (v) => (Array.isArray(v) ? v : []);

exports.products = {
  list: wrap(async (req, res) => res.json(await s.listProducts(est(req)))),
  create: wrap(async (req, res) => res.status(201).json({ id: await s.saveProduct(est(req), null, parse(req.body, schemas.products), req.body.group_ids) })),
  update: wrap(async (req, res) => { await s.saveProduct(est(req), pid(req), parse(req.body, schemas.products), req.body.group_ids); res.json({ ok: true }); }),
};

exports.groups = {
  list: wrap(async (req, res) => res.json(await s.listGroups(est(req)))),
  save: (isNew) => wrap(async (req, res) => {
    const d = parse(req.body, schemas.option_groups);
    const rows = rowsOf(req.body.options).map((o) => ({ id: o.id, ...parse(o, schemas.options) }));
    if (rows.length > 40) throw new HttpError(400, 'Muitas opções no grupo.');
    const id = await s.saveGroup(est(req), isNew ? null : pid(req), d, rows);
    res.status(isNew ? 201 : 200).json({ id });
  }),
};

exports.combos = {
  list: wrap(async (req, res) => res.json(await s.listCombos(est(req)))),
  save: (isNew) => wrap(async (req, res) => {
    const id = await s.saveCombo(est(req), isNew ? null : pid(req), parse(req.body, schemas.combos), rowsOf(req.body.items));
    res.status(isNew ? 201 : 200).json({ id });
  }),
};
