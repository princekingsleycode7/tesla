const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { env } = require('../config/env');

/**
 * Computes a SHA-256 hex hash of a raw token for secure database storage.
 * @param {string} token
 * @returns {string}
 */
function hashToken(token) {
  if (!token) return '';
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Generates a cryptographically random hex token.
 * @param {number} [bytes=32]
 * @returns {string}
 */
function generateRandomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Generates a signed JWT for authentication with unique jti.
 * @param {object} payload
 * @param {object} [options={}]
 * @returns {string}
 */
function isValidTimespan(val) {
  if (typeof val === 'number') return !isNaN(val);
  if (typeof val === 'string') {
    return /^\d+\s*(s|m|h|d|w|y)?$/i.test(val.trim());
  }
  return false;
}

function generateAuthToken(payload = {}, options = {}) {
  const secret = (env && env.JWT_SECRET) ? env.JWT_SECRET : (process.env.JWT_SECRET || 'dev-default-secret-do-not-use-in-production');
  const cleanPayload = { ...payload };
  delete cleanPayload.exp;
  delete cleanPayload.iat;

  const { expiresIn: optExpiresIn, ...restOptions } = options || {};
  let rawExpires = optExpiresIn || (env && env.JWT_EXPIRES_IN) || process.env.JWT_EXPIRES_IN || '7d';

  if (!isValidTimespan(rawExpires)) {
    rawExpires = '7d';
  }

  const jti = crypto.randomUUID();
  return jwt.sign({ ...cleanPayload, jti }, secret, { expiresIn: rawExpires, ...restOptions });
}

/**
 * Verifies and decodes a JWT token.
 * @param {string} token
 * @returns {object}
 */
function verifyAuthToken(token) {
  const secret = env.JWT_SECRET;
  return jwt.verify(token, secret);
}

module.exports = {
  hashToken,
  generateRandomToken,
  generateAuthToken,
  verifyAuthToken
};
