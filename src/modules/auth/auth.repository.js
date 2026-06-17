const prisma = require('../../config/db');

const userWithRoleSelect = {
  id: true,
  fullName: true,
  emailId: true,
  mobileNo: true,
  passwordHash: true,
  isActive: true,
  lastLoginAt: true,
  roleId: true,
  role: {
    select: {
      id: true,
      name: true,
      slug: true,
      isActive: true
    }
  }
};

const findUserByIdentifier = (identifier) => {
  return prisma.user.findFirst({
    where: {
      OR: [
        { emailId: identifier },
        { mobileNo: identifier }
      ]
    },
    select: userWithRoleSelect
  });
};

const findUserById = (userId) => {
  return prisma.user.findUnique({
    where: { id: userId },
    select: userWithRoleSelect
  });
};

const updateLastLoginAt = (userId) => {
  return prisma.user.update({
    where: { id: userId },
    data: {
      lastLoginAt: new Date()
    }
  });
};

module.exports = {
  findUserByIdentifier,
  findUserById,
  updateLastLoginAt
};
