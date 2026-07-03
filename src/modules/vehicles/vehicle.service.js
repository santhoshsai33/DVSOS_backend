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

  if (query.fromDate) {
    const from = new Date(query.fromDate);
    if (!isNaN(from)) {
      where.createdAt = { ...where.createdAt, gte: from };
    }
  }
  if (query.toDate) {
    const to = new Date(query.toDate);
    if (!isNaN(to)) {
      to.setHours(23, 59, 59, 999);
      where.createdAt = { ...where.createdAt, lte: to };
    }
  }

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

const getVehicleById = async (id, user) => {
  const vehicleId = parseInt(id, 10);
  const vehicle = await prisma.vehicle.findUnique({
    where: { id: vehicleId },
    include: {
      customer: {
        select: { id: true, fullName: true, mobileNo: true, emailId: true, address: true }
      },
      brand: {
        select: { id: true, name: true }
      },
      location: {
        select: { id: true, locationName: true, locationCode: true }
      }
    }
  });

  if (!vehicle) {
    throw new Error('Vehicle not found');
  }

  // Ensure location matches if user is restricted
  if (user && user.locationId && vehicle.locationId !== user.locationId) {
    throw new Error('Unauthorized to view this Vehicle');
  }

  // Fetch media files (images) associated with this vehicle
  const mediaFiles = await prisma.mediaFile.findMany({
    where: {
      moduleName: 'Vehicle',
      moduleRecordId: vehicleId
    },
    orderBy: { createdAt: 'desc' }
  });

  return {
    ...vehicle,
    images: mediaFiles
  };
};

module.exports = {
  listVehicles,
  getVehicleById
};
