const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const ctrl = require('../controllers/signup.controller');

const limit = (windowMs, max, msg) => rateLimit({ windowMs, max, standardHeaders: true, legacyHeaders: false, message: { error: msg } });
const createLimiter = limit(60 * 60 * 1000, Number(process.env.SIGNUP_RATE_LIMIT) || 10, 'Muitas tentativas de cadastro. Tente novamente em 1 hora.');
const checkLimiter = limit(60 * 1000, 60, 'Muitas verificações. Aguarde um instante.');

router.get('/slug/:slug', checkLimiter, ctrl.slug);
router.post('/', createLimiter, ctrl.create);
module.exports = router;
