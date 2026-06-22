const router = require('express').Router();

const roleController = require('./role.controller');
const {
  validateIdParam,
  validateRolePayload,
  validateStatusPayload
} = require('./role.validation');
const { authenticate } = require('../../common/middleware/auth.middleware');
const { roleMiddleware } = require('../../common/middleware/role.middleware');

const adminOnly = roleMiddleware(['admin']);

router.use(authenticate);

router.post('/create', adminOnly, validateRolePayload, roleController.createRole);
router.put('/update/:id', adminOnly, validateIdParam, validateRolePayload, roleController.updateRole);
router.get('/list', adminOnly, roleController.listRoles);
router.get('/detail/:id', adminOnly, validateIdParam, roleController.getRoleDetail);
router.patch('/status/:id', adminOnly, validateIdParam, validateStatusPayload, roleController.updateRoleStatus);

module.exports = router;
