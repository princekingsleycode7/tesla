const profileService = require('../services/profileService');

/**
 * User Profile Controller
 */
class ProfileController {
  /**
   * GET /api/v1/profile
   */
  async getProfile(req, res, next) {
    try {
      const userId = req.user.id;
      const profile = await profileService.getProfile(userId);

      return res.status(200).json({
        success: true,
        data: {
          profile
        }
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * PATCH /api/v1/profile
   */
  async updateProfile(req, res, next) {
    try {
      const userId = req.user.id;
      const updates = req.body || {};
      const meta = {
        ipAddress: req.ip || req.connection?.remoteAddress,
        userAgent: req.headers['user-agent']
      };

      const updatedProfile = await profileService.updateProfile(userId, updates, meta);

      return res.status(200).json({
        success: true,
        data: {
          profile: updatedProfile
        }
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/profile/avatar
   */
  async updateAvatar(req, res, next) {
    try {
      const userId = req.user.id;
      const avatarData = req.body?.avatarUrl || req.body?.avatar_url || req.body?.avatar;
      const meta = {
        ipAddress: req.ip || req.connection?.remoteAddress,
        userAgent: req.headers['user-agent']
      };

      const updatedProfile = await profileService.updateAvatar(userId, avatarData, meta);

      return res.status(200).json({
        success: true,
        data: {
          avatarUrl: updatedProfile.avatarUrl,
          profile: updatedProfile
        }
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new ProfileController();
