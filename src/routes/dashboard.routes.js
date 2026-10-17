const router = require('express').Router();
const ctrl = require('../controllers/dashboard.controller');
const { requireAuth, requireRole } = require('../middleware/auth');

router.get('/', requireAuth, requireRole('admin', 'atendente'), ctrl.summary);

module.exports = router;
