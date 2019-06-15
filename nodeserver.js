'use strict';

trapUncaughExceptions();

const fs = require('fs');
const markdown = require('markdown').markdown;
const AsyncLock = require('async-lock');

// Loads the appropriate Polyglot interface module.
const Polyglot = useCloud() ?
  require('pgc_interface') : // Cloud Polyglot
  require('polyinterface'); // Polyglot V2 module (On-Premise)

const logger = Polyglot.logger;
const lock = new AsyncLock({ timeout: 500 });

const ControllerNode = require('./Nodes/ControllerNode.js')(Polyglot);
const Vehicle = require('./Nodes/Vehicle.js')(Polyglot);

// Must be the same as in tesla.js
const emailParam = 'Tesla account email';
const pwParam = 'Tesla account password';

// UI customParams (param:defaultValue)
const defaultParams = {
  [emailParam]: 'Tesla email',
  [pwParam]: 'password',
};

const controllerAddress = 'controller';

logger.info('-------------------------------------------------------');
logger.info('Starting Tesla Node Server');

// Create an instance of the Polyglot interface. We need pass all the node
// classes that we will be using.
const poly = new Polyglot.Interface([ControllerNode, Vehicle]);

// Tesla API interface module
// const tesla = require('./lib/tesla.js')(Polyglot, poly);

// Connected to MQTT, but config has not yet arrived.
poly.on('mqttConnected', function() {
  logger.info('MQTT Connection started');
});

// Config has been received
poly.on('config', function(config) {
  const nodesCount = Object.keys(config.nodes).length;
  logger.info('Config received has %d nodes', nodesCount);

  // logger.info('Received config: %o',
  //    Object.assign({}, config, { nodes: '<nodes>' }));

  // Important config options:
  // config.nodes: Our nodes, with the node class applied
  // config.customParams: Configuration parameters from the UI
  // config.newParamsDetected: Flag which tells us that customParams changed

  // If this is the first config after a node server restart
  if (config.isInitialConfig) {
    // Removes all existing notices on startup.
    poly.removeNoticesAll();

    // Uses options specific to Polyglot-V2 vs PGC
    if (poly.isCloud) {
      logger.info('Running nodeserver in the cloud');

      if (!nodesCount) {
        // Only required if using PGC
        logger.info('Sending profile files to ISY.');
        poly.updateProfile();
      }
    } else {
      logger.info('Running nodeserver on-premises');

      // Sets the configuration doc shown in the UI
      // Available in Polyglot V2 only
      const md = fs.readFileSync('./configdoc.md');
      poly.setCustomParamsDoc(markdown.toHTML(md.toString()));
    }

    // Sets the configuration fields in the UI
    initializeCustomParams(config.customParams);

    // If we have no nodes yet, we add the first node: a controller node which
    // holds the node server status and control buttons.
    if (!nodesCount) {
      // When Nodeserver is started for the first time, creation of the
      // controller fails if done too early.
      const createDelay = 5000;
      logger.info('Auto-creating controller in %s seconds', createDelay / 1000);
      setTimeout(function() {
        try {
          logger.info('Auto-creating controller');
          callAsync(autoCreateController());
        } catch (err) {
          logger.error('Error while auto-creating controller node:', err);
        }
      }, createDelay);
    } else {
      // Test code to remove the first node found

      // try {
      //   logger.info('Auto-deleting controller');
      //  callAsync(autoDeleteNode(config.nodes[Object.keys(config.nodes)[0]]));
      // } catch (err) {
      //   logger.error('Error while auto-deleting controller node');
      // }
    }
  } else {
    if (config.newParamsDetected) {
      logger.info('New parameters detected');
      const controllerNode = poly.getNode(controllerAddress);

      // Automatically try to discover vehicles if user changed his creds
      if (controllerNode &&
        nodesCount === 1 &&
        config.customParams[emailParam] &&
        /[^@]+@[^\.]+\..+/.test(config.customParams[emailParam]) &&
        config.customParams[emailParam] !== defaultParams [emailParam] &&
        config.customParams[pwParam] &&
        config.customParams[pwParam].length > 1 &&
        config.customParams[pwParam] !== defaultParams [pwParam]
      ) {
        controllerNode.onDiscover();
      }
    }
  }
});

