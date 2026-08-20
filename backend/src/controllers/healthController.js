const healthService = require('../services/healthService');
const { successResponse } = require('../utils/apiResponse');

/**
 * Health Controller
 * GET /api/v1/health
 */
async function getHealth(req, res, next) {
  try {
    const health = await healthService.getHealthStatus();
    
    // Return standard health response
    return res.status(200).json(
      successResponse({
        status: health.status
      })
    );
  } catch (error) {
    next(error);
  }
}

/**
 * Detailed Health Controller (for debugging / monitoring)
 * GET /api/v1/health/detailed
 */
async function getDetailedHealth(req, res, next) {
  try {
    const health = await healthService.getHealthStatus();
    return res.status(200).json(successResponse(health));
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getHealth,
  getDetailedHealth
};
