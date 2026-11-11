const app = require('./backend/server.js');

if (require.main === module) {
  app.startServer();
}

module.exports = app;
