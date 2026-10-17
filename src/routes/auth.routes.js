const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const ctrl = require('../controllers/auth.controller');
const { requireAuth } = require('../middleware/auth');
const users = require('../services/users.service');
const { wrap } = require('../utils/http');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Muitas tentativas. Aguarde 15 minutos.' },
});

router.post('/login', loginLimiter, ctrl.login);
router.post('/logout', ctrl.logout);
router.post('/reset', loginLimiter, wrap(async (req, res) => { await users.resetPassword(req.body.token, req.body.password); res.json({ ok: true }); }));
router.get('/me', requireAuth, ctrl.me);

module.exports = router;
