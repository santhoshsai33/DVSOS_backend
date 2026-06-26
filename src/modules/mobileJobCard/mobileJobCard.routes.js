const router = require('express').Router();

const controller = require('./mobileJobCard.controller');
const { uploadVehiclePhotos } = require('./mobileJobCard.upload');
const { normalizeCreateJobCardPayload, validateCreateJobCardPayload, validateIdParam } = require('./mobileJobCard.validation');
const { authMiddleware } = require('../../common/middleware/auth.middleware');
const { roleMiddleware } = require('../../common/middleware/role.middleware');

const jobCardAccess = roleMiddleware(['crm_team', 'admin', 'super_admin', 'manager', 'managing_director']);

router.use(authMiddleware);

router.get('/list', jobCardAccess, controller.jobCardList);
router.get('/queue', jobCardAccess, controller.pendingQueue);
router.get('/queue/:id', jobCardAccess, validateIdParam, controller.queueDetail);
router.post( '/create-from-gate-entry', jobCardAccess, uploadVehiclePhotos, normalizeCreateJobCardPayload, validateCreateJobCardPayload, controller.createFromGateEntry );
module.exports = router;
