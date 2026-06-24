const { createValidation } = require('../common');

<<<<<<< HEAD
const validation = createValidation([
  { name: 'stateName', type: 'string' }
=======
module.exports = createValidation([
  { name: 'stateName', type: 'string', maxLength: 100 }
>>>>>>> 1fd3428a5aa048971cd735ba5947b7e84e3389d6
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
