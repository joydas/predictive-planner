const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../config/jwt.config');

/**
 * Authenticate requests using the Authorization Bearer token header.
 * On success, attaches the decoded JWT payload to req.user.
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Authorization token missing or malformed' });
  }

  const token = authHeader.split(' ')[1];

  jwt.verify(token, jwtSecret, (err, payload) => {
    if (err) {
      return res.status(401).json({ message: 'Invalid or expired token' });
    }

    req.user = payload;
    next();
  });
}

/**
 * Authorize only users with the provided roles.
 * Example: authorizeRoles(['PM', 'ACCOUNT_MANAGER'])
 */
function authorizeRoles(allowedRoles = []) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Access forbidden for this role' });
    }

    next();
  };
}

module.exports = {
  authenticateToken,
  authorizeRoles,
};
