const jobCardService = require('./jobCard.service');
const { apiResponse } = require('../../common/utils/apiResponse');

const getJobCards = async (req, res, next) => {
  try {
    const result = await jobCardService.listJobCards(req.query, req.user);

    return apiResponse(res, {
      statusCode: 200,
      success: true,
      message: 'Job cards retrieved successfully',
      data: result.jobCards,
      meta: result.meta
    });
  } catch (error) {
    return next(error);
  }
};

const getJobCard = async (req, res, next) => {
  try {
    const jobCard = await jobCardService.getJobCardById(req.params.id, req.user);

    return apiResponse(res, {
      statusCode: 200,
      success: true,
      message: 'Job card retrieved successfully',
      data: jobCard
    });
  } catch (error) {
    if (error.message === 'Job Card not found' || error.message === 'Unauthorized to view this Job Card') {
      return apiResponse(res, {
        statusCode: 404,
        success: false,
        message: error.message
      });
    }
    return next(error);
  }
};

const getJobCardStatuses = async (req, res, next) => {
  try {
    const statuses = await jobCardService.listJobCardStatuses();

    return apiResponse(res, {
      statusCode: 200,
      success: true,
      message: 'Job card statuses retrieved successfully',
      data: statuses
    });
  } catch (error) {
    return next(error);
  }
};

const getJobCardServiceStatuses = async (req, res, next) => {
  try {
    const statuses = await jobCardService.listJobCardServiceStatuses();

    return apiResponse(res, {
      statusCode: 200,
      success: true,
      message: 'Job card service statuses retrieved successfully',
      data: statuses
    });
  } catch (error) {
    return next(error);
  }
};

const updateJobCard = async (req, res, next) => {
  try {
    const jobCard = await jobCardService.updateJobCard(req.params.id, req.body, req.user);

    return apiResponse(res, {
      statusCode: 200,
      success: true,
      message: 'Job card updated successfully',
      data: jobCard
    });
  } catch (error) {
    if (error.message === 'Job Card not found') {
      return apiResponse(res, {
        statusCode: 404,
        success: false,
        message: error.message,
        data: {},
        meta: {}
      });
    }
    return next(error);
  }
};

module.exports = {
  getJobCards,
  getJobCard,
  getJobCardStatuses,
  getJobCardServiceStatuses,
  updateJobCard
};
