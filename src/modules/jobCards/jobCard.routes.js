const router = require('express').Router();
const jobCardController = require('./jobCard.controller');
const { authenticate } = require('../../common/middleware/auth.middleware');
const { roleMiddleware } = require('../../common/middleware/role.middleware');

const canViewJobCards = roleMiddleware(['admin', 'manager', 'managing_director', 'service_advisor', 'technician', 'crm_team', 'floor_supervisor', 'body_shop_supervisor', 'water_wash_team']);

router.use(authenticate);

router.get('/list', canViewJobCards, jobCardController.getJobCards);
router.get('/detail/:id', canViewJobCards, jobCardController.getJobCard);

module.exports = router;
