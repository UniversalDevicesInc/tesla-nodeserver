'use strict';

// In memory cache

const NodeCache = require( "node-cache" );
const responseCache = new NodeCache();

module.exports = function(Polyglot) {
  // Utility function provided to facilitate logging.
  const logger = Polyglot.logger;

  class Cache {

    getCache () {
//      logger('Cache has %s', responseCache.getStats().keys);
      return responseCache;
    }
  }

  return new Cache(); // singleton
};
