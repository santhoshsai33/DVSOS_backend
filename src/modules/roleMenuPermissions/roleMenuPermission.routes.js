const router = require('express').Router({ mergeParams: true });

const roleMenuPermissionController = require('./roleMenuPermission.controller');
const {
  validateRoleIdParam,
  validateMenuIdParam,
  validatePermissionPayload
} = require('./roleMenuPermission.validation');
const { authenticate } = require('../../common/middleware/auth.middleware');
const { roleMiddleware } = require('../../common/middleware/role.middleware');

const adminOnly = roleMiddleware(['admin']);

router.use(authenticate);
router.use(adminOnly);
router.use(validateRoleIdParam);

router.post('/save', validatePermissionPayload, roleMenuPermissionController.saveRoleMenuPermissions);
router.get('/list', roleMenuPermissionController.getRoleMenuPermissions);
router.put('/update', validatePermissionPayload, roleMenuPermissionController.updateRoleMenuPermissions);
router.delete('/delete/:menuId', validateMenuIdParam, roleMenuPermissionController.deleteRoleMenuPermission);

module.exports = router;
