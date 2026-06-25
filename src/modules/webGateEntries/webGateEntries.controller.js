const { apiResponse } = require('../../common/utils/apiResponse');
const service = require('./webGateEntries.service');

const list = async (req, res, next) => {
  try {
    const data = await service.list(req.query, req.user);
    return apiResponse(res, {
      message: 'Gate entries fetched successfully',
      data: data.entries,
      meta: data.meta
    });
  } catch (error) {
    return next(error);
  }
};

const getBySlug = async (req, res, next) => {
  try {
    const data = await service.getBySlug(req.params.slug, req.user);
    return apiResponse(res, {
      message: 'Gate entry fetched successfully',
      data
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = { list, getBySlug };
