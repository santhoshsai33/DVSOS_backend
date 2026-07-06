const cron = require('node-cron');
const prisma = require('../config/db');

// Module-level flags
let isRegistered = false;
let isProcessing = false;

// Stage mapping to configuration codes, roles, and message details
const STAGE_CONFIGS = {
  // Mechanical Work stage status codes
  MECHANICAL_ASSIGNED: {
    roles: ['floor_supervisor', 'floor-supervisor', 'manager'],
    title: 'Mechanical Work Delayed',
    messageTemplate: (regNo) => `Mechanical Work Delayed: Vehicle No. ${regNo} has exceeded the allowed Mechanical Work time.`,
    notificationType: 'STAGE_TIMEOUT'
  },
  MECHANICAL_IN_PROGRESS: {
    roles: ['floor_supervisor', 'floor-supervisor', 'manager'],
    title: 'Mechanical Work Delayed',
    messageTemplate: (regNo) => `Mechanical Work Delayed: Vehicle No. ${regNo} has exceeded the allowed Mechanical Work time.`,
    notificationType: 'STAGE_TIMEOUT'
  },
  // Body Shop stage status codes
  BODY_SHOP_ASSIGNED: {
    roles: ['floor_supervisor', 'floor-supervisor', 'manager', 'body-shop-supervisor', 'body_shop_supervisor'],
    title: 'Body Shop Work Delayed',
    messageTemplate: (regNo) => `Body Shop Work Delayed: Vehicle No. ${regNo} has exceeded the allowed Body Shop work time.`,
    notificationType: 'STAGE_TIMEOUT'
  },
  BODY_SHOP_IN_PROGRESS: {
    roles: ['floor_supervisor', 'floor-supervisor', 'manager', 'body-shop-supervisor', 'body_shop_supervisor'],
    title: 'Body Shop Work Delayed',
    messageTemplate: (regNo) => `Body Shop Work Delayed: Vehicle No. ${regNo} has exceeded the allowed Body Shop work time.`,
    notificationType: 'STAGE_TIMEOUT'
  },
  // Water Wash stage status codes
  WATER_WASH_ASSIGNED: {
    roles: ['floor_supervisor', 'floor-supervisor', 'manager', 'managing_director', 'managing-director'],
    title: 'Water Wash Delayed',
    messageTemplate: (regNo) => `Water Wash Delayed: Vehicle No. ${regNo} has exceeded the allowed Water Wash time. Please take immediate action.`,
    notificationType: 'STAGE_TIMEOUT'
  },
  WATER_WASH_IN_PROGRESS: {
    roles: ['floor_supervisor', 'floor-supervisor', 'manager', 'managing_director', 'managing-director'],
    title: 'Water Wash Delayed',
    messageTemplate: (regNo) => `Water Wash Delayed: Vehicle No. ${regNo} has exceeded the allowed Water Wash time. Please take immediate action.`,
    notificationType: 'STAGE_TIMEOUT'
  }
};

/**
 * Resolve recipients for workshop stages.
 */
async function resolveWorkshopRecipients(locationId, roles) {
  const recipients = new Set();

  const users = await prisma.user.findMany({
    where: {
      locationId,
      role: { slug: { in: roles } },
      isActive: true
    },
    select: { id: true }
  });

  for (const user of users) {
    recipients.add(user.id);
  }

  // Fallback to Location Head
  if (recipients.size === 0) {
    const location = await prisma.location.findUnique({
      where: { id: locationId },
      select: { locationHeadUserId: true }
    });
    if (location && location.locationHeadUserId) {
      recipients.add(location.locationHeadUserId);
    }
  }

  return Array.from(recipients);
}

/**
 * Main evaluation workflow for workshop stage delays.
 */
