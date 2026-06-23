const bcrypt = require('bcryptjs');

const prisma = require('../../config/db');
const userRepository = require('./user.repository');
const { generateUniqueCode, CODE_CONFIG } = require('../../common/utils/code.util');

const DEFAULT_USER_PASSWORD = 'Admin@123';
const ADMIN_ROLE_SLUGS = new Set(['admin', 'super_admin']);
const MANAGING_DIRECTOR_ROLE = 'managing_director';
const MD_BLOCKED_ROLE_SLUGS = new Set(['admin', 'super_admin', 'managing_director']);
const MD_ALLOWED_ROLE_SLUGS = new Set([
  'gate_security',
  'gatekeeper',
  'crm_team',
  'floor_supervisor',
  'body_shop_supervisor',
  'water_wash_team',
  'manager'
]);
const LOCATION_REQUIRED_ROLE_SLUGS = new Set([
  'managing_director',
  'gate_security',
  'gatekeeper',
  'crm_team',
  'floor_supervisor',
  'body_shop_supervisor',
  'water_wash_team',
  'manager'
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

const normalizeRoleSlug = (slug) => String(slug || '').trim().toLowerCase().replace(/-/g, '_');

const isAdminRole = (roleSlug) => ADMIN_ROLE_SLUGS.has(normalizeRoleSlug(roleSlug));

const isManagingDirector = (user) => normalizeRoleSlug(user && user.roleSlug) === MANAGING_DIRECTOR_ROLE;

const parseOptionalPositiveInt = (value) => {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : NaN;
};

const toPublicUser = (user) => ({
  id: user.id,
  fullName: user.fullName,
  email: user.emailId,
  mobile: user.mobileNo,
  employeeCode: user.employeeCode,
  locationId: user.locationId,
  isActive: user.isActive,
  role: {
    id: user.role.id,
    name: user.role.name,
    slug: user.role.slug
  }
});

const hashPassword = (password) => {
  return bcrypt.hash(password, 12);
};

const ensureUserExists = async (id) => {
  const user = await userRepository.findUserById(id);

  if (!user) {
    throw createHttpError(404, 'User not found');
  }

  return user;
};

const ensureRoleExists = async (roleId) => {
  const role = await userRepository.findRoleById(roleId);

  if (!role || !role.isActive) {
    throw createHttpError(400, 'roleId must reference an existing role');
  }

  return role;
};

const ensureActiveLocationExists = async (locationId) => {
  const location = await userRepository.findActiveLocationById(locationId);

  if (!location) {
    throw createHttpError(400, 'Invalid or inactive location');
  }

  return location;
};

const resolveLocationForRole = async ({ actor, targetRole, requestedLocationId, currentLocationId }) => {
  const targetRoleSlug = normalizeRoleSlug(targetRole.slug);
  const parsedRequestedLocationId = parseOptionalPositiveInt(requestedLocationId);

  if (Number.isNaN(parsedRequestedLocationId)) {
    throw createHttpError(400, 'Invalid or inactive location');
  }

  if (isAdminRole(actor.roleSlug)) {
    const nextLocationId = parsedRequestedLocationId || currentLocationId || null;

    if (LOCATION_REQUIRED_ROLE_SLUGS.has(targetRoleSlug) && !nextLocationId) {
      throw createHttpError(400, 'Location is required for this role');
    }

    if (nextLocationId) {
      await ensureActiveLocationExists(nextLocationId);
    }

    return nextLocationId;
  }

  if (isManagingDirector(actor)) {
    if (!actor.locationId) {
      throw createHttpError(400, 'Managing Director is not assigned to any location');
    }

    if (parsedRequestedLocationId && parsedRequestedLocationId !== Number(actor.locationId)) {
      throw createHttpError(403, 'You cannot create users for another location');
    }

    return Number(actor.locationId);
  }

  throw createHttpError(403, 'You do not have permission to manage this role');
};

const assertActorCanManageRole = (actor, targetRole) => {
  const targetRoleSlug = normalizeRoleSlug(targetRole.slug);

  if (isAdminRole(actor.roleSlug)) {
    return;
  }

  if (isManagingDirector(actor)) {
    if (MD_BLOCKED_ROLE_SLUGS.has(targetRoleSlug) || !MD_ALLOWED_ROLE_SLUGS.has(targetRoleSlug)) {
      throw createHttpError(403, 'You do not have permission to manage this role');
    }

    return;
  }

  throw createHttpError(403, 'You do not have permission to manage this role');
};

const assertMdCanAccessUser = (actor, targetUser) => {
  if (!isManagingDirector(actor)) {
    return;
  }

  if (!actor.locationId) {
    throw createHttpError(400, 'Managing Director is not assigned to any location');
  }

  if (targetUser.locationId !== Number(actor.locationId)) {
    throw createHttpError(403, 'You can access only users from your assigned location');
  }

  if (MD_BLOCKED_ROLE_SLUGS.has(normalizeRoleSlug(targetUser.role.slug))) {
    throw createHttpError(403, 'You do not have permission to manage this role');
  }
};

const ensureUniqueEmail = async (email, excludeId) => {
  const existingUser = await userRepository.findUserByEmail(email, excludeId);

  if (existingUser) {
    throw createHttpError(409, 'Email already exists');
  }
};

const ensureUniqueEmployeeCode = async (employeeCode, excludeId) => {
  if (!employeeCode) {
    return;
  }

  const existingUser = await userRepository.findUserByEmployeeCode(employeeCode, excludeId);

  if (existingUser) {
    throw createHttpError(409, 'Employee code already exists');
  }
};

const assertNotRemovingLastActiveAdmin = async ({ currentUser, nextRoleId, nextIsActive }) => {
  const isCurrentActiveAdmin = currentUser.isActive && isAdminRole(currentUser.role.slug);

  if (!isCurrentActiveAdmin) {
    return;
  }

  const nextRole = nextRoleId && nextRoleId !== currentUser.roleId
    ? await ensureRoleExists(nextRoleId)
    : currentUser.role;

  const remainsActiveAdmin = nextIsActive !== false && isAdminRole(nextRole.slug);

  if (remainsActiveAdmin) {
    return;
  }

  const activeAdminCount = await userRepository.countActiveAdmins();

  if (activeAdminCount <= 1) {
    throw createHttpError(400, 'Cannot deactivate or remove the last active admin user');
  }
};

const createUser = async ({ fullName, email, mobile, employeeCode, roleId, password, locationId }, actor) => {
  const normalizedEmail = email.trim();
  let normalizedEmployeeCode = employeeCode ? employeeCode.trim() : null;
  const parsedRoleId = Number(roleId);
  const initialPassword = typeof password === 'string' && password.trim() ? password : DEFAULT_USER_PASSWORD;

  const role = await ensureRoleExists(parsedRoleId);
  assertActorCanManageRole(actor, role);
  const resolvedLocationId = await resolveLocationForRole({
    actor,
    targetRole: role,
    requestedLocationId: locationId
  });
  await ensureUniqueEmail(normalizedEmail);

  if (!normalizedEmployeeCode) {
    const latestUser = await userRepository.findLatestEmployeeCode();
    normalizedEmployeeCode = await generateUniqueCode({
      prefix: CODE_CONFIG.employee.prefix,
      latestCode: latestUser?.employeeCode,
      existsCallback: async (code) => !!(await userRepository.findUserByEmployeeCode(code))
    });
  } else {
    await ensureUniqueEmployeeCode(normalizedEmployeeCode);
  }

  const passwordHash = await hashPassword(initialPassword);

  const user = await prisma.$transaction(async (tx) => {
    const createdUser = await tx.user.create({
      data: {
        fullName: fullName.trim(),
        emailId: normalizedEmail,
        mobileNo: mobile ? mobile.trim() : null,
        employeeCode: normalizedEmployeeCode,
        roleId: parsedRoleId,
        locationId: resolvedLocationId,
        passwordHash,
        createdById: actor.userId || null
      },
      select: {
        id: true,
        fullName: true,
        emailId: true,
        mobileNo: true,
        employeeCode: true,
        locationId: true,
        isActive: true,
        roleId: true,
        role: {
          select: {
            id: true,
            name: true,
            slug: true
          }
        }
      }
    });

    return createdUser;
  });

  return toPublicUser(user);
};

const updateUser = async (id, { fullName, email, mobile, employeeCode, roleId, locationId }, actor) => {
  const userId = Number(id);
  const parsedRoleId = Number(roleId);
  const normalizedEmail = email.trim();
  const normalizedEmployeeCode = employeeCode ? employeeCode.trim() : null;

  const currentUser = await ensureUserExists(userId);
  assertMdCanAccessUser(actor, currentUser);
  const role = await ensureRoleExists(parsedRoleId);
  assertActorCanManageRole(actor, role);
  await assertNotRemovingLastActiveAdmin({
    currentUser,
    nextRoleId: parsedRoleId,
    nextIsActive: currentUser.isActive
  });
  const resolvedLocationId = await resolveLocationForRole({
    actor,
    targetRole: role,
    requestedLocationId: locationId,
    currentLocationId: currentUser.locationId
  });
  await ensureUniqueEmail(normalizedEmail, userId);
  await ensureUniqueEmployeeCode(normalizedEmployeeCode, userId);

  const user = await prisma.$transaction(async (tx) => {
    const updatedUser = await tx.user.update({
      where: { id: userId },
      data: {
        fullName: fullName.trim(),
        emailId: normalizedEmail,
        mobileNo: mobile ? mobile.trim() : null,
        employeeCode: normalizedEmployeeCode,
        roleId: parsedRoleId,
        locationId: resolvedLocationId,
        modifiedById: actor.userId || null
      },
      select: {
        id: true,
        fullName: true,
        emailId: true,
        mobileNo: true,
        employeeCode: true,
        locationId: true,
        isActive: true,
        roleId: true,
        role: {
          select: {
            id: true,
            name: true,
            slug: true
          }
        }
      }
    });

    return updatedUser;
  });

  return toPublicUser(user);
};

const listUsers = async (query, actor) => {
  const page = parsePositiveInt(query.page, 1);
  const limit = parsePositiveInt(query.limit, 10);
  const search = query.search ? query.search.trim() : undefined;
  const roleId = query.roleId ? parsePositiveInt(query.roleId, undefined) : undefined;
  const requestedLocationId = query.locationId ? parsePositiveInt(query.locationId, undefined) : undefined;
  const locationId = isManagingDirector(actor) ? Number(actor.locationId) : requestedLocationId;
  const isActive = parseBooleanFilter(query.isActive);

  if (isManagingDirector(actor) && !actor.locationId) {
    throw createHttpError(400, 'Managing Director is not assigned to any location');
  }

  const { users, total } = await userRepository.listUsers({
    page,
    limit,
    search,
    roleId,
    locationId,
    isActive
  });

  return {
    users: users.map(toPublicUser),
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  };
};

const getUserDetail = async (id, actor) => {
  const user = await ensureUserExists(Number(id));
  if (isManagingDirector(actor) && user.locationId !== Number(actor.locationId)) {
    throw createHttpError(403, 'You can access only users from your assigned location');
  }

  return toPublicUser(user);
};

const updateUserStatus = async (id, { isActive }, actor) => {
  const userId = Number(id);
  const currentUser = await ensureUserExists(userId);
  assertMdCanAccessUser(actor, currentUser);

  await assertNotRemovingLastActiveAdmin({
    currentUser,
    nextRoleId: currentUser.roleId,
    nextIsActive: isActive
  });

  const user = await prisma.$transaction(async (tx) => {
    const updatedUser = await tx.user.update({
      where: { id: userId },
      data: {
        isActive,
        modifiedById: actor.userId || null
      },
      select: {
        id: true,
        fullName: true,
        emailId: true,
        mobileNo: true,
        employeeCode: true,
        locationId: true,
        isActive: true,
        roleId: true,
        role: {
          select: {
            id: true,
            name: true,
            slug: true
          }
        }
      }
    });

    return updatedUser;
  });

  return toPublicUser(user);
};

const resetUserPassword = async (id, { password }) => {
  const userId = Number(id);
  await ensureUserExists(userId);

  const passwordHash = await hashPassword(password);
  const user = await userRepository.updateUser(userId, { passwordHash });

  return toPublicUser(user);
};

module.exports = {
  createUser,
  updateUser,
  listUsers,
  getUserDetail,
  updateUserStatus,
  resetUserPassword
};
