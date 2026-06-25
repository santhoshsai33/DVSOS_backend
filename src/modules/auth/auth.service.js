const bcrypt = require('bcryptjs');

const env = require('../../config/env');
const jwt = require('jsonwebtoken');
const authRepository = require('./auth.repository');
const userRepository = require('../users/user.repository');
const { signToken, verifyToken } = require('../../utils/jwt');
const { getRedirectPath } = require('../../utils/redirectPath');
const { sendPasswordResetEmail } = require('../../utils/email');

const LOGIN_ERROR_MESSAGE = 'Invalid email or password';
const ADMIN_ROLE_SLUGS = new Set(['admin', 'super_admin']);
const LOCATION_REQUIRED_ROLE_SLUGS = new Set([
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

const normalizeRoleSlug = (slug) => String(slug || '').trim().toLowerCase().replace(/-/g, '_');

const roleRequiresLocation = (roleSlug) => {
  const normalizedRoleSlug = normalizeRoleSlug(roleSlug);
  return LOCATION_REQUIRED_ROLE_SLUGS.has(normalizedRoleSlug) && !ADMIN_ROLE_SLUGS.has(normalizedRoleSlug);
};

const toPublicUser = (user) => ({
  id: user.id,
  fullName: user.fullName,
  emailId: user.emailId,
  mobileNo: user.mobileNo,
  role: {
    id: user.role.id,
    name: user.role.name,
    slug: user.role.slug
  },
  locationId: user.locationId
});

const buildJwtPayload = (user) => ({
  userId: user.id,
  roleId: user.roleId,
  roleSlug: user.role.slug,
  locationId: user.locationId
});

const normalizeAuthErrorOptions = (options) => {
  if (typeof options === 'boolean') {
    return {
      genericLoginError: options,
      maskInactiveUser: options,
      maskInactiveRole: options
    };
  }

  const genericLoginError = Boolean(options?.genericLoginError);

  return {
    genericLoginError,
    maskInactiveUser: options?.maskInactiveUser ?? genericLoginError,
    maskInactiveRole: options?.maskInactiveRole ?? genericLoginError
  };
};

const assertUserCanAuthenticate = (user, options = false) => {
  const { genericLoginError, maskInactiveUser, maskInactiveRole } = normalizeAuthErrorOptions(options);

  if (!user || !user.role) {
    throw createHttpError(401, genericLoginError ? LOGIN_ERROR_MESSAGE : 'User not found');
  }

  if (!user.isActive) {
    throw createHttpError(403, maskInactiveUser ? LOGIN_ERROR_MESSAGE : 'User account is inactive');
  }

  if (!user.role.isActive) {
    throw createHttpError(403, maskInactiveRole ? LOGIN_ERROR_MESSAGE : 'User role is inactive');
  }
};

const comparePassword = (password, passwordHash) => {
  return bcrypt.compare(password, passwordHash);
};

const groupMenusByModule = (permissions) => {
  const groups = new Map();

  permissions
    .map((permission) => ({
      module: permission.menu.module,
      menuId: permission.menu.id,
      parentId: permission.menu.parentId,
      name: permission.menu.name,
      path: permission.menu.path,
      icon: permission.menu.icon,
      sequence: permission.menu.sequence,
      canRead: permission.canRead,
      canCreate: permission.canCreate,
      canUpdate: permission.canUpdate,
      canDelete: permission.canDelete
    }))
    .sort((a, b) => {
      return a.module.localeCompare(b.module) || a.sequence - b.sequence || a.name.localeCompare(b.name);
    })
    .forEach((menu) => {
      if (!groups.has(menu.module)) {
        groups.set(menu.module, []);
      }

      groups.get(menu.module).push(menu);
    });

  return Array.from(groups.entries()).map(([module, menus]) => ({
    module,
    menus
  }));
};

const getAllowedMenus = async (roleId) => {
  const permissions = await authRepository.findReadableMenusByRoleId(roleId);
  return groupMenusByModule(permissions);
};

const buildAuthResponse = async (user, includeToken = false) => {
  const menus = await getAllowedMenus(user.roleId);
  const authData = {
    user: toPublicUser(user),
    redirectPath: getRedirectPath(user.role.slug),
    menus
  };

  if (includeToken) {
    return {
      token: signToken(buildJwtPayload(user)),
      ...authData
    };
  }

  return authData;
};

const login = async ({ emailId, password }) => {
  const normalizedEmailId = emailId.trim();
  const user = await authRepository.findUserByEmailId(normalizedEmailId);

  assertUserCanAuthenticate(user, {
    genericLoginError: true,
    maskInactiveUser: false
  });

  const passwordMatches = await comparePassword(password, user.passwordHash);

  if (!passwordMatches) {
    throw createHttpError(401, LOGIN_ERROR_MESSAGE);
  }

  if (roleRequiresLocation(user.role.slug) && !user.locationId) {
    throw createHttpError(403, 'Location is required for this role');
  }

  await authRepository.updateLastLoginAt(user.id);

  return buildAuthResponse(user, true);
};

const getCurrentUser = async (userId) => {
  const user = await authRepository.findUserById(Number(userId));

  assertUserCanAuthenticate(user);

  if (roleRequiresLocation(user.role.slug) && !user.locationId) {
    throw createHttpError(403, 'Location is required for this role');
  }

  return buildAuthResponse(user, false);
};

const updateProfile = async (userId, data) => {
  const numericUserId = Number(userId);
  const user = await authRepository.findUserById(numericUserId);

  assertUserCanAuthenticate(user);

  const existingEmail = await userRepository.findUserByEmail(data.emailId, numericUserId);
  if (existingEmail) {
    throw createHttpError(400, 'Email already exists');
  }

  const updatedUser = await userRepository.updateUser(numericUserId, {
    fullName: data.fullName,
    emailId: data.emailId,
    mobileNo: data.mobileNo
  });

  return buildAuthResponse(updatedUser, false);
};

const forgotPassword = async (emailId) => {
  const normalizedEmailId = emailId.trim();
  const user = await authRepository.findUserByEmailId(normalizedEmailId);

  if (!user) {
    throw createHttpError(404, 'No account found with this email.');
  }

  const resetToken = jwt.sign(
    { userId: user.id },
    env.jwtSecret,
    { expiresIn: '15m' }
  );

  const resetLink = `${env.frontendUrl}/reset-password/${resetToken}`;

  await sendPasswordResetEmail(user.emailId, resetLink);
};

const resetPassword = async (token, newPassword) => {
  let payload;
  try {
    payload = verifyToken(token);
  } catch (err) {
    throw createHttpError(400, 'Invalid or expired reset token.');
  }

  const userId = payload.userId;
  const passwordHash = await bcrypt.hash(newPassword, 10);

  await authRepository.updatePassword(userId, passwordHash);
};

module.exports = {
  LOGIN_ERROR_MESSAGE,
  toPublicUser,
  buildJwtPayload,
  getAllowedMenus,
  login,
  getCurrentUser,
  updateProfile,
  forgotPassword,
  resetPassword
};
