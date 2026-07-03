const cron = require('node-cron');
const prisma = require('../config/db');

// Module-level flags
let isRegistered = false;
let isProcessing = false;

/**
 * Fetch all active stage time limits mapped by statusId.
 */
async function fetchStageLimits() {
  const limits = await prisma.stageTimeLimit.findMany({
    where: { isActive: true },
    select: {
      statusId: true,
      allowedMinutes: true,
      notifyRoleId: true
    }
  });

  const limitsMap = {};
  for (const limit of limits) {
    if (limit.statusId) {
      limitsMap[limit.statusId] = limit;
    }
  }
  return limitsMap;
}

/**
 * Resolve deterministic recipients list for the notification.
 */
async function resolveRecipients(gateEntry, stageLimit) {
  const recipients = new Set();

  // Step 1: Active users at the gate entry's location with the notify role
  if (stageLimit.notifyRoleId) {
    const roleUsers = await prisma.user.findMany({
      where: {
        locationId: gateEntry.locationId,
        roleId: stageLimit.notifyRoleId,
        isActive: true
      },
      select: { id: true }
    });
    for (const user of roleUsers) {
      recipients.add(user.id);
    }
  }

  // Step 2: Fallback to Location Head
  if (recipients.size === 0) {
    const location = await prisma.location.findUnique({
      where: { id: gateEntry.locationId },
      select: { locationHeadUserId: true }
    });
    if (location && location.locationHeadUserId) {
      recipients.add(location.locationHeadUserId);
    }
  }

  // Step 3: Fallback to creator / enteredBy user
  if (recipients.size === 0) {
    const creatorId = gateEntry.enteredById || gateEntry.createdById;
    if (creatorId) {
      recipients.add(creatorId);
    }
  }

  return Array.from(recipients);
}

/**
 * Evaluates and processes a batch of gate entries.
 * Returns { processed: number, created: number, duplicates: number }
 */
async function processGateEntryBatch(batch, limitsMap) {
  let createdCount = 0;
  let duplicatesCount = 0;

  for (const entry of batch) {
    try {
      if (!entry.statusId) {
        continue;
      }

      const limit = limitsMap[entry.statusId];
      if (!limit) {
        console.warn(`[Gate Entry Timeout Job] No active StageTimeLimit configuration for statusId ${entry.statusId} on GateEntry ${entry.id}. Skipping.`);
        continue;
      }

      // Calculate elapsed time (UTC milliseconds)
      const elapsedMs = Date.now() - entry.entryTime.getTime();
      const allowedMs = limit.allowedMinutes * 60 * 1000;

      if (elapsedMs >= allowedMs) {
        // Resolve recipients
        const recipientIds = await resolveRecipients(entry, limit);

        if (recipientIds.length === 0) {
          console.warn(`[Gate Entry Timeout Job] No recipients resolved for GateEntry ${entry.id} (Location: ${entry.locationId}). Skipping.`);
          continue;
        }

        // Create notification for each recipient
        for (const recipientId of recipientIds) {
          try {
            // Check if notification already exists to avoid spamming
            const existingNotification = await prisma.notification.findFirst({
              where: {
                userId: recipientId,
                gateEntryId: entry.id,
                statusId: entry.statusId,
                notificationType: 'STAGE_TIMEOUT'
              }
            });

            if (existingNotification) {
              duplicatesCount++;
              continue;
            }

            await prisma.notification.create({
              data: {
                locationId: entry.locationId,
                userId: recipientId,
                statusId: entry.statusId,
                gateEntryId: entry.id,
                title: 'Gate Entry Timeout',
                message: `Gate entry ${entry.gateEntryNo} has exceeded the allowed duration of ${limit.allowedMinutes} minutes in the current stage.`,
                notificationType: 'STAGE_TIMEOUT'
              }
            });
            createdCount++;
          } catch (err) {
            console.error(`[Gate Entry Timeout Job] Error inserting notification for GateEntry ${entry.id}, Recipient ${recipientId}:`, err.message);
          }
        }
      }
    } catch (recordError) {
      console.error(`[Gate Entry Timeout Job] Critical error evaluating GateEntry ${entry.id}:`, recordError.message);
    }
  }

  return { processed: batch.length, created: createdCount, duplicates: duplicatesCount };
}

/**
 * Execute the main evaluation workflow.
 */
async function runJobWorkflow() {
  const startTime = Date.now();
  console.info('[CRON START] Gate Entry Timeout Notification Job');

  let totalStageLimits = 0;
  let totalGateEntriesEvaluated = 0;
  let totalNotificationsCreated = 0;
  let totalDuplicatesSkipped = 0;

  try {
    // 1. Fetch stage limits
    const limitsMap = await fetchStageLimits();
    totalStageLimits = Object.keys(limitsMap).length;

    // 2. Paginate over pending Gate Entries in batches of 500
    const batchSize = 500;
    let lastId = 0;
    let hasMore = true;

    while (hasMore) {
      const batch = await prisma.gateEntry.findMany({
        where: {
          exitTime: null,
          statusId: { not: null },
          id: { gt: lastId }
        },
        orderBy: { id: 'asc' },
        take: batchSize
      });

      if (batch.length === 0) {
        hasMore = false;
        break;
      }

      // Process batch
      const result = await processGateEntryBatch(batch, limitsMap);
      totalGateEntriesEvaluated += result.processed;
      totalNotificationsCreated += result.created;
      totalDuplicatesSkipped += result.duplicates;

      // Update cursor
      lastId = batch[batch.length - 1].id;
      if (batch.length < batchSize) {
        hasMore = false;
      }
    }

  } catch (error) {
    console.error('[Gate Entry Timeout Job] Unexpected critical error running workflow:', error.message);
  } finally {
    const duration = Date.now() - startTime;
    console.info('[CRON END] Gate Entry Timeout Notification Job');
    console.info(`- Total Stage Limits Loaded: ${totalStageLimits}`);
    console.info(`- Total Gate Entries Evaluated: ${totalGateEntriesEvaluated}`);
    console.info(`- Notifications Created: ${totalNotificationsCreated}`);
    console.info(`- Duplicates Skipped: ${totalDuplicatesSkipped}`);
    console.info(`- Execution Time: ${duration} ms`);
  }
}

/**
 * Initialize and register the cron job safely.
 */
function startGateEntryTimeoutJob() {
  if (isRegistered) {
    console.info('[Gate Entry Timeout Job] Cron job already registered. Skipping registration.');
    return;
  }

  // Schedule task to run every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    if (isProcessing) {
      console.warn('[Gate Entry Timeout Job] Previous execution is still active. Skipping run to prevent overlaps.');
      return;
    }

    try {
      isProcessing = true;
      await runJobWorkflow();
    } finally {
      isProcessing = false;
    }
  });

  isRegistered = true;
  console.info('[Gate Entry Timeout Job] Cron job registered successfully to run every 5 minutes (*/5 * * * *).');
}

module.exports = {
  startGateEntryTimeoutJob,
  runJobWorkflow // exported for manual invocation / verification
};
