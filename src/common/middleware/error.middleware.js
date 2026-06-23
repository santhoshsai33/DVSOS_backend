const { apiResponse } = require('../utils/apiResponse');

const errorMiddleware = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;

  console.error(err);

  return apiResponse(res, {
    statusCode,
    success: false,
    message: err.message || 'Internal server error',
    data: err.data || {},
    meta: {}
  });
};

module.exports = errorMiddleware;
