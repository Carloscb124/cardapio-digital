const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const c = require('../controllers/customer.controller');

const limit = (ms, max, msg) => rateLimit({ windowMs: ms, max, standardHeaders: true, legacyHeaders: false, message: { error: msg } });
const max = Number(process.env.CUSTOMER_RATE_LIMIT) || 10;
const authLimiter = limit(15 * 60 * 1000, max, 'Muitas tentativas. Aguarde 15 minutos.');
const regLimiter = limit(60 * 60 * 1000, max, 'Muitos cadastros em pouco tempo. Tente novamente mais tarde.');

router.param('slug', (req, res, next, v) => (/^[a-z0-9-]{3,60}$/.test(v) ? next() : res.status(404).json({ error: 'Estabelecimento não encontrado.' })));
router.param('orderId', (req, res, next, v) => (/^\d+$/.test(v) ? next() : res.status(404).json({ error: 'Pedido não encontrado.' })));
router.param('addrId', (req, res, next, v) => (/^\d+$/.test(v) ? next() : res.status(404).json({ error: 'Endereço não encontrado.' })));

router.post('/:slug/register', regLimiter, c.register);
router.post('/:slug/login', authLimiter, c.login);
router.post('/:slug/reset', authLimiter, c.reset);
router.post('/:slug/logout', c.logout);
router.get('/:slug/me', c.requireCustomer, c.me);
router.get('/:slug/orders', c.requireCustomer, c.orders);
router.post('/:slug/orders/:orderId/reorder', c.requireCustomer, c.reorder);
router.post('/:slug/addresses', c.requireCustomer, c.addAddress);
router.delete('/:slug/addresses/:addrId', c.requireCustomer, c.removeAddress);
router.post('/:slug/password', authLimiter, c.requireCustomer, c.password);
module.exports = router;
