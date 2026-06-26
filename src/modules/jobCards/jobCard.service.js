const prisma = require('../../config/db');

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
    where.currentStatus = { statusCode: query.status };
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

module.exports = {
  listJobCards
};
