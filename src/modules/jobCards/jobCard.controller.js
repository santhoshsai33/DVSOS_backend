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

module.exports = {
  getJobCards,
  getJobCard
};
