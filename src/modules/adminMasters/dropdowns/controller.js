const { apiResponse } = require('../../../common/utils/apiResponse');
const service = require('./service');

const respond = (res, key, data) => {
  return apiResponse(res, {
    message: 'Success',
    data: { [key]: data }
  });
};

const states = async (req, res, next) => {
  try {
    return respond(res, 'states', await service.listStates());
  } catch (error) {
    return next(error);
  }
};

const districts = async (req, res, next) => {
  try {
    return respond(res, 'districts', await service.listDistricts(req.query));
  } catch (error) {
    return next(error);
  }
};

const serviceCategories = async (req, res, next) => {
  try {
    return respond(res, 'serviceCategories', await service.listServiceCategories());
  } catch (error) {
    return next(error);
  }
};

const serviceItems = async (req, res, next) => {
  try {
    return respond(res, 'serviceItems', await service.listServiceItems(req.query));
  } catch (error) {
    return next(error);
  }
};

const serviceCenters = async (req, res, next) => {
  try {
    return respond(res, 'serviceCenters', await service.listServiceCenters());
  } catch (error) {
    return next(error);
  }
};

const locations = async (req, res, next) => {
  try {
    return respond(res, 'locations', await service.listLocations(req.query));
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  states,
  districts,
  serviceCategories,
  serviceItems,
  serviceCenters,
  locations
};
