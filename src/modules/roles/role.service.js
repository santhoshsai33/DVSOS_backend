const roleRepository = require('./role.repository');
const { generateSlug, generateUniqueSlug } = require('../../common/utils/slug.util');

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

const ensureRoleExists = async (id) => {
  const role = await roleRepository.findRoleById(id);

  if (!role) {
    throw createHttpError(404, 'Role not found');
  }

  return role;
};

const ensureUniqueRoleName = async (name, excludeId) => {
  const existingRole = await roleRepository.findRoleByName(name, excludeId);

  if (existingRole) {
    throw createHttpError(409, 'Role name already exists');
  }
};

const ensureUniqueRoleSlug = async (slug, excludeId) => {
  const existingRole = await roleRepository.findRoleBySlug(slug, excludeId);

  if (existingRole) {
    throw createHttpError(409, 'Role slug already exists');
  }
};

const resolveRoleSlug = async ({ name, slug, excludeId }) => {
  const sourceSlug = slug ? slug : name;
  const normalizedSlug = generateSlug(sourceSlug);

  if (!normalizedSlug) {
    throw createHttpError(400, 'Valid role slug is required');
  }

  if (slug) {
    await ensureUniqueRoleSlug(normalizedSlug, excludeId);
    return normalizedSlug;
  }

  return generateUniqueSlug(normalizedSlug, (slugValue) => {
    return roleRepository.findRoleBySlug(slugValue, excludeId);
  });
};

const createRole = async ({ name, slug, description }) => {
  const normalizedName = name.trim();
  const normalizedSlug = await resolveRoleSlug({ name: normalizedName, slug });

  await ensureUniqueRoleName(normalizedName);

  return roleRepository.createRole({
    name: normalizedName,
    slug: normalizedSlug,
    description: description ? description.trim() : null
  });
};

const updateRole = async (id, { name, slug, description }) => {
  const roleId = Number(id);
  await ensureRoleExists(roleId);

  const normalizedName = name.trim();
  const normalizedSlug = await resolveRoleSlug({ name: normalizedName, slug, excludeId: roleId });

  await ensureUniqueRoleName(normalizedName, roleId);

  return roleRepository.updateRole(roleId, {
    name: normalizedName,
    slug: normalizedSlug,
    description: description ? description.trim() : null
  });
};

const listRoles = async (query) => {
  const page = parsePositiveInt(query.page, 1);
  const limit = parsePositiveInt(query.limit, 10);
  const search = query.search ? query.search.trim() : undefined;
  const isActive = parseBooleanFilter(query.isActive);

  const { roles, total } = await roleRepository.listRoles({
    page,
    limit,
    search,
    isActive
  });

  return {
    roles,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  };
};

const getRoleDetail = async (id) => {
  return ensureRoleExists(Number(id));
};

const updateRoleStatus = async (id, { isActive }) => {
  const roleId = Number(id);
  await ensureRoleExists(roleId);

  return roleRepository.updateRole(roleId, { isActive });
};

module.exports = {
  createRole,
  updateRole,
  listRoles,
  getRoleDetail,
  updateRoleStatus
};
