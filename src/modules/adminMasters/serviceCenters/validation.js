const { createValidation } = require('../common');

module.exports = createValidation([
  { name: 'serviceCenterCode', type: 'string' },
  { name: 'serviceCenterName', type: 'string' }
]);
