/**
 * Input validation middleware for authentication endpoints
 */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateRegister(req, res, next) {
  const { email, password, firstName, lastName } = req.body || {};

  if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'A valid email address is required'
      }
    });
  }

  if (!password || typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Password must be at least 8 characters long'
      }
    });
  }

  next();
}

function validateLogin(req, res, next) {
  const { email, password } = req.body || {};

  if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'A valid email address is required'
      }
    });
  }

  if (!password || typeof password !== 'string') {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Password is required'
      }
    });
  }

  next();
}

function validateForgotPassword(req, res, next) {
  const { email } = req.body || {};

  if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'A valid email address is required'
      }
    });
  }

  next();
}

function validateResetPassword(req, res, next) {
  const { token, newPassword } = req.body || {};

  if (!token || typeof token !== 'string') {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Password reset token is required'
      }
    });
  }

  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'New password must be at least 8 characters long'
      }
    });
  }

  next();
}

function validateChangePassword(req, res, next) {
  const { currentPassword, newPassword } = req.body || {};

  if (!currentPassword || typeof currentPassword !== 'string') {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Current password is required'
      }
    });
  }

  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'New password must be at least 8 characters long'
      }
    });
  }

  next();
}

function validateVerifyEmail(req, res, next) {
  const { token } = req.body || {};

  if (!token || typeof token !== 'string') {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Verification token is required'
      }
    });
  }

  next();
}

function validateProfileUpdate(req, res, next) {
  const body = req.body;

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request body must be a JSON object'
      }
    });
  }

  const stringFields = {
    firstName: 100,
    first_name: 100,
    lastName: 100,
    last_name: 100,
    phone: 50,
    country: 100,
    currency: 10,
    bio: 1000,
    addressLine1: 255,
    address_line1: 255,
    addressLine2: 255,
    address_line2: 255,
    city: 100,
    stateProvince: 100,
    state_province: 100,
    postalCode: 50,
    postal_code: 50,
    occupation: 100
  };

  for (const [field, maxLen] of Object.entries(stringFields)) {
    if (body[field] !== undefined && body[field] !== null) {
      if (typeof body[field] !== 'string') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: `Field '${field}' must be a string`
          }
        });
      }
      if (body[field].length > maxLen) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: `Field '${field}' exceeds maximum allowed length of ${maxLen} characters`
          }
        });
      }
    }
  }

  next();
}

function validateAvatarUpload(req, res, next) {
  const avatar = req.body?.avatarUrl || req.body?.avatar_url || req.body?.avatar;

  if (!avatar || typeof avatar !== 'string') {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Avatar payload (avatarUrl or base64 data URI) is required'
      }
    });
  }

  const trimmed = avatar.trim();
  const isDataUri = trimmed.startsWith('data:image/');
  const isHttpUrl = trimmed.startsWith('http://') || trimmed.startsWith('https://');

  if (!isDataUri && !isHttpUrl) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_AVATAR_FORMAT',
        message: 'Avatar must be an HTTP/HTTPS image URL or a valid image data URI'
      }
    });
  }

  // 5MB limit
  if (isDataUri && trimmed.length > 7 * 1024 * 1024) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'AVATAR_TOO_LARGE',
        message: 'Avatar image exceeds the 5MB size limit'
      }
    });
  }

  next();
}

function validateSettingsUpdate(req, res, next) {
  const body = req.body;

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request body must be a JSON object'
      }
    });
  }

  const theme = body.preferences?.theme || body.theme;
  if (theme !== undefined && !['dark', 'light', 'system'].includes(theme)) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_THEME',
        message: "Theme must be one of: 'dark', 'light', 'system'"
      }
    });
  }

  const timeout = body.security?.sessionTimeoutMinutes !== undefined ? body.security.sessionTimeoutMinutes : (body.session_timeout_minutes !== undefined ? body.session_timeout_minutes : body.sessionTimeoutMinutes);
  if (timeout !== undefined) {
    const num = Number(timeout);
    if (isNaN(num) || num < 5 || num > 1440) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_SETTING_VALUE',
          message: 'Session timeout must be between 5 and 1440 minutes'
        }
      });
    }
  }

  next();
}

function validateInvestmentCreation(req, res, next) {
  const body = req.body || {};
  const targetPlan = body.planId || body.plan_id || body.slug;
  const amount = body.amount;

  if (!targetPlan || typeof targetPlan !== 'string' || !targetPlan.trim()) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Plan ID or slug is required'
      }
    });
  }

  if (amount === undefined || amount === null) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Investment amount is required'
      }
    });
  }

  const numAmount = typeof amount === 'string' ? parseFloat(amount) : Number(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_AMOUNT',
        message: 'Investment amount must be a positive number'
      }
    });
  }

  next();
}

function validatePaymentInitialization(req, res, next) {
  const body = req.body || {};
  const amount = body.amount;

  if (amount === undefined || amount === null) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Payment amount is required'
      }
    });
  }

  const numAmount = typeof amount === 'string' ? parseFloat(amount) : Number(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_AMOUNT',
        message: 'Payment amount must be a positive number'
      }
    });
  }

  if (body.currency && typeof body.currency !== 'string') {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Currency must be a string'
      }
    });
  }

  next();
}

module.exports = {
  validateRegister,
  validateLogin,
  validateForgotPassword,
  validateResetPassword,
  validateChangePassword,
  validateVerifyEmail,
  validateProfileUpdate,
  validateAvatarUpload,
  validateSettingsUpdate,
  validateInvestmentCreation,
  validatePaymentInitialization
};

