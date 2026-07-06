const router = require('express').Router();

const controller = require('./mobileJobCard.controller');
const { uploadVehiclePhotos } = require('./mobileJobCard.upload');
const { normalizeCreateJobCardPayload, validateCreateJobCardPayload, validateIdParam } = require('./mobileJobCard.validation');
const { authMiddleware } = require('../../common/middleware/auth.middleware');
const { permissionMiddleware } = require('../../common/middleware/permission.middleware');

const canReadJobCards = permissionMiddleware('/job-cards', 'canRead');
const canCreateJobCards = permissionMiddleware('/job-cards', 'canCreate');

router.use(authMiddleware);

router.get('/list', canReadJobCards, controller.jobCardList);
router.get('/detail/:id', canReadJobCards, validateIdParam, controller.jobCardDetail);
router.get('/queue', canReadJobCards, controller.pendingQueue);
router.get('/queue/:id', canReadJobCards, validateIdParam, controller.queueDetail);
router.post( '/create-from-gate-entry', canCreateJobCards, uploadVehiclePhotos, normalizeCreateJobCardPayload, validateCreateJobCardPayload, controller.createFromGateEntry );
module.exports = router;
