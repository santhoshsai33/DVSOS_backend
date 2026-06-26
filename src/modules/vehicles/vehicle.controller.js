const vehicleService = require('./vehicle.service');
const { apiResponse } = require('../../common/utils/apiResponse');

const getVehicles = async (req, res, next) => {
  try {
    const result = await vehicleService.listVehicles(req.query, req.user);

    return apiResponse(res, {
      statusCode: 200,
      success: true,
      message: 'Vehicles retrieved successfully',
      data: result.vehicles,
      meta: result.meta
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getVehicles
};
