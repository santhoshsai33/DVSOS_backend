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

const updateVehicle = async (req, res, next) => {
  try {
    const updatedVehicle = await vehicleService.updateVehicle(req.params.id, req.body, req.user);

    return apiResponse(res, {
      statusCode: 200,
      success: true,
      message: 'Vehicle updated successfully',
      data: updatedVehicle
    });
  } catch (error) {
    if (error.message === 'Vehicle not found' || error.message === 'Unauthorized to update this Vehicle') {
      return apiResponse(res, {
        statusCode: error.message === 'Vehicle not found' ? 404 : 403,
        success: false,
        message: error.message
      });
    }
    return next(error);
  }
};

const getVehicleHistory = async (req, res, next) => {
  try {
    const history = await vehicleService.getVehicleHistory(req.params.id, req.query, req.user);

    return apiResponse(res, {
      statusCode: 200,
      success: true,
      message: 'Vehicle history retrieved successfully',
      data: history
    });
  } catch (error) {
    if (error.message === 'Vehicle not found') {
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
  getVehicle,
  updateVehicle,
  getVehicleHistory
};
