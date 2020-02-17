'use strict';

const AsyncLock = require('async-lock');
const lock = new AsyncLock({ timeout: 500 });

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

      this.tesla = require('../lib/tesla.js')(Polyglot, polyInterface);

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
          ST: { value: '', uom: 78 }, // Conditioning status
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
      if (vehicleMessage && vehicleMessage.response) {
        logger.debug('VehicleConditioning pushedData() vehicleMessage.response.isy_nodedef %s, nodeDefId %s'
            , vehicleMessage.response.isy_nodedef, nodeDefId);
        if (key === id
            && vehicleMessage.response.isy_nodedef != nodeDefId) {
          // process the message for this vehicle sent from a different node.
          if (vehicleMessage.response.climate_state) {
            this.processDrivers(vehicleMessage.response.climate_state);
          } else {
            logger.error('API result for pushedData is incorrect: %o',
                vehicleMessage);
              this.setDriver('ERR', '1'); // Will be reported if changed
          }
        }
      }
    }

	async onClimateOn() {
        const id = this.vehicleId();
        logger.info('CLIMATE_ON (%s)', this.address);
        await this.tesla.cmdHvacStart(id);
        await this.queryNow();
      }

	async onClimateOff() {
        const id = this.vehicleId();
        logger.info('CLIMATE_OFF (%s)', this.address);
        await this.tesla.cmdHvacStop(id);
        await this.queryNow();
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

    async queryVehicle(longPoll) {
      const id = this.vehicleId();
      let climateData = await this.tesla.getVehicleClimateState(id);

      // check if Tesla is sleeping and sent an error code 408
      if (climateData === 408) {
        if (longPoll) {
          // wake the car and try again
          await this.tesla.wakeUp(id);
          await delay(3000); // Wait 3 seconds before trying again.
          climateData = await this.tesla.getVehicleClimateState(id);
        }
      }
      if (climateData === 408) {
        logger.info('API ERROR CAUGHT: %s', climateData);
        return 0;
      }

      if (climateData && climateData.response) {
        this.processDrivers(climateData.response);
      } else {
        logger.error('API result for getVehicleClimateState is incorrect: %o',
            vehicleMessage);
          this.setDriver('ERR', '1'); // Will be reported if changed
      }

    }

    processDrivers(climateState) {
      logger.debug('VehicleConditioning processDrivers');
      // Gather basic vehicle climate data
      if (climateState) {
        logger.debug("is_auto_conditioning_on %s", climateState.is_auto_conditioning_on);
        this.setDriver('ST', climateState.is_auto_conditioning_on ? 100 : 0, false);

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
