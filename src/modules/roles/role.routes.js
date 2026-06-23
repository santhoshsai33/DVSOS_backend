const router = require('express').Router();

const roleController = require('./role.controller');
const {
  validateIdParam,
  validateRolePayload,
  validateStatusPayload
} = require('./role.validation');
const { authenticate } = require('../../common/middleware/auth.middleware');
const { roleMiddleware } = require('../../common/middleware/role.middleware');

const canViewRoles = roleMiddleware(['admin', 'manager', 'managing_director']);
const adminOrMd = roleMiddleware(['admin', 'managing_director']);
const adminOnly = roleMiddleware(['admin']);

router.use(authenticate);

router.post('/create', adminOrMd, validateRolePayload, roleController.createRole);
router.put('/update/:id', adminOrMd, validateIdParam, validateRolePayload, roleController.updateRole);
router.get('/list', canViewRoles, roleController.listRoles);
router.get('/detail/:id', canViewRoles, validateIdParam, roleController.getRoleDetail);
router.patch('/status/:id', adminOrMd, validateIdParam, validateStatusPayload, roleController.updateRoleStatus);

module.exports = router;
