# Change Log

v2.1.0 (2020-01-18)
* When the General node is in wake mode, all three nodes will be refreshed including the Climate and Security nodes
* Added configuration parameter "Enable Security Commands"
* Fixed error with sunroof status
* Added configuration parameter "Custom Logging Level"

v2.0.0 (2019-12-06)
* Split up the vehicle node for a more compact interface.  A General node, a Climate node, and a Security node
* Set charge limit control now reflects the current setting
* Moved display of status values that also have setters to only display in the control
* Combined the celsius and fahrenheit settings for driver/passenger temp into a single control
* Store and use driver and passenger climate values in status fields rather than in instance variables
* Added frunk and trunk status
* Changed sentry mode to an option list
* Changed seat heat to an option list that shows the setting in the vehicle

v1.0.5 (2019-11-17)
* Fixed GV17 for software update status values
* Updated displayed server version to 1.0.5
* Fixed precision for Odometer reading
* Support for temperature and distance UOM matching the settings in the vehicle
** GV12, GV13, GV14 now support both celsius and fahrenheit
** GV1 and GV10 support both kilometers and miles
* Added GV15 for Max Defrost status (it is COLD in the Northland)
* Separate commands for setting driver/passenger temperature in both C and F

v1.0.4 (2019-09-19)

* Added GV11 for Sentry Mode
* Added GV12 for drivers side climate control temperature (celsius only)
* Added GV13 for passengers side climate control temperature (celsius only)
* Added GV14 for outside temperature (celsius only)
* Added GV17 for software update availability status (not confirmed workings since no updates from Tesla yet)
* Added cmd WINDOWS_VENT to vent all the windows (requires Tesla V10 firmware)
* Added cmd WINDOWS_CLOSE to close all the windows (requires Tesla V10 firmware)
* Added cmd TRUNK_OPEN to open the rear trunk
* Added cmd FRUNK_OPEN to open the front trunk (frunk)
* Added cmd HEATED_SEAT_LEVEL_DRIVER to set the level on the heated seat for the driver
* Added cmd HEATED_SEAT_LEVEL_PASSENGER to set the level on the heated seat for the passenger
* Added cmd HEATED_SEAT_LEVEL_REAR_LEFT to set the level on the heated seat for the rear left seat
* Added cmd HEATED_SEAT_LEVEL_REAR_CENTER to set the level on the heated seat for the rear center seat
* Added cmd HEATED_SEAT_LEVEL_REAR_RIGHT to set the level on the heated seat for the rear right seat
* Added cmd SENTRY_MODE_ON to turn on Sentry Mode
* Added cmd SENTRY_MODE_OFF to turn off Sentry Mode
* Added cmd START_SOFTWARE_UPDATE to start the Tesla software update if one is available.
* Added cmd MAX_DEFROST_ON to turn on the Max Defrost
* Added cmd MAX_DEFROST_OFF to turn off the Max Defrost
* Added cmd CLIMATE_TEMP_SETTING_DRIVER to set the climate control temperature for the drivers side (celsius only)
* Added cmd CLIMATE_TEMP_SETTING_PASSENGER to set the climate control temperature for the passengers side (celsius only)
* Added cmd LETSLEEP to allow the vehicle to sleep. This disables short polling from contacting the Tesla API
* Added check for distance units. Will display KMs if the vehicle GUI is in KM/HR
* Will now use both the short poll and long poll. Short poll off unless WAKE cmd called first.
* Changed the default short poll time to 15 seconds
* Changed the default long poll time to 2700 seconds (45 minutes) to let the car sleep
* Properly sets online status by catching error returned from API if car is sleeping and sets GV18 to false

v1.0.3 (2019-06-14)
* Added CLITEMP internal temperature
* Added cmd CLIMATE_ON to start conditioning the vehicle
* Added cmd CLIMATE_OFF to stop conditioning the vehicle
* Added CLIEMD Climate conditioning status
* Fixed spelling of vehicle.
* Fixed sunroof data parsing when the vehicle does not have a sunroof. 

v1.0.2 (2019-05-05)
* Fixed ability to use properties in programs
* Added GV8 Locked state
* Added GV9 Sun roof percent
* Added GV10 Odometer
* State of Charge % has been moved to ST 
* Online state has been moved to GV18

v1.0.1 (2019-04-20)
* Added support for Polyglot Cloud.

v1.0.0 Initial release


