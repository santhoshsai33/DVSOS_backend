const { apiResponse } = require('../../common/utils/apiResponse');
const auditLogService = require('./auditLog.service');

const getAuditLogs = async (req, res, next) => {
  try {
    const { auditLogs, meta } = await auditLogService.listAuditLogs(req.query);
    
    return apiResponse(res, {
      message: 'Audit logs fetched successfully',
      data: { auditLogs },
      meta
    });
  } catch (error) {
    return next(error);
  }
};

const getAuditLogById = async (req, res, next) => {
  try {
    const auditLog = await auditLogService.getAuditLogDetail(req.params.id);
    
    return apiResponse(res, {
      message: 'Audit log details fetched successfully',
      data: { auditLog }
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getAuditLogs,
  getAuditLogById
};
