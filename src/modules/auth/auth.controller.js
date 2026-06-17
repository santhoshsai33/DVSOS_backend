const { apiResponse } = require('../../common/utils/apiResponse');
const authService = require('./auth.service');

const login = async (req, res, next) => {
  try {
    const data = await authService.login(req.body);

    return apiResponse(res, {
      message: 'Login successful',
      data
    });
  } catch (error) {
    return next(error);
  }
};

const me = async (req, res, next) => {
  try {
    const user = await authService.getCurrentUser(req.user.userId);

    return apiResponse(res, {
      message: 'Current user fetched successfully',
      data: {
        user
      }
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  login,
  me
};
