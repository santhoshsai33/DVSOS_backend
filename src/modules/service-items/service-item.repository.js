const prisma = require('../../config/db');

const categorySummarySelect = {
  id: true,
  name: true,
  slug: true,
  isActive: true
};

const serviceItemSelect = {
  id: true,
  categoryId: true,
  name: true,
  slug: true,
  description: true,
  defaultPrice: true,
  estimatedMinutes: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  category: {
    select: categorySummarySelect
  }
};

const buildServiceItemWhere = ({ search, categoryId, isActive, onlyActiveCategory } = {}) => {
  const where = {};

  if (typeof isActive === 'boolean') {
    where.isActive = isActive;
  }

  if (categoryId) {
    where.categoryId = categoryId;
  }

  if (onlyActiveCategory) {
    where.category = { isActive: true };
  }

  if (search) {
    where.OR = [
      { name: { contains: search } },
      { slug: { contains: search } },
      { description: { contains: search } }
    ];
  }

  return where;
};

const createServiceItem = (data) => {
  return prisma.serviceItem.create({
    data,
    select: serviceItemSelect
  });
};

const updateServiceItem = (id, data) => {
  return prisma.serviceItem.update({
    where: { id },
    data,
    select: serviceItemSelect
  });
};

const findServiceItemById = (id, { onlyActive = false, onlyActiveCategory = false } = {}) => {
  return prisma.serviceItem.findFirst({
    where: {
      id,
      ...(onlyActive ? { isActive: true } : {}),
      ...(onlyActiveCategory ? { category: { isActive: true } } : {})
    },
    select: serviceItemSelect
  });
};

const findServiceItemBySlug = (slug, excludeId) => {
  return prisma.serviceItem.findFirst({
    where: {
      slug,
      ...(excludeId ? { id: { not: excludeId } } : {})
    },
    select: serviceItemSelect
  });
};

const findCategoryById = (id) => {
  return prisma.serviceCategory.findUnique({
    where: { id },
    select: categorySummarySelect
  });
};

const listServiceItems = async ({ page, limit, search, categoryId, isActive, onlyActiveCategory }) => {
  const where = buildServiceItemWhere({ search, categoryId, isActive, onlyActiveCategory });
  const skip = (page - 1) * limit;

  const [serviceItems, total] = await prisma.$transaction([
    prisma.serviceItem.findMany({
      where,
      select: serviceItemSelect,
      orderBy: { id: 'asc' },
      skip,
      take: limit
    }),
    prisma.serviceItem.count({ where })
  ]);

  return { serviceItems, total };
};

module.exports = {
  createServiceItem,
  updateServiceItem,
  findServiceItemById,
  findServiceItemBySlug,
  findCategoryById,
  listServiceItems
};
