const router = require('express').Router();

const bayController = require('./bay.controller');
const {
  validateIdParam,
  validateBayPayload,
  validateStatusPayload
} = require('./bay.validation');
const { authenticate } = require('../../common/middleware/auth.middleware');
const { permissionMiddleware } = require('../../common/middleware/permission.middleware');

const canReadBays = permissionMiddleware('/md-bays', 'canRead');
const canCreateBays = permissionMiddleware('/md-bays', 'canCreate');
const canUpdateBays = permissionMiddleware('/md-bays', 'canUpdate');

router.use(authenticate);

router.get('/dropdown', canReadBays, bayController.getBayDropdown);
router.post('/create', canCreateBays, validateBayPayload, bayController.createBay);
router.put('/update/:id', canUpdateBays, validateIdParam, validateBayPayload, bayController.updateBay);
router.get('/list', canReadBays, bayController.listBays);
router.patch('/status/:id', canUpdateBays, validateIdParam, validateStatusPayload, bayController.updateBayStatus);

const crmRouter = require('express').Router();
crmRouter.use(authenticate);
crmRouter.get('/list', canReadBays, bayController.listBays);

module.exports = {
  bayRoutes: router,
  crmBayRoutes: crmRouter
};
