const categoryRepository = require('./service-category.repository');
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

const parseForceFlag = (value) => value === true || value === 'true';

const shouldRestrictToActive = (user) => {
  return user && VIEW_ACTIVE_ONLY_ROLES.has(user.roleSlug);
};

const ensureCategoryExists = async (id, onlyActive = false) => {
  const category = await categoryRepository.findCategoryById(id, onlyActive);

  if (!category) {
    throw createHttpError(404, 'Service category not found');
  }

  return category;
};

const ensureUniqueCategorySlug = async (slug, excludeId) => {
  const existingCategory = await categoryRepository.findCategoryBySlug(slug, excludeId);

  if (existingCategory) {
    throw createHttpError(409, 'Service category slug already exists');
  }
};

const resolveCategorySlug = async ({ name, slug, excludeId }) => {
  const sourceSlug = slug ? slug : name;
  const normalizedSlug = generateSlug(sourceSlug);

  if (!normalizedSlug) {
    throw createHttpError(400, 'Valid service category slug is required');
  }

  if (slug) {
    await ensureUniqueCategorySlug(normalizedSlug, excludeId);
    return normalizedSlug;
  }

  return generateUniqueSlug(normalizedSlug, (slugValue) => {
    return categoryRepository.findCategoryBySlug(slugValue, excludeId);
  });
};

const createCategory = async ({ name, slug, description }) => {
  const normalizedName = name.trim();
  const normalizedSlug = await resolveCategorySlug({ name: normalizedName, slug });

  return categoryRepository.createCategory({
    name: normalizedName,
    slug: normalizedSlug,
    description: description ? description.trim() : null
  });
};

const updateCategory = async (id, { name, slug, description }) => {
  const categoryId = Number(id);
  await ensureCategoryExists(categoryId);

  const normalizedName = name.trim();
  const normalizedSlug = await resolveCategorySlug({ name: normalizedName, slug, excludeId: categoryId });

  return categoryRepository.updateCategory(categoryId, {
    name: normalizedName,
    slug: normalizedSlug,
    description: description ? description.trim() : null
  });
};

const listCategories = async (query, user) => {
  const page = parsePositiveInt(query.page, 1);
  const limit = parsePositiveInt(query.limit, 10);
  const search = query.search ? query.search.trim() : undefined;
  const isActive = shouldRestrictToActive(user) ? true : parseBooleanFilter(query.isActive);

  const { categories, total } = await categoryRepository.listCategories({
    page,
    limit,
    search,
    isActive
  });

  return {
    categories,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  };
};

const getCategoryDetail = async (id, user) => {
  return ensureCategoryExists(Number(id), shouldRestrictToActive(user));
};

const updateCategoryStatus = async (id, { isActive }, query = {}) => {
  const categoryId = Number(id);
  await ensureCategoryExists(categoryId);

  if (!isActive) {
    const activeServiceItemCount = await categoryRepository.countActiveServiceItems(categoryId);
    const force = parseForceFlag(query.force);

    if (activeServiceItemCount > 0 && !force) {
      throw createHttpError(
        409,
        'Service category has active service items. Pass force=true to deactivate category and its active service items'
      );
    }

    if (activeServiceItemCount > 0 && force) {
      return categoryRepository.deactivateCategoryAndItems(categoryId);
    }
  }

  return categoryRepository.updateCategory(categoryId, { isActive });
};

module.exports = {
  createCategory,
  updateCategory,
  listCategories,
  getCategoryDetail,
  updateCategoryStatus
};
