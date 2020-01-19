'use strict';

// The controller node is a regular ISY node. It must be the first node created
// by the node server. It has an ST status showing the nodeserver status, and
// optionally node statuses. It usually has a few commands on the node to
// facilitate interaction with the nodeserver from the admin console or
// ISY programs.

// nodeDefId must match the nodedef id in your nodedef
const nodeDefId = 'CONTROLLER';

module.exports = function(Polyglot) {
  // Utility function provided to facilitate logging.
  const logger = Polyglot.logger;

  // In this example, we also need to have our custom node because we create
  // nodes from this controller. See onCreateNew
  const Vehicle = require('./Vehicle.js')(Polyglot);
  const VehicleSecurity = require('./VehicleSecurity.js')(Polyglot);
  const VehicleClimate = require('./VehicleClimate.js')(Polyglot);

  class Controller extends Polyglot.Node {
    // polyInterface: handle to the interface
    // address: Your node address, withouth the leading 'n999_'
    // primary: Same as address, if the node is a primary node
    // name: Your node name
    constructor(polyInterface, primary, address, name) {
      super(nodeDefId, polyInterface, primary, address, name);

      this.tesla = require('../lib/tesla.js')(Polyglot, polyInterface);

      // Commands that this controller node can handle.
      // Should match the 'accepts' section of the nodedef.
      this.commands = {
        // CREATE_NEW: this.onCreateNew,
        DISCOVER: this.onDiscover,
        UPDATE_PROFILE: this.onUpdateProfile,
        // REMOVE_NOTICES: this.onRemoveNotices,
        QUERY: this.query,
      };

      // Status that this controller node has.
      // Should match the 'sts' section of the nodedef.
      this.drivers = {
        ST: { value: '1', uom: 2 }, // uom 2 = Boolean. '1' is True.
      };

      this.isController = true;
    }

    // Sends the profile files to ISY
    onUpdateProfile() {
      this.polyInterface.updateProfile();
    }

    // Discover vehicles
    async onDiscover() {
      const _this = this;
      try {
        logger.info('Discovering new vehicles');

        const getVehiclesResult = await this.tesla.getVehicles();
        const vehicles = getVehiclesResult.response;

        logger.info('Vehicles: %o', vehicles);

        const addResults = await Promise.all(vehicles.map(function(vehicle) {
          return _this.autoAddVehicle(vehicle);
        }));
        logger.info('Tesla Vehicles: %d, added to Polyglot: %d',
          vehicles.length,
          addResults.filter(function(v) {
            return v && v.added;
          }).length,
        );
        this.clearCredentialsError();
      } catch (err) {
        this.displayCredentialsError(err);
        logger.errorStack(err, 'Error discovering vehicles:');
      }
    }

    displayCredentialsError(err) {
      if (err.statusCode === 401) {
        this.polyInterface.addNotice(
          'credsError',
          'Tesla account login failed'
        );
      }
    }

    clearCredentialsError() {
      this.polyInterface.removeNotice('credsError');
    }

    updateOtherNodes(deviceAddress, vehicleMessage) {
      logger.debug('ControllerNodes.updateOtherNodes(%s)', deviceAddress);
      const securityNode = this.polyInterface.getNode("s" + deviceAddress);
      logger.debug('ControllerNodes.updateOtherNodes(%s)getnode', deviceAddress);
      securityNode.pushedData(deviceAddress, vehicleMessage);
      logger.debug('ControllerNodes.updateOtherNodes(%s)pushdata', deviceAddress);
      const climateNode = this.polyInterface.getNode("c" + deviceAddress);
      climateNode.pushedData(deviceAddress, vehicleMessage);
    }

    // pass the Tesla API vehicle object
    async autoAddVehicle(vehicle) {
      // id is the vehicle ID for the purpose of calling APIs.
      // I have seen cases where the good number is id_s, not id (?)
      const id = typeof vehicle.id_s === 'string' ?
        vehicle.id_s : vehicle.id_s.toString();
      const deviceAddress = typeof vehicle.vehicle_id === 'string' ?
        vehicle.vehicle_id : vehicle.vehicle_id.toString();
      const node = this.polyInterface.getNode(deviceAddress);

      if (!node) {
        try {
          logger.info('Adding vehicle node %s: %s',
            deviceAddress, vehicle.display_name);
          const newVehicle = new Vehicle(
              this.polyInterface,
              this.address, // primary
              deviceAddress,
              vehicle.display_name,
              id); // We save the ID in GV20 for eventual API calls

          await newVehicle.initializeUOM();

          const result = await this.polyInterface.addNode(newVehicle);

          logger.info('Vehicle added: %s', result);
          this.polyInterface.addNoticeTemp(
            'newVehicle-' + deviceAddress,
            'New node created: ' + vehicle.display_name,
            5
          );
          
          const vehicleSecurityName = vehicle.display_name + " Security";
          const vehicleSecurityAddress =  "s" + deviceAddress;
          logger.info('Adding VehicleSecurity node %s: %s',
              vehicleSecurityAddress, vehicleSecurityName);
            const newVehicleSecurity = new VehicleSecurity(
                this.polyInterface,
                this.address, // primary
                vehicleSecurityAddress,
                vehicleSecurityName,
                id); // We save the ID in GV20 for eventual API calls

            const resultSecurity = await this.polyInterface.addNode(newVehicleSecurity);
            await newVehicleSecurity.query(true); // get current values

            logger.info('VehicleSecurity added: %s', resultSecurity);
            this.polyInterface.addNoticeTemp(
              'newVehicleSecurity-' + vehicleSecurityAddress,
              'New node created: ' + vehicleSecurityName,
              5
            );
            
            const vehicleClimateName = vehicle.display_name + " Climate";
            const vehicleClimateAddress =  "c" + deviceAddress;
            logger.info('Adding VehicleClimate node %s: %s',
                vehicleClimateAddress, vehicleClimateName);
              const newVehicleClimate = new VehicleClimate(
                  this.polyInterface,
                  this.address, // primary
                  vehicleClimateAddress,
                  vehicleClimateName,
                  id); // We save the ID in GV20 for eventual API calls

              const resultClimate = await this.polyInterface.addNode(newVehicleClimate);
              await newVehicleClimate.initializeUOM();
              await newVehicleClimate.query(true); // get current values

              logger.info('VehicleClimate added: %s', resultClimate);
              this.polyInterface.addNoticeTemp(
                'newVehicleClimate-' + vehicleClimateAddress,
                'New node created: ' + vehicleClimateName,
                5
              );

          return { added: true };

        } catch (err) {
          logger.errorStack(err, 'Vehicle add failed:');
        }
      } else {
        logger.info('Vehicle already exists: %s (%s)',
          deviceAddress, vehicle.display_name);
      }
    }
  }

  // Required so that the interface can find this Node class using the nodeDefId
  Controller.nodeDefId = nodeDefId;

  return Controller;
};


// Those are the standard properties of every nodes:
// this.id              - Nodedef ID
// this.polyInterface   - Polyglot interface
// this.primary         - Primary address
// this.address         - Node address
// this.name            - Node name
// this.timeAdded       - Time added (Date() object)
// this.enabled         - Node is enabled?
// this.added           - Node is added to ISY?
// this.commands        - List of allowed commands
//                        (You need to define them in your custom node)
// this.drivers         - List of drivers
//                        (You need to define them in your custom node)

// Those are the standard methods of every nodes:
// Get the driver object:
// this.getDriver(driver)

// Set a driver to a value (example set ST to 100)
// this.setDriver(driver, value, report=true, forceReport=false, uom=null)

// Send existing driver value to ISY
// this.reportDriver(driver, forceReport)

// Send existing driver values to ISY
// this.reportDrivers()

// When we get a query request for this node.
// Can be overridden to actually fetch values from an external API
// this.query()

// When we get a status request for this node.
// this.status()


