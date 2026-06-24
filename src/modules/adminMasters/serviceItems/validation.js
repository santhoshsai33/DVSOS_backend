const { createValidation } = require('../common');

module.exports = createValidation([
  { name: 'categoryId', type: 'int' },
  { name: 'name', type: 'string', maxLength: 100 },
  { name: 'defaultPrice', type: 'decimal' }
]);
