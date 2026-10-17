const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const ctrl = require('../controllers/public.controller');

const orderLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false, message: { error: 'Muitos pedidos em pouco tempo. Aguarde alguns minutos.' } });
const slug = (req, res, next) => (/^[a-z0-9-]{3,60}$/.test(req.params.slug) ? next() : res.status(404).json({ error: 'Estabelecimento não encontrado.' }));

router.get('/:slug/menu', slug, ctrl.menu);
router.post('/:slug/coupon', slug, orderLimiter, ctrl.coupon);
router.post('/:slug/orders', slug, orderLimiter, ctrl.order);
module.exports = router;
