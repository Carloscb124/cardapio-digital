const { wrap, HttpError } = require('../utils/http');
const { parse } = require('../utils/validate');

module.exports = (service, schema, check) => {
  const est = (req) => req.session.user.establishmentId;
  const body = (req) => { const d = parse(req.body, schema); if (check) check(d); return d; };
  const found = (n) => { if (!n) throw new HttpError(404, 'Registro não encontrado.'); };
  return {
    list: wrap(async (req, res) => res.json(await service.list(est(req)))),
    create: wrap(async (req, res) => res.status(201).json({ id: await service.create(est(req), body(req)) })),
    update: wrap(async (req, res) => { found(await service.update(est(req), Number(req.params.id), body(req))); res.json({ ok: true }); }),
    remove: wrap(async (req, res) => { found(await service.remove(est(req), Number(req.params.id))); res.json({ ok: true }); }),
  };
};
