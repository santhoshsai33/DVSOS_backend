const { createValidation } = require('../common');

module.exports = createValidation([
  { name: 'stateName', type: 'string' },
  { name: 'stateCode', type: 'string' }
]);
