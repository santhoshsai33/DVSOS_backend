const { apiResponse } = require('../utils/apiResponse');
const { verifyToken } = require('../../utils/jwt');
const prisma = require('../../config/db');

const INACTIVE_ACCOUNT_MESSAGE = 'User account is inactive';
const INACTIVE_ROLE_MESSAGE = 'User role is inactive';

const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return apiResponse(res, {
      statusCode: 401,
      success: false,
      message: 'Authentication token is required',
      data: {},
      meta: {}
    });
  }

  const token = authHeader.split(' ')[1];
  let decoded;

  try {
    decoded = verifyToken(token);
  } catch (error) {
    return apiResponse(res, {
      statusCode: 401,
      success: false,
      message: 'Invalid or expired authentication token',
      data: {},
      meta: {}
    });
  }

  try {
    if (!decoded.userId || !decoded.roleId || !decoded.roleSlug) {
      return apiResponse(res, {
        statusCode: 401,
        success: false,
        message: 'Invalid authentication token payload',
        data: {},
        meta: {}
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        locationId: true,
        isActive: true,
        role: {
          select: {
            id: true,
            slug: true,
            isActive: true
          }
        }
      }
    });

    if (!user || !user.role) {
      return apiResponse(res, {
        statusCode: 401,
        success: false,
        message: 'Invalid authentication token payload',
        data: {},
        meta: {}
      });
    }

    if (!user.isActive) {
      return apiResponse(res, {
        statusCode: 403,
        success: false,
        message: INACTIVE_ACCOUNT_MESSAGE,
        data: {},
        meta: {}
      });
    }

    if (!user.role.isActive) {
      return apiResponse(res, {
        statusCode: 403,
        success: false,
        message: INACTIVE_ROLE_MESSAGE,
        data: {},
        meta: {}
      });
    }

    req.user = {
      userId: decoded.userId,
      roleId: user.role.id,
      roleSlug: user.role.slug,
      locationId: user.locationId || null
    };

    return next();
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  authenticate,
  authMiddleware: authenticate
};
