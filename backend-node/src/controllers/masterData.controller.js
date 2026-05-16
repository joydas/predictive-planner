const masterDataRepository = require('../repositories/masterData.repository');

async function getPlanningMasterData(req, res) {
  try {
    const data = await masterDataRepository.getPlanningMasterData();
    return res.json(data);
  } catch (error) {
    console.error('Planning master data retrieval failed:', error);
    return res.status(500).json({ message: 'Failed to load planning master data' });
  }
}

module.exports = {
  getPlanningMasterData,
};
