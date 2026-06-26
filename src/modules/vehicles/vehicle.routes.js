const router = require('express').Router();
const vehicleController = require('./vehicle.controller');
const { authenticate } = require('../../common/middleware/auth.middleware');
const { roleMiddleware } = require('../../common/middleware/role.middleware');

const canViewVehicles = roleMiddleware(['admin', 'manager', 'managing_director', 'service_advisor', 'technician']);

router.use(authenticate);

router.get('/list', canViewVehicles, vehicleController.getVehicles);

module.exports = router;
