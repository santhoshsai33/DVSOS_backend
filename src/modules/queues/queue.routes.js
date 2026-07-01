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
  'mechanical',
  'mechanic',
  'floor_supervisor',
  'body_shop_supervisor',
  'water_wash_team',
  'water_wash'
]);

const queueAssignAccess = roleMiddleware([
  'admin',
  'manager',
  'mechanical',
  'mechanic',
  'floor_supervisor',
  'body_shop_supervisor',
  'water_wash_team',
  'water_wash'
]);

router.use(authenticate);

router.get('/mechanical/list', queueViewAccess, controller.listMechanicalQueue);
router.get('/body-shop/list', queueViewAccess, controller.listBodyShopQueue);
router.get('/water-wash/list', queueViewAccess, controller.listWaterWashQueue);
router.post('/assign/:jobCardId', queueAssignAccess, validateJobCardIdParam, validateAssignPayload, controller.assignWork);
router.patch('/status/:assignmentId', queueAssignAccess, validateAssignmentIdParam, validateStatusPayload, controller.updateAssignmentStatus);

module.exports = router;
