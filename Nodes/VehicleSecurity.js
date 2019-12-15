'use strict';

const AsyncLock = require('async-lock');
const lock = new AsyncLock({ timeout: 2000 });

//Must be the same in nodeserver.js
const enableSecurityCommandsParam = 'Enable Security Commands';

// nodeDefId must match the nodedef in the profile
const nodeDefId = 'VEHSEC';

function delay(delay) {
  return new Promise(function(waitforit) {
    setTimeout(waitforit, delay);
  });
}

module.exports = function(Polyglot) {
  // Utility function provided to facilitate logging.
  const logger = Polyglot.logger;

  // This is your custom Node class
  class VehicleSecurity extends Polyglot.Node {

    // polyInterface: handle to the interface
    // primary: Same as address, if the node is a primary node
    // address: Your node address, without the leading 'n999_'
    // name: Your node name
    // id is the nodedefId
    constructor(polyInterface, primary, address, name, id) {
      super(nodeDefId, polyInterface, primary, address, name);

      this.tesla = require('../lib/tesla.js')(Polyglot, polyInterface);

      this.cache = require('../lib/Cache.js')(Polyglot);
      this.cache.getCache().on("set", async ( key, value ) => {
        this.pushedData(key, value);
      });


      // PGC supports setting the node hint when creating a node
      // REF: https://github.com/UniversalDevicesInc/hints
      // Must be a string in this format
      // If you don't care about the hint, just comment the line.
      this.hint = '0x01130101'; // See hints.yaml
      
      // Commands that this node can handle.
      // Should match the 'accepts' section of the nodedef.
      this.commands = {
        QUERY_NOW: this.queryNow, // force a query now to update the status.
        LOCK: this.onLock,
        UNLOCK: this.onUnlock,
        SUNROOF_OPEN: this.onSunroofOpen,
        SUNROOF_CLOSE: this.onSunroofClose,
        WINDOWS_VENT: this.onWindowsVent, // vent all the windows
        WINDOWS_CLOSE: this.onWindowsClose, // close all the windows
        TRUNK_OPEN: this.onTrunkOpen, // open the rear trunk
        FRUNK_OPEN: this.onFrunkOpen, // open the front trunk (frunk)
        CHARGE_PORT_DOOR: this.onChargePortDoor,
        SENTRY_MODE: this.onSentryMode, // Change sentry mode
        START_SOFTWARE_UPDATE: this.onStartSoftwareUpdate // will start the car's software update if one is available.
      };

      

      // Status that this node has.
      // Should match the 'sts' section of the nodedef.
      // Must all be strings
      this.drivers = {
        GV1: { value: '', uom: 25 }, // Charge port door status
        GV2: { value: '', uom: 2 }, // Charge port latch engaged
        GV3: { value: '', uom: 25 }, // Frunk status
        GV4: { value: '', uom: 25 }, // Trunk Status
        GV8: { value: '', uom: 2 }, // Locked?
        GV9: { value: '', uom: 51 }, // Sunroof open%
        GV11:  { value: '', uom: 25 }, // Sentry mode on
        GV17: { value: '', uom: 25 }, // Software Update Availability Status
        GV18: { value: '', uom: 2 }, // Online?
        GV19: { value: '', uom: 56 }, // Last updated unix timestamp
        GV20: { value: id, uom: 56 }, // ID used for the Tesla API
        ERR: { value: '', uom: 2 } // In error?
      };

      this.let_sleep = true; // this will be used to disable short polling
    }


    // The id is stored in GV20
    vehicleId() {
      const gv20 = this.getDriver('GV20'); // id used for the API
      return gv20 ? gv20.value : null;
    }

    async pushedData (key, vehicleMessage) {
      const id = this.vehicleId();
      logger.debug('VehicleSecurity pushedData() received id %s, key %s', id, key);
      if (vehicleMessage && vehicleMessage.response) {
        logger.debug('VehicleSecurity pushedData() vehicleMessage.response.isy_nodedef %s, nodeDefId %s'
            , vehicleMessage.response.isy_nodedef, nodeDefId);
        if (key === id
            && vehicleMessage.response.isy_nodedef != nodeDefId) {
          this.processDrivers(vehicleMessage, true);
        }
      }
    }

    async queryNow() {
      logger.debug('queryNow (%s)', this.address);
      await this.query(true);
    }
    
    areCommandsEnabled() {
      const config = this.polyInterface.getConfig();
      const params = config.customParams;
      return params[enableSecurityCommandsParam] === 'true' ? true : false;
    }

    async onLock() {
      const id = this.vehicleId();
      logger.info('LOCK (%s)', this.address);
      await this.tesla.cmdDoorLock(id);
    }

    async onUnlock() {
      if (this.areCommandsEnabled()) {
        const id = this.vehicleId();
        logger.info('UNLOCK (%s)', this.address);
        await this.tesla.cmdDoorUnlock(id);
        await this.queryNow();
      } else {
        logger.info('UNLOCK disabled');
      }
    }

    async onSunroofOpen() {
      const id = this.vehicleId();
      logger.info('SUNROOF_OPEN (%s)', this.address);
      await this.tesla.cmdSunRoof(id, 'vent');
    }

    async onSunroofClose() {
      const id = this.vehicleId();
      logger.info('SUNROOF_CLOSE (%s)', this.address);
      await this.tesla.cmdSunRoof(id, 'close');
    }

    async onChargePortDoor(message) {
      const id = this.vehicleId();
      logger.info('CHARGE_PORT_DOOR %s (%s)', message.value, this.address);
      if (message.value === '1') {
        await this.tesla.cmdChargePortOpen(id);
      } else {
        await this.tesla.cmdChargePortClose(id);
      }
      await this.queryNow();
    }


    async onWindowsVent() {
      const id = this.vehicleId();
      logger.info('WINDOWS VENT (%s)', this.address);
      await this.tesla.cmdWindows(id, 'vent');
      await this.queryNow();
    }

    async onWindowsClose() {
      const id = this.vehicleId();
      logger.info('WINDOWS CLOSE (%s)', this.address);
      await this.tesla.cmdWindows(id, 'close');
      await this.queryNow();
    }

    async onTrunkOpen() {
      const id = this.vehicleId();
      logger.info('TRUNK OPEN (%s)', this.address);
      await this.tesla.cmdActuateTrunk(id, 'rear');
      await this.queryNow();
    }

    async onFrunkOpen() {
      const id = this.vehicleId();
      logger.info('FRUNK OPEN (%s)', this.address);
      await this.tesla.cmdActuateTrunk(id, 'front');
      await this.queryNow();
    }

    async onSentryMode(message) {
      const id = this.vehicleId();
      const decodeValue = message.value === '1' ? 'on' : 'off';
      logger.debug('SENTRY MODE raw %s decoded %s (%s)', message.value, decodeValue, this.address);
      await this.tesla.cmdSentryMode(id, decodeValue);
      await this.queryNow();
    }

    async onStartSoftwareUpdate() {
      const id = this.vehicleId();
      logger.info('STARTING SOFTWARE UPDATE (%s)', this.address);
      await this.tesla.cmdStartSoftwareUpdate(id);
      await this.queryNow();
    }

    // Update Vehicle security only on long poll.
    async query(longPoll) {
      const _this = this;
      if (longPoll) {
        try {
          // Run query only one at a time
          logger.info('VehicleSecurity long poll');

          await lock.acquire('query', function() {
            return _this.queryVehicle(longPoll);
          });
        } catch (err) {
          logger.error('Error while querying vehicle: %s', err.message);
        }
      } else {
        logger.info('VehicleSecurity SKIPPING POLL TO LET THE VEHICLE SLEEP');
      }

    }

    // I_SOFTWARE_UPDATE_STATUS index
    decodSoftwareUpdateStatus(status) {
      if (status === '') {
        return 0
      } else if (status === 'available') {
        return 1
      } else if (status === 'scheduled') {
        return 2
      } else if (status === 'installing') {
        return 3
      }
    }

    async queryVehicle(longPoll) {
      logger.debug('VehicleSecurity queryVehicle(%s)', longPoll);
      const id = this.vehicleId();
      let vehicleData = await this.tesla.getVehicleData(id);

      // check if Tesla is sleeping and sent an error code 408
      if (vehicleData === 408) {
        if (longPoll) {
          // wake the car and try again
          await this.tesla.wakeUp(id);
          await delay(2000); // Wait 2 seconds before trying again.
          vehicleData = await this.tesla.getVehicleData(id);
        }
      }
      if (vehicleData === 408) {
        this.setDriver('GV18', false, true); // car is offline
        logger.info('API ERROR CAUGHT: %s', vehicleData);
        return 0;
      }

      this.processDrivers(vehicleData, longPoll);

        // logger.info('This vehicle Data %o', vehicleData);
    }

    processDrivers(vehicleData, longPoll) {
      logger.debug('VehicleSecurity processDrivers')
      // Gather basic vehicle & charge state
      // (same as getVehicleData with less clutter)
      // let vehicleData = await this.tesla.getVehicle(id);
      // const chargeState = await this.tesla.getVehicleChargeState(id);
      // vehicleData.response.charge_state = chargeState.response;

      if (vehicleData && vehicleData.response &&
        vehicleData.response.charge_state &&
        vehicleData.response.vehicle_state &&
        vehicleData.response.gui_settings) {

        const response = vehicleData.response;
        const chargeState = vehicleData.response.charge_state;
        const vehicleState = vehicleData.response.vehicle_state;
        const timestamp = Math.round((new Date().valueOf() / 1000)).toString();

        this.setDriver('GV1', chargeState.charge_port_door_open ? 1 : 0, false);

        this.setDriver('GV2',
          chargeState.charge_port_latch.toLowerCase() === 'engaged',
          false);

        logger.debug("Frunk: %s, Trunk: %s", vehicleState.ft, vehicleState.rt);
        this.setDriver('GV3', vehicleState.ft === 0 ? 0 : 1, false);
        this.setDriver('GV4', vehicleState.rt === 0 ? 0 : 1, false);

        this.setDriver('GV8', vehicleState.locked, false);

        logger.debug('vehicleState.sun_roof_percent_open %s', vehicleState.sun_roof_percent_open);
        if (vehicleState.sun_roof_percent_open != '') {
          this.setDriver('GV9', vehicleState.sun_roof_percent_open, false);
        }

        // Status of sentry mode (displayed with an index).
        this.setDriver('GV11', vehicleState.sentry_mode ? 1 : 0, false);

        // Software Update Availability Status
        logger.debug("software_update.status %s", vehicleState.software_update.status);
        this.setDriver('GV17', this.decodSoftwareUpdateStatus(vehicleState.software_update.status), true);

        if (this.let_sleep && !longPoll) {
          this.setDriver('GV18', false, false); // this way we know if we have to wake up the car or not
        } else {
          this.setDriver('GV18',
              response.state.toLowerCase() === 'online', false);
        }

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
  VehicleSecurity.nodeDefId = nodeDefId;

  return VehicleSecurity;
};
