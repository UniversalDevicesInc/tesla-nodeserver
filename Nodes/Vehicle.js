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
        LETSLEEP: this.onLetSleep, // call to let the vehicle sleep (disables short polling)
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
        CLIMATE_OFF: this.onClimateOff, // stop pre-heat or pre-cool of the car
        CLIMATE_ON: this.onClimateOn, // pre-heat or pre-cool the car
        WINDOWS_VENT: this.onWindowsVent, // vent all the windows
        WINDOWS_CLOSE: this.onWindowsClose, // close all the windows
        TRUNK_OPEN: this.onTrunkOpen, // open the rear trunk
        FRUNK_OPEN: this.onFrunkOpen, // open the front trunk (frunk)
        HEATED_SEAT_LEVEL_DRIVER: this.onHeatedSeatDriver, // set the level on the heated seat for the driver
        HEATED_SEAT_LEVEL_PASSENGER: this.onHeatedSeatPassenger, // set the level on the heated seat for the passenger
        HEATED_SEAT_LEVEL_REAR_LEFT: this.onHeatedSeatRearLeft, // set the level on the heated seat for the rear left seat
        HEATED_SEAT_LEVEL_REAR_CENTER: this.onHeatedSeatRearCenter, // set the level on the heated seat for the rear center seat
        HEATED_SEAT_LEVEL_REAR_RIGHT: this.onHeatedSeatRearRight, // set the level on the heated seat for the rear right seat
        SENTRY_MODE_ON: this.onSentryModeOn, // turn on Sentry Mode
        SENTRY_MODE_OFF: this.onSentryModeOff, // turn off Sentry Mode
        START_SOFTWARE_UPDATE: this.onStartSoftwareUpdate, // will start the car's software update if one is available.
        MAX_DEFROST_ON: this.onMaxDefrostOn, // turns the climate control to max defrost
        MAX_DEFROST_OFF: this.onMaxDefrostOff, // turns the climate control to the previous setting
        CLIMATE_TEMP_SETTING_DRIVER: this.onSetClimateTempDriver, // sets the climate control temp for the drivers side
        CLIMATE_TEMP_SETTING_PASSENGER: this.onSetClimateTempPassenger, // sets the climate control temp for the passengers side
      };

      // Status that this node has.
      // Should match the 'sts' section of the nodedef.
      // Must all be strings
      this.drivers = {
        ST: { value: '', uom: 51 }, // SOC%
        GV1: { value: '', uom: 116 }, // Battery range (default mile, but UOM gathered from the vehicle)
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
        GV10: { value: '', uom: 116 }, // Odometer (default mile, but multi-editor supports kilometer too)
        GV11:  { value: '', uom: 2 }, // Sentry mode on
        GV12:  { value: '', uom: 4 }, // Drivers side temp
        GV13:  { value: '', uom: 4 }, // Passenger side temp
        GV14:  { value: '', uom: 4 }, // Exterior temp
        GV17: { value: '', uom: 26 }, // Software Update Availability Status
        GV18: { value: '', uom: 2 }, // Online?
        GV19: { value: '', uom: 56 }, // Last updated unix timestamp
        GV20: { value: id, uom: 56 }, // ID used for the Tesla API
        CLITEMP: { value: '', uom: 4 }, // Interior temperature
        CLIEMD: { value: '', uom: 2 }, // Climate conditioning on
        ERR: { value: '', uom: 2 }, // In error?
      };

      this.distance_uom = 'mi'; // defaults to miles. Pulls data from vehicle GUI to change to KM where appropriate.
      this.temperature_uom = 'F'; // defaults to Fahrenheit. Pulls data from vehicle GUI to change to C where appropriate.
      
      this.drivers_temp = '15'; // need to keep these in memory for when we set one or the other
      this.passengers_temp = '15'; // since setting one to null means the temp goes to LO
      this.let_sleep = true; // this will be used to disable short polling
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
      this.let_sleep = false;
      await this.tesla.wakeUp(id);
    }

    async onLetSleep() {
      logger.info('LET SLEEP (%s)', this.address);
      this.let_sleep = true;
      this.setDriver('GV18', false, true); // this way we know if we have to wake up the car or not
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

	async onClimateOn() {
        const id = this.vehicleId();
        logger.info('CLIMATE_ON (%s)', this.address);
        await this.tesla.cmdHvacStart(id);
        await this.query();
      }

	async onClimateOff() {
        const id = this.vehicleId();
        logger.info('CLIMATE_OFF (%s)', this.address);
        await this.tesla.cmdHvacStop(id);
        await this.query();
      }

    async onWindowsVent() {
      const id = this.vehicleId();
      logger.info('WINDOWS VENT (%s)', this.address);
      await this.tesla.cmdWindows(id, 'vent');
      await this.query();
    }

    async onWindowsClose() {
      const id = this.vehicleId();
      logger.info('WINDOWS CLOSE (%s)', this.address);
      await this.tesla.cmdWindows(id, 'close');
      await this.query();
    }

    async onTrunkOpen() {
      const id = this.vehicleId();
      logger.info('TRUNK OPEN (%s)', this.address);
      await this.tesla.cmdActuateTrunk(id, 'rear');
      await this.query();
    }

    async onFrunkOpen() {
      const id = this.vehicleId();
      logger.info('FRUNK OPEN (%s)', this.address);
      await this.tesla.cmdActuateTrunk(id, 'front');
      await this.query();
    }

    async onHeatedSeatDriver(message) {
      const id = this.vehicleId();

      logger.info('SET DRIVERS HEATED SEAT (%s): %s', this.address,
          message.value ? message.value : 'No value');

      await this.tesla.cmdHeatedSeats(id, '0', message.value);
      await this.query();
    }

    async onHeatedSeatPassenger(message) {
      const id = this.vehicleId();

      logger.info('SET PASSENGER HEATED SEAT (%s): %s', this.address,
          message.value ? message.value : 'No value');

      await this.tesla.cmdHeatedSeats(id, '1', message.value);
      await this.query();
    }

    async onHeatedSeatRearLeft(message) {
      const id = this.vehicleId();

      logger.info('SET REAR LEFT HEATED SEAT (%s): %s', this.address,
          message.value ? message.value : 'No value');

      await this.tesla.cmdHeatedSeats(id, '2', message.value);
      await this.query();
    }

    async onHeatedSeatRearCenter(message) {
      const id = this.vehicleId();

      logger.info('SET REAR CENTER HEATED SEAT (%s): %s', this.address,
          message.value ? message.value : 'No value');

      await this.tesla.cmdHeatedSeats(id, '4', message.value);
      await this.query();
    }

    async onHeatedSeatRearRight(message) {
      const id = this.vehicleId();

      logger.info('SET REAR RIGHT HEATED SEAT (%s): %s', this.address,
          message.value ? message.value : 'No value');

      await this.tesla.cmdHeatedSeats(id, '5', message.value);
      await this.query();
    }

    async onSentryModeOn() {
      const id = this.vehicleId();
      logger.info('SENTRY MODE ON (%s)', this.address);
      await this.tesla.cmdSentryMode(id, 'on');
      await this.query();
    }

    async onSentryModeOff() {
      const id = this.vehicleId();
      logger.info('SENTRY MODE OFF (%s)', this.address);
      await this.tesla.cmdSentryMode(id, 'off');
      await this.query();
    }

    async onStartSoftwareUpdate() {
      const id = this.vehicleId();
      logger.info('STARTING SOFTWARE UPDATE (%s)', this.address);
      await this.tesla.cmdStartSoftwareUpdate(id);
      await this.query();
    }

    async onMaxDefrostOn() {
      const id = this.vehicleId();
      logger.info('MAX DEFROST MODE ON (%s)', this.address);
      await this.tesla.cmdMaxDefrost(id, 'on');
      await this.query();
    }

    async onMaxDefrostOff() {
      const id = this.vehicleId();
      logger.info('MAX DEFROST OFF (%s)', this.address);
      await this.tesla.cmdMaxDefrost(id, 'off');
      await this.query();
    }

    async onSetClimateTempDriver(message) {
      const id = this.vehicleId();
      logger.info('SETTING DRIVERS SIDE CLIMATE TEMP (%s): %s', this.address,
        message.value ? message.value : 'No value');
      this.drivers_temp = message.value;
      await this.tesla.cmdSetClimateTemp(id, message.value, this.passengers_temp);
      await this.query();
    }
    async onSetClimateTempPassenger(message) {
      const id = this.vehicleId();
      logger.info('SETTING PASSENGERS SIDE CLIMATE TEMP (%s): %s', this.address,
          message.value ? message.value : 'No value');
      this.passengers_temp = message.value;
      await this.tesla.cmdSetClimateTemp(id, this.drivers_temp, message.value);
      await this.query();
    }

    async query(longPoll) {
      const _this = this;
      if (!this.let_sleep || longPoll) {
        try {
          // Run query only one at a time
          await lock.acquire('query', function() {
            return _this.queryVehicle(longPoll);
          });
        } catch (err) {
          logger.error('Error while querying vehicle: %s', err.message);
        }
      } else {
        logger.info('SKIPPING POLL TO LET THE VEHICLE SLEEP - ISSUE WAKE CMD TO VEHICLE TO ENABLE SHORT POLLING');
      }

    }

    vehicleUOM(guisettings) {
	    // this will take the units set from the Tesla GUI in the vehicle and we'll use that to display the correct ones
	    if (guisettings.gui_distance_units) {
	      if (guisettings.gui_distance_units.includes('mi')) {
	        this.distance_uom = 'mi';
	      } else {
	        this.distance_uom = 'km';
	      }
	      logger.info('Distance Units set to: %s', this.distance_uom);
	    } else {
	      logger.error('GUI Distance Units missing from vehicleData');
	    }
	      
	    if (guisettings.gui_temperature_units) {
	      this.temperature_uom = guisettings.gui_temperature_units;
	      logger.info('Temperature Units set to: %s', this.temperature_uom);
	    } else {
	      logger.error('GUI Temperature Units missing from vehicleData');
	    }
    }

    async queryVehicle(longPoll) {
      const id = this.vehicleId();
      const vehicleData = await this.tesla.getVehicleData(id);

      // check if Tesla is sleeping and sent an error code 408
      if (vehicleData === 408) {
          this.setDriver('GV18', false, true); // car is offline
          logger.info('API ERROR CAUGHT: %s', vehicleData);
          return 0;
      }

      // Gather basic vehicle & charge state
      // (same as getVehicleData with less clutter)
      // let vehicleData = await this.tesla.getVehicle(id);
      // const chargeState = await this.tesla.getVehicleChargeState(id);
      // vehicleData.response.charge_state = chargeState.response;

      if (vehicleData && vehicleData.response &&
        vehicleData.response.charge_state &&
        vehicleData.response.vehicle_state &&
        vehicleData.response.climate_state &&
        vehicleData.response.gui_settings) {

        // logger.info('This vehicle Data %o', vehicleData);

        const response = vehicleData.response;
        const chargeState = vehicleData.response.charge_state;
        const vehiculeState = vehicleData.response.vehicle_state;
        const climateState = vehicleData.response.climate_state;
        const guisettings = vehicleData.response.gui_settings;
        const timestamp = Math.round((new Date().valueOf() / 1000)).toString();

        this.vehicleUOM(guisettings)

        if (climateState.driver_temp_setting && climateState.passenger_temp_setting) {
          this.drivers_temp = climateState.driver_temp_setting;
          logger.info('Drivers temp currently set to: %s', this.drivers_temp);
          this.passengers_temp = climateState.passenger_temp_setting;
          logger.info('Passengers temp currently set to: %s', this.passengers_temp);
        } else {
          logger.error('Missing drivers or passenger temp from from climate state');
        }

        // We know the 'Stopped' status, but what are the others?
        if (chargeState.charging_state !== 'Stopped' &&
          chargeState.charging_state !== 'Disconnected') {
          logger.info('Charging state: %s', chargeState.charging_state);
        }

        this.setDriver('ST', chargeState.battery_level, false);
        if (this.distance_uom === 'km') {
          chargeState.battery_range = (Math.round(parseFloat(chargeState.battery_range) * 1.609344, 1)).toString();
        }
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
        if (vehiculeState.sun_roof_percent_open != null) {
        	this.setDriver('GV9', vehiculeState.sun_roof_percent_open, false);
        }

        // Odometer reading
        if (this.distance_uom === 'km') {
          this.setDriver('GV10', Math.round(parseFloat(vehiculeState.odometer) * 1.609344, 1).toString(), true, false, 8);
        } else {
          this.setDriver('GV10', Math.round(parseFloat(vehiculeState.odometer), 1).toString(), true, false, 116);
        }

        // Status of sentry mode.
        if (vehiculeState.sentry_mode) {
          this.setDriver('GV11', vehiculeState.sentry_mode, false);
        }

        // Drivers side temp
        if (climateState.driver_temp_setting) {
          this.setDriver('GV12', climateState.driver_temp_setting, false);
        }

        // Passengers side temp
        if (climateState.driver_temp_setting) {
          this.setDriver('GV13', climateState.passenger_temp_setting, false);
        }

        // Exterior temp
        if (climateState.driver_temp_setting) {
          this.setDriver('GV14', climateState.outside_temp, false);
        }

        // Software Update Availability Status
        //if (vehiculeState.software_update.status) {
          this.setDriver('GV17', vehiculeState.software_update.status, false);
        //}
        if (this.let_sleep && !longPoll) {
          this.setDriver('GV18', false, false); // this way we know if we have to wake up the car or not
        } else {
          this.setDriver('GV18',
              response.state.toLowerCase() === 'online', false);
        }

        this.setDriver('GV19', timestamp, false);
        // GV20 is not updated. This is the id we use to find this vehicle.
        // It must be already correct.
        
        // Current temperature inside the vehicle.
        this.setDriver('CLITEMP', climateState.inside_temp, false);
        // Status of climate conditioning.
        this.setDriver('CLIEMD', climateState.is_climate_on, false);

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
