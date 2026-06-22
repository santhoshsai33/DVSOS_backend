const router = require('express').Router();

const serviceItemController = require('./service-item.controller');
const {
  validateIdParam,
  validateServiceItemPayload,
  validateStatusPayload
} = require('./service-item.validation');
const { authenticate } = require('../../common/middleware/auth.middleware');
const { roleMiddleware } = require('../../common/middleware/role.middleware');

const canViewServiceMasters = roleMiddleware([
  'admin',
  'crm_team',
  'crm-team',
  'manager',
  'managing_director',
  'managing-director'
]);
const adminOnly = roleMiddleware(['admin']);

router.use(authenticate);

router.post('/create', adminOnly, validateServiceItemPayload, serviceItemController.createServiceItem);
router.put('/update/:id', adminOnly, validateIdParam, validateServiceItemPayload, serviceItemController.updateServiceItem);
router.get('/list', canViewServiceMasters, serviceItemController.listServiceItems);
router.get('/detail/:id', canViewServiceMasters, validateIdParam, serviceItemController.getServiceItemDetail);
router.patch('/status/:id', adminOnly, validateIdParam, validateStatusPayload, serviceItemController.updateServiceItemStatus);

module.exports = router;
