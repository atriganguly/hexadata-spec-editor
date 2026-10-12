const { join } = require('path');

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  // Points backend runtime to the root .cache directory
  cacheDirectory: join(__dirname, '..', '.cache', 'puppeteer'),
};