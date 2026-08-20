/**
 * Standardized API Response Utilities
 */

/**
 * Creates a standard successful API response object
 * @param {any} data - The payload
 * @param {object} [meta] - Optional pagination or metadata
 * @returns {object}
 */
function successResponse(data = {}, meta = undefined) {
  const response = {
    success: true,
    data
  };
  if (meta) {
    response.meta = meta;
  }
  return response;
}

/**
 * Creates a standard error API response object
 * @param {string} code - Machine-readable error code (e.g., 'NOT_FOUND', 'VALIDATION_ERROR')
 * @param {string} message - Human-readable error description
 * @param {any} [details] - Optional extra diagnostic details
 * @returns {object}
 */
function errorResponse(code, message, details = undefined) {
  const response = {
    success: false,
    error: {
      code: code || 'INTERNAL_ERROR',
      message: message || 'An unexpected error occurred'
    }
  };
  if (details && process.env.NODE_ENV !== 'production') {
    response.error.details = details;
  }
  return response;
}

module.exports = {
  successResponse,
  errorResponse
};
