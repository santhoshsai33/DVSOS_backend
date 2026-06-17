const jwt = require('jsonwebtoken');

const env = require('../../config/env');
const { apiResponse } = require('../utils/apiResponse');

const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return apiResponse(res, {
      statusCode: 401,
      success: false,
      message: 'Authentication token is required',
      data: {},
      meta: {}
    });
  }

  try {
    const token = authHeader.split(' ')[1];

    const decoded = jwt.verify(token, env.jwtSecret);

    if (!decoded.userId || !decoded.roleId || !decoded.roleSlug || !decoded.email) {
      return apiResponse(res, {
        statusCode: 401,
        success: false,
        message: 'Invalid authentication token payload',
        data: {},
        meta: {}
      });
    }

    req.user = {
      userId: decoded.userId,
      roleId: decoded.roleId,
      roleSlug: decoded.roleSlug,
      email: decoded.email
    };

    return next();
  } catch (error) {
    return apiResponse(res, {
      statusCode: 401,
      success: false,
      message: 'Invalid or expired authentication token',
      data: {},
      meta: {}
    });
  }
};

module.exports = {
  authenticate
};
