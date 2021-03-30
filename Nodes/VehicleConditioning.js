'use strict';

const AsyncLock = require('async-lock');
const lock = new AsyncLock({ timeout: 15000 });

// nodeDefId must match the nodedef in the profile
const nodeDefId = 'VEHICLECOND';

function delay(delay) {
  return new Promise(function(waitforit) {
    setTimeout(waitforit, delay);
  });
}

module.exports = function(Polyglot) {
  // Utility function provided to facilitate logging.
  const logger = Polyglot.logger;

  // This is your custom Node class
  class VehicleConditioning extends Polyglot.Node {

    // polyInterface: handle to the interface
    // primary: Same as address, if the node is a primary node
    // address: Your node address, without the leading 'n999_'
    // name: Your node name
    // id is the nodedefId
    constructor(polyInterface, primary, address, name, id) {
      super(nodeDefId, polyInterface, primary, address, name);

      this.tesla = require('../lib/tesla_v3.js')(Polyglot, polyInterface);

      // PGC supports setting the node hint when creating a node
      // REF: https://github.com/UniversalDevicesInc/hints
      // Must be a string in this format
      // If you don't care about the hint, just comment the line.
      this.hint = '0x01130101'; // See hints.yaml
      
      // Commands that this node can handle.
      // Should match the 'accepts' section of the nodedef.
      this.commands = {
        QUERY_NOW: this.queryNow, // Force a query now to update the status
        DON: this.onClimateOn, //  pre-heat or pre-cool the car
        DOF: this.onClimateOff, // stop pre-heat or pre-cool of the car
      };

      

      // Status that this node has.
      // Should match the 'sts' section of the nodedef.
      // Must all be strings
      this.drivers = {
          ST: { value: '', uom: 25 }, // Conditioning status
        GV19: { value: '', uom: 56 }, // Last updated unix timestamp
        GV20: { value: id, uom: 56 }, // ID used for the Tesla API
        ERR: { value: '', uom: 2 } // In error?
      };

    }

    // The id is stored in GV20
    vehicleId() {
      const gv20 = this.getDriver('GV20'); // id used for the API
      return gv20 ? gv20.value : null;
    }

    async pushedData (key, vehicleMessage) {
      const id = this.vehicleId();
      logger.debug('VehicleConditioning pushedData() received id %s, key %s', id, key);
      if (vehicleMessage && vehicleMessage.isy_nodedef) {
        logger.debug('VehicleConditioning pushedData() vehicleMessage.isy_nodedef %s, nodeDefId %s'
            , vehicleMessage.isy_nodedef, nodeDefId);
        if (key === id
            && vehicleMessage.isy_nodedef != nodeDefId) {
          // process the message for this vehicle sent from a different node.
          if (vehicleMessage.climate_state) {
            this.processDrivers(vehicleMessage.climate_state);
          } else {
            logger.error('API result for pushedData is incorrect: %o',
                vehicleMessage);
              this.setDriver('ERR', '1'); // Will be reported if changed
          }
        }
      }
    }

	  async onClimateOn() {
      try {
        const id = this.vehicleId();
        logger.info('CLIMATE_ON (%s)', this.address);
        await this.tesla.cmdHvacStart(id);
        await this.queryNow();
      } catch (err) {
        logger.errorStack(err, 'Error onClimateOn:');
      }
    }

	  async onClimateOff() {
      try {
        const id = this.vehicleId();
        logger.info('CLIMATE_OFF (%s)', this.address);
        await this.tesla.cmdHvacStop(id);
        await this.queryNow();
      } catch (err) {
        logger.errorStack(err, 'Error onClimateOff:');
      }
    }

    async queryNow() {
      await this.asyncQuery(true);
    }
    
    async query(ignored) {
      // This is overridden and does nothing because the only time
      // this will be called is on the long poll, and the long poll
      // refresh is done from the Vehicle node.
    }
    
    async asyncQuery(now) {
      const _this = this;
      if (now) {
        try {
          // Run query only one at a time
          logger.info('VehicleConditioning now');

          await lock.acquire('query', function() {
            return _this.queryVehicle(now);
          });
        } catch (err) {
          logger.error('VehicleConditioning Error while querying vehicle: %s', err.message);
        }
      } else {
        logger.info('VehicleConditioning SKIPPING POLL');
      }
    }

    async queryVehicleClimateStateRetry(id)
    {
      const MAX_RETRIES = 1;
      for (let i = 0; i <= MAX_RETRIES; i++) {
        try {
          await delay(3000); // Wait another 3 seconds before trying again.
          return { response: await this.tesla.getVehicleClimateState(id) };
        } catch (err) {
          logger.debug('VehicleConditioning.getVehicleClimateState Retrying %d %s', i, err);
        }
      }
      return {error: "Error timed out"};
    }

    async queryVehicle(longPoll) {
      const id = this.vehicleId();
      let climateData;
      try {
        climateData = {response: await this.tesla.getVehicleClimateState(id) }; 
      } catch (err) {
        if (longPoll) {
          // wake the car and try again
          logger.debug('VehicleClimate.getVehicleData Retrying %s', err);
          await this.tesla.wakeUp(id);
          climateData = await queryVehicleClimateStateRetry(id);
        } else {
          logger.info('API ERROR CAUGHT: %s', climateState);
          return 0;
        }
      }

      if (climateData && climateData.response) {
        this.processDrivers(climateData.response);
      } else if (climateData && climateData.error) {
        logger.error('API result for getVehicleClimateState is incorrect: %o',
            climateData.error);
        this.setDriver('ERR', '1'); // Will be reported if changed
      }
    }

    processDrivers(climateState) {
      logger.debug('VehicleConditioning processDrivers');
      // Gather basic vehicle climate data
      if (climateState) {
        logger.debug("is_auto_conditioning_on %s", climateState.is_auto_conditioning_on);
        this.setDriver('ST', climateState.is_auto_conditioning_on ? 255 : 0, false);

        const timestamp = Math.round((new Date().valueOf() / 1000)).toString();
        this.setDriver('GV19', timestamp, false);

        this.setDriver('ERR', '0', false);
        this.reportDrivers(); // Reports only changed values
      } else {
        logger.error('API result for getVehicleClimateState is incorrect: %o',
          climateData);
        this.setDriver('ERR', '1'); // Will be reported if changed
      }
    }
  }

  // Required so that the interface can find this Node class using the nodeDefId
  VehicleConditioning.nodeDefId = nodeDefId;

  return VehicleConditioning;
};
