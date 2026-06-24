const router = require('express').Router();

const dashboardController = require('./dashboard.controller');
const { authenticate } = require('../../common/middleware/auth.middleware');
const { roleMiddleware } = require('../../common/middleware/role.middleware');

const adminOnly = roleMiddleware(['admin', 'super_admin']);

router.use(authenticate);

router.get('/admin', adminOnly, dashboardController.getAdminDashboard);

module.exports = router;
