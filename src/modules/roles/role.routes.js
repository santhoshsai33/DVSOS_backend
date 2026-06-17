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
const adminOnly = roleMiddleware(['admin']);

router.use(authenticate);

router.post('/', adminOnly, validateRolePayload, roleController.createRole);
router.put('/:id', adminOnly, validateIdParam, validateRolePayload, roleController.updateRole);
router.get('/', canViewRoles, roleController.listRoles);
router.get('/:id', canViewRoles, validateIdParam, roleController.getRoleDetail);
router.patch('/:id/status', adminOnly, validateIdParam, validateStatusPayload, roleController.updateRoleStatus);

module.exports = router;
