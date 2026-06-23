const bcrypt = require('bcryptjs');

const userRepository = require('./user.repository');

const DEFAULT_USER_PASSWORD = 'Admin@123';

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

const toPublicUser = (user) => ({
  id: user.id,
  fullName: user.fullName,
  email: user.emailId,
  mobile: user.mobileNo,
  employeeCode: user.employeeCode,
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

  if (!role) {
    throw createHttpError(400, 'roleId must reference an existing role');
  }

  return role;
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
  const isCurrentActiveAdmin = currentUser.isActive && currentUser.role.slug === 'admin';

  if (!isCurrentActiveAdmin) {
    return;
  }

  const nextRole = nextRoleId && nextRoleId !== currentUser.roleId
    ? await ensureRoleExists(nextRoleId)
    : currentUser.role;

  const remainsActiveAdmin = nextIsActive !== false && nextRole.slug === 'admin';

  if (remainsActiveAdmin) {
    return;
  }

  const activeAdminCount = await userRepository.countActiveAdmins();

  if (activeAdminCount <= 1) {
    throw createHttpError(400, 'Cannot deactivate or remove the last active admin user');
  }
};

const createUser = async ({ fullName, email, mobile, employeeCode, roleId, password }, createdById) => {
  const normalizedEmail = email.trim();
  const normalizedEmployeeCode = employeeCode ? employeeCode.trim() : null;
  const parsedRoleId = Number(roleId);
  const initialPassword = typeof password === 'string' && password.trim() ? password : DEFAULT_USER_PASSWORD;

  await ensureRoleExists(parsedRoleId);
  await ensureUniqueEmail(normalizedEmail);
  await ensureUniqueEmployeeCode(normalizedEmployeeCode);

  const passwordHash = await hashPassword(initialPassword);

  const user = await userRepository.createUser({
    fullName: fullName.trim(),
    emailId: normalizedEmail,
    mobileNo: mobile ? mobile.trim() : null,
    employeeCode: normalizedEmployeeCode,
    roleId: parsedRoleId,
    passwordHash,
    createdById: createdById || null
  });

  return toPublicUser(user);
};

const updateUser = async (id, { fullName, email, mobile, employeeCode, roleId }) => {
  const userId = Number(id);
  const parsedRoleId = Number(roleId);
  const normalizedEmail = email.trim();
  const normalizedEmployeeCode = employeeCode ? employeeCode.trim() : null;

  const currentUser = await ensureUserExists(userId);
  await ensureRoleExists(parsedRoleId);
  await assertNotRemovingLastActiveAdmin({
    currentUser,
    nextRoleId: parsedRoleId,
    nextIsActive: currentUser.isActive
  });
  await ensureUniqueEmail(normalizedEmail, userId);
  await ensureUniqueEmployeeCode(normalizedEmployeeCode, userId);

  const user = await userRepository.updateUser(userId, {
    fullName: fullName.trim(),
    emailId: normalizedEmail,
    mobileNo: mobile ? mobile.trim() : null,
    employeeCode: normalizedEmployeeCode,
    roleId: parsedRoleId
  });

  return toPublicUser(user);
};

const listUsers = async (query) => {
  const page = parsePositiveInt(query.page, 1);
  const limit = parsePositiveInt(query.limit, 10);
  const search = query.search ? query.search.trim() : undefined;
  const roleId = query.roleId ? parsePositiveInt(query.roleId, undefined) : undefined;
  const isActive = parseBooleanFilter(query.isActive);

  const { users, total } = await userRepository.listUsers({
    page,
    limit,
    search,
    roleId,
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

const getUserDetail = async (id) => {
  const user = await ensureUserExists(Number(id));

  return toPublicUser(user);
};

const updateUserStatus = async (id, { isActive }) => {
  const userId = Number(id);
  const currentUser = await ensureUserExists(userId);

  await assertNotRemovingLastActiveAdmin({
    currentUser,
    nextRoleId: currentUser.roleId,
    nextIsActive: isActive
  });

  const user = await userRepository.updateUser(userId, { isActive });

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
