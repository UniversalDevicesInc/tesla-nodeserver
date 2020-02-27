'use strict';
// This is the Wake node for the vehicle.
// This node can be set in the "wake" mode which updates on the short poll.
// The other nodes are updated by calling the controller node on the short poll when queryVehicle() is called here.

const AsyncLock = require('async-lock');
const lock = new AsyncLock({ timeout: 10000 });

// nodeDefId must match the nodedef in the profile
const nodeDefId = 'VEHICLEWAKEMODE';

const customLoggingLevel = 'Custom Logging Level';
const validLoggingLevels = ['error', 'warn', 'info', 'verbose', 'debug'];

function delay(delay) {
  return new Promise(function(waitforit) {
    setTimeout(waitforit, delay);
  });
}

module.exports = function(Polyglot) {
  // Utility function provided to facilitate logging.
  const logger = Polyglot.logger;

  // This is your custom Node class
  class VehicleWakeMode extends Polyglot.Node {

    // polyInterface: handle to the interface
    // primary: Same as address, if the node is a primary node
    // address: Your node address, without the leading 'n999_'
    // name: Your node name
    // id is the nodedefId
    constructor(polyInterface, primary, address, name, id) {
      super(nodeDefId, polyInterface, primary, address, name);

      this.tesla = require('../lib/tesla.js')(Polyglot, polyInterface);

      // PGC supports setting the node hint when creating a node
      // REF: https://github.com/UniversalDevicesInc/hints
      // Must be a string in this format
      // If you don't care about the hint, just comment the line.
      this.hint = '0x01130101'; // See hints.yaml
      
      // Commands that this node can handle.
      // Should match the 'accepts' section of the nodedef.
      this.commands = {
        WAKE_MODE: this.onWake, // monitor on the short poll - may keep the car awake.
        QUERY_NOW: this.queryNow, // Force a query now to update the status
      };

      

      // Status that this node has.
      // Should match the 'sts' section of the nodedef.
      // Must all be strings
      this.drivers = {
          ST: { value: '', uom: 78 }, // wake mode polling status
       AWAKE: { value: '', uom: 25 }, // vehicle status as reported by vehicle
        GV19: { value: '', uom: 56 }, // Last updated unix timestamp
        GV20: { value: id, uom: 56 }, // ID used for the Tesla API
        ERR: { value: '', uom: 2 } // In error?
      };

      this.let_sleep = true; // this will be used to disable short polling

      this.last_wake_time = 0;  //  epoch time of last wake.
    }

    // The id is stored in GV20
    vehicleId() {
      const gv20 = this.getDriver('GV20'); // id used for the API
      return gv20 ? gv20.value : null;
    }

    async onWake(message) {
      const id = this.vehicleId();
      logger.info('WAKE (%s) %s', this.address, message.value);

      const decodeValue = message.value === '1' ? true : false;

      if (decodeValue) {
        this.let_sleep = false;
        this.last_wake_time = this.nowEpochToTheSecond();
        await this.tesla.wakeUp(id);
      } else {
        this.setLetSleep();
        this.reportDrivers(); // Reports only changed values
      }
    }
    
    nowEpochToTheSecond() {
      return Math.round((new Date().valueOf() / 1000));
    }

    setLetSleep() {
      logger.info('LET SLEEP (%s)', this.address);
      this.let_sleep = true;
      this.setDriver('ST', 0, true); // Set Wake Mode to false
    }

    async queryNow() {
      await this.query(true);
    }

    async query(longPoll) {
      try {
        const _this = this;
        // Run query only one at a time
        await lock.acquire('query', function() {
          _this.setDebugLevel(_this.polyInterface);
          _this.updateSleepStatus();
          if (!_this.let_sleep || longPoll) {
            return _this.queryVehicle(longPoll);
          } else {
            logger.info('SKIPPING POLL TO LET THE VEHICLE SLEEP - ISSUE WAKE CMD TO VEHICLE TO ENABLE SHORT POLLING');
            return _this.checkVehicleOnline();
          }
        });
      } catch (err) {
        logger.error('Error while querying vehicle: %s', err.stack);
      }
    }

    // Assume the app is allowing the vehicle to sleep, 
    // but we want to know if the vehicle has actually gone offline
    async checkVehicleOnline() {
      const id = this.vehicleId();
      const vehicleSummary = await this.tesla.getVehicle(id);
      if (vehicleSummary === 408) {
        this.setDriver('AWAKE', 3, true); // api not responding
        logger.info('API ERROR CAUGHT: %s', vehicleData);
        return 0;
      }

      if (vehicleSummary && vehicleSummary.response && vehicleSummary.response.state) {
        const vehicleState = vehicleSummary.response.state;
        if (vehicleState === 'asleep') {
          this.setDriver('AWAKE', 0, true); // car is asleep
        } else if (vehicleState === 'online') {
          this.setDriver('AWAKE', 1, true); // car is online
        } else if (vehicleState === 'offline') {
          this.setDriver('AWAKE', 2, true); // car is offline
        } else {
          logger.warn("VehicleWakeMode.checkVehicleOnline() unexpected state: %s", vehicleState);
        }
      }
    }

    updateOtherNodes(vehicleData) {
      logger.debug('VehicleWakeMode.updateOtherNodes(%s)', this.address);
      const controllerNode = this.polyInterface.getNode(this.primary);
      controllerNode.updateOtherNodes(this.address, this.vehicleId(), vehicleData);
    }

    setDebugLevel(polyInterface) {
      const config = polyInterface.getConfig();
      const params = config.customParams;
      let newLoggingLevel = '';
      if (customLoggingLevel in params) {
        newLoggingLevel = params[customLoggingLevel];
      }
      logger.debug('Configured logging level: %s', newLoggingLevel);
      if (validLoggingLevels.includes(newLoggingLevel)) {
        logger.debug('Found logging level');
        for (const transport of logger.transports) {
          logger.debug('Setting logging level: %s', newLoggingLevel);
          transport.level = newLoggingLevel;
        }
      } else {
        for (const transport of logger.transports) {
          logger.warn('Ignoring bad logging level.  Using: %s', transport.level);
        }
      }
    }

    // Check when the wake period expires, and then disable short polling.
    updateSleepStatus() {
      const longPoll = this.polyInterface.getConfig().longPoll;
      const now = this.nowEpochToTheSecond();
      if (now > (this.last_wake_time + longPoll)) {
        logger.debug("updateSleepStatus(%s): %s, nowEpochToTheSecond() %s", this.let_sleep, this.last_wake_time, now);
        this.setLetSleep();
      }
    }

    async asyncQuery(now) {
      const _this = this;
      if (now) {
        try {
          // Run query only one at a time
          logger.info('VehicleWakeMode now');

          await lock.acquire('query', function() {
            return _this.queryVehicle(now);
          });
        } catch (err) {
          logger.error('VehicleWakeMode Error while querying vehicle: %s', err.message);
        }
      } else {
        logger.info('VehicleWakeMode SKIPPING POLL');
      }

    }

    async queryVehicle(longPoll) {
      const id = this.vehicleId();
      let vehicleData = await this.tesla.getVehicleData(id);

      // check if Tesla is sleeping and sent an error code 408
      if (vehicleData === 408) {
        if (longPoll) {
          // wake the car and try again
          await this.tesla.wakeUp(id);
          await delay(3000); // Wait 3 seconds before trying again.
          vehicleData = await this.tesla.getVehicleData(id);
        }
      }
      if (vehicleData === 408) {
        this.setDriver('AWAKE', 3); // the car API is not responding
        this.setDriver('ERR', '1'); // Will be reported if changed
        logger.info('API ERROR CAUGHT: %s', vehicleData);
        return 0;
      }

      if (vehicleData && vehicleData.response) {
        this.processDrivers(vehicleData);
      } else {
        logger.error('API result for getVehicleData is incorrect: %o',
            vehicleMessage);
          this.setDriver('ERR', '1'); // Will be reported if changed
      }

    }

    processDrivers(vehicleData) {
      logger.debug('VehicleWakeMode processDrivers');
      // Gather basic vehicle climate data
      if (vehicleData && vehicleData.response) {

        // Forward the vehicleData to the other nodes so they also update.
        vehicleData.response.isy_nodedef = nodeDefId;
        this.updateOtherNodes(vehicleData);

        if (this.let_sleep) {
          this.setDriver('ST', 0); // wake mode off
        } else {
          this.setDriver('ST', 1);  // wake mode on
        }

        const timestamp = this.nowEpochToTheSecond().toString();
        this.setDriver('GV19', timestamp);

        this.setDriver('ERR', '0');
        this.reportDrivers(); // Reports only changed values
      } else {
        logger.error('API result for getVehicleData is incorrect: %o',
          climateData);
        this.setDriver('ERR', '1'); // Will be reported if changed
      }
    }
  }

  // Required so that the interface can find this Node class using the nodeDefId
  VehicleWakeMode.nodeDefId = nodeDefId;

  return VehicleWakeMode;
};