async function runDelayMonitorWorkflow() {
  const startTime = Date.now();
  console.info('[CRON START] Workshop Delay Monitor Job');

  let processedCount = 0;
  let notificationsCreated = 0;

  try {
    // 1. Fetch stage limits configured
    const limits = await prisma.stageTimeLimit.findMany({
      where: { isActive: true },
      include: { status: true }
    });

    // Create lookup maps by statusId and stageCode
    const limitsByStatusId = {};
    const limitsByStageCode = {};
    for (const limit of limits) {
      if (limit.statusId) {
        limitsByStatusId[limit.statusId] = limit;
      }
      if (limit.stageCode) {
        limitsByStageCode[limit.stageCode.toUpperCase()] = limit;
      }
    }

    const DEFAULT_LIMIT_MINUTES = 45; // Default fallback allowed time

    // 2. Query all active Job Cards (not yet delivered or ready for delivery)
    // We only care about stages mapped in STAGE_CONFIGS
    const activeJobCards = await prisma.jobCard.findMany({
      where: {
        currentStatus: {
          statusCode: { in: Object.keys(STAGE_CONFIGS) }
        }
      },
      include: {
        currentStatus: true,
        vehicle: true
      }
    });

    for (const jobCard of activeJobCards) {
      try {
        const statusCode = jobCard.currentStatus?.statusCode;
        if (!statusCode || !STAGE_CONFIGS[statusCode]) continue;

        processedCount++;

        const config = STAGE_CONFIGS[statusCode];

        // Retrieve allowed minutes configuration
        let limitMinutes = DEFAULT_LIMIT_MINUTES;
        if (jobCard.currentStatusId && limitsByStatusId[jobCard.currentStatusId]) {
          limitMinutes = limitsByStatusId[jobCard.currentStatusId].allowedMinutes;
        } else if (limitsByStageCode[statusCode]) {
          limitMinutes = limitsByStageCode[statusCode].allowedMinutes;
        }

        // Retrieve elapsed time in current status (using last status log or updatedAt)
        const lastLog = await prisma.jobCardStatusLog.findFirst({
          where: { jobCardId: jobCard.id, statusId: jobCard.currentStatusId },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true }
        });

        const statusEntryTime = lastLog ? lastLog.createdAt : jobCard.updatedAt;
        const elapsedMs = Date.now() - new Date(statusEntryTime).getTime();
        const allowedMs = limitMinutes * 60 * 1000;

        if (elapsedMs >= allowedMs) {
          const recipients = await resolveWorkshopRecipients(jobCard.locationId, config.roles);

          for (const recipientId of recipients) {
            // Check if notification already exists to avoid spamming
            const existingNotification = await prisma.notification.findFirst({
              where: {
                userId: recipientId,
                jobCardId: jobCard.id,
                statusId: jobCard.currentStatusId,
                notificationType: config.notificationType,
                createdAt: { gte: new Date(statusEntryTime) }
              }
            });

            if (existingNotification) {
              continue;
            }

            const regNo = jobCard.vehicle?.registrationNo || jobCard.jobCardNo;
            const message = config.messageTemplate(regNo);

            await prisma.notification.create({
              data: {
                locationId: jobCard.locationId,
                userId: recipientId,
                jobCardId: jobCard.id,
                statusId: jobCard.currentStatusId,
                title: config.title,
                message,
                notificationType: config.notificationType
              }
            });

            notificationsCreated++;
          }
        }
      } catch (innerErr) {
        console.error(`[Workshop Delay Monitor Job] Error processing job card ${jobCard.id}:`, innerErr.message);
      }
    }
  } catch (error) {
    console.error('[Workshop Delay Monitor Job] Critical error running workflow:', error.message);
  } finally {
    const duration = Date.now() - startTime;
    console.info('[CRON END] Workshop Delay Monitor Job');
    console.info(`- Job Cards Evaluated: ${processedCount}`);
    console.info(`- Notifications Created: ${notificationsCreated}`);
    console.info(`- Execution Time: ${duration} ms`);
  }
}

/**
 * Initialize and register the cron job.
 */
function startDelayMonitorJob() {
  if (isRegistered) {
    console.info('[Workshop Delay Monitor Job] Cron job already registered. Skipping registration.');
    return;
  }

  // Schedule task to run every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    if (isProcessing) {
      console.warn('[Workshop Delay Monitor Job] Previous execution is still active. Skipping run to prevent overlaps.');
      return;
    }

    try {
      isProcessing = true;
      await runDelayMonitorWorkflow();
    } finally {
      isProcessing = false;
    }
  });

  isRegistered = true;
  console.info('[Workshop Delay Monitor Job] Cron job registered successfully to run every 5 minutes (*/5 * * * *).');
}

module.exports = {
  startDelayMonitorJob,
  runDelayMonitorWorkflow
};
