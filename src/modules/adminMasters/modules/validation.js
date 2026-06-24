const { createValidation } = require('../common');

module.exports = createValidation([
  { name: 'moduleName', type: 'string', maxLength: 100 },
  { name: 'description', type: 'string', required: false, maxLength: 500 }
]);
