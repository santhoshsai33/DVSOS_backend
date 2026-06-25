const { apiResponse } = require('../../common/utils/apiResponse');

const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;

const sendValidationError = (res, message) => {
  return apiResponse(res, {
    statusCode: 400,
    success: false,
    message,
    data: {},
    meta: {}
  });
};

const validateIdParam = (req, res, next) => {
  const identifier = String(req.params.id || '').trim();

  if (!identifier) {
    return sendValidationError(res, 'Valid customer identifier is required');
  }

  const id = Number(identifier);
  if (!Number.isNaN(id)) {
    if (!Number.isInteger(id) || id <= 0) {
      return sendValidationError(res, 'Valid customer identifier is required');
    }
  }

  return next();
};

const validateCustomerPayload = (req, res, next) => {
  const { fullName, mobileNo, emailId } = req.body || {};

  if (!isNonEmptyString(fullName)) {
    return sendValidationError(res, 'fullName is required');
  }

  if (!isNonEmptyString(mobileNo)) {
    return sendValidationError(res, 'mobileNo is required');
  }

  return next();
};

const validateStatusPayload = (req, res, next) => {
  if (typeof (req.body || {}).isActive !== 'boolean') {
    return sendValidationError(res, 'isActive boolean is required');
  }

  return next();
};

module.exports = {
  validateIdParam,
  validateCustomerPayload,
  validateStatusPayload
};
