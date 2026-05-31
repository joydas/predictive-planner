const mysql = require('mysql2');

const DEFAULT_DB_CONFIG = {
  host: 'localhost',
  port: 3306,
  user: 'root',
  password: '',
  database: 'predictive_planner_v2',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
};

const getFirstEnv = (...keys) => {
  for (const key of keys) {
    const value = process.env[key];
    if (value !== undefined && value !== '') {
      return value;
    }
  }
  return undefined;
};

const parseEnvNumber = (value, fallback) => {
  if (value === undefined || value === '') {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const DB_CONFIG = {
  host: getFirstEnv('DB_HOST', 'MYSQL_HOST') || DEFAULT_DB_CONFIG.host,
  port: parseEnvNumber(getFirstEnv('DB_PORT', 'MYSQL_PORT'), DEFAULT_DB_CONFIG.port),
  user: getFirstEnv('DB_USER', 'DB_USERNAME', 'MYSQL_USER') || DEFAULT_DB_CONFIG.user,
  password: getFirstEnv('DB_PASSWORD', 'MYSQL_PASSWORD') || DEFAULT_DB_CONFIG.password,
  database: getFirstEnv('DB_NAME', 'MYSQL_DATABASE') || DEFAULT_DB_CONFIG.database,
  waitForConnections: true,
  connectionLimit: parseEnvNumber(process.env.DB_CONNECTION_LIMIT, DEFAULT_DB_CONFIG.connectionLimit),
  queueLimit: parseEnvNumber(process.env.DB_QUEUE_LIMIT, DEFAULT_DB_CONFIG.queueLimit),
  dateStrings: ['DATE'],
};

const pool = mysql.createPool(DB_CONFIG);

module.exports = {
  pool,
  DB_CONFIG,
};
