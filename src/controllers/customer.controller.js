const svc = require('../services/customer.service');
const { wrap, HttpError } = require('../utils/http');

const est = (req) => svc.estBySlug(req.params.slug);

// Abre a sessão do cliente sem derrubar uma eventual sessão de equipe no mesmo navegador.
function start(req, res, next, acc, estId) {
  const staff = req.session.user;
  req.session.regenerate((err) => {
    if (err) return next(err);
    if (staff) req.session.user = staff;
    req.session.customer = { id: acc.id, name: acc.name, phone: acc.phone, establishmentId: estId, slug: req.params.slug };
    res.json({ ok: true, name: acc.name });
  });
}

exports.requireCustomer = (req, res, next) => {
  const c = req.session.customer;
  if (!c || c.slug !== req.params.slug) return res.status(401).json({ error: 'Entre na sua conta para continuar.' });
  next();
};
exports.register = wrap(async (req, res, next) => { const e = await est(req); start(req, res, next, await svc.register(e, req.body || {}), e); });
exports.login = wrap(async (req, res, next) => { const e = await est(req); start(req, res, next, await svc.login(e, req.body.phone, req.body.password), e); });
exports.logout = (req, res) => { delete req.session.customer; res.json({ ok: true }); };
exports.reset = wrap(async (req, res) => { await svc.resetPassword(await est(req), req.body.token, req.body.password); res.json({ ok: true }); });
exports.me = wrap(async (req, res) => res.json(await svc.me(req.session.customer.establishmentId, req.session.customer.id)));
exports.orders = wrap(async (req, res) => res.json(await svc.history(req.session.customer.establishmentId, req.session.customer.id)));
exports.reorder = wrap(async (req, res) => res.json(await svc.reorder(req.session.customer.establishmentId, req.session.customer.id, Number(req.params.orderId))));
exports.addAddress = wrap(async (req, res) => res.status(201).json({ id: await svc.addAddress(req.session.customer.id, req.body || {}) }));
exports.removeAddress = wrap(async (req, res) => { await svc.removeAddress(req.session.customer.id, Number(req.params.addrId)); res.json({ ok: true }); });
exports.password = wrap(async (req, res) => { await svc.changePassword(req.session.customer.id, req.body.current, req.body.password, req.body.confirm); res.json({ ok: true }); });
exports.adminList = wrap(async (req, res) => res.json(await svc.adminList(req.session.user.establishmentId)));
exports.adminReset = wrap(async (req, res) => {
  const estId = req.session.user.establishmentId;
  const token = await svc.createResetToken(estId, Number(req.params.id));
  const [[s]] = await require('../config/db').query('SELECT slug FROM establishments WHERE id=?', [estId]);
  res.json({ path: `/m/${s.slug}?reset=${token}` });
});
