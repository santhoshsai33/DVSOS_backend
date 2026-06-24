const { createValidation } = require('../common');

module.exports = createValidation([
  { name: 'moduleName', type: 'string' },
  { name: 'description', type: 'string', required: false }
]);
