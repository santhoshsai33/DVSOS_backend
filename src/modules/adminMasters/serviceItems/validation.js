const { createValidation } = require('../common');

module.exports = createValidation([
  { name: 'categoryId', type: 'int' },
  { name: 'name', type: 'string' },
  { name: 'defaultPrice', type: 'decimal' }
]);
