const router = require('express').Router();

const userController = require('./user.controller');
const {
  validateIdParam,
  validateUserPayload,
  validatePasswordPayload,
  validateStatusPayload
} = require('./user.validation');
const { authenticate } = require('../../common/middleware/auth.middleware');
const { roleMiddleware } = require('../../common/middleware/role.middleware');

const canManageUsers = roleMiddleware(['admin', 'super_admin', 'managing_director']);
const canViewUsers = roleMiddleware(['admin', 'super_admin', 'manager', 'managing_director']);
const adminOnly = roleMiddleware(['admin', 'super_admin']);

router.use(authenticate);

router.post('/create', canManageUsers, validateUserPayload(), userController.createUser);
router.put('/update/:id', canManageUsers, validateIdParam, validateUserPayload(), userController.updateUser);
router.get('/list', canViewUsers, userController.listUsers);
router.get('/detail/:id', canViewUsers, validateIdParam, userController.getUserDetail);
router.patch('/status/:id', canManageUsers, validateIdParam, validateStatusPayload, userController.updateUserStatus);
router.patch('/reset-password/:id', adminOnly, validateIdParam, validatePasswordPayload, userController.resetUserPassword);

module.exports = router;
