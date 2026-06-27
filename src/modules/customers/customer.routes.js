const router = require('express').Router();

const customerController = require('./customer.controller');
const {
  validateIdParam,
  validateCustomerPayload,
  validateStatusPayload
} = require('./customer.validation');
const { authenticate } = require('../../common/middleware/auth.middleware');
const { roleMiddleware } = require('../../common/middleware/role.middleware');

const canViewCustomers = roleMiddleware(['admin', 'manager', 'managing_director', 'service_advisor', 'technician', 'crm_team', 'water_wash_team', 'water_wash']);
const canEditCustomers = roleMiddleware(['admin', 'manager', 'managing_director', 'service_advisor']);

router.use(authenticate);

router.get('/list', canViewCustomers, customerController.getCustomers);
router.get('/detail/:id', canViewCustomers, validateIdParam, customerController.getCustomer);
router.put('/update/:id', canEditCustomers, validateIdParam, validateCustomerPayload, customerController.updateCustomer);
router.patch('/status/:id', canEditCustomers, validateIdParam, validateStatusPayload, customerController.updateCustomerStatus);

module.exports = router;
