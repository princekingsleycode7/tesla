const express = require('express');
const profileController = require('../../controllers/profileController');
const { requireAuth } = require('../../middleware/auth');
const { validateProfileUpdate, validateAvatarUpload } = require('../../middleware/validation');

const router = express.Router();

// All profile routes require authentication
router.use(requireAuth);

router.get('/', (req, res, next) => profileController.getProfile(req, res, next));
router.patch('/', validateProfileUpdate, (req, res, next) => profileController.updateProfile(req, res, next));
router.post('/avatar', validateAvatarUpload, (req, res, next) => profileController.updateAvatar(req, res, next));

module.exports = router;
