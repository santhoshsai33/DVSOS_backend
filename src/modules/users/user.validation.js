const { apiResponse } = require('../../common/utils/apiResponse');

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const mobileRegex = /^\+?[0-9]{10,15}$/;

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
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return sendValidationError(res, 'Valid user id is required');
  }

  return next();
};

const validateUserPayload = ({ requirePassword = false } = {}) => {
  return (req, res, next) => {
    const { fullName, email, mobile, roleId, password } = req.body || {};
    const parsedRoleId = Number(roleId);

    if (!isNonEmptyString(fullName)) {
      return sendValidationError(res, 'fullName is required');
    }

    if (!isNonEmptyString(email)) {
      return sendValidationError(res, 'email is required');
    }

    if (!emailRegex.test(email.trim())) {
      return sendValidationError(res, 'email must be valid');
    }

    if (mobile && !mobileRegex.test(String(mobile).trim())) {
      return sendValidationError(res, 'mobile must be valid');
    }

    if (!Number.isInteger(parsedRoleId) || parsedRoleId <= 0) {
      return sendValidationError(res, 'roleId is required');
    }

    if (requirePassword && !isNonEmptyString(password)) {
      return sendValidationError(res, 'password is required');
    }

    return next();
  };
};

const validatePasswordPayload = (req, res, next) => {
  const { password } = req.body || {};

  if (!isNonEmptyString(password)) {
    return sendValidationError(res, 'password is required');
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
  validateUserPayload,
  validatePasswordPayload,
  validateStatusPayload
};
