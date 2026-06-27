const router = require('express').Router();
const vehicleController = require('./vehicle.controller');
const { authenticate } = require('../../common/middleware/auth.middleware');
const { roleMiddleware } = require('../../common/middleware/role.middleware');

const canViewVehicles = roleMiddleware([
  'admin', 
  'manager', 
  'managing_director', 
  'service_advisor', 
  'technician',
  'crm_team',
  'floor_supervisor',
  'body_shop_supervisor',
  'water_wash_team',
  'water_wash',
  'gate_security',
  'gatekeeper'
]);

router.use(authenticate);

router.get('/list', canViewVehicles, vehicleController.getVehicles);
router.get('/detail/:id', canViewVehicles, vehicleController.getVehicle);

module.exports = router;
