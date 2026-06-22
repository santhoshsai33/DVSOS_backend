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

const canViewUsers = roleMiddleware(['admin', 'manager', 'managing_director']);
const adminOnly = roleMiddleware(['admin']);

router.use(authenticate);

router.post('/create', adminOnly, validateUserPayload({ requirePassword: true }), userController.createUser);
router.put('/update/:id', adminOnly, validateIdParam, validateUserPayload(), userController.updateUser);
router.get('/list', canViewUsers, userController.listUsers);
router.get('/detail/:id', canViewUsers, validateIdParam, userController.getUserDetail);
router.patch('/status/:id', adminOnly, validateIdParam, validateStatusPayload, userController.updateUserStatus);
router.patch('/reset-password/:id', adminOnly, validateIdParam, validatePasswordPayload, userController.resetUserPassword);

module.exports = router;
