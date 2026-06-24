const prisma = require('../../config/db');

const recentUserSelect = {
  id: true,
  fullName: true,
  slug: true,
  emailId: true,
  mobileNo: true,
  employeeCode: true,
  isActive: true,
  createdAt: true,
  role: {
    select: {
      id: true,
      name: true,
      slug: true
    }
  }
};

const getAdminDashboard = async ({ recentUserLimit = 5 } = {}) => {
  const [
    totalUsers,
    activeRoles,
    serviceItems,
    serviceCategories,
    recentUsers
  ] = await prisma.$transaction([
    prisma.user.count(),
    prisma.role.count({ where: { isActive: true } }),
    prisma.serviceItem.count(),
    prisma.serviceCategory.count(),
    prisma.user.findMany({
      select: recentUserSelect,
      orderBy: { createdAt: 'desc' },
      take: recentUserLimit
    })
  ]);

  return {
    summary: {
      totalUsers,
      activeRoles,
      serviceItems,
      serviceCategories
    },
    recentUsers
  };
};

module.exports = {
  getAdminDashboard
};
