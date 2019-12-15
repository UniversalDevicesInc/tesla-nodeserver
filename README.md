# Tesla Nodeserver

This Nodeserver works with both Polyglot V2 (On-premises installation) and Polyglot cloud.

### Pre-requisites
1. Own a Tesla Vehicle
2. Have your Tesla account user ID and password.
3. If you want to use it on the cloud, you also need an 
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

1. Login to Polyglot and go to your Tesla nodeserver.
2. Enter your Tesla account user ID and password
3. You should see a "Tesla Controller" node appear in the ISY admin console, and your vehicle(s) underneath. You may need to restart the admin console.
4. As of version 1.0.4 polling behaviour has changed. The short poll value is defaulted to 15 seconds and is intended to give near real time updates without letting the vehicle go to sleep. By default short polling will not be active so you may not see data populate in the ISY admin area at first launch. Issuing the "Wake" command will enable the short poll to call the Tesla API. Issuing the "Let vehicle sleep" command will again disable short polling. Note that if you do not issue the "Let vehicle sleep" command then the Tesla will not go to sleep as the polling rate is fairly high and accessing the Tesla API will keep the vehicle awake.
5. In addition, as of 2.0.0 the long poll is used by the Security and Climate nodes to refresh the status.  The Query command may be used to refresh each of these nodes individually, but unlike the general node will not continue to poll. 

Long polling is now defaulted to 2700 seconds (45 minutes) to allow the Tesla time to fall asleep but still periodically gather data from it if it happens to be awake.

The use case intended for more real time short term polling with the ability to enable/disable it programmatically is so you could issue a command to the vehicle (e.g. start the climate control system) and then get a notification when the vehicle is now up to temperature. 

You can adjust in Polyglot the short and long poll values which represents how frequently data is refreshed, in seconds.
