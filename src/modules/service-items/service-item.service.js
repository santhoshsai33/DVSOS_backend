const serviceItemRepository = require('./service-item.repository');
const { generateSlug, generateUniqueSlug } = require('../../common/utils/slug.util');

const VIEW_ACTIVE_ONLY_ROLES = new Set([
  'crm_team',
  'crm-team',
  'manager',
  'managing_director',
  'managing-director'
]);

const createHttpError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);

  if (Number.isNaN(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
};

const parseBooleanFilter = (value) => {
  if (value === undefined || value === '') {
    return undefined;
  }

  if (value === true || value === 'true') {
    return true;
  }

  if (value === false || value === 'false') {
    return false;
  }

  return undefined;
};

const parseOptionalPositiveInt = (value) => {
  if (value === undefined || value === '') {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

const shouldRestrictToActive = (user) => {
  return user && VIEW_ACTIVE_ONLY_ROLES.has(user.roleSlug);
};

const toServiceItemResource = (serviceItem) => ({
  id: serviceItem.id,
  categoryId: serviceItem.categoryId,
  name: serviceItem.name,
  slug: serviceItem.slug,
  description: serviceItem.description,
  basePrice: Number(serviceItem.defaultPrice),
  estimatedMinutes: serviceItem.estimatedMinutes,
  isActive: serviceItem.isActive,
  createdAt: serviceItem.createdAt,
  updatedAt: serviceItem.updatedAt,
  category: serviceItem.category
    ? {
        id: serviceItem.category.id,
        name: serviceItem.category.name,
        slug: serviceItem.category.slug
      }
    : null
});

const ensureServiceItemExists = async (id, options = {}) => {
  const serviceItem = await serviceItemRepository.findServiceItemById(id, options);

  if (!serviceItem) {
    throw createHttpError(404, 'Service item not found');
  }

  return serviceItem;
};

const ensureServiceItemExistsByIdentifier = async (identifier, options = {}) => {
  const serviceItem = await serviceItemRepository.findServiceItemByIdentifier(identifier, options);

  if (!serviceItem) {
    throw createHttpError(404, 'Service item not found');
  }

  return serviceItem;
};

const ensureUniqueServiceItemSlug = async (slug, excludeId) => {
  const existingServiceItem = await serviceItemRepository.findServiceItemBySlug(slug, excludeId);

  if (existingServiceItem) {
    throw createHttpError(409, 'Service item slug already exists');
  }
};

const resolveServiceItemSlug = async ({ name, slug, excludeId }) => {
  const sourceSlug = slug ? slug : name;
  const normalizedSlug = generateSlug(sourceSlug);

  if (!normalizedSlug) {
    throw createHttpError(400, 'Valid service item slug is required');
  }

  if (slug) {
    await ensureUniqueServiceItemSlug(normalizedSlug, excludeId);
    return normalizedSlug;
  }

  return generateUniqueSlug(normalizedSlug, (slugValue) => {
    return serviceItemRepository.findServiceItemBySlug(slugValue, excludeId);
  });
};

const ensureActiveCategoryExists = async (categoryId) => {
  const category = await serviceItemRepository.findCategoryById(categoryId);

  if (!category) {
    throw createHttpError(404, 'Service category not found');
  }

  if (!category.isActive) {
    throw createHttpError(400, 'Cannot create or assign service item under inactive category');
  }

  return category;
};

const buildServiceItemData = async ({ categoryId, name, slug, description, basePrice, estimatedMinutes }, excludeId) => {
  const normalizedName = name.trim();
  const normalizedSlug = await resolveServiceItemSlug({ name: normalizedName, slug, excludeId });

  return {
    categoryId: Number(categoryId),
    name: normalizedName,
    slug: normalizedSlug,
    description: description ? description.trim() : null,
    defaultPrice: basePrice === undefined || basePrice === null || basePrice === '' ? 0 : Number(basePrice),
    estimatedMinutes:
      estimatedMinutes === undefined || estimatedMinutes === null || estimatedMinutes === ''
        ? null
        : Number(estimatedMinutes)
  };
};

const createServiceItem = async (payload) => {
  const data = await buildServiceItemData(payload);

  await ensureActiveCategoryExists(data.categoryId);

  const serviceItem = await serviceItemRepository.createServiceItem(data);
  return toServiceItemResource(serviceItem);
};

const updateServiceItem = async (identifier, payload) => {
  const existingServiceItem = await ensureServiceItemExistsByIdentifier(identifier);
  const data = await buildServiceItemData(payload, existingServiceItem.id);

  await ensureActiveCategoryExists(data.categoryId);

  const serviceItem = await serviceItemRepository.updateServiceItem(existingServiceItem.id, data);
  return toServiceItemResource(serviceItem);
};

const listServiceItems = async (query, user) => {
  const page = parsePositiveInt(query.page, 1);
  const limit = parsePositiveInt(query.limit, 10);
  const search = query.search ? query.search.trim() : undefined;
  const categoryId = parseOptionalPositiveInt(query.categoryId);
  const activeOnlyViewer = shouldRestrictToActive(user);
  const isActive = activeOnlyViewer ? true : parseBooleanFilter(query.isActive);

  const { serviceItems, total } = await serviceItemRepository.listServiceItems({
    page,
    limit,
    search,
    categoryId,
    isActive,
    onlyActiveCategory: activeOnlyViewer
  });

  return {
    serviceItems: serviceItems.map(toServiceItemResource),
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  };
};

const getServiceItemDetail = async (identifier, user) => {
  const activeOnlyViewer = shouldRestrictToActive(user);
  const serviceItem = await ensureServiceItemExistsByIdentifier(identifier, {
    onlyActive: activeOnlyViewer,
    onlyActiveCategory: activeOnlyViewer
  });
  return toServiceItemResource(serviceItem);
};

const updateServiceItemStatus = async (id, { isActive }) => {
  const serviceItemId = Number(id);
  const serviceItem = await ensureServiceItemExists(serviceItemId);

  if (isActive) {
    await ensureActiveCategoryExists(serviceItem.categoryId);
  }

  const updatedServiceItem = await serviceItemRepository.updateServiceItem(serviceItemId, { isActive });
  return toServiceItemResource(updatedServiceItem);
};

module.exports = {
  createServiceItem,
  updateServiceItem,
  listServiceItems,
  getServiceItemDetail,
  updateServiceItemStatus
};
