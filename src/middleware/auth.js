const crypto = require('crypto');

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' });
  next();
}

const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.session.user.role) ? next() : res.status(403).json({ error: 'Sem permissão para esta ação.' });

// Token CSRF guardado na sessão; exigido no header x-csrf-token em POST/PUT/PATCH/DELETE.
function issueCsrf(req, res) {
  if (!req.session.csrf) req.session.csrf = crypto.randomBytes(24).toString('hex');
  res.json({ token: req.session.csrf });
}

function verifyCsrf(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const sent = Buffer.from(String(req.get('x-csrf-token') || ''));
  const real = Buffer.from(String(req.session.csrf || ''));
  if (!real.length || sent.length !== real.length || !crypto.timingSafeEqual(sent, real)) {
    return res.status(403).json({ error: 'Requisição inválida (CSRF). Recarregue a página.' });
  }
  next();
}

module.exports = { requireAuth, requireRole, issueCsrf, verifyCsrf };
