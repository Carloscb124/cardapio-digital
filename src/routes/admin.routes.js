const router = require('express').Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const schemas = require('../config/schemas');
const makeService = require('../services/crud.service');
const makeController = require('../controllers/crud.controller');
const catalog = require('../controllers/catalog.controller');
const admin = require('../controllers/admin.controller');
const customers = require('../controllers/customer.controller');
const { upload } = require('../config/upload');
const { HttpError } = require('../utils/http');

router.use(requireAuth);
router.param('id', (req, res, next, v) => (/^\d+$/.test(v) ? next() : res.status(404).json({ error: 'Registro não encontrado.' })));
const adminOnly = requireRole('admin');
const staff = requireRole('admin', 'atendente');

function resource(path, table, order, check) {
  const c = makeController(makeService({ table, schema: schemas[table], order }), schemas[table], check);
  router.get(path, adminOnly, c.list); router.post(path, adminOnly, c.create);
  router.put(`${path}/:id`, adminOnly, c.update); router.delete(`${path}/:id`, adminOnly, c.remove);
  return c;
}
resource('/categories', 'categories', 'sort_order, name');
resource('/delivery-zones', 'delivery_zones', 'neighborhood');
const couponCheck = (d) => { if (d.type === 'percent' && d.value > 100) throw new HttpError(400, 'O desconto percentual não pode passar de 100%.'); };
resource('/coupons', 'coupons', 'id DESC', couponCheck);

const del = (table) => makeController(makeService({ table, schema: schemas[table] }), schemas[table]).remove;
router.get('/products', adminOnly, catalog.products.list);
router.post('/products', adminOnly, catalog.products.create);
router.put('/products/:id', adminOnly, catalog.products.update);
router.delete('/products/:id', adminOnly, del('products'));
router.get('/option-groups', adminOnly, catalog.groups.list);
router.post('/option-groups', adminOnly, catalog.groups.save(true));
router.put('/option-groups/:id', adminOnly, catalog.groups.save(false));
router.delete('/option-groups/:id', adminOnly, del('option_groups'));
router.get('/combos', adminOnly, catalog.combos.list);
router.post('/combos', adminOnly, catalog.combos.save(true));
router.put('/combos/:id', adminOnly, catalog.combos.save(false));
router.delete('/combos/:id', adminOnly, del('combos'));

router.get('/pix', adminOnly, admin.pix.get);
router.put('/pix', adminOnly, admin.pix.save);

router.get('/settings', adminOnly, admin.settings.get);
router.put('/settings', adminOnly, admin.settings.update);
router.post('/uploads', adminOnly, upload.single('image'), admin.upload);

router.get('/users', adminOnly, admin.users.list);
router.post('/users', adminOnly, admin.users.create);
router.put('/users/:id', adminOnly, admin.users.update);
router.post('/users/:id/reset-link', adminOnly, admin.users.resetLink);

router.get('/orders', admin.orders.list);
router.get('/orders/counts', admin.orders.counts);
router.get('/orders/menu', staff, admin.orders.menu);
router.post('/orders/coupon-preview', staff, admin.orders.couponPreview);
router.post('/orders', staff, admin.orders.create);
router.get('/orders/:id', admin.orders.get);
router.get('/orders/:id/ticket', staff, admin.orders.ticket);
router.post('/orders/:id/status', admin.orders.status);

router.get('/customers', staff, customers.adminList);
router.post('/customers', staff, customers.adminCreate);
router.put('/customers/:id', staff, customers.adminUpdate);
router.delete('/customers/:id', adminOnly, customers.adminRemove);
router.post('/customers/:id/reset-link', adminOnly, customers.adminReset);

router.get('/stock', adminOnly, admin.stock.list);
router.post('/stock/adjust', adminOnly, admin.stock.adjust);
router.get('/stock/movements', adminOnly, admin.stock.movements);

router.get('/reports', adminOnly, admin.reports.summary);
router.get('/reports/export', adminOnly, admin.reports.csv);

module.exports = router;
