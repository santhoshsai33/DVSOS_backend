const router = require('express').Router();

const dashboardController = require('./dashboard.controller');
const { authenticate } = require('../../common/middleware/auth.middleware');
const { roleMiddleware } = require('../../common/middleware/role.middleware');

const adminOnly = roleMiddleware(['admin', 'super_admin']);
const mdOnly = roleMiddleware(['md', 'super_admin', 'admin']);
const floorSupervisorOnly = roleMiddleware(['floor_supervisor', 'super_admin', 'admin']);
const managerOnly = roleMiddleware(['manager', 'super_admin', 'admin', 'md']);

const bodyShopSupervisorOnly = roleMiddleware(['body_shop_supervisor', 'super_admin', 'admin', 'manager', 'md']);

const waterWashSupervisorOnly = roleMiddleware(['water_wash_supervisor', 'super_admin', 'admin', 'manager', 'md']);

router.use(authenticate);

router.get('/admin', adminOnly, dashboardController.getAdminDashboard);
router.get('/md', mdOnly, dashboardController.getMdDashboard);
router.get('/supervisor', floorSupervisorOnly, dashboardController.getFloorSupervisorDashboard);
router.get('/manager', managerOnly, dashboardController.getManagerDashboard);
router.get('/body-shop', bodyShopSupervisorOnly, dashboardController.getBodyShopDashboard);
router.get('/water-wash', waterWashSupervisorOnly, dashboardController.getWaterWashDashboard);

module.exports = router;
