const backendPort = Number(process.env.PORT || 3000);

module.exports = {
  proxy: `http://localhost:${backendPort}`,
  port: Number(process.env.BROWSER_SYNC_PORT || backendPort + 1),
  files: ['frontend/public/**/*'],
  open: false
};
