const { verifyAuthToken, hashToken } = require('../utils/token');
const sessionRepository = require('../repositories/sessionRepository');
const userRepository = require('../repositories/userRepository');

/**
 * Authentication Middleware
 * Enforces valid bearer token, active session, and non-suspended user.
 */
async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication token is required in Authorization header'
        }
      });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Malformed authentication token'
        }
      });
    }

    // 1. Verify cryptographic JWT signature
    let decoded;
    try {
      decoded = verifyAuthToken(token);
    } catch (jwtErr) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: jwtErr.name === 'TokenExpiredError' ? 'Authentication token has expired' : 'Invalid authentication token'
        }
      });
    }

    // 2. Verify active session in database (prevent use of revoked tokens)
    const tokenDigest = hashToken(token);
    const session = await sessionRepository.findSessionByTokenHash(tokenDigest);

    if (!session || session.is_revoked) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'SESSION_REVOKED',
          message: 'Authentication session has been revoked or expired'
        }
      });
    }

    if (new Date(session.expires_at) < new Date()) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'SESSION_EXPIRED',
          message: 'Authentication session has expired'
        }
      });
    }

    // 3. Fetch user and verify account status
    const user = await userRepository.getUserWithProfile(decoded.userId);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'Account associated with token no longer exists'
        }
      });
    }

    if (user.status === 'SUSPENDED' || user.status === 'DEACTIVATED') {
      return res.status(403).json({
        success: false,
        error: {
          code: 'ACCOUNT_DISABLED',
          message: `Account is currently ${user.status.toLowerCase()}`
        }
      });
    }

    // Attach user & token context to request
    req.user = user;
    req.rawToken = token;
    req.session = session;

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Role-Based Access Control Middleware
 * @param {...string} roles - Permitted roles (e.g. 'ADMIN', 'OPERATOR')
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required for this resource'
        }
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'You do not have permission to access this resource'
        }
      });
    }

    next();
  };
}

/**
 * Optional Authentication Middleware (populates req.user if valid token present)
 */
async function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.split(' ')[1];
  if (!token) return next();

  try {
    const decoded = verifyAuthToken(token);
    const tokenDigest = hashToken(token);
    const session = await sessionRepository.findSessionByTokenHash(tokenDigest);

    if (session && !session.is_revoked && new Date(session.expires_at) >= new Date()) {
      const user = await userRepository.getUserWithProfile(decoded.userId);
      if (user && user.status === 'ACTIVE') {
        req.user = user;
        req.rawToken = token;
        req.session = session;
      }
    }
  } catch (e) {
    // Ignore invalid token for optional auth
  }

  next();
}

module.exports = {
  requireAuth,
  requireRole,
  optionalAuth
};
