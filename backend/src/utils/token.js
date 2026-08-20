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
function generateAuthToken(payload, options = {}) {
  const secret = env.JWT_SECRET;
  const expiresIn = options.expiresIn || env.JWT_EXPIRES_IN || '7d';
  const jti = crypto.randomUUID();
  return jwt.sign({ ...payload, jti }, secret, { expiresIn, ...options });
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
