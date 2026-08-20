const logger = require('../utils/logger');
const { errorResponse } = require('../utils/apiResponse');

/**
 * Central Express Error Handling Middleware
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || err.status || 500;
  const errorCode = err.code || (statusCode >= 500 ? 'INTERNAL_SERVER_ERROR' : 'BAD_REQUEST');
  const errorMessage = err.message || 'An unexpected server error occurred';

  logger.error('Unhandled Application Error', {
    code: errorCode,
    statusCode,
    message: errorMessage,
    path: req.originalUrl,
    method: req.method,
    stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined
  });

  const responseBody = errorResponse(
    errorCode,
    errorMessage,
    process.env.NODE_ENV !== 'production' ? { stack: err.stack } : undefined
  );

  res.status(statusCode).json(responseBody);
}

module.exports = errorHandler;
