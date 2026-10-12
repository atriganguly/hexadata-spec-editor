const { join } = require('path');

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  // Ensures root `npm install` downloads Chrome inside the deployed project folder
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};