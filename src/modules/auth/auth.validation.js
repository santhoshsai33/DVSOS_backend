const { apiResponse } = require('../../common/utils/apiResponse');

const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;

const validateLogin = (req, res, next) => {
  const { emailId, password } = req.body || {};

  if (!isNonEmptyString(emailId)) {
    return apiResponse(res, {
      statusCode: 400,
      success: false,
      message: 'emailId is required',
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

const validateUpdateProfile = (req, res, next) => {
  const { fullName, emailId, mobileNo } = req.body || {};

  if (!isNonEmptyString(fullName)) {
    return apiResponse(res, {
      statusCode: 400,
      success: false,
      message: 'fullName is required',
      data: {},
      meta: {}
    });
  }

  if (!isNonEmptyString(emailId)) {
    return apiResponse(res, {
      statusCode: 400,
      success: false,
      message: 'emailId is required',
      data: {},
      meta: {}
    });
  }

  if (!isNonEmptyString(mobileNo)) {
    return apiResponse(res, {
      statusCode: 400,
      success: false,
      message: 'mobileNo is required',
      data: {},
      meta: {}
    });
  }

  return next();
};

module.exports = {
  validateLogin,
  validateUpdateProfile
};
