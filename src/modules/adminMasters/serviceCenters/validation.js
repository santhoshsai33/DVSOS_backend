const { createValidation } = require('../common');

module.exports = createValidation([
  { name: 'serviceCenterName', type: 'string', maxLength: 100 }
]);
