const router = require('express').Router();

const controller = require('./controller');
const { validateOptionalPositiveInt } = require('./validation');
const { authMiddleware } = require('../../../common/middleware/auth.middleware');
const { roleMiddleware } = require('../../../common/middleware/role.middleware');
const { permissionMiddleware } = require('../../../common/middleware/permission.middleware');

const adminOnly = roleMiddleware(['admin', 'super_admin']);
const canRead = permissionMiddleware({ menuPath: '/admin-dashboard', action: 'canRead' });

router.use(authMiddleware);
router.use(adminOnly);
router.use(canRead);

router.get('/states', controller.states);
router.get('/districts', validateOptionalPositiveInt('stateId'), controller.districts);
router.get('/service-categories', controller.serviceCategories);
router.get('/service-items', validateOptionalPositiveInt('categoryId'), controller.serviceItems);
router.get('/service-centers', controller.serviceCenters);
router.get('/locations', validateOptionalPositiveInt('serviceCenterId'), controller.locations);

module.exports = router;
