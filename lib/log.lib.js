/**
 * @fileOverview Provides a Bunyan logger.
 */
var bunyan = require('bunyan');
var fmt = require('bunyan-format');

var shouldLog = !!process.env.KAFKING_LOG_LEVEL;
var logLevel = process.env.KAFKING_LOG_LEVEL || 'info';
var noColors = !!process.env.KAFKING_LOG_NO_COLORS;

// default outstream mutes
var outStream = {
  write: function() {}
};

if (shouldLog) {
  outStream = fmt({
    outputMode: 'long',
    levelInString: true,
    color: !noColors,
  });
}

/**
 * Create a singleton bunyan logger and expose it.
 */
var logger = module.exports = bunyan.createLogger({
  name: 'Kafking',
  level: logLevel,
  stream: outStream,
});

/**
 * Get a child logger with a relative path to the provided full module path.
 *
 * Usage: var log = require('./util/logger').getChild(__filename);
 *
 * @param {string} modulePath The full modulepath.
 * @return {bunyan.Child} A child logger to use.
 */
logger.getChild = function(modulePath) {
  var cleanModulePath = modulePath.split('kafking/lib').pop();

  return logger.child({module: cleanModulePath});
};
