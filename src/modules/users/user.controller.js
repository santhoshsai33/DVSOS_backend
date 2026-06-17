const { apiResponse } = require('../../common/utils/apiResponse');
const userService = require('./user.service');

const createUser = async (req, res, next) => {
  try {
    const user = await userService.createUser(req.body, req.user.userId);

    return apiResponse(res, {
      statusCode: 201,
      message: 'User created successfully',
      data: { user }
    });
  } catch (error) {
    return next(error);
  }
};

const updateUser = async (req, res, next) => {
  try {
    const user = await userService.updateUser(req.params.id, req.body);

    return apiResponse(res, {
      message: 'User updated successfully',
      data: { user }
    });
  } catch (error) {
    return next(error);
  }
};

const listUsers = async (req, res, next) => {
  try {
    const { users, meta } = await userService.listUsers(req.query);

    return apiResponse(res, {
      message: 'Users fetched successfully',
      data: { users },
      meta
    });
  } catch (error) {
    return next(error);
  }
};

const getUserDetail = async (req, res, next) => {
  try {
    const user = await userService.getUserDetail(req.params.id);

    return apiResponse(res, {
      message: 'User fetched successfully',
      data: { user }
    });
  } catch (error) {
    return next(error);
  }
};

const updateUserStatus = async (req, res, next) => {
  try {
    const user = await userService.updateUserStatus(req.params.id, req.body);

    return apiResponse(res, {
      message: user.isActive ? 'User activated successfully' : 'User deactivated successfully',
      data: { user }
    });
  } catch (error) {
    return next(error);
  }
};

const resetUserPassword = async (req, res, next) => {
  try {
    const user = await userService.resetUserPassword(req.params.id, req.body);

    return apiResponse(res, {
      message: 'User password reset successfully',
      data: { user }
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  createUser,
  updateUser,
  listUsers,
  getUserDetail,
  updateUserStatus,
  resetUserPassword
};
