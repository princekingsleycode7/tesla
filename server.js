const express = require('express');
const path = require('path');

const app = express();
const PORT = 3000;

// Serve static assets from the root directory
app.use(express.static(path.join(__dirname)));

// Route all other requests to index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
