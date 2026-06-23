const router = require('express').Router();

const controller = require('./mobileGateEntry.controller');
const { validateCreateGateEntryPayload, validateIdParam, validateRegistrationQuery } = require('./mobileGateEntry.validation');
const { authMiddleware } = require('../../common/middleware/auth.middleware');
const { roleMiddleware } = require('../../common/middleware/role.middleware');

const gateAccess = roleMiddleware(['gate_security', 'admin']);
const crmAccess = roleMiddleware(['crm_team', 'admin', 'manager']);

router.use(authMiddleware);

router.get('/check-vehicle', gateAccess, validateRegistrationQuery, controller.checkVehicle);
router.get('/history', gateAccess, controller.history);
router.get('/active', gateAccess, validateRegistrationQuery, controller.activeByVehicle);
router.post('/', gateAccess, validateCreateGateEntryPayload, controller.createGateEntry);
router.patch('/:id/exit', gateAccess, validateIdParam, controller.submitExit);

const crmRouter = require('express').Router();
crmRouter.use(authMiddleware);
crmRouter.get('/pending', crmAccess, controller.pendingCrmEntries);

module.exports = {
  mobileGateEntryRoutes: router,
  crmGateEntryRoutes: crmRouter
};
