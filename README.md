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
3. You should see a "Tesla Controller" node appear in the ISY admin console, and your vehicule(s) underneat. You may need to restart the admin console.
4. You can adjust in Polyglot the short poll value which represents how frequent data is refreshed, in seconds. The long poll is not used. 
