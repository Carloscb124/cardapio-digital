const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const ctrl = require('../controllers/public.controller');

const orderLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false, message: { error: 'Muitos pedidos em pouco tempo. Aguarde alguns minutos.' } });
const slug = (req, res, next) => (/^[a-z0-9-]{3,60}$/.test(req.params.slug) ? next() : res.status(404).json({ error: 'Estabelecimento não encontrado.' }));

const trackLimiter = rateLimit({ windowMs: 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false, message: { error: 'Muitas consultas. Aguarde um instante.' } });
const tokenOk = (req, res, next) => (/^[a-f0-9]{32}$/.test(req.params.token) ? next() : res.status(404).json({ error: 'Pedido não encontrado. Confira o link.' }));
router.get('/track/:token', trackLimiter, tokenOk, ctrl.track);
router.get('/track/:token/pix', trackLimiter, tokenOk, ctrl.trackPix);
router.get('/:slug/menu', slug, ctrl.menu);
router.post('/:slug/coupon', slug, orderLimiter, ctrl.coupon);
router.post('/:slug/orders', slug, orderLimiter, ctrl.order);
module.exports = router;
