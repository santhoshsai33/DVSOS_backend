const router = require('express').Router();
const jobCardController = require('./jobCard.controller');
const { authenticate } = require('../../common/middleware/auth.middleware');
const { roleMiddleware } = require('../../common/middleware/role.middleware');

const canViewJobCards = roleMiddleware(['admin', 'manager', 'managing_director', 'service_advisor', 'technician', 'mechanical', 'mechanic', 'crm_team', 'floor_supervisor', 'body_shop_supervisor', 'water_wash_team', 'water_wash', 'gatekeeper', 'gate_security']);

router.use(authenticate);

router.get('/list', canViewJobCards, jobCardController.getJobCards);
router.get('/statuses/list', canViewJobCards, jobCardController.getJobCardStatuses);
router.get('/service-statuses/list', canViewJobCards, jobCardController.getJobCardServiceStatuses);
router.get('/detail/:id', canViewJobCards, jobCardController.getJobCard);
router.put('/update/:id', canViewJobCards, jobCardController.updateJobCard);

module.exports = router;
