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

module.exports = {
  getJobCards
};
