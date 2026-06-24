const { createValidation } = require('../common');

module.exports = createValidation([
  { name: 'moduleName', type: 'string', maxLength: 100 },
  { name: 'description', type: 'string', required: false, maxLength: 500 }
]);

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

validation.validateIdentifierParam = (req, res, next) => {
  const identifier = String(req.params.id || '').trim();
  const numericIdentifier = Number(identifier);
  const isValidId = Number.isInteger(numericIdentifier) && numericIdentifier > 0;
  const isValidSlug = slugRegex.test(identifier);

  if (!isValidId && !isValidSlug) {
    return validation.validateIdParam(req, res, next);
  }

  return next();
};

module.exports = validation;
