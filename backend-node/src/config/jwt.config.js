const jwtSecret = process.env.JWT_SECRET || 'please_change_this_secret';
const jwtExpiresIn = process.env.JWT_EXPIRES_IN || '8h';

module.exports = {
  jwtSecret,
  jwtExpiresIn,
};
