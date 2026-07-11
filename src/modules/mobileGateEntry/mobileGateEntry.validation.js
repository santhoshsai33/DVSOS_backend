const { apiResponse } = require('../../common/utils/apiResponse');

const allowedEntryTypes = ['service', 'pickup', 'enquiry'];
const indianMobileRegex = /^[6-9][0-9]{9}$/;

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
    return sendValidationError(res, 'Valid gate entry id is required');
  }

  return next();
};

const validateRegistrationQuery = (req, res, next) => {
  if (!isNonEmptyString(req.query.registrationNumber)) {
    return sendValidationError(res, 'registrationNumber is required');
  }

  return next();
};

const validateCreateGateEntryPayload = (req, res, next) => {
  const { registrationNumber, entryType, whatsappNumber, remarks } = req.body || {};

  if (!isNonEmptyString(registrationNumber)) {
    return sendValidationError(res, 'registrationNumber is required');
  }

  if (!isNonEmptyString(entryType)) {
    return sendValidationError(res, 'entryType is required');
  }

  if (!allowedEntryTypes.includes(String(entryType).trim().toLowerCase())) {
    return sendValidationError(res, 'entryType must be service, pickup, or enquiry');
  }

  if (whatsappNumber !== undefined && whatsappNumber !== null && whatsappNumber !== '') {
    const mobile = String(whatsappNumber).trim();
    if (!indianMobileRegex.test(mobile)) {
      return sendValidationError(res, 'whatsappNumber must be a valid 10 digit India mobile number');
    }
  }

  if (remarks !== undefined && remarks !== null) {
    if (typeof remarks === 'string' && remarks.length > 200) {
      return sendValidationError(res, 'remarks must not exceed 200 characters');
    }
  }

  return next();
};

module.exports = {
  allowedEntryTypes,
  indianMobileRegex,
  validateIdParam,
  validateRegistrationQuery,
  validateCreateGateEntryPayload
};
