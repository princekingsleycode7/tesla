const bcrypt = require('bcryptjs');

const BCRYPT_SALT_ROUNDS = 12;

/**
 * Hashes a plaintext password using bcrypt with strong salt rounds.
 * @param {string} plaintext
 * @returns {Promise<string>}
 */
async function hashPassword(plaintext) {
  if (!plaintext || typeof plaintext !== 'string') {
    throw new Error('Password string is required for hashing');
  }
  return bcrypt.hash(plaintext, BCRYPT_SALT_ROUNDS);
}

/**
 * Compares plaintext password against a stored bcrypt hash.
 * @param {string} plaintext
 * @param {string} hash
 * @returns {Promise<boolean>}
 */
async function comparePassword(plaintext, hash) {
  if (!plaintext || !hash) return false;
  return bcrypt.compare(plaintext, hash);
}

/**
 * Validates password strength policy:
 * - Minimum 8 characters
 * - Maximum 128 characters
 * - At least one letter (a-z or A-Z)
 * - At least one number (0-9)
 * - At least one special character
 * @param {string} password
 * @returns {{ valid: boolean, message?: string }}
 */
function validatePasswordStrength(password) {
  if (!password || typeof password !== 'string') {
    return { valid: false, message: 'Password is required and must be a string' };
  }

  if (password.length < 8) {
    return { valid: false, message: 'Password must be at least 8 characters long' };
  }

  if (password.length > 128) {
    return { valid: false, message: 'Password must not exceed 128 characters' };
  }

  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[^a-zA-Z0-9]/.test(password);

  if (!hasLetter || !hasNumber || !hasSpecial) {
    return {
      valid: false,
      message: 'Password must include at least one letter, one number, and one special character'
    };
  }

  return { valid: true };
}

module.exports = {
  hashPassword,
  comparePassword,
  validatePasswordStrength,
  BCRYPT_SALT_ROUNDS
};
