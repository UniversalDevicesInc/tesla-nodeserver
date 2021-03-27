# Tesla Nodeserver

This Nodeserver works with both Polyglot V2 (On-premises installation) and Polyglot cloud.

### Pre-requisites
1. Own a Tesla Vehicle
2. Have your Tesla account user ID and password.
3. Your Tesla account configured optionally with Multi-Factor authentication 
4. If you want to use it on the cloud, you also need an 
[ISY Portal](https://my.isy.io) account, and a [license to access your ISY](https://wiki.universal-devices.com/index.php?title=ISY_Portal_Renewal_Instructions).

### Nodeserver Installation
If you want to use this Nodeserver in the cloud, just go to [polyglot.isy.io](https://polyglot.isy.io/store), click on Store, and add the Tesla Nodeserver.

If you want to use it on-premises: 
1. Install Polyglot-V2. [Instructions here](https://github.com/UniversalDevicesInc/polyglot-v2)
2. Make sure you have Node.js & NPM installed

```
sudo apt install nodejs
sudo apt install npm
```

3. Install this node server

Go to Nodeservers|Nodeserver Store, and add the Tesla Nodeserver.

### Configuration

1. Login to Polyglot and go to your Tesla nodeserver.  It may take a minute for the node to show up.
2. Enter your Tesla account user ID, password, Multi-Factor Device name (Optional), and Multi-Factor passcode (Optional)
3. You should see a "Tesla Controller" node appear in the ISY admin console, and your vehicle(s) underneath. You may need to restart the admin console.
4. As of version 1.0.4 polling behaviour has changed. The short poll value is defaulted to 15 seconds and is intended to give near real time updates without letting the vehicle go to sleep. By default short polling will not be active so you may not see data populate in the ISY admin area at first launch. Issuing the "Wake" command will enable the short poll to call the Tesla API. Issuing the "Let vehicle sleep" command will again disable short polling. Note that if you do not issue the "Let vehicle sleep" command then the Tesla will not go to sleep as the polling rate is fairly high and accessing the Tesla API will keep the vehicle awake.
5. As of version 2.1.0 when the General node is in wake mode it will refresh on the short poll and so will the Security and Climate nodes.
6. As of version 2.1.0 the ability to enable/disable the security commands.  By default "Enable Security Commands" is set to false.
7. As of version 2.1.0 a configuration value to change the logging level to help in debugging.
8. As of 2.2.0 the long poll is used to limit the "wake" period.  The Query command may be used to refresh the nodes independent of the wake status.
9. As of 3.0.0, Multi-Factor Authentication is required on the Tesla account

Note that when setting up your Tesla account, you may add up to two Multi-Factor Authentication devices.  If you have more than one device they are named.  In the nodeserver configuration, specifying the name of the device is optional but will need to be specified if you have more than one device registered. The Multi-Factor Device name should be entered in the nodeserver configuration along with the generated passcode.  The passcodes are time limited so it is best to enter the passcode last before saving the configuration.  Also, the best practice is to enter the passcode right after it changes to give the system time to save and use the passcode before it expires. 

Long polling is now defaulted to 2700 seconds (45 minutes) to allow the Tesla time to fall asleep but still periodically gather data from it if it happens to be awake.  The long poll is also the limit of time that the "wake" command will run the short poll.

The use case intended for more real time short term polling with the ability to enable/disable it programmatically is so you could issue a command to the vehicle (e.g. start the climate control system) and then get a notification when the vehicle is now up to temperature. 

You can adjust in Polyglot the short and long poll values which represents how frequently data is refreshed, in seconds.

The configuration setting "Enable Security Commands" allows you to limit security sensitive controls like your vehicle's doors, frunk, trunk, or windows.  Values for the configuration are "true/false".  Enter the value "true" to enable all the security commands.  Or, individual commands may be enabled with a comma separated list of values from "lock", "sunroof", "charge\_port", "windows", "trunk", "frunk", "sentry", and "software\_update".

If you want to use the Home Location functionality, enter your home latitude and longitude in the *Home Lat Lon*.  The decimal values must be separated by a space.  e.g. 37.4924845 -121.944623

The configuration setting *Custom Logging Level* may have the values "error", "warn", "info", "verbose", "debug".
