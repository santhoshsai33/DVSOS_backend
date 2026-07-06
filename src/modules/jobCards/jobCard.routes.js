const router = require('express').Router();
const jobCardController = require('./jobCard.controller');
const additionalWorkRoutes = require('../additionalWork/additionalWork.routes');
const { authenticate } = require('../../common/middleware/auth.middleware');
const { permissionMiddleware } = require('../../common/middleware/permission.middleware');

const canReadJobCards = permissionMiddleware('/job-cards', 'canRead');
const canUpdateJobCards = permissionMiddleware('/job-cards', 'canUpdate');

router.use(authenticate);

router.get('/list', canReadJobCards, jobCardController.getJobCards);
router.get('/statuses/list', canReadJobCards, jobCardController.getJobCardStatuses);
router.get('/service-statuses/list', canReadJobCards, jobCardController.getJobCardServiceStatuses);
router.get('/detail/:id', canReadJobCards, jobCardController.getJobCard);
router.put('/update/:id', canUpdateJobCards, jobCardController.updateJobCard);
router.use('/:jobCardId/additional-work', additionalWorkRoutes);

module.exports = router;
