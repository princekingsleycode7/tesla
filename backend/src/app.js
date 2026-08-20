const express = require('express');
const path = require('path');
const { securityHeaders, corsMiddleware, apiLimiter } = require('./middleware/security');
const requestLogger = require('./middleware/requestLogger');
const errorHandler = require('./middleware/errorHandler');
const notFoundHandler = require('./middleware/notFoundHandler');
const apiRoutes = require('./routes');

const app = express();

// Path to static assets and frontend landing page (project root)
const staticRoot = path.resolve(__dirname, '../../');

// 1. Global Security & Observability Middlewares
app.use(securityHeaders);
app.use(corsMiddleware);
app.use(requestLogger);

// 2. Body Parsers
app.use(express.json({
  limit: '10mb',
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 3. Serve Static Frontend Assets (Images, Videos, Favicons, Styles, Scripts)
app.use(express.static(staticRoot, {
  maxAge: '1d',
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.mp4')) {
      res.setHeader('Content-Type', 'video/mp4');
    }
  }
}));

// 4. Mount API Routes with Rate Limiting
app.use('/api', apiLimiter, apiRoutes);

// 5. Explicit HTML Page Routes for Preserving Existing Pages
app.get('/', (req, res) => {
  res.sendFile(path.join(staticRoot, 'index.html'));
});

app.get('/v2', (req, res) => {
  res.sendFile(path.join(staticRoot, 'v2.html'));
});

// 6. Handle 404s
app.use(notFoundHandler);

// 7. Centralized Error Handler
app.use(errorHandler);

module.exports = app;
