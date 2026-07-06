const router = require('express').Router();
const vehicleController = require('./vehicle.controller');
const { authenticate } = require('../../common/middleware/auth.middleware');
const { permissionMiddleware } = require('../../common/middleware/permission.middleware');

const canReadVehicles = permissionMiddleware('/vehicles', 'canRead');
const canUpdateVehicles = permissionMiddleware('/vehicles', 'canUpdate');

router.use(authenticate);

router.get('/list', canReadVehicles, vehicleController.getVehicles);
router.get('/detail/:id', canReadVehicles, vehicleController.getVehicle);
router.get('/history/:id', canReadVehicles, vehicleController.getVehicleHistory);
router.put('/update/:id', canUpdateVehicles, vehicleController.updateVehicle);

module.exports = router;
