const { apiResponse } = require('../../common/utils/apiResponse');

const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;

const validateLogin = (req, res, next) => {
  const { identifier, password } = req.body || {};

  if (!isNonEmptyString(identifier)) {
    return apiResponse(res, {
      statusCode: 400,
      success: false,
      message: 'identifier is required',
      data: {},
      meta: {}
    });
  }

  if (!isNonEmptyString(password)) {
    return apiResponse(res, {
      statusCode: 400,
      success: false,
      message: 'password is required',
      data: {},
      meta: {}
    });
  }

  return next();
};

module.exports = {
  validateLogin
};
