const { createValidation } = require('../common');

module.exports = createValidation([
  { name: 'serviceCenterId', type: 'int' },
  { name: 'stateId', type: 'int' },
  { name: 'districtId', type: 'int' },
  { name: 'locationName', type: 'string', maxLength: 100 },
  { name: 'locationType', type: 'string' },
  { name: 'address', type: 'string', required: false, maxLength: 255 }
]);
