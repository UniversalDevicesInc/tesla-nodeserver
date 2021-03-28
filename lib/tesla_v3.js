'use strict';

// This uses the Tesla JS library
// Ref: https://github.com/mseminatore/TeslaJS
// which implements the Tesla API - a good overview of the api is below
// Ref: https://tesla-api.timdorr.com/api-basics/authentication

// The following values must be the same as in nodeserver.js
const emailParam = 'Tesla account email';
const pwParam = 'Tesla account password';
const mfaPassCodeParam = 'MFA code';
const mfaDeviceNameParam = 'MFA Device Name';

const tjs = require('teslajs');

function delay(delay) {
  return new Promise(function(fulfill) {
    setTimeout(fulfill, delay);
  });
}

// Polyglot is the Polyglot-V2 or PGC module
// polyInterface is the instantiated Polyglot interface module
module.exports = function(Polyglot, polyInterface) {
  const logger = Polyglot.logger;
  // logger.info('blah');

  class TeslaInterface {

    constructor(polyInterface) {
      this.polyInterface = polyInterface;
    }

    async getNewTokens(params) {
      try {
        const config = {
            username: params[emailParam],
            password: params[pwParam],
            mfaPassCode: params[mfaPassCodeParam],
            mfaDeviceName: params[mfaDeviceNameParam]
          };
        const login = await tjs.loginAsync(config);

        if (login.error) {
          logger.error(login.error);
          return {error: true, errorMsg: login.error};
        }

        var token = JSON.stringify(login.body);

        if (token)
          console.log("Login Succesful! %", token);

        return login.body;
      } catch (err) {
        logger.error(error);
        return {error: true, errorMsg: error};
      }

    }    
    
    // Gets new tokens using Tesla user/password
    // private
    async getNewTokens2(params) {
      // logger.info('getNewTokens %o', params);
      tjs.loginAsync({
        username: params[emailParam],
        password: params[pwParam],
        mfaPassCode: params[mfaPassCodeParam],
        mfaDeviceName: params[mfaDeviceNameParam]
      }).done(
          // success!
          function (result) {
            result.error = false;
              if (!result.authToken) {
                return {error: true, errorMsg: "Login failed"};
              }
  
              var token = JSON.stringify(result.body);
  
              if (token) {
                  logger.debug("Login Successfull.");
                  return token;
              }
          },
          // failure!
          function (error) {
              logger.error(error);
              return {error: true, errorMsg: error};
          }
      );

    }

    // Gets new tokens using refresh token
    // private
    async refreshTokens(oauth) {
      return await tjs.refreshTokenAsync(oauth.refresh_token);
    }

    // private
    oauthIsValid(oauth) {
      const keys = oauth ? Object.keys(oauth) : [];
      const requiredKeys = ['access_token', 'refresh_token', 'created_at',
        'expires_in', 'token_type'];

      const missingKeys = requiredKeys.filter(function(key) {
        return !keys.includes(key);
      });

      if (missingKeys.length) {
        logger.error('oauth is invalid: %o', oauth);
      }

      return !missingKeys.length;
    }

    // private
    saveTokens(oauth) {
      if (this.oauthIsValid(oauth)) {
        logger.info('Saving new tokens to customData');
        this.polyInterface.addCustomData({oauth: oauth});
      } else {
        logger.error('Could not save new tokens: There are missing keys');
      }
    }

    // private
    clearTokens() {
      logger.error('Clearing tokens');
      this.polyInterface.addCustomData({oauth: null});
    }

    // Gets access token from customData, or requests new token if required
    // private
    async getAccessToken(forceRefresh = false) {
      const config = this.polyInterface.getConfig();
      const params = config.customParams;
      let oauth = config.customData.oauth;
      let newTokens = false;

      // logger.info('existing oauth1: %o', oauth);
      if (!(oauth && oauth.access_token)) {
        logger.info('Getting new tokens');
        oauth = await this.getNewTokens(params);
        this.saveTokens(oauth);
        newTokens = true;
        await delay(2000); // Wait 2 seconds before using new tokens
      }

      const tokenExpiry = oauth && oauth.created_at && oauth.expires_in ?
        new Date((oauth.created_at + oauth.expires_in) * 1000) : null;

      // Expired or expires in less than 60 seconds?
      if ((tokenExpiry && new Date().valueOf() + 60000 > tokenExpiry.valueOf())
        || forceRefresh) {
        logger.info('Refreshing tokens%s', forceRefresh ? ' [FORCED]' : '');

        try {
          oauth = await this.refreshTokens(oauth);
        } catch (err) {
          if (err.statusCode === 401) {
            // Refresh token not valid? Clear tokens, so that we try with
            // the password grant next time.
            this.clearTokens();
          }
          throw err;
        }

        this.saveTokens(oauth);
        newTokens = true;
        await delay(2000); // Wait 2 seconds before using new tokens
      }

      if (!newTokens) {
        logger.info('Reusing existing tokens');
      }

      // logger.info('existing oauth: %o', oauth);
      return oauth && oauth.access_token ? oauth.access_token : null;
    }

    async getTJOptions() {
      const accessToken = await this.getAccessToken();

      return {
        "authToken": accessToken
      }
    }
    
    async getTJOptionsId(id) {
      const accessToken = await this.getAccessToken();

      return {
        "authToken": accessToken,
        "vehicleID": id
      }
    }

    async getVehicles() {
      const options = await this.getTJOptions();
      return await tjs.vehiclesAsync(options);
    }

    // Get a specific vehicle
    async getVehicle(id) {
      const options = await this.getTJOptionsId(id);
      const result = await tjs.vehiclesAsync(options);
      if (result && result[0])
        return result[0];
    }

    // Get all vehicle data
    async getVehicleData(id) {
      const options = await this.getTJOptionsId(id);
      return await tjs.vehicleDataAsync(options);
    }

    // Get a vehicle charge state
    async getVehicleChargeState(id) {
      const options = await this.getTJOptionsId(id);
      return await tjs.chargeStateAsync(options);
    }

    // Get a vehicle GUI settings
    async getVehicleGuiSettings(id) {
      const options = await this.getTJOptionsId(id);
      return await tjs.guiSettingsAsync(options);
    }

    // Get a vehicle climate state
    async getVehicleClimateState(id) {
      const options = await this.getTJOptionsId(id);
      return await tjs.climateStateAsync(options);
      
    }

    async wakeUp(id) {
      const options = await this.getTJOptionsId(id);
      return await tjs.wakeUpAsync(options);
      
    }

    async cmdDoorUnlock(id) {
      const options = await this.getTJOptionsId(id);
      return await tjs.doorUnlockAsync(options);
   }

    async cmdDoorLock(id) {
      const options = await this.getTJOptionsId(id);
      return await tjs.doorLockAsync(options);
   }

    async cmdHonkHorn(id) {
      const options = await this.getTJOptionsId(id);
      return await tjs.honkHornAsync(options);
    }

    async cmdFlashLights(id) {
      const options = await this.getTJOptionsId(id);
      return await tjs.flashLightsAsync(options);
    }

    async cmdHvacStart(id) {
      const options = await this.getTJOptionsId(id);
      return await tjs.climateStartAsync(options);
    }

    async cmdHvacStop(id) {
      const options = await this.getTJOptionsId(id);
      return await tjs.climateStopAsync(options);
    }

    async cmdSetTemperature(id, driverTempC, passengerTempC) {
      const options = await this.getTJOptionsId(id);
      return await tjs.setTempsAsync(options, driverTempC, passengerTempC);
    }

    async cmdChargeLimitSetTo(id, percent) {
      const options = await this.getTJOptionsId(id);
      return await tjs.setChargeLimitAsync(options, percent);
    }

    async cmdSunRoof(id, state) {
      const validStates = ['vent', 'close'];
      // Controls the panoramic sunroof on the Model S.
      // Note: There were state options for open (100%), comfort (~80%), and
      // move (combined with a percent parameter), but they have since been
      // disabled server side. It is unknown if they will return at a later
      // time.

      if (!validStates.includes(state)) {
        throw new Error('Invalid sun roof state requested: ' + state);
      }

      const options = await this.getTJOptionsId(id);
      return await tjs.sunRoofControlAsync(options, state);
      
    }

    async cmdActuateTrunk(id, state) {
      const validTrunks = ['rear', 'front'];
      if (!validTrunks.includes(state)) {
        throw new Error('Invalid trunk requested: ' + state);
      }

      const options = await this.getTJOptionsId(id);
      return await tjs.openTrunkAsync(options, state);
    }

    async cmdChargePortOpen(id) {
      const options = await this.getTJOptionsId(id);
      return await tjs.openChargePortAsync(options);
    }

    async cmdChargePortClose(id) {
      const options = await this.getTJOptionsId(id);
      return await tjs.closeChargePortAsync(options);
    }

    async cmdChargeStart(id) {
      const options = await this.getTJOptionsId(id);
      return await tjs.startChargeAsync(options);
    }

    async cmdChargeStop(id) {
      const options = await this.getTJOptionsId(id);
      return await tjs.stopChargeAsync(options);
    }

    async cmdWindows(id, state) {
      const validStates = ['vent', 'close'];
      if (!validStates.includes(state)) {
        throw new Error('Invalid window position state requested: ' + state);
      }

      const options = await this.getTJOptionsId(id);
      return await tjs.windowControlAsync(options, state);
    }

    async cmdHeatedSeats(id, seat, level) {
      // 0 = driver
      // 1 = passenger
      // 2 = rear left
      // API docs show they skip 3. I don't know why.
      // 4 = rear center
      // 5 = rear right
      // 7 = 3rd row left
      // 8 = 3rd row right
      const validSeats = ['0', '1', '2', '4', '5', '7', '8'];
      if (!validSeats.includes(seat)) {
        throw new Error('Invalid seat requested: ' + seat);
      }

      const validHeaterLevel = ['0', '1', '2', '3'];
      if (!validHeaterLevel.includes(level)) {
        throw new Error('Invalid level requested: ' + level);
      }

      const options = await this.getTJOptionsId(id);
      return await tjs.seatHeaterAsync(options, seat, level);
      
    }

    async cmdSentryMode(id, state) {
      const validStates = ['on', 'off'];
      if (!validStates.includes(state)) {
        throw new Error('Invalid Sentry Mode state requested: ' + state);
      }

      const options = await this.getTJOptionsId(id);
      return await tjs.setSentryModeAsync(options, state);
    }

    async cmdStartSoftwareUpdate(id) {
      const options = await this.getTJOptionsId(id);
      return await tjs.scheduleSoftwareUpdateAsync(options, 0);
    }

    async cmdMaxDefrost(id, state) {
      const validStates = ['on', 'off'];
      if (!validStates.includes(state)) {
        throw new Error('Invalid Max Defrost state requested: ' + state);
      }

      const options = await this.getTJOptionsId(id);
      return await tjs.maxDefrostAsync(options, state === "on");
    }

    async cmdSetClimateTemp(id, drivers_temp, passengers_temp) {
      const options = await this.getTJOptionsId(id);
      return await tjs.setTempsAsync(options, drivers_temp, passengers_temp);
    }

  }

  return new TeslaInterface(polyInterface); // Module returns a singleton
};
