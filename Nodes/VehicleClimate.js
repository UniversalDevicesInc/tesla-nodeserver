'use strict';

const AsyncLock = require('async-lock');
const lock = new AsyncLock({ timeout: 15000 });

// nodeDefId must match the nodedef in the profile
const nodeDefId = 'VEHICLECLIMATE';

function delay(delay) {
  return new Promise(function(waitforit) {
    setTimeout(waitforit, delay);
  });
}

module.exports = function(Polyglot) {
  // Utility function provided to facilitate logging.
  const logger = Polyglot.logger;

  // This is your custom Node class
  class VehicleClimate extends Polyglot.Node {

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
        HEATED_SEAT_LEVEL_DRIVER: this.onHeatedSeatDriver, // set the level on the heated seat for the driver
        HEATED_SEAT_LEVEL_PASSENGER: this.onHeatedSeatPassenger, // set the level on the heated seat for the passenger
        HEATED_SEAT_LEVEL_REAR_LEFT: this.onHeatedSeatRearLeft, // set the level on the heated seat for the rear left seat
        HEATED_SEAT_LEVEL_REAR_CENTER: this.onHeatedSeatRearCenter, // set the level on the heated seat for the rear center seat
        HEATED_SEAT_LEVEL_REAR_RIGHT: this.onHeatedSeatRearRight, // set the level on the heated seat for the rear right seat
        HEATED_SEAT_LEVEL_THIRD_ROW_LEFT: this.onHeatedSeatThirdRowLeft, // set the level on the heated seat for the third row left seat
        HEATED_SEAT_LEVEL_THIRD_ROW_RIGHT: this.onHeatedSeatThirdRowRight, // set the level on the heated seat for the third row right seat
        MAX_DEFROST_ON: this.onMaxDefrostOn, // turns the climate control to max defrost
        MAX_DEFROST_OFF: this.onMaxDefrostOff, // turns the climate control to the previous setting
        CLIMATE_TEMP_SETTING_DRIVER: this.onSetClimateTempDriver, // sets the climate control temp for the drivers side
        CLIMATE_TEMP_SETTING_PASSENGER: this.onSetClimateTempPassenger, // sets the climate control temp for the passengers side
      };

      

      // Status that this node has.
      // Should match the 'sts' section of the nodedef.
      // Must all be strings
      this.drivers = {
        GV1: { value: '', uom: 25}, // Driver seat heat
        GV2: { value: '', uom: 25}, // Passenger seat heat
        GV3: { value: '', uom: 25}, // Rear left seat heat
        GV4: { value: '', uom: 25}, // Rear center seat heat
        GV5: { value: '', uom: 25}, // Rear right seat heat
        GV6: { value: '', uom: 25}, // Third row left seat heat
        GV7: { value: '', uom: 25}, // Third row right seat heat
//        GV12:  { value: '', uom: 4 }, // Drivers side temp
//        GV13:  { value: '', uom: 4 }, // Passenger side temp
//      GV14:  { value: '', uom: 4 }, // Exterior temp
        GV15:  { value: '', uom: 2 }, // Max Defrost
        GV19: { value: '', uom: 56 }, // Last updated unix timestamp
        GV20: { value: id, uom: 56 }, // ID used for the Tesla API
        ERR: { value: '', uom: 2 } // In error?
      };

      this.temperature_uom_index = 4; // defaults to Celsius. Pulls data from vehicle GUI to change to C where appropriate.
      
    }

    async initializeUOMRetry(id)
    {
      const MAX_RETRIES = 1;
      for (let i = 0; i <= MAX_RETRIES; i++) {
        try {
          await delay(3000); // Wait 3 seconds before trying again.
          return {response: await this.tesla.getVehicleGuiSettings(id) };
        } catch (err) {
          logger.debug('VehicleClimate.initializeUOMRetry Retrying', err, i);
        }
      }
      return {error: "Error timed out"};
    }

    async initializeUOM() {
      const id = this.vehicleId();
      let vehicleGuiSettings;
      try {
        vehicleGuiSettings = {response: await this.tesla.getVehicleGuiSettings(id)};
      } catch (err) {
        await this.tesla.wakeUp(id);
        vehicleGuiSettings = await this.initializeUOMRetry(id);
      }

      if (vehicleGuiSettings && vehicleGuiSettings.response) {
        this.vehicleUOM(vehicleGuiSettings.response);
        logger.debug('VehicleClimate.initializeUOM (%s)', this.temperature_uom_index);
        this.drivers.GV12 = { value: '', uom: this.temperature_uom_index };
        this.drivers.GV13 = { value: '', uom: this.temperature_uom_index };
        this.drivers.GV14 = { value: '', uom: this.temperature_uom_index };
        this.drivers.ST = { value: '', uom: this.temperature_uom_index };
      } else {
        logger.error('Vehicle.initializeUOM() %s', vehicleGuiSettings.error);
      }
      logger.debug('VehicleClimate.initializeUOM done');
    }

    // The id is stored in GV20
    vehicleId() {
      const gv20 = this.getDriver('GV20'); // id used for the API
      return gv20 ? gv20.value : null;
    }

    async pushedData (key, vehicleMessage) {
      const id = this.vehicleId();
      logger.debug('VehicleClimate pushedData() received id %s, key %s', id, key);
      if (vehicleMessage && vehicleMessage.isy_nodedef) {
        logger.debug('VehicleClimate pushedData() vehicleMessage.isy_nodedef %s, nodeDefId %s'
            , vehicleMessage.isy_nodedef, nodeDefId);
        if (key === id
            && vehicleMessage.isy_nodedef != nodeDefId) {
          // process the message for this vehicle sent from a different node.
          this.processDrivers(vehicleMessage);
        }
      }
    }

    async onHeatedSeatDriver(message) {
      try {
        const id = this.vehicleId();
  
        logger.info('SET DRIVERS HEATED SEAT (%s): %s', this.address,
            message.value ? message.value : 'No value');
  
        await this.tesla.cmdHeatedSeats(id, '0', message.value);
        await this.queryNow();
      } catch (err) {
        logger.errorStack(err, 'Error onHeatedSeatDriver:');
      }
    }

    async onHeatedSeatPassenger(message) {
      try {
        const id = this.vehicleId();
  
        logger.info('SET PASSENGER HEATED SEAT (%s): %s', this.address,
            message.value ? message.value : 'No value');
  
        await this.tesla.cmdHeatedSeats(id, '1', message.value);
        await this.queryNow();
      } catch (err) {
        logger.errorStack(err, 'Error onHeatedSeatDriver:');
      }
    }

    async onHeatedSeatRearLeft(message) {
      try {
        const id = this.vehicleId();
  
        logger.info('SET REAR LEFT HEATED SEAT (%s): %s', this.address,
            message.value ? message.value : 'No value');
  
        await this.tesla.cmdHeatedSeats(id, '2', message.value);
        await this.queryNow();
      } catch (err) {
        logger.errorStack(err, 'Error onHeatedSeatRearLeft:');
      }
   }

    async onHeatedSeatRearCenter(message) {
      try {
        const id = this.vehicleId();
  
        logger.info('SET REAR CENTER HEATED SEAT (%s): %s', this.address,
            message.value ? message.value : 'No value');
  
        await this.tesla.cmdHeatedSeats(id, '4', message.value);
        await this.queryNow();
      } catch (err) {
        logger.errorStack(err, 'Error onHeatedSeatRearCenter:');
      }
    }

    async onHeatedSeatRearRight(message) {
      try {
        const id = this.vehicleId();
  
        logger.info('SET REAR RIGHT HEATED SEAT (%s): %s', this.address,
            message.value ? message.value : 'No value');
  
        await this.tesla.cmdHeatedSeats(id, '5', message.value);
        await this.queryNow();
      } catch (err) {
        logger.errorStack(err, 'Error onHeatedSeatRearRight:');
      }
    }

    async onHeatedSeatThirdRowLeft(message) {
      try {
        const id = this.vehicleId();
  
        logger.info('SET THIRD_ROW_LEFT HEATED SEAT (%s): %s', this.address,
            message.value ? message.value : 'No value');
  
        await this.tesla.cmdHeatedSeats(id, '7', message.value);
        await this.queryNow();
      } catch (err) {
        logger.errorStack(err, 'Error onHeatedSeatThirdRowLeft:');
      }
    }

    async onHeatedSeatThirdRowRight(message) {
      try {
        const id = this.vehicleId();
  
        logger.info('SET THIRD_ROW_RIGHT HEATED SEAT (%s): %s', this.address,
            message.value ? message.value : 'No value');
  
        await this.tesla.cmdHeatedSeats(id, '8', message.value);
        await this.queryNow();
      } catch (err) {
        logger.errorStack(err, 'Error onHeatedSeatThirdRowRight:');
      }
    }

    async onMaxDefrostOn() {
      try {
        const id = this.vehicleId();
        logger.info('MAX DEFROST MODE ON (%s)', this.address);
        await this.tesla.cmdMaxDefrost(id, 'on');
        await this.queryNow();
      } catch (err) {
        logger.errorStack(err, 'Error onMaxDefrostOn:');
      }
    }

    async onMaxDefrostOff() {
      try {
        const id = this.vehicleId();
        logger.info('MAX DEFROST OFF (%s)', this.address);
        await this.tesla.cmdMaxDefrost(id, 'off');
        await this.queryNow();
      } catch (err) {
        logger.errorStack(err, 'Error onMaxDefrostOff:');
      }
    }

    async onSetClimateTempDriver(message) {
      try {
        const id = this.vehicleId();
        const celsiusDeg = this.toStdTemp(message.value, Number(message.uom));
        logger.info('SETTING DRIVERS SIDE CLIMATE TEMP (%s): D_Raw %s, D_Value %s, passenger %s', this.address,
            message.value, celsiusDeg, this.stdPassengerTemp());
        logger.debug('message uom: %s', message.uom);
        await this.tesla.cmdSetClimateTemp(id, celsiusDeg, this.stdPassengerTemp());
        await this.queryNow();
      } catch (err) {
        logger.errorStack(err, 'Error onSetClimateTempDriver:');
      }
    }

    // The passenger temperature is stored in GV13
    stdPassengerTemp() {
      const gv13 = this.getDriver('GV13'); // id used for storing the passenger temp
      return this.toStdTemp(gv13 ? gv13.value : null, gv13.uom);
    }

    async onSetClimateTempPassenger(message) {
      try {
        const id = this.vehicleId();
        const celsiusDeg = this.toStdTemp(message.value, Number(message.uom));
        logger.info('SETTING PASSENGERS SIDE CLIMATE TEMP (%s): D_Raw %s, D_Value %s, driver %s', this.address,
            message.value, celsiusDeg, this.stdDriverTemp());
        logger.debug('message uom: %s', message.uom);
        await this.tesla.cmdSetClimateTemp(id, this.stdDriverTemp(), celsiusDeg);
        await this.queryNow();
      } catch (err) {
        logger.errorStack(err, 'Error onSetClimateTempPassenger:');
      }
    }

    // The driver temperature is stored in GV12
    stdDriverTemp() {
      const gv12 = this.getDriver('GV12'); // id used for storing the driver temp
      return this.toStdTemp(gv12 ? gv12.value : null, gv12.uom);
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
          logger.info('VehicleClimate now');

          await lock.acquire('query', function() {
            return _this.queryVehicle(now);
          });
        } catch (err) {
          logger.error('VehicleClimate Error while querying vehicle: %s', err.message);
        }
      } else {
        logger.info('VehicleClimate SKIPPING POLL');
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
	      
	    if (guisettings.gui_temperature_units) {
	      this.temperature_uom_index = this.decodeTempUOM(guisettings.gui_temperature_units);
	      logger.info('Temperature Units from vehicle: %s', guisettings.gui_temperature_units);
	    } else {
	      logger.error('GUI Temperature Units missing from gui_settings');
	    }
    }

    celsiusToFahrenheit(celsiusDeg) {
      return (celsiusDeg * 1.8) + 32;
    }

    fahrenheitToCelsius(fDeg) {
      return (fDeg - 32) * 5/9;
    }

    fromStdTemp(celsiusDeg) {
      if (this.temperature_uom_index === 17) {
        return Math.round(this.celsiusToFahrenheit(celsiusDeg)).toString();
      } else {
        return Math.round(celsiusDeg).toString();
      }
    }

    toStdTemp(localDeg, uom) {
      if (uom === 17) {
        return this.fahrenheitToCelsius(localDeg).toString();
      } else {
        return localDeg;
      }
    }

    decodeTempUOM(uom) {
      if (uom === 'F') {
        return 17;
      } else {
        return 4;
      }
    }

    async queryVehicleRetry(id)
    {
      const MAX_RETRIES = 1;
      for (let i = 0; i <= MAX_RETRIES; i++) {
        try {
          await delay(3000); // Wait another 3 seconds before trying again.
          return { response: await this.tesla.getVehicleData(id) };
        } catch (err) {
          logger.debug('VehicleClimate.getVehicleData Retrying %d %s', i, err);
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
          logger.debug('VehicleClimate.getVehicleData Retrying %s', err);
          await this.tesla.wakeUp(id);
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

    setDriverValues(name, value, report) {
      if (typeof value != 'undefined') {
        this.setDriver(name, value, report);
      } else {
        this.setDriver(name, 10, false);
      }
    }

    processDrivers(vehicleData) {
      logger.debug('VehicleClimate processDrivers');
      // Gather basic vehicle climate data
      if (vehicleData &&
          vehicleData.climate_state &&
            vehicleData.gui_settings) {
        const climateState = vehicleData.climate_state;
        const timestamp = Math.round((new Date().valueOf() / 1000)).toString();
  
        this.vehicleUOM(vehicleData.gui_settings);
  
        this.setDriverValues('GV1', climateState.seat_heater_left, false);
        this.setDriverValues('GV2', climateState.seat_heater_right, false);
        this.setDriverValues('GV3', climateState.seat_heater_rear_left, false);
        this.setDriverValues('GV4', climateState.seat_heater_rear_center, false);
        this.setDriverValues('GV5', climateState.seat_heater_rear_right, false);
        this.setDriverValues('GV6', climateState.seat_heater_third_row_left, false);
        this.setDriverValues('GV7', climateState.seat_heater_third_row_right, false);

        // Drivers side temp
        if (climateState.driver_temp_setting) {
          this.setDriver('GV12', this.fromStdTemp(climateState.driver_temp_setting), false, false, this.temperature_uom_index);
        }

        // Passengers side temp
        if (climateState.passenger_temp_setting) {
          this.setDriver('GV13', this.fromStdTemp(climateState.passenger_temp_setting), false, false, this.temperature_uom_index);
        }

        // Exterior temp
        if (climateState.outside_temp) {
          this.setDriver('GV14', this.fromStdTemp(climateState.outside_temp), false, false, this.temperature_uom_index);
        }

        logger.debug("defrost_mode %s, is_front_defroster_on %s, is_auto_conditioning_on %s", climateState.defrost_mode, climateState.is_front_defroster_on, climateState.is_auto_conditioning_on);
        // Max Defrost
        if (climateState.defrost_mode == 2 && climateState.is_front_defroster_on && climateState.is_auto_conditioning_on) {
          this.setDriver('GV15', true, false);
        } else {
          this.setDriver('GV15', false, false);
        }

        this.setDriver('GV19', timestamp, false);
        // GV20 is not updated. This is the id we use to find this vehicle.
        // It must be already correct.
        
        // Current temperature inside the vehicle.
        this.setDriver('ST', this.fromStdTemp(climateState.inside_temp), false, false, this.temperature_uom_index);

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
  VehicleClimate.nodeDefId = nodeDefId;

  return VehicleClimate;
};
