const router = require('express').Router();

const serviceItemController = require('./service-item.controller');
const {
  validateIdParam,
  validateIdentifierParam,
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
router.put('/update/:id', adminOnly, validateIdentifierParam, validateServiceItemPayload, serviceItemController.updateServiceItem);
router.get('/list', canViewServiceMasters, serviceItemController.listServiceItems);
router.get('/detail/:id', canViewServiceMasters, validateIdentifierParam, serviceItemController.getServiceItemDetail);
router.patch('/status/:id', adminOnly, validateIdParam, validateStatusPayload, serviceItemController.updateServiceItemStatus);

const crmOnly = roleMiddleware(['crm_team', 'crm-team']);

const crmRouter = require('express').Router();
crmRouter.use(authenticate);
crmRouter.get('/list', crmOnly, serviceItemController.listServiceItems);

module.exports = {
  serviceItemRoutes: router,
  crmServiceItemRoutes: crmRouter
};
