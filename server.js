/**
 * Root Server Entry Point
 * Delegates to modular full-stack backend application
 */
const { startServer } = require('./backend/src/server');

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});