// This is triggered every x seconds. Frequency is configured in the UI.
poly.on('poll', function(longPoll) {
  callAsync(doPoll(longPoll));
});

// Received a 'stop' message from Polyglot. This NodeServer is shutting down
poly.on('stop', async function() {
  logger.info('Graceful stop');

  // Make a last short poll and long poll
  await doPoll(false);
  // await doPoll(true); Long poll is not used.

  // Tell Interface we are stopping (Our polling is now finished)
  poly.stop();
});

// Received a 'delete' message from Polyglot. This NodeServer is being removed
poly.on('delete', function() {
  logger.info('Nodeserver is being deleted');

  // We can do some cleanup, then stop.
  poly.stop();
});

// MQTT connection ended
poly.on('mqttEnd', function() {
  logger.info('MQTT connection ended.'); // May be graceful or not.
});

// Triggered for every message received from polyglot.
// Can be used for troubleshooting.
poly.on('messageReceived', function(message) {
  // Only display messages other than config
  // if (!message['config']) {
  //   logger.debug('Message: %o', message);
  // }
});

// Triggered for every message received from polyglot.
// Can be used for troubleshooting.
// poly.on('messageSent', function(message) {
//   logger.debug('Message sent: %o', message);
// });

// This is being triggered based on the short and long poll parameters in the UI
async function doPoll(longPoll) {
  // Prevents polling logic reentry if an existing poll is underway
  try {
    await lock.acquire('poll', function() {
      logger.info('%s', longPoll ? 'Long poll' : 'Short poll');

      // We poll during short poll only. long polls are ignored.
      if (!longPoll) {
        const nodes = poly.getNodes();

        Object.keys(nodes).forEach(function(address) {
          if ('query' in nodes[address]) {
            nodes[address].query();
          }
        });
      }
    });
  } catch (err) {
    logger.error('Error while polling: %s', err.message);
  }
}

// Creates the controller node
async function autoCreateController() {
  try {
    await poly.addNode(
      new ControllerNode(poly,
        controllerAddress, controllerAddress, 'Tesla NodeServer')
    );

    // Add a notice in the UI
    poly.addNoticeTemp('newController', 'Controller node initialized', 5);

  } catch (err) {
    logger.error('Error creating controller node');

    // Add a notice in the UI, and leave it there
    poly.addNotice('newController', 'Error creating controller node');
  }
}


// Sets the custom params as we want them. Keeps existing params values.
function initializeCustomParams(currentParams) {
  const defaultParamKeys = Object.keys(defaultParams);
  const currentParamKeys = Object.keys(currentParams);

  // Get orphan keys from either currentParams or defaultParams
  const differentKeys = defaultParamKeys.concat(currentParamKeys)
  .filter(function(key) {
    return !(key in defaultParams) || !(key in currentParams);
  });

  if (differentKeys.length) {
    let customParams = {};

    // Only keeps params that exists in defaultParams
    // Sets the params to the existing value, or default value.
    defaultParamKeys.forEach(function(key) {
      customParams[key] = currentParams[key] ?
        currentParams[key] : defaultParams[key];
    });

    poly.saveCustomParams(customParams);
  }
}

// Call Async function from a non-async function without waiting for result
// and log the error if it fails
function callAsync(promise) {
  (async function() {
    try {
      await promise;
    } catch (err) {
      logger.error('Error with async function: %s',
        err.stack ? err.stack : err.message);
    }
  })();
}

function trapUncaughExceptions() {
  // If we get an uncaugthException...
  process.on('uncaughtException', function(err) {
    // Used in dev. Useful when logger is not yet defined.
    console.log('err', err);

    // avoid the edge case where an exception is thrown before the logger is available
    if ( !(typeof myval === 'undefined')) {
    	logger.error(`uncaughtException REPORT THIS!: ${err.stack}`);
    }
  });
}

function useCloud() {
  return process.env.MQTTENDPOINT && process.env.STAGE;
}

// Starts the NodeServer!
poly.start();
