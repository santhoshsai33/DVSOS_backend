const { apiResponse } = require('../utils/apiResponse');
const prisma = require('../../config/db');

const validateKioskKey = async (req, res, next) => {
  try {
    const kioskKey = req.query.kioskKey || req.headers['x-kiosk-key'];

    if (!kioskKey) {
      return apiResponse(res, {
        statusCode: 401,
        success: false,
        message: 'TV Kiosk API Key is required. Please check your URL bookmark.',
        data: {},
        meta: {}
      });
    }

    const location = await prisma.location.findFirst({
      where: {
        kioskKey: String(kioskKey).trim(),
        isActive: true
      },
      select: {
        id: true,
        locationCode: true,
        locationName: true
      }
    });

    if (!location) {
      return apiResponse(res, {
        statusCode: 401,
        success: false,
        message: 'Invalid or revoked TV Kiosk API Key.',
        data: {},
        meta: {}
      });
    }

    req.kioskLocationId = location.id;
    req.kioskLocation = location;
    return next();
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  validateKioskKey
};
