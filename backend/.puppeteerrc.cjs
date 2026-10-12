const { join } = require('path');

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  // Instructs Puppeteer to store Chrome inside node_modules so Render bundles it into the deployment image
  cacheDirectory: join(__dirname, 'node_modules', '.cache', 'puppeteer'),
};