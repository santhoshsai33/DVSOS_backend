const prisma = require('../../config/db');

/**
 * Upsert a device token for a user.
 */
async function upsertDeviceToken(userId, token) {
  return prisma.userDeviceToken.upsert({
    where: { token },
    update: {
      userId,
      isActive: true,
      updatedAt: new Date()
    },
    create: {
      userId,
      token,
      isActive: true
    }
  });
}

/**
 * Get paginated notifications for a specific user.
 */
async function getUserNotifications(userId, limit = 20, offset = 0) {
  const [notifications, total] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      include: {
        jobCard: {
          select: {
            slug: true,
            jobCardNo: true
          }
        },
        gateEntry: {
          select: {
            slug: true,
            gateEntryNo: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset
    }),
    prisma.notification.count({
      where: { userId }
    })
  ]);

  return { notifications, total };
}

/**
 * Mark a single notification as read.
 */
async function markAsRead(userId, notificationId) {
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId }
  });

  if (!notification || notification.userId !== userId) {
    const error = new Error('Notification not found or access denied');
    error.statusCode = 404;
    throw error;
  }

  return prisma.notification.update({
    where: { id: notificationId },
    data: { readAt: new Date() }
  });
}

/**
 * Mark all notifications as read for a user.
 */
async function markAllAsRead(userId) {
  return prisma.notification.updateMany({
    where: {
      userId,
      readAt: null
    },
    data: {
      readAt: new Date()
    }
  });
}

/**
 * Get active managers with their active device tokens.
 */
async function getManagersWithTokens() {
  return prisma.user.findMany({
    where: {
      role: {
        slug: 'manager'
      },
      isActive: true
    },
    include: {
      deviceTokens: {
        where: {
          isActive: true
        }
      }
    }
  });
}

/**
 * Deactivate a device token (e.g. if invalid or client logged out).
 */
async function deactivateDeviceToken(token) {
  return prisma.userDeviceToken.updateMany({
    where: { token },
    data: { isActive: false }
  });
}

/**
 * Create a new notification record in the database.
 */
async function createNotification(data) {
  return prisma.notification.create({
    data
  });
}

module.exports = {
  upsertDeviceToken,
  getUserNotifications,
  markAsRead,
  markAllAsRead,
  getManagersWithTokens,
  deactivateDeviceToken,
  createNotification
};
