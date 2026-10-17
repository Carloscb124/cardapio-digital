const s = require('../services/public.service');
const { wrap } = require('../utils/http');

exports.menu = wrap(async (req, res) => res.json(await s.getMenu(req.params.slug)));
exports.coupon = wrap(async (req, res) => res.json(await s.previewCoupon(req.params.slug, req.body.code, req.body.subtotal)));
exports.order = wrap(async (req, res) => res.status(201).json(await s.createOrder(req.params.slug, req.body)));
