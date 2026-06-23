const prisma = require('../../config/db');

const userSelect = {
  id: true,
  fullName: true,
  emailId: true,
  mobileNo: true,
  employeeCode: true,
  isActive: true,
  roleId: true,
  locationId: true,
  createdAt: true,
  updatedAt: true,
  lastLoginAt: true,
  role: {
    select: {
      id: true,
      name: true,
      slug: true
    }
  }
};

const userWithRoleForChecksSelect = {
  ...userSelect,
  role: {
    select: {
      id: true,
      name: true,
      slug: true,
      isActive: true
    }
  }
};

const buildUserWhere = ({ search, roleId, locationId, isActive } = {}) => {
  const where = {};

  if (typeof isActive === 'boolean') {
    where.isActive = isActive;
  }

  if (roleId) {
    where.roleId = roleId;
  }

  if (locationId) {
    where.locationId = locationId;
  }

  if (search) {
    where.OR = [
      { fullName: { contains: search } },
      { emailId: { contains: search } },
      { mobileNo: { contains: search } },
      { employeeCode: { contains: search } }
    ];
  }

  return where;
};

const createUser = (data) => {
  return prisma.user.create({
    data,
    select: userSelect
  });
};

const updateUser = (id, data) => {
  return prisma.user.update({
    where: { id },
    data,
    select: userSelect
  });
};

const findUserById = (id) => {
  return prisma.user.findUnique({
    where: { id },
    select: userWithRoleForChecksSelect
  });
};

const findUserByEmail = (email, excludeId) => {
  return prisma.user.findFirst({
    where: {
      emailId: email,
      ...(excludeId ? { id: { not: excludeId } } : {})
    },
    select: userSelect
  });
};

const findUserByEmployeeCode = (employeeCode, excludeId) => {
  return prisma.user.findFirst({
    where: {
      employeeCode,
      ...(excludeId ? { id: { not: excludeId } } : {})
    },
    select: userSelect
  });
};

const findRoleById = (roleId) => {
  return prisma.role.findUnique({
    where: { id: roleId },
    select: {
      id: true,
      name: true,
      slug: true,
      isActive: true
    }
  });
};

const findActiveLocationById = (locationId) => {
  return prisma.location.findFirst({
    where: {
      id: locationId,
      isActive: true
    },
    select: {
      id: true,
      locationCode: true,
      locationName: true
    }
  });
};

const countActiveAdmins = () => {
  return prisma.user.count({
    where: {
      isActive: true,
      role: {
        slug: {
          in: ['admin', 'super_admin']
        }
      }
    }
  });
};

const listUsers = async ({ page, limit, search, roleId, locationId, isActive }) => {
  const where = buildUserWhere({ search, roleId, locationId, isActive });
  const skip = (page - 1) * limit;

  const [users, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      select: userSelect,
      orderBy: { id: 'asc' },
      skip,
      take: limit
    }),
    prisma.user.count({ where })
  ]);

  return { users, total };
};

module.exports = {
  createUser,
  updateUser,
  findUserById,
  findUserByEmail,
  findUserByEmployeeCode,
  findRoleById,
  findActiveLocationById,
  countActiveAdmins,
  listUsers
};
