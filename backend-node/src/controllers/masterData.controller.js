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

async function listIndustries(req, res) {
  try {
    const industries = await masterDataRepository.listIndustries();
    return res.json({ items: industries });
  } catch (error) {
    console.error('Industry master data retrieval failed:', error);
    return res.status(500).json({ message: 'Failed to load industries' });
  }
}

module.exports = {
  getPlanningMasterData,
  listIndustries,
};
