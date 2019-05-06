'use strict';

const AsyncLock = require('async-lock');
const lock = new AsyncLock({ timeout: 500 });

// nodeDefId must match the nodedef in the profile
const nodeDefId = 'VEHICLE';

module.exports = function(Polyglot) {
  // Utility function provided to facilitate logging.
  const logger = Polyglot.logger;

  // This is your custom Node class
  class Vehicle extends Polyglot.Node {

    // polyInterface: handle to the interface
    // primary: Same as address, if the node is a primary node
    // address: Your node address, withouth the leading 'n999_'
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
        WAKE: this.onWake,
        HORN: this.onHorn,
        FLASH: this.onFlash,
        LOCK: this.onLock,
        UNLOCK: this.onUnlock,
        SUNROOF_OPEN: this.onSunroofOpen,
        SUNROOF_CLOSE: this.onSunroofClose,
        PORT_OPEN: this.onPortOpen,
        PORT_CLOSE: this.onPortClose,
        CHARGE_SET_TO: this.onChargeSetTo,
        QUERY: this.query, // Query function from the base class
      };

      // Status that this node has.
      // Should match the 'sts' section of the nodedef.
      // Must all be strings
      this.drivers = {
        ST: { value: '', uom: 51 }, // SOC%
        GV1: { value: '', uom: 56 }, // Battery range
        GV2: { value: '', uom: 2 }, // Charge port door open
        GV3: { value: '', uom: 2 }, // Charge port latch engaged
        GV4: { value: '', uom: 2 }, // Charge enable request
        GV5: { value: '', uom: 2 }, // Charging state
        GV6: { value: '', uom: 2 }, // Fast charger present
        GV7: { value: '', uom: 51 }, // Charge limit SOC%
        CC: { value: '', uom: 1 }, // Charger actual current
        CV: { value: '', uom: 72 }, // Charger voltage
        CPW: { value: '', uom: 73 }, // Charger power
        GV8: { value: '', uom: 2 }, // Locked?
        GV9: { value: '', uom: 51 }, // Sunroof open%
        GV10: { value: '', uom: 56 }, // Odometer
        GV18: { value: '', uom: 2 }, // Online?
        GV19: { value: '', uom: 56 }, // Last updated unix timestamp
        GV20: { value: id, uom: 56 }, // ID used for the Tesla API
        ERR: { value: '', uom: 2 }, // In error?
      };
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
      await this.query();
    }

    async onDOF() {
      const id = this.vehicleId();
      logger.info('DOF-Charge Stop (%s)', this.address);
      await this.tesla.cmdChargeStop(id);
      await this.query();
    }

    async onWake() {
      const id = this.vehicleId();
      logger.info('WAKE (%s)', this.address);
      await this.tesla.wakeUp(id);
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

    async onLock() {
      const id = this.vehicleId();
      logger.info('LOCK (%s)', this.address);
      await this.tesla.cmdDoorLock(id);
    }

    async onUnlock() {
      const id = this.vehicleId();
      logger.info('UNLOCK (%s)', this.address);
      await this.tesla.cmdDoorUnlock(id);
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

    async onPortOpen() {
      const id = this.vehicleId();
      logger.info('PORT_OPEN (%s)', this.address);
      await this.tesla.cmdChargePortOpen(id);
    }

    async onPortClose() {
      const id = this.vehicleId();
      logger.info('PORT_CLOSE (%s)', this.address);
      await this.tesla.cmdChargePortClose(id);
    }

    async onChargeSetStd() {
      const id = this.vehicleId();
      logger.info('CHARGE_SET_STD (%s)', this.address);
      await this.tesla.cmdChargeLimitStd(id);
      await this.query();
    }

    async onChargeSetTo(message) {
      const id = this.vehicleId();

      logger.info('CHARGE_SET_TO (%s): %s', this.address,
        message.value ? message.value : 'No value');

      await this.tesla.cmdChargeLimitSetTo(id, message.value);
      await this.query();
    }

    async query() {
      const _this = this;

      try {
        // Run query only one at a time
        await lock.acquire('query', function() {
          return _this.queryVehicle();
        });
      } catch (err) {
        logger.error('Error while querying vehicle: %s', err.message);
      }
    }

    async queryVehicle() {
      const id = this.vehicleId();
      const vehicleData = await this.tesla.getVehicleData(id);

      // Gather basic vehicle & charge state
      // (same as getVehicleData with less clutter)
      // let vehicleData = await this.tesla.getVehicle(id);
      // const chargeState = await this.tesla.getVehicleChargeState(id);
      // vehicleData.response.charge_state = chargeState.response;

      if (vehicleData && vehicleData.response &&
        vehicleData.response.charge_state &&
        vehicleData.response.vehicle_state) {

        // logger.info('This vehicle Data %o', vehicleData);

        const response = vehicleData.response;
        const chargeState = vehicleData.response.charge_state;
        const vehiculeState = vehicleData.response.vehicle_state;
        const timestamp = Math.round((new Date().valueOf() / 1000)).toString();

        // We know the 'Stopped' status, but what are the others?
        if (chargeState.charging_state !== 'Stopped' &&
          chargeState.charging_state !== 'Disconnected') {
          logger.info('Charging state: %s', chargeState.charging_state);
        }

        this.setDriver('ST', chargeState.battery_level, false);
        this.setDriver('GV1', chargeState.battery_range, false);
        this.setDriver('GV2', chargeState.charge_port_door_open, false);
        this.setDriver('GV3',
          chargeState.charge_port_latch.toLowerCase() === 'engaged',
          false);

        this.setDriver('GV4', chargeState.charge_enable_request, false);
        this.setDriver('GV5',
          chargeState.charging_state.toLowerCase() === 'charging', false);
        this.setDriver('GV6', chargeState.fast_charger_present, false);
        this.setDriver('GV7', chargeState.charge_limit_soc, false);
        this.setDriver('CC', chargeState.charger_actual_current, false);
        this.setDriver('CV', chargeState.charger_voltage, false);
        this.setDriver('CPW', chargeState.charger_power * 1000, false);
        this.setDriver('GV8', vehiculeState.locked, false);
        this.setDriver('GV9', vehiculeState.sun_roof_percent_open, false);
        this.setDriver('GV10', parseInt(vehiculeState.odometer, 10), false);

        this.setDriver('GV18',
          response.state.toLowerCase() === 'online', false);

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
