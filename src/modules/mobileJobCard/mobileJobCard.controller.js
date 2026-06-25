const { apiResponse } = require('../../common/utils/apiResponse');
const service = require('./mobileJobCard.service');

const pendingQueue = async (req, res, next) => {
  try {
    const { entries, summary, meta } = await service.pendingQueue(req.query, req.user);
    return apiResponse(res, {
      message: 'Job card queue fetched successfully',
      data: {
        entries,
        summary
      },
      meta
    });
  } catch (error) {
    return next(error);
  }
};

const queueDetail = async (req, res, next) => {
  try {
    const data = await service.queueDetail(req.params.id, req.user);
    return apiResponse(res, {
      message: 'Gate entry detail fetched successfully',
      data
    });
  } catch (error) {
    return next(error);
  }
};

const createFromGateEntry = async (req, res, next) => {
  try {
    const data = await service.createFromGateEntry(req.body, req.user, req.files || []);
    return apiResponse(res, {
      statusCode: 201,
      message: 'Job card created successfully',
      data
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  pendingQueue,
  queueDetail,
  createFromGateEntry
};
