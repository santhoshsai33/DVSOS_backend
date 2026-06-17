const { apiResponse } = require('../../common/utils/apiResponse');

const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;

const isValidNonNegativeNumber = (value) => {
  if (value === undefined || value === null || value === '') {
    return true;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0;
};

const isValidNonNegativeInteger = (value) => {
  if (value === undefined || value === null || value === '') {
    return true;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0;
};

const validateIdParam = (req, res, next) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return apiResponse(res, {
      statusCode: 400,
      success: false,
      message: 'Valid service item id is required',
      data: {},
      meta: {}
    });
  }

  return next();
};

const validateServiceItemPayload = (req, res, next) => {
  const { categoryId, name, basePrice, estimatedMinutes } = req.body || {};
  const parsedCategoryId = Number(categoryId);

  if (!Number.isInteger(parsedCategoryId) || parsedCategoryId <= 0) {
    return apiResponse(res, {
      statusCode: 400,
      success: false,
      message: 'valid categoryId is required',
      data: {},
      meta: {}
    });
  }

  if (!isNonEmptyString(name)) {
    return apiResponse(res, {
      statusCode: 400,
      success: false,
      message: 'service item name is required',
      data: {},
      meta: {}
    });
  }

  if (!isValidNonNegativeNumber(basePrice)) {
    return apiResponse(res, {
      statusCode: 400,
      success: false,
      message: 'basePrice must be greater than or equal to 0',
      data: {},
      meta: {}
    });
  }

  if (!isValidNonNegativeInteger(estimatedMinutes)) {
    return apiResponse(res, {
      statusCode: 400,
      success: false,
      message: 'estimatedMinutes must be greater than or equal to 0',
      data: {},
      meta: {}
    });
  }

  return next();
};

const validateStatusPayload = (req, res, next) => {
  if (typeof (req.body || {}).isActive !== 'boolean') {
    return apiResponse(res, {
      statusCode: 400,
      success: false,
      message: 'isActive boolean is required',
      data: {},
      meta: {}
    });
  }

  return next();
};

module.exports = {
  validateIdParam,
  validateServiceItemPayload,
  validateStatusPayload
};
