const svc = require('../services/customer.service');
const { wrap } = require('../utils/http');

const est = (req) => svc.estBySlug(req.params.slug);
const me = (req) => req.session.customer;

// Abre a sessão do cliente sem derrubar uma eventual sessão de equipe no mesmo navegador.
function start(req, res, next, acc, extra = {}) {
  const staff = req.session.user;
  req.session.regenerate((err) => {
    if (err) return next(err);
    if (staff) req.session.user = staff;
    req.session.customer = { id: acc.id, name: acc.name, phone: acc.phone };
    res.json({ ok: true, name: acc.name, ...extra });
  });
}

exports.requireCustomer = (req, res, next) => (me(req) ? next() : res.status(401).json({ error: 'Entre na sua conta para continuar.' }));
exports.register = wrap(async (req, res, next) => { await est(req); const a = await svc.register(req.body || {}); start(req, res, next, a, { recoveryCode: a.recoveryCode }); });
exports.login = wrap(async (req, res, next) => { await est(req); start(req, res, next, await svc.login(req.body.phone, req.body.password)); });
exports.logout = (req, res) => { delete req.session.customer; res.json({ ok: true }); };
exports.recover = wrap(async (req, res) => { const b = req.body || {}; res.json({ ok: true, recoveryCode: await svc.recover(b.phone, b.code, b.password, b.confirm) }); });
exports.newRecoveryCode = wrap(async (req, res) => res.json({ recoveryCode: await svc.rotateRecovery(me(req).id, (req.body || {}).current) }));
exports.me = wrap(async (req, res) => res.json(await svc.me(me(req).id)));
exports.orders = wrap(async (req, res) => res.json(await svc.history(me(req).id)));
exports.reorder = wrap(async (req, res) => res.json(await svc.reorder(await est(req), me(req).id, Number(req.params.orderId))));
exports.addAddress = wrap(async (req, res) => res.status(201).json({ id: await svc.addAddress(me(req).id, req.body || {}) }));
exports.removeAddress = wrap(async (req, res) => { await svc.removeAddress(me(req).id, Number(req.params.addrId)); res.json({ ok: true }); });
exports.password = wrap(async (req, res) => { await svc.changePassword(me(req).id, req.body.current, req.body.password, req.body.confirm); res.json({ ok: true }); });
exports.adminList = wrap(async (req, res) => res.json(await svc.adminList(req.session.user.establishmentId, req.query.q)));
exports.adminCreate = wrap(async (req, res) => res.status(201).json({ id: await svc.adminCreate(req.session.user.establishmentId, req.body || {}) }));
exports.adminUpdate = wrap(async (req, res) => { await svc.adminUpdate(req.session.user.establishmentId, Number(req.params.id), req.body || {}); res.json({ ok: true }); });
exports.adminRemove = wrap(async (req, res) => { await svc.adminRemove(req.session.user.establishmentId, Number(req.params.id)); res.json({ ok: true }); });
