const dashboardRepository = require('./dashboard.repository');

const getAdminDashboard = () => {
  return dashboardRepository.getAdminDashboard({ recentUserLimit: 5 });
};

module.exports = {
  getAdminDashboard
};
