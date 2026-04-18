// Centralized frontend configuration for service URLs

export const NODE_API_URL = process.env.REACT_APP_NODE_API_URL || 'http://localhost:3001';
export const ML_API_URL = process.env.REACT_APP_ML_API_URL || 'http://localhost:5000';

const config = {
  NODE_API_URL,
  ML_API_URL,
};

export default config;
