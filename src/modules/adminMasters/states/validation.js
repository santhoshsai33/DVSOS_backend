const { createValidation } = require('../common');

module.exports = createValidation([
  { name: 'stateName', type: 'string', maxLength: 100 }
]);
