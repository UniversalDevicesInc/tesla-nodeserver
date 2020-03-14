'use strict';
// This is the charging node for the vehicle.

const AsyncLock = require('async-lock');
const lock = new AsyncLock({ timeout: 500 });

// nodeDefId must match the nodedef in the profile
const nodeDefId = 'VEHICLE';

function delay(delay) {
  return new Promise(function(waitforit) {
    setTimeout(waitforit, delay);
  });
}

module.exports = function(Polyglot) {
  // Utility function provided to facilitate logging.
  const logger = Polyglot.logger;

  // This is your custom Node class
  class Vehicle extends Polyglot.Node {

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
        DON: this.onDON, // Charge On, up to
        DOF: this.onDOF, // Charge off
        HORN: this.onHorn,
        FLASH: this.onFlash,
        CHARGE_SET_TO: this.onChargeSetTo,
        QUERY_NOW: this.queryNow, // Force a query now to update the status
      };

      

      // Status that this node has.
      // Should match the 'sts' section of the nodedef.
      // Must all be strings
      this.drivers = {
        ST: { value: '', uom: 51 }, // SOC%
//        GV1: { value: '', uom: 116 }, // Battery range (default mile, but UOM gathered from the vehicle)
        GV4: { value: '', uom: 2 }, // Charge enable request
        GV5: { value: '', uom: 25 }, // Charging state
        GV6: { value: '', uom: 2 }, // Fast charger present
        GV7: { value: '', uom: 51 }, // Charge limit SOC%
        CC: { value: '', uom: 1 }, // Charger actual current
        CV: { value: '', uom: 72 }, // Charger voltage
        CPW: { value: '', uom: 73 }, // Charger power
//        GV10: { value: '', uom: 116 }, // Odometer (default mile, but multi-editor supports kilometer too)
        GV19: { value: '', uom: 56 }, // Last updated unix timestamp
        GV20: { value: id, uom: 56 }, // ID used for the Tesla API
        ERR: { value: '', uom: 2 } // In error?
      };

      this.distance_uom = 'mi'; // defaults to miles. Pulls data from vehicle GUI to change to KM where appropriate.
      
    }

    async initializeUOM() {
      const id = this.vehicleId();
      let vehicleGuiSettings = await this.tesla.getVehicleGuiSettings(id);
      if (vehicleGuiSettings === 408) {
        logger.info('initializeUOM waking vehicle');
        await this.tesla.wakeUp(id);
        await delay(5000); // Wait 5 seconds before trying again.
        vehicleGuiSettings = await this.tesla.getVehicleGuiSettings(id);
      }
      this.vehicleUOM(vehicleGuiSettings.response);
      
      if (this.distance_uom === 'mi') {
        this.drivers.GV1 = { value: '', uom: 116 };
        this.drivers.GV10 = { value: '', uom: 116 };
      } else {
        this.drivers.GV1 = { value: '', uom: 83 };
        this.drivers.GV10 = { value: '', uom: 83 };
      }
      logger.info('Vehicle.initializeUOM() done');
    }

    // The id is stored in GV20
    vehicleId() {
      const gv20 = this.getDriver('GV20'); // id used for the API
      return gv20 ? gv20.value : null;
    }

    async onDON(message) {
      const id = this.vehicleId();

      logger.info('DON-Charge Start (%s): %s', this.address,
        message.value ? message.value : 'No value');

      if (message.value) {
        await this.tesla.cmdChargeLimitSetTo(id, message.value);
      }
      await this.tesla.cmdChargeStart(id);
      await this.queryNow();
    }

    async onDOF() {
      const id = this.vehicleId();
      logger.info('DOF-Charge Stop (%s)', this.address);
      await this.tesla.cmdChargeStop(id);
      await this.queryNow();
    }

    async pushedData (key, vehicleMessage) {
      const id = this.vehicleId();
      logger.debug('Vehicle pushedData() received id %s, key %s', id, key);
      if (vehicleMessage && vehicleMessage.response) {
        logger.debug('Vehicle pushedData() vehicleMessage.response.isy_nodedef %s, nodeDefId %s'
            , vehicleMessage.response.isy_nodedef, nodeDefId);
        if (key === id
            && vehicleMessage.response.isy_nodedef != nodeDefId) {
          // process the message for this vehicle sent from a different node.
          this.processDrivers(vehicleMessage);
        }
      } else {
        logger.error('API result for pushedData is incorrect: %o',
            vehicleMessage);
          this.setDriver('ERR', '1'); // Will be reported if changed
      }
    }

    async onHorn() {
      const id = this.vehicleId();
      logger.info('HORN (%s)', this.address);
      await this.tesla.cmdHonkHorn(id);
    }

    async onFlash() {
      const id = this.vehicleId();
      logger.info('FLASH (%s)', this.address);
      await this.tesla.cmdFlashLights(id);
    }

    async onChargeSetTo(message) {
        const id = this.vehicleId();

        logger.info('CHARGE_SET_TO (%s): %s', this.address,
          message.value ? message.value : 'No value');

        await this.tesla.cmdChargeLimitSetTo(id, message.value);
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
          logger.info('Vehicle now');

          await lock.acquire('query', function() {
            return _this.queryVehicle(now);
          });
        } catch (err) {
          logger.error('Vehicle Error while querying vehicle: %s', err.message);
        }
      } else {
        logger.info('Vehicle SKIPPING POLL');
      }

    }

    vehicleUOM(guisettings) {
	    // this will take the units set from the Tesla GUI in the vehicle
      // and we'll use that to match what is displayed by the nodeserver 
	    if (guisettings.gui_distance_units) {
	      if (guisettings.gui_distance_units.includes('mi')) {
	        this.distance_uom = 'mi';
	      } else {
	        this.distance_uom = 'km';
	      }
	      logger.info('Distance Units from vehicle: %s', this.distance_uom);
	    } else {
	      logger.error('GUI Distance Units missing from gui_settings');
	    }
	      
    }
    
    nowEpochToTheSecond() {
      return Math.round((new Date().valueOf() / 1000));
    }
    
    resolveChargingState(charging_state) {
      let chargingStateIndex;
      if (charging_state === 'Stopped') {
        chargingStateIndex = 0;
      } else if (charging_state === 'Disconnected') {
        chargingStateIndex = 1;
      } else if (charging_state === 'Charging') {
        chargingStateIndex = 2;
      } else if (charging_state === 'Complete') {
        chargingStateIndex = 3;
      } else {
        logger.warn('Unmatched charging state: %s', charging_state);
      }

      return chargingStateIndex;
    }

    async queryVehicle(longPoll) {
      logger.debug('Vehicle.queryVehicle(%s)', longPoll);
      const id = this.vehicleId();
      let vehicleData = await this.tesla.getVehicleData(id);

      // check if Tesla is sleeping and sent an error code 408
      if (vehicleData === 408) {
        if (longPoll) {
          // wake the car and try again
          await this.tesla.wakeUp(id);
          await delay(3000); // Wait 3 seconds before trying again.
          vehicleData = await this.tesla.getVehicleData(id);
          if (vehicleData === 408) {
            await delay(3000); // Wait another 3 seconds before trying again.
            vehicleData = await this.tesla.getVehicleData(id);
          }
        }
      }
      if (vehicleData === 408) {
        logger.info('API ERROR CAUGHT: %s', vehicleData);
        return 0;
      }

      if (vehicleData) {
        this.processDrivers(vehicleData);
      } else {
        logger.error('API result for getVehicleClimateState is incorrect: %o',
            vehicleMessage);
          this.setDriver('ERR', '1'); // Will be reported if changed
      }
		}

    processDrivers(vehicleData) {
      // Gather basic vehicle & charge state
      // (same as getVehicleData with less clutter)
      // let vehicleData = await this.tesla.getVehicle(id);
      // const chargeState = await this.tesla.getVehicleChargeState(id);
      // vehicleData.response.charge_state = chargeState.response;

      if (vehicleData && vehicleData.response &&
        vehicleData.response.charge_state &&
        vehicleData.response.vehicle_state &&
        vehicleData.response.gui_settings) {

        const chargeState = vehicleData.response.charge_state;
        const vehicleState = vehicleData.response.vehicle_state;

        this.vehicleUOM(vehicleData.response.gui_settings);

        this.setDriver('ST', chargeState.battery_level, false);

        // Battery range
        if (this.distance_uom === 'km') {
          this.setDriver('GV1', Math.round(parseFloat(chargeState.battery_range) * 1.609344).toString(), true, false, 8);
        } else {
          this.setDriver('GV1', Math.round(parseFloat(chargeState.battery_range)).toString(), true, false, 116);
        }

        this.setDriver('GV4', chargeState.charge_enable_request, false);
        this.setDriver('GV5', this.resolveChargingState(chargeState.charging_state), false);
        this.setDriver('GV6', chargeState.fast_charger_present, false);
        this.setDriver('GV7', chargeState.charge_limit_soc, false);
        this.setDriver('CC', chargeState.charger_actual_current, false);
        this.setDriver('CV', chargeState.charger_voltage, false);
        this.setDriver('CPW', chargeState.charger_power * 1000, false);

        // Odometer reading
        if (this.distance_uom === 'km') {
          this.setDriver('GV10', Math.round(parseFloat(vehicleState.odometer) * 1.609344).toString(), true, false, 8);
        } else {
          this.setDriver('GV10', Math.round(parseFloat(vehicleState.odometer)).toString(), true, false, 116);
        }

        const timestamp = this.nowEpochToTheSecond().toString();
        this.setDriver('GV19', timestamp, false);
        // GV20 is not updated. This is the id we use to find this vehicle.
        // It must be already correct.
        
        this.setDriver('ERR', '0', false);
        this.reportDrivers(); // Reports only changed values
      } else {

        logger.error('API result for getVehicleData is incorrect: %o',
          vehicleData);
        this.setDriver('ERR', '1'); // Will be reported if changed
      }
    }
  }

  // Required so that the interface can find this Node class using the nodeDefId
  Vehicle.nodeDefId = nodeDefId;

  return Vehicle;
};
