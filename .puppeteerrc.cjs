const { join } = require('node:path');

/**
 * Puppeteer configuration (single source for local dev, Render and Docker).
 * Only the lean headless shell is downloaded: the PDF renderer never needs full Chrome.
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
  chrome: { skipDownload: true },
  'chrome-headless-shell': { skipDownload: false },
};
