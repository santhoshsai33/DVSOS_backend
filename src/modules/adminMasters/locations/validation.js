const { createValidation } = require('../common');

module.exports = createValidation([
  { name: 'serviceCenterId', type: 'int' },
  { name: 'stateId', type: 'int' },
  { name: 'districtId', type: 'int' },
  { name: 'locationName', type: 'string' },
  { name: 'locationType', type: 'string' }
]);
