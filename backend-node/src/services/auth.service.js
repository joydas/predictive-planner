const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const userRepository = require('../repositories/user.repository');
const { jwtSecret, jwtExpiresIn } = require('../config/jwt.config');

/**
 * Authenticate a user and build a JWT token.
 * Returns the token and normalized user payload.
 */
async function login(email, password) {
  if (!email || !password) {
    const error = new Error('Email and password are required');
    error.status = 400;
    throw error;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const user = await userRepository.findByEmail(normalizedEmail);

  if (!user || !user.activeFlag) {
    const error = new Error('Invalid credentials');
    error.status = 401;
    throw error;
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);

  if (!passwordMatches) {
    const error = new Error('Invalid credentials');
    error.status = 401;
    throw error;
  }

  const token = jwt.sign(
    {
      userId: user.userId,
      organizationId: user.organizationId,
      organizationName: user.organizationName,
      email: user.email,
      role: user.role,
    },
    jwtSecret,
    {
      expiresIn: jwtExpiresIn,
    }
  );

  return {
    token,
    user: {
      userId: user.userId,
      id: user.userId,
      organizationId: user.organizationId,
      organizationName: user.organizationName,
      userName: user.userName,
      name: user.userName,
      email: user.email,
      role: user.role,
    },
  };
}

/**
 * Hash a plain password for safe storage.
 * Use this helper when creating or seeding users.
 */
function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

module.exports = {
  login,
  hashPassword,
};
