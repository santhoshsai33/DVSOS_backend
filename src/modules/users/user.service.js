const bcrypt = require('bcryptjs');

const prisma = require('../../config/db');
const userRepository = require('./user.repository');
const { generateUniqueCode, CODE_CONFIG } = require('../../common/utils/code.util');
const { generateSlug, generateUniqueSlug } = require('../../common/utils/slug.util');

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

const hasLocationInput = (value) => value !== undefined;

const toPublicUser = (user) => ({
  id: user.id,
  slug: user.slug,
  fullName: user.fullName,
  email: user.emailId,
  mobile: user.mobileNo,
  employeeCode: user.employeeCode,
  locationId: user.locationId,
  location: user.location ? {
    id: user.location.id,
    locationCode: user.location.locationCode,
    locationName: user.location.locationName
  } : null,
  locationName: user.location ? user.location.locationName : null,
  isActive: user.isActive,
  role: {
    id: user.role.id,
    name: user.role.name,
    slug: user.role.slug
  },
  dob: user.dob,
  licenceNumber: user.licenceNumber,
  emergencyContact: user.emergencyContact,
  gender: user.gender,
  address: user.address,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
  lastLoginAt: user.lastLoginAt,
  lastLogin: user.lastLoginAt
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

const resolveUserByIdentifier = async (identifier) => {
  const parsedId = Number(identifier);
  const user = Number.isInteger(parsedId) && parsedId > 0
    ? await userRepository.findUserById(parsedId)
    : await userRepository.findUserBySlug(String(identifier || '').trim());

  if (!user) {
    throw createHttpError(404, 'User not found');
  }

  return user;
};

const resolveUserSlug = async (fullName, excludeId) => {
  const baseSlug = generateSlug(fullName);

  if (!baseSlug) {
    throw createHttpError(400, 'Valid user slug could not be generated from full name');
  }

  return generateUniqueSlug(baseSlug, async (slugValue) => {
    const existingUser = await userRepository.findUserBySlug(slugValue);
    return existingUser && existingUser.id !== excludeId;
  });
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
  const shouldUseRequestedLocation = hasLocationInput(requestedLocationId);

  if (Number.isNaN(parsedRequestedLocationId)) {
    throw createHttpError(400, 'Invalid or inactive location');
  }

  if (isAdminRole(actor.roleSlug)) {
    const nextLocationId = shouldUseRequestedLocation
      ? parsedRequestedLocationId
      : currentLocationId || null;

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
    if (MD_BLOCKED_ROLE_SLUGS.has(targetRoleSlug)) {
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

const ensureUniqueMobile = async (mobile, excludeId) => {
  if (!mobile) return;
  const existingUser = await userRepository.findUserByMobile(mobile, excludeId);

  if (existingUser) {
    throw createHttpError(409, 'Mobile number already exists');
  }
};

const ensureUniqueLicenceNumber = async (licenceNumber, excludeId) => {
  if (!licenceNumber) return;
  const existingUser = await userRepository.findUserByLicenceNumber(licenceNumber, excludeId);

  if (existingUser) {
    throw createHttpError(409, 'Licence number already exists');
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

const createUser = async ({ fullName, email, mobile, employeeCode, roleId, password, dob, licenceNumber, emergencyContact, gender, address, locationId }, actor) => {
  const normalizedEmail = email.trim();
  let normalizedEmployeeCode = employeeCode ? employeeCode.trim() : null;
  const parsedRoleId = Number(roleId);
  const initialPassword = typeof password === 'string' && password.trim() ? password : DEFAULT_USER_PASSWORD;

  const role = await ensureRoleExists(parsedRoleId);
  const normalizedFullName = fullName.trim();
  const normalizedSlug = await resolveUserSlug(normalizedFullName);
  assertActorCanManageRole(actor, role);
  const resolvedLocationId = await resolveLocationForRole({
    actor,
    targetRole: role,
    requestedLocationId: locationId
  });
  await ensureUniqueEmail(normalizedEmail);
  await ensureUniqueMobile(mobile ? mobile.trim() : null);
  await ensureUniqueLicenceNumber(licenceNumber ? licenceNumber.trim() : null);

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

  const user = await userRepository.createUser({
    fullName: normalizedFullName,
    slug: normalizedSlug,
    emailId: normalizedEmail,
    mobileNo: mobile ? mobile.trim() : null,
    employeeCode: normalizedEmployeeCode,
    roleId: parsedRoleId,
    locationId: resolvedLocationId,
    passwordHash,
    dob: dob ? new Date(dob) : null,
    licenceNumber: licenceNumber ? licenceNumber.trim() : null,
    emergencyContact: emergencyContact ? emergencyContact.trim() : null,
    gender: gender ? gender.trim() : null,
    address: address ? address.trim() : null,
    createdById: actor.userId || null
  });

  return toPublicUser(user);
};

const updateUser = async (id, { fullName, email, mobile, employeeCode, roleId, dob, licenceNumber, emergencyContact, gender, address, locationId }, actor) => {
  const parsedRoleId = Number(roleId);
  const normalizedEmail = email.trim();
  const normalizedEmployeeCode = employeeCode ? employeeCode.trim() : null;

  const currentUser = await resolveUserByIdentifier(id);
  const userId = currentUser.id;
  const normalizedFullName = fullName.trim();
  const normalizedSlug = await resolveUserSlug(normalizedFullName, userId);
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
  await ensureUniqueMobile(mobile ? mobile.trim() : null, userId);
  await ensureUniqueLicenceNumber(licenceNumber ? licenceNumber.trim() : null, userId);
  await ensureUniqueEmployeeCode(normalizedEmployeeCode, userId);

  const user = await userRepository.updateUser(userId, {
    fullName: normalizedFullName,
    slug: normalizedSlug,
    emailId: normalizedEmail,
    mobileNo: mobile ? mobile.trim() : null,
    employeeCode: normalizedEmployeeCode,
    roleId: parsedRoleId,
    locationId: resolvedLocationId,
    dob: dob ? new Date(dob) : null,
    licenceNumber: licenceNumber ? licenceNumber.trim() : null,
    emergencyContact: emergencyContact ? emergencyContact.trim() : null,
    gender: gender ? gender.trim() : null,
    address: address ? address.trim() : null
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
  const user = await resolveUserByIdentifier(id);
  assertMdCanAccessUser(actor, user);

  return toPublicUser(user);
};

const updateUserStatus = async (id, { isActive }, actor) => {
  const currentUser = await resolveUserByIdentifier(id);
  const userId = currentUser.id;
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
        slug: true,
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
        },
        location: {
          select: {
            id: true,
            locationCode: true,
            locationName: true
          }
        }
      }
    });

    return updatedUser;
  });

  return toPublicUser(user);
};

const resetUserPassword = async (id, { password }, actor) => {
  const currentUser = await resolveUserByIdentifier(id);
  const userId = currentUser.id;
  assertMdCanAccessUser(actor, currentUser);

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
