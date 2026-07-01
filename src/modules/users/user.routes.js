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
const canViewMechanicDropdown = roleMiddleware(['admin', 'manager', 'managing_director', 'mechanical', 'mechanic', 'floor_supervisor', 'body_shop_supervisor', 'water_wash_team', 'water_wash']);
const adminOrMd = roleMiddleware(['admin', 'managing_director']);
const adminOnly = roleMiddleware(['admin']);

router.use(authenticate);

router.post('/create', adminOrMd, validateUserPayload(), userController.createUser);
router.put('/update/:id', adminOrMd, validateIdParam, validateUserPayload(), userController.updateUser);
router.get('/mechanics/dropdown', canViewMechanicDropdown, userController.listMechanicDropdown);
router.get('/list', canViewUsers, userController.listUsers);
router.get('/detail/:id', canViewUsers, validateIdParam, userController.getUserDetail);
router.patch('/status/:id', adminOrMd, validateIdParam, validateStatusPayload, userController.updateUserStatus);
router.patch('/reset-password/:id', adminOrMd, validateIdParam, validatePasswordPayload, userController.resetUserPassword);

module.exports = router;
