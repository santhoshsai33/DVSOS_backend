const jobCardService = require('./jobCard.service');
const { apiResponse } = require('../../common/utils/apiResponse');

const { exportToExcel } = require('../../common/utils/excel.util');

const getJobCards = async (req, res, next) => {
  try {
    const result = await jobCardService.listJobCards(req.query, req.user);

    if (req.query.export === 'true') {
      const columns = [
        { header: 'Job Card Number', key: 'jobCardNo', width: 22 },
        { header: 'Vehicle Number', key: 'vehicleNumber', width: 20 },
        { header: 'Owner Name', key: 'ownerName', width: 25 },
        { header: 'Owner Mobile', key: 'ownerMobile', width: 18 },
        { header: 'Technician', key: 'technician', width: 25 },
        { header: 'Bay', key: 'bayName', width: 18 },
        { header: 'Estimate Cost', key: 'totalEstimate', width: 18 },
        { header: 'Status', key: 'status', width: 18 },
        { header: 'Created At', key: 'createdAt', width: 25 }
      ];

      // Format response data matching UI rendering
      const formattedData = result.jobCards.map(item => {
        const displayItem = jobCardService.toJobCardListResponse(item, req.query.department || req.query.category);
        return {
          jobCardNo: displayItem.jobCardNo,
          vehicleNumber: displayItem.vehicle?.registrationNo || '',
          ownerName: displayItem.customer?.fullName || '',
          ownerMobile: displayItem.customer?.mobileNo || '',
          technician: displayItem.technician || 'Unassigned',
          bayName: displayItem.bay?.bayName || displayItem.bay?.bayCode || 'Unassigned',
          totalEstimate: displayItem.totalEstimate || 0,
          status: displayItem.currentStatus?.statusCode || 'PENDING',
          createdAt: displayItem.createdAt ? new Date(displayItem.createdAt).toLocaleString() : ''
        };
      });

      return await exportToExcel(res, 'Job_Cards', 'Job Cards', columns, formattedData);
    }

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
