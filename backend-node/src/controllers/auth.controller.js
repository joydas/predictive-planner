const authService = require('../services/auth.service');

async function login(req, res) {
  try {
    const body = req.body || {};
    const { email, password } = body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const result = await authService.login(email, password);
    return res.json(result);
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ message: error.message || 'Unable to process login' });
  }
}

module.exports = {
  login,
};
