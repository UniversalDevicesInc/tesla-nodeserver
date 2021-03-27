'use strict';

const AsyncLock = require('async-lock');
const Math = require('mathjs');
const lock = new AsyncLock({ timeout: 2000 });

//Must be the same in nodeserver.js
const enableSecurityCommandsParam = 'Enable Security Commands';
const homeLatLon = 'Home Lat Lon';

// nodeDefId must match the nodedef in the profile
const nodeDefId = 'VEHSEC';

function delay(delay) {
  return new Promise(function(waitforit) {
    setTimeout(waitforit, delay);
  });
}


function distanceInMeters( lat1,  lng1,  lat2,  lng2) {
// return the distance between to locations
  const earthRadius = 6371000; // meters

  const dLat = Math.unit(lat2-lat1, 'deg').toNumber('rad');
  const dLng = Math.unit(lng2-lng1, 'deg').toNumber('rad');

  const sindLat = Math.sin(dLat / 2);
  const sindLng = Math.sin(dLng / 2);

  const a = Math.pow(sindLat, 2) + Math.pow(sindLng, 2)
      * Math.cos(Math.unit(lat1, 'deg').toNumber('rad')) * Math.cos(Math.unit(lat2, 'deg').toNumber('rad'));

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  const dist = earthRadius * c;

  return dist; // output distance, in meters
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

      this.tesla = require('../lib/tesla_v3.js')(Polyglot, polyInterface);

      // PGC supports setting the node hint when creating a node
      // REF: https://github.com/UniversalDevicesInc/hints
      // Must be a string in this format
      // If you don't care about the hint, just comment the line.
      this.hint = '0x01130101'; // See hints.yaml
      
      // Commands that this node can handle.
      // Should match the 'accepts' section of the nodedef.
      this.commands = {
        QUERY_NOW: this.queryNow, // force a query now to update the status.
        DON: this.onLock,
        DOF: this.onUnlock,
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
        GV5: { value: '', uom: 25 }, // Security Command Status
        GV6: { value: '', uom: 25 }, // Vehicle Location
        ST: { value: '', uom: 25 }, // Locked?
        GV9: { value: '', uom: 51 }, // Sunroof open%
        GV11:  { value: '', uom: 25 }, // Sentry mode on
        GV17: { value: '', uom: 25 }, // Software Update Availability Status
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
      logger.debug('VehicleSecurity pushedData() received id %s, key %s', id, key);
      if (vehicleMessage && vehicleMessage.isy_nodedef) {
        logger.debug('VehicleSecurity pushedData() vehicleMessage.isy_nodedef %s, nodeDefId %s'
            , vehicleMessage.isy_nodedef, nodeDefId);
        // process the message for this vehicle sent from a different node.
        if (key === id
            && vehicleMessage.isy_nodedef != nodeDefId) {
          this.processDrivers(vehicleMessage);
        }
      }
    }

    async queryNow() {
      logger.debug('queryNow (%s)', this.address);
      await this.asyncQuery(true);
    }
    
    areCommandsEnabled() {
      return this.checkSecuritySetting('true');
    }
    
    checkSecuritySetting(setting) {
      const config = this.polyInterface.getConfig();
      const params = config.customParams;
      const securitySettings = params[enableSecurityCommandsParam];
      const values = securitySettings.split(',');
      logger.debug('checkSecuritySetting %s', values);
      return values.includes(setting) ? true : false;
    }

    getHomeLat() {
      const config = this.polyInterface.getConfig();
      const params = config.customParams;
      const latLon = params[homeLatLon];
      if (latLon != null) {
        const values = latLon.split(' ');
        if (values.length > 0) {
          return Number(values[0]);
        }
      }
    }

    getHomeLon() {
      const config = this.polyInterface.getConfig();
      const params = config.customParams;
      const latLon = params[homeLatLon];
      if (latLon != null) {
        const values = latLon.split(' ');
        if (values.length > 1) {
          return Number(values[1]);
        }
      }
    }

    async onLock() {
      try {
        if (this.areCommandsEnabled() || this.checkSecuritySetting('lock')) {
          const id = this.vehicleId();
          logger.info('LOCK (%s)', this.address);
          await this.tesla.cmdDoorLock(id);
        } else {
          logger.info('LOCK disabled');
        }
      } catch (err) {
        logger.errorStack(err, 'Error onLock:');
      }
    }

    async onUnlock() {
      try {
        if (this.areCommandsEnabled() || this.checkSecuritySetting('lock')) {
          const id = this.vehicleId();
          logger.info('UNLOCK (%s)', this.address);
          await this.tesla.cmdDoorUnlock(id);
          await this.queryNow();
        } else {
          logger.info('UNLOCK disabled');
        }
      } catch (err) {
        logger.errorStack(err, 'Error onUnlock:');
      }
    }

    async onSunroofOpen() {
      try {
        if (this.areCommandsEnabled() || this.checkSecuritySetting('sunroof')) {
          const id = this.vehicleId();
          logger.info('SUNROOF_OPEN (%s)', this.address);
          await this.tesla.cmdSunRoof(id, 'vent');
        } else {
          logger.info('SUNROOF_OPEN disabled');
        }
      } catch (err) {
        logger.errorStack(err, 'Error onSunroofOpen:');
      }
    }

    async onSunroofClose() {
      try {
        if (this.areCommandsEnabled() || this.checkSecuritySetting('sunroof')) {
          const id = this.vehicleId();
          logger.info('SUNROOF_CLOSE (%s)', this.address);
          await this.tesla.cmdSunRoof(id, 'close');
        } else {
          logger.info('SUNROOF_CLOSE disabled');
        }
      } catch (err) {
        logger.errorStack(err, 'Error onSunroofClose:');
      }
    }

    async onChargePortDoor(message) {
      try {
        const id = this.vehicleId();
        logger.info('CHARGE_PORT_DOOR %s (%s)', message.value, this.address);
        if (message.value === '1') {
          if (this.areCommandsEnabled() || this.checkSecuritySetting('charge_port')) {
            await this.tesla.cmdChargePortOpen(id);
          } else {
            logger.info('CHARGE_PORT_DOOR disabled');
          }
        } else {
          if (this.areCommandsEnabled() || this.checkSecuritySetting('charge_port')) {
            await this.tesla.cmdChargePortClose(id);
          } else {
            logger.info('CHARGE_PORT_DOOR disabled');
          }
        }
        await this.queryNow();
      } catch (err) {
        logger.errorStack(err, 'Error onChargePortDoor:');
      }
    }


    async onWindowsVent() {
      try {
        if (this.areCommandsEnabled() || this.checkSecuritySetting('windows')) {
          const id = this.vehicleId();
          logger.info('WINDOWS_VENT (%s)', this.address);
          await this.tesla.cmdWindows(id, 'vent');
          await this.queryNow();
        } else {
          logger.info('WINDOWS_VENT disabled');
        }
      } catch (err) {
        logger.errorStack(err, 'Error onWindowsVent:');
      }
    }

    async onWindowsClose() {
      try {
        if (this.areCommandsEnabled() || this.checkSecuritySetting('windows')) {
          const id = this.vehicleId();
          logger.info('WINDOWS CLOSE (%s)', this.address);
          await this.tesla.cmdWindows(id, 'close');
          await this.queryNow();
        } else {
          logger.info('WINDOWS CLOSE disabled');
        }
      } catch (err) {
        logger.errorStack(err, 'Error onWindowsClose:');
      }
    }

    async onTrunkOpen() {
      try {
        if (this.areCommandsEnabled() || this.checkSecuritySetting('trunk')) {
          const id = this.vehicleId();
          logger.info('TRUNK_OPEN (%s)', this.address);
          await this.tesla.cmdActuateTrunk(id, 'rear');
          await this.queryNow();
        } else {
          logger.info('TRUNK_OPEN disabled');
        }
      } catch (err) {
        logger.errorStack(err, 'Error onTrunkOpen:');
      }
    }

    async onFrunkOpen() {
      try {
        if (this.areCommandsEnabled() || this.checkSecuritySetting('frunk')) {
          const id = this.vehicleId();
          logger.info('FRUNK_OPEN (%s)', this.address);
          await this.tesla.cmdActuateTrunk(id, 'front');
          await this.queryNow();
        } else {
          logger.info('FRUNK_OPEN disabled');
        }
      } catch (err) {
        logger.errorStack(err, 'Error onFrunkOpen:');
      }
    }

    async onSentryMode(message) {
      try {
        if (this.areCommandsEnabled() || this.checkSecuritySetting('sentry')) {
          const id = this.vehicleId();
          const decodeValue = message.value === '1' ? 'on' : 'off';
          logger.debug('SENTRY MODE raw %s decoded %s (%s)', message.value, decodeValue, this.address);
          await this.tesla.cmdSentryMode(id, decodeValue);
          await this.queryNow();
        } else {
          logger.info('SENTRY MODE disabled');
        }
      } catch (err) {
        logger.errorStack(err, 'Error onSentryMode:');
      }
    }

    async onStartSoftwareUpdate() {
      try {
        if (this.areCommandsEnabled() || this.checkSecuritySetting('software_update')) {
          const id = this.vehicleId();
          logger.info('STARTING SOFTWARE UPDATE (%s)', this.address);
          await this.tesla.cmdStartSoftwareUpdate(id);
          await this.queryNow();
        } else {
          logger.info('STARTING SOFTWARE UPDATE disabled');
        }
      } catch (err) {
        logger.errorStack(err, 'Error onStartSoftwareUpdate:');
      }
    }

    async query(ignored) {
      // This is overridden and does nothing because the only time
      // this will be called is on the long poll, and the long poll
      // refresh is done from the Vehicle node.
    }

    // Update Vehicle security only on long poll.
    async asyncQuery(now) {
      const _this = this;
      if (now) {
        try {
          // Run query only one at a time
          logger.info('VehicleSecurity now');

          await lock.acquire('query', function() {
            return _this.queryVehicle(now);
          });
        } catch (err) {
          logger.error('Error while querying vehicle: %s', err.message);
        }
      } else {
        logger.info('VehicleSecurity SKIPPING POLL');
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

    decodeLocation(vehicleLat, vehicleLon) {
      try {
        const homeLat = this.getHomeLat();  // 45.027933;
        const homeLon = this.getHomeLon();  // -93.365416;
        
        const distanceFromHome = distanceInMeters(vehicleLat, vehicleLon, homeLat, homeLon);
        logger.debug('distanceFromHome (Meters) %s', distanceFromHome);
        
        if (isNaN(distanceFromHome)) {
          return 0;
        }
        else if (distanceFromHome < 50) {
          logger.debug('car is home');
          return 1;
        } else {
          logger.debug('car is remote');
          return 2;
        }
        
      } catch (err) {
        logger.error('Invalid Home Lat,Lon value: %s', err.message);
        return 0;
      }
    }

    async queryVehicleRetry(id)
    {
      const MAX_RETRIES = 1;
      for (let i = 0; i <= MAX_RETRIES; i++) {
        try {
          return { response: await this.tesla.getVehicleData(id) };
        } catch (err) {
          await delay(3000);
          logger.debug('VehicleSecurity.getVehicleData Retrying %d %s', i, err);
        }
      }
      return {error: "Error timed out"};
    }

    async queryVehicle(longPoll) {
      const id = this.vehicleId();

      let vehicleData;
      try {
        vehicleData = { response: await this.tesla.getVehicleData(id) };
      } catch (err) {
        if (longPoll) {
          // wake the car and try again
          logger.debug('Vehicle.getVehicleData Retrying %s', err);
          await this.tesla.wakeUp(id);
          await delay(3000); // Wait another 3 seconds before trying again.
          vehicleData = await this.queryVehicleRetry(id);
        } else {
          logger.info('API ERROR CAUGHT: %s', vehicleData);
          return 0;
        }
      }

      if (vehicleData && vehicleData.response) {
        this.processDrivers(vehicleData.response);
      } else if (vehicleData && vehicleData.error) {
        logger.error('API for getVehicleData failed: %s', vehicleData.error);
      }
      // logger.info('This vehicle Data %o', vehicleData);
    }

    processDrivers(vehicleData) {
      logger.debug('VehicleSecurity processDrivers')
      // Gather basic vehicle & charge state
      // (same as getVehicleData with less clutter)
      // let vehicleData = await this.tesla.getVehicle(id);
      // const chargeState = await this.tesla.getVehicleChargeState(id);
      // vehicleData.charge_state = chargeState;

      this.setDriver('GV5', this.areCommandsEnabled() ? 1 : 0, false); // commands enabled/disabled status

      if (vehicleData &&
        vehicleData.charge_state &&
        vehicleData.vehicle_state &&
        vehicleData.drive_state &&
        vehicleData.gui_settings) {

        const chargeState = vehicleData.charge_state;
        const vehicleState = vehicleData.vehicle_state;
        const driveState = vehicleData.drive_state;
        const timestamp = Math.round((new Date().valueOf() / 1000)).toString();

        this.setDriver('GV1', chargeState.charge_port_door_open ? 1 : 0, false);

        this.setDriver('GV2',
          chargeState.charge_port_latch === 'Engaged',
          false);

        logger.debug("Frunk: %s, Trunk: %s", vehicleState.ft, vehicleState.rt);
        this.setDriver('GV3', vehicleState.ft === 0 ? 0 : 1, false);
        this.setDriver('GV4', vehicleState.rt === 0 ? 0 : 1, false);

        // Software Update Availability Status
        logger.debug("driveState.latitude %s, longitude %s", driveState.latitude, driveState.longitude);
        this.setDriver('GV6', this.decodeLocation(driveState.latitude, driveState.longitude), true);

        this.setDriver('ST', vehicleState.locked ? 1 : 0, false);

        logger.debug('vehicleState.sun_roof_percent_open %s', vehicleState.sun_roof_percent_open);
        if (typeof vehicleState.sun_roof_percent_open != 'undefined') {
          this.setDriver('GV9', vehicleState.sun_roof_percent_open, false, false, 51);
        } else {
          this.setDriver('GV9', 101, false, false, 25);
        }

        // Status of sentry mode (displayed with an index).
        this.setDriver('GV11', vehicleState.sentry_mode_available ? (vehicleState.sentry_mode ? 1 : 0) : 2, false);

        // Software Update Availability Status
        logger.debug("software_update.status %s", vehicleState.software_update.status);
        this.setDriver('GV17', this.decodSoftwareUpdateStatus(vehicleState.software_update.status), true);

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
