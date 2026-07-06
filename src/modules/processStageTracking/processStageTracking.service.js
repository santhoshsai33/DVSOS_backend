const prisma = require('../../config/db');

const ACTIVE_STAGE_STATUSES = ['PENDING', 'DELAYED'];

const findStageTimeLimit = async (db, { locationId, moduleId, statusId }) => {
  const baseWhere = {
    moduleId,
    statusId,
    isActive: true
  };

  if (locationId) {
    const locationLimit = await db.stageTimeLimit.findFirst({
      where: {
        ...baseWhere,
        locationId
      }
    });

    if (locationLimit) {
      return locationLimit;
    }
  }

  return db.stageTimeLimit.findFirst({
    where: {
      ...baseWhere,
      locationId: null
    }
  });
};

const startStage = async ({
  locationId,
  gateEntryId = null,
  jobCardId = null,
  customerId,
  vehicleId,
  moduleId,
  statusId,
  createdById = null
}, db = prisma) => {
  const limit = await findStageTimeLimit(db, { locationId, moduleId, statusId });

  if (!limit) {
    return null;
  }

  return db.processStageTracking.create({
    data: {
      locationId,
      gateEntryId,
      jobCardId,
      customerId,
      vehicleId,
      moduleId,
      statusId,
      stageStatus: 'PENDING',
      startedAt: new Date(),
      completedAt: null,
      isDelayNotified: false,
      delayNotifiedAt: null,
      createdById
    }
  });
};

const completeStage = async ({
  gateEntryId = null,
  jobCardId = null,
  moduleId,
  statusId,
  modifiedById = null
}, db = prisma) => {
  const stage = await db.processStageTracking.findFirst({
    where: {
      ...(gateEntryId ? { gateEntryId } : {}),
      ...(jobCardId ? { OR: [{ jobCardId }, { jobCardId: null }] } : {}),
      moduleId,
      statusId,
      stageStatus: {
        in: ACTIVE_STAGE_STATUSES
      }
    },
    orderBy: {
      startedAt: 'desc'
    }
  });

  if (!stage) {
    return null;
  }

  return db.processStageTracking.update({
    where: { id: stage.id },
    data: {
      stageStatus: 'COMPLETED',
      completedAt: new Date(),
      ...(jobCardId ? { jobCardId } : {}),
      modifiedById
    }
  });
};

const cancelStage = async ({
  gateEntryId = null,
  jobCardId = null,
  moduleId,
  statusId,
  modifiedById = null
}, db = prisma) => {
  return db.processStageTracking.updateMany({
    where: {
      ...(gateEntryId ? { gateEntryId } : {}),
      ...(jobCardId ? { jobCardId } : {}),
      moduleId,
      statusId,
      stageStatus: {
        in: ACTIVE_STAGE_STATUSES
      }
    },
    data: {
      stageStatus: 'CANCELLED',
      completedAt: new Date(),
      modifiedById
    }
  });
};

const getCurrentStageByJobCard = async (jobCardId, db = prisma) => {
  return db.processStageTracking.findFirst({
    where: {
      jobCardId,
      stageStatus: {
        in: ACTIVE_STAGE_STATUSES
      }
    },
    include: {
      module: true,
      status: true
    },
    orderBy: {
      startedAt: 'desc'
    }
  });
};

const getCurrentStageByGateEntry = async (gateEntryId, db = prisma) => {
  return db.processStageTracking.findFirst({
    where: {
      gateEntryId,
      stageStatus: {
        in: ACTIVE_STAGE_STATUSES
      }
    },
    include: {
      module: true,
      status: true
    },
    orderBy: {
      startedAt: 'desc'
    }
  });
};

module.exports = {
  findStageTimeLimit,
  startStage,
  completeStage,
  cancelStage,
  getCurrentStageByJobCard,
  getCurrentStageByGateEntry
};
