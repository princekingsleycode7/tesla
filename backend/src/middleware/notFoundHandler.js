const { errorResponse } = require('../utils/apiResponse');

/**
 * 404 Not Found Handler
 */
function notFoundHandler(req, res, next) {
  // If requesting an API route, return structured JSON error
  if (req.originalUrl.startsWith('/api/')) {
    return res.status(404).json(
      errorResponse('NOT_FOUND', `Route ${req.method} ${req.originalUrl} not found`)
    );
  }

  // Otherwise pass to next or return 404
  return res.status(404).send('Page not found');
}

module.exports = notFoundHandler;
