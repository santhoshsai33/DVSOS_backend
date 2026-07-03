const router = require('express').Router({ mergeParams: true });
const controller = require('./additionalWork.controller');
const { roleMiddleware } = require('../../common/middleware/role.middleware');

const additionalWorkAccess = roleMiddleware([
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

router.get('/context', additionalWorkAccess, controller.getContext);
router.post('/request', additionalWorkAccess, controller.createRequest);

module.exports = router;
