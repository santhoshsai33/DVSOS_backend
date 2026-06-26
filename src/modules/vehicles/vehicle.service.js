const prisma = require('../../config/db');

const listVehicles = async (query, user) => {
  const page = parseInt(query.page, 10) || 1;
  const limit = parseInt(query.limit, 10) || 10;
  const skip = (page - 1) * limit;

  const where = {};

  if (user && user.locationId) {
    where.locationId = Number(user.locationId);
  }

  if (query.search) {
    where.OR = [
      { registrationNo: { contains: query.search } },
      { customer: { fullName: { contains: query.search } } },
      { customer: { mobileNo: { contains: query.search } } }
    ];
  }

  if (query.status === 'active') where.isActive = true;
  if (query.status === 'inactive') where.isActive = false;

  const [vehicles, total] = await Promise.all([
    prisma.vehicle.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        customer: {
          select: { id: true, fullName: true, mobileNo: true }
        },
        brand: {
          select: { id: true, name: true }
        },
        location: {
          select: { id: true, locationName: true, locationCode: true }
        }
      }
    }),
    prisma.vehicle.count({ where })
  ]);

  return {
    vehicles,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    }
  };
};

module.exports = {
  listVehicles
};
