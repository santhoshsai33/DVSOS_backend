const bcrypt = require('bcryptjs');

const authRepository = require('./auth.repository');
const { signToken } = require('../../utils/jwt');
const { getRedirectPath } = require('../../utils/redirectPath');

const LOGIN_ERROR_MESSAGE = 'Invalid email or password';

const createHttpError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const toPublicUser = (user) => ({
  id: user.id,
  fullName: user.fullName,
  emailId: user.emailId,
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

const assertUserCanAuthenticate = (user, genericLoginError = false) => {
  if (!user || !user.role) {
    throw createHttpError(401, genericLoginError ? LOGIN_ERROR_MESSAGE : 'User not found');
  }

  if (!user.isActive) {
    throw createHttpError(403, genericLoginError ? LOGIN_ERROR_MESSAGE : 'User account is inactive');
  }

  if (!user.role.isActive) {
    throw createHttpError(403, genericLoginError ? LOGIN_ERROR_MESSAGE : 'User role is inactive');
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

  assertUserCanAuthenticate(user, true);

  const passwordMatches = await comparePassword(password, user.passwordHash);

  if (!passwordMatches) {
    throw createHttpError(401, LOGIN_ERROR_MESSAGE);
  }

  await authRepository.updateLastLoginAt(user.id);

  return buildAuthResponse(user, true);
};

const getCurrentUser = async (userId) => {
  const user = await authRepository.findUserById(Number(userId));

  assertUserCanAuthenticate(user);

  return buildAuthResponse(user, false);
};

module.exports = {
  LOGIN_ERROR_MESSAGE,
  toPublicUser,
  buildJwtPayload,
  getAllowedMenus,
  login,
  getCurrentUser
};
