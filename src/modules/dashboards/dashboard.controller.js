const { apiResponse } = require('../../common/utils/apiResponse');
const dashboardService = require('./dashboard.service');

const getAdminDashboard = async (req, res, next) => {
  try {
    const dashboard = await dashboardService.getAdminDashboard();

    return apiResponse(res, {
      message: 'Admin dashboard fetched successfully',
      data: dashboard
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getAdminDashboard
};
