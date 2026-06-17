const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const env = require('../../config/env');
const authRepository = require('./auth.repository');

const ROLE_REDIRECT_PATHS = {
  admin: '/admin',
  gate_security: '/gate-security',
  crm_team: '/crm',
  floor_supervisor: '/floor-supervisor',
  body_shop_supervisor: '/body-shop',
  water_wash_team: '/water-wash',
  manager: '/manager',
  managing_director: '/md',
  'gate-security': '/gate-security',
  'crm-team': '/crm',
  'floor-supervisor': '/floor-supervisor',
  'body-shop-supervisor': '/body-shop',
  'water-wash-team': '/water-wash',
  'managing-director': '/md'
};

const createHttpError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const toPublicUser = (user) => ({
  id: user.id,
  fullName: user.fullName,
  email: user.emailId,
  mobile: user.mobileNo,
  role: {
    id: user.role.id,
    name: user.role.name,
    slug: user.role.slug
  }
});

const buildJwtPayload = (user) => ({
  userId: user.id,
  roleId: user.role.id,
  roleSlug: user.role.slug,
  email: user.emailId
});

const generateToken = (user) => {
  return jwt.sign(buildJwtPayload(user), env.jwtSecret, {
    expiresIn: env.jwtExpiresIn
  });
};

const hashPassword = (password) => {
  return bcrypt.hash(password, 12);
};

const verifyPassword = (plainPassword, passwordHash) => {
  return bcrypt.compare(plainPassword, passwordHash);
};

const assertUserCanAuthenticate = (user) => {
  if (!user) {
    throw createHttpError(401, 'Invalid login credentials');
  }

  if (!user.isActive) {
    throw createHttpError(403, 'User account is inactive');
  }

  if (!user.role || !user.role.isActive) {
    throw createHttpError(403, 'User role is inactive');
  }
};

const login = async ({ identifier, password }) => {
  const normalizedIdentifier = identifier.trim();
  const user = await authRepository.findUserByIdentifier(normalizedIdentifier);

  assertUserCanAuthenticate(user);

  const passwordMatches = await verifyPassword(password, user.passwordHash);

  if (!passwordMatches) {
    throw createHttpError(401, 'Invalid login credentials');
  }

  await authRepository.updateLastLoginAt(user.id);

  const token = generateToken(user);

  return {
    token,
    user: toPublicUser(user),
    redirectPath: ROLE_REDIRECT_PATHS[user.role.slug] || '/'
  };
};

const getCurrentUser = async (userId) => {
  const user = await authRepository.findUserById(userId);

  assertUserCanAuthenticate(user);

  return toPublicUser(user);
};

module.exports = {
  ROLE_REDIRECT_PATHS,
  generateToken,
  hashPassword,
  verifyPassword,
  login,
  getCurrentUser
};
