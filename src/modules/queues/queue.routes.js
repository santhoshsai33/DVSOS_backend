const router = require('express').Router();

const controller = require('./queue.controller');
const { authenticate } = require('../../common/middleware/auth.middleware');
const { roleMiddleware } = require('../../common/middleware/role.middleware');
const {
  validateAssignmentIdParam,
  validateAssignPayload,
  validateJobCardIdParam,
  validateStatusPayload
} = require('./queue.validation');

const queueViewAccess = roleMiddleware([
  'admin',
  'manager',
  'managing_director',
  'floor_supervisor',
  'body_shop_supervisor',
  'water_wash_team'
]);

const queueAssignAccess = roleMiddleware([
  'admin',
  'manager',
  'floor_supervisor',
  'body_shop_supervisor',
  'water_wash_team'
]);

router.use(authenticate);

router.get('/mechanical/list', queueViewAccess, controller.listMechanicalQueue);
router.get('/body-shop/list', queueViewAccess, controller.listBodyShopQueue);
router.get('/water-wash/list', queueViewAccess, controller.listWaterWashQueue);
router.post('/assign/:jobCardId', queueAssignAccess, validateJobCardIdParam, validateAssignPayload, controller.assignWork);
router.patch('/status/:assignmentId', queueAssignAccess, validateAssignmentIdParam, validateStatusPayload, controller.updateAssignmentStatus);

module.exports = router;
