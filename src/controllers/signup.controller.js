const service = require('../services/signup.service');
const { wrap } = require('../utils/http');

exports.slug = wrap(async (req, res) => res.json(await service.slugAvailable(String(req.params.slug || '').toLowerCase())));

exports.create = wrap(async (req, res, next) => {
  const u = await service.createAccount(req.body || {});
  // Já entra logado: renova a sessão (evita fixação de sessão) e grava o usuário.
  req.session.regenerate((err) => {
    if (err) return next(err);
    req.session.user = { id: u.id, name: u.name, role: u.role, establishmentId: u.establishmentId, establishmentName: u.establishmentName };
    res.status(201).json({ ok: true, slug: u.slug });
  });
});
