const prisma = require('../../config/db');
const { STATUS_MODULE_CODES, statusModuleFilter } = require('../../common/utils/status.util');

const listJobCards = async (query, user) => {
  const page = parseInt(query.page, 10) || 1;
  const limit = parseInt(query.limit, 10) || 10;
  const skip = (page - 1) * limit;

  const where = {};

  const locationId = user?.locationId || query.locationId;
  if (locationId) {
    where.locationId = Number(locationId);
  }

  if (query.search) {
    where.OR = [
      { jobCardNo: { contains: query.search } },
      { vehicle: { registrationNo: { contains: query.search } } },
      { customer: { fullName: { contains: query.search } } },
      { customer: { mobileNo: { contains: query.search } } }
    ];
  }

  if (query.status) {
    where.currentStatus = {
      is: {
        statusCode: String(query.status).trim().toUpperCase(),
        ...statusModuleFilter(STATUS_MODULE_CODES.JOB_CARD_STATUS)
      }
    };
  }

  const [jobCards, total] = await Promise.all([
    prisma.jobCard.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        customer: {
          select: { id: true, fullName: true, mobileNo: true }
        },
        vehicle: {
          select: { id: true, registrationNo: true }
        },
        currentStatus: {
          select: { id: true, statusCode: true, statusName: true }
        },
        location: {
          select: { id: true, locationName: true, locationCode: true }
        }
      }
    }),
    prisma.jobCard.count({ where })
  ]);

  return {
    jobCards,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    }
  };
};

const getJobCardById = async (id, user) => {
  const jobCard = await prisma.jobCard.findUnique({
    where: { id: parseInt(id, 10) },
    include: {
      customer: {
        select: { id: true, fullName: true, mobileNo: true, emailId: true, address: true }
      },
      vehicle: {
        select: { id: true, registrationNo: true, model: true, variant: true, fuelType: true, vehicleColor: true }
      },
      currentStatus: {
        select: { id: true, statusCode: true, statusName: true }
      },
      location: {
        select: { id: true, locationName: true, locationCode: true }
      },
      gateEntry: {
        select: { id: true, entryType: true, gateEntryNo: true }
      },
      services: {
        include: {
          serviceItem: true,
          serviceStatus: true
        }
      },
      workAssignments: {
        include: {
          assignedUser: {
            select: { id: true, fullName: true, mobileNo: true }
          },
          status: true
        }
      }
    }
  });

  if (!jobCard) {
    throw new Error('Job Card not found');
  }

  // Ensure location matches if user is restricted
  if (user && user.locationId && jobCard.locationId !== user.locationId) {
    throw new Error('Unauthorized to view this Job Card');
  }

  return jobCard;
};

module.exports = {
  listJobCards,
  getJobCardById
};
