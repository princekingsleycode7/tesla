const settingsService = require('../services/settingsService');

/**
 * User Settings Controller
 */
class SettingsController {
  /**
   * GET /api/v1/settings
   */
  async getSettings(req, res, next) {
    try {
      const userId = req.user.id;
      const settings = await settingsService.getSettings(userId);

      return res.status(200).json({
        success: true,
        data: {
          settings
        }
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * PATCH /api/v1/settings
   */
  async updateSettings(req, res, next) {
    try {
      const userId = req.user.id;
      const updates = req.body || {};
      const meta = {
        ipAddress: req.ip || req.connection?.remoteAddress,
        userAgent: req.headers['user-agent']
      };

      const updatedSettings = await settingsService.updateSettings(userId, updates, meta);

      return res.status(200).json({
        success: true,
        data: {
          settings: updatedSettings
        }
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new SettingsController();
