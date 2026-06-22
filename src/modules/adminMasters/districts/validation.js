const { createValidation } = require('../common');

module.exports = createValidation([
  { name: 'stateId', type: 'int' },
  { name: 'districtName', type: 'string' }
]);
