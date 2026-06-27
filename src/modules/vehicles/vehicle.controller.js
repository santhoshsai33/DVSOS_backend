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

const getVehicle = async (req, res, next) => {
  try {
    const vehicle = await vehicleService.getVehicleById(req.params.id, req.user);

    return apiResponse(res, {
      statusCode: 200,
      success: true,
      message: 'Vehicle retrieved successfully',
      data: vehicle
    });
  } catch (error) {
    if (error.message === 'Vehicle not found' || error.message === 'Unauthorized to view this Vehicle') {
      return apiResponse(res, {
        statusCode: 404,
        success: false,
        message: error.message
      });
    }
    return next(error);
  }
};

module.exports = {
  getVehicles,
  getVehicle
};
