const dashboardRepository = require('./dashboard.repository');

const getAdminDashboard = () => {
  return dashboardRepository.getAdminDashboard({ recentUserLimit: 5 });
};

const getMdDashboard = (timeframe, locationId) => {
  return dashboardRepository.getMdDashboard({ timeframe, locationId });
};

const getFloorSupervisorDashboard = (locationId) => {
  return dashboardRepository.getFloorSupervisorDashboard({ locationId });
};

const getManagerDashboard = (locationId) => {
  return dashboardRepository.getManagerDashboard({ locationId });
};

const getBodyShopDashboard = (locationId) => {
  return dashboardRepository.getBodyShopDashboard({ locationId });
};

const getWaterWashDashboard = (locationId) => {
  return dashboardRepository.getWaterWashDashboard({ locationId });
};

module.exports = {
  getAdminDashboard,
  getMdDashboard,
  getFloorSupervisorDashboard,
  getManagerDashboard,
  getBodyShopDashboard,
  getWaterWashDashboard
};
