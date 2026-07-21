const { apiResponse } = require('../../common/utils/apiResponse');

const isPositiveInt = (value) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 2147483647;
};

const isOptionalPositiveInt = (value) => {
  return value === undefined || value === null || value === '' || isPositiveInt(value);
};

const sendValidationError = (res, message) => {
  return apiResponse(res, {
    statusCode: 400,
    success: false,
    message,
    data: {},
    meta: {}
  });
};

const validateIdParam = (req, res, next) => {
  if (!isPositiveInt(req.params.id)) {
    return sendValidationError(res, 'Valid stage time limit id is required');
  }

  return next();
};

const validatePayload = (req, res, next) => {
  const {
    locationId,
    moduleId,
    statusId,
    stageCode,
    allowedMinutes,
    notifyRoleId,
    notifyUserId
  } = req.body || {};

  if (!isPositiveInt(moduleId)) {
    return sendValidationError(res, 'moduleId is required');
  }

  if (!isPositiveInt(statusId)) {
    return sendValidationError(res, 'statusId is required');
  }

  if (!String(stageCode || '').trim()) {
    return sendValidationError(res, 'stageCode is required');
  }

  if (!isPositiveInt(allowedMinutes)) {
    return sendValidationError(res, 'allowedMinutes must be a positive integer');
  }

  if (!isOptionalPositiveInt(locationId)) {
    return sendValidationError(res, 'locationId must be a positive integer');
  }

  if (!isOptionalPositiveInt(notifyRoleId)) {
    return sendValidationError(res, 'notifyRoleId must be a positive integer');
  }

  if (!isOptionalPositiveInt(notifyUserId)) {
    return sendValidationError(res, 'notifyUserId must be a positive integer');
  }

  const hasNotifyRole = notifyRoleId !== undefined && notifyRoleId !== null && notifyRoleId !== '';
  const hasNotifyUser = notifyUserId !== undefined && notifyUserId !== null && notifyUserId !== '';

  if (hasNotifyRole && hasNotifyUser) {
    return sendValidationError(res, 'Choose either notify role or notify user, not both.');
  }

  if (!hasNotifyRole && !hasNotifyUser) {
    return sendValidationError(res, 'Notify role or notify user is required.');
  }

  return next();
};

const validateStatusPayload = (req, res, next) => {
  if (typeof (req.body || {}).isActive !== 'boolean') {
    return sendValidationError(res, 'isActive boolean is required');
  }

  return next();
};

module.exports = {
  validateIdParam,
  validatePayload,
  validateStatusPayload
};
