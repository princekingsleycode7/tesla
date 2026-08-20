const express = require('express');
const authController = require('../../controllers/authController');
const { requireAuth } = require('../../middleware/auth');
const { authLimiter } = require('../../middleware/security');
const {
  validateRegister,
  validateLogin,
  validateForgotPassword,
  validateResetPassword,
  validateChangePassword,
  validateVerifyEmail
} = require('../../middleware/validation');

const router = express.Router();

// Apply auth rate limiting to authentication routes
router.use(authLimiter);

/**
 * @route   POST /api/v1/auth/register
 * @desc    Register a new investor or system user
 * @access  Public
 */
router.post('/register', validateRegister, (req, res, next) => authController.register(req, res, next));

/**
 * @route   POST /api/v1/auth/login
 * @desc    Log in user with email and password
 * @access  Public
 */
router.post('/login', validateLogin, (req, res, next) => authController.login(req, res, next));

/**
 * @route   POST /api/v1/auth/logout
 * @desc    Log out active session and revoke token
 * @access  Private
 */
router.post('/logout', requireAuth, (req, res, next) => authController.logout(req, res, next));

/**
 * @route   GET /api/v1/auth/me
 * @desc    Get currently authenticated user's profile
 * @access  Private
 */
router.get('/me', requireAuth, (req, res, next) => authController.getCurrentUser(req, res, next));

/**
 * @route   POST /api/v1/auth/forgot-password
 * @desc    Initiate password reset flow
 * @access  Public
 */
router.post('/forgot-password', validateForgotPassword, (req, res, next) => authController.forgotPassword(req, res, next));

/**
 * @route   POST /api/v1/auth/reset-password
 * @desc    Complete password reset with secure token
 * @access  Public
 */
router.post('/reset-password', validateResetPassword, (req, res, next) => authController.resetPassword(req, res, next));

/**
 * @route   POST /api/v1/auth/change-password
 * @desc    Change password for logged-in user
 * @access  Private
 */
router.post('/change-password', requireAuth, validateChangePassword, (req, res, next) => authController.changePassword(req, res, next));

/**
 * @route   POST /api/v1/auth/verify-email
 * @desc    Verify email address using verification token
 * @access  Public
 */
router.post('/verify-email', validateVerifyEmail, (req, res, next) => authController.verifyEmail(req, res, next));

module.exports = router;
