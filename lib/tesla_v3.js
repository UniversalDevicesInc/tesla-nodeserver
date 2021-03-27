'use strict';

// Tesla Client ID and Secret taken from here: https://pastebin.com/pS7Z6yyP
// Ref: https://tesla-api.timdorr.com/api-basics/authentication

// Must be the same as in nodeserver.js
const emailParam = 'Tesla account email';
const pwParam = 'Tesla account password';
const mfaPassCodeParam = 'MFA code';
const mfaDeviceNameParam = 'MFA Device Name';

//TODO: replaced with teslajs
//const oAuthClientId =
//  '81527cff06843c8634fdc09e8ac0abefb46ac849f38fe1e431c2ef2106796384';
//const oAuthClientSecret =
//  'c7257eb71a564034f9419ee651c7d0e5f7aa6bfbd18bafb5c5c033b093bb2fa3';

//TODO: replaced with teslajs
//const teslaApiHost = 'owner-api.teslamotors.com';
//const teslaApiHeaders = {
//  'x-tesla-user-agent': 'TeslaApp/3.4.4-350/fad4a582e/android/8.1.0',
//  'user-agent': 'Mozilla/5.0 (Linux; Android 8.1.0; ' +
//    'Pixel XL Build/OPM4.171019.021.D1; wv) ' +
//    'AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 ' +
//    'Chrome/68.0.3440.91 Mobile Safari/537.36',
//};

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

    // noinspection JSMethodCanBeStatic
    // private
// TODO: replaced by teslajs
//    async oAuthRequest(body) {
//      // logger.info('before req %o', body);
//      return request({
//        method: 'POST',
//        url: 'https://' + teslaApiHost + '/oauth/token',
//        json: true,
//        gzip: true,
//        headers: teslaApiHeaders,
//        body: body,
//      });
//    }

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

// TODO: replaced by teslajs
///      return this.oAuthRequest({
///        grant_type: 'password',
///        client_id: oAuthClientId,
///        client_secret: oAuthClientSecret,
///        email: params[emailParam],
///        password: params[pwParam],
///      });
     
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
                  /// console.error("Login failed!".red);
                  /// process.exit(1);
                return {error: true, errorMsg: "Login failed"};
              }
  
              var token = JSON.stringify(result.body);
  
              if (token) {
                  logger.debug("Login Successfull.");
                  /// console.log("OAuth token is: " + token.green);
  
                  /// fs.writeFileSync('.token', token, 'utf8');
                  /// console.log('Auth token saved!');
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
      // logger.info('refreshTokens %o', oauth);
// TODO: replaced with teslajs
//      return this.oAuthRequest({
//        grant_type: 'refresh_token',
//        client_id: oAuthClientId,
//        client_secret: oAuthClientSecret,
//        refresh_token: oauth.refresh_token,
//      });
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

 // TODO: replaced with teslajs

    // private
//    async teslaApi(method, url, body, forceRefresh = false) {
//      logger.info('Tesla API: %s', url);
//
//      try {
//        const accessToken = await this.getAccessToken(forceRefresh);
//        let req = {
//          method: method,
//          auth: {
//            bearer: accessToken,
//            // + (forceRefresh ? '1' : '1'), TESTING
//          },
//          headers: teslaApiHeaders,
//          url: 'https://' + teslaApiHost + url,
//          json: true,
//          gzip: true,
//        };
//
//        if (body) {
//          req.body = body;
//        }
//
//        const result = await request(req);
//
//        // If not successful
//        if (result && result.response && 'result' in result.response) {
//          if (!result.response.result) {
//            logger.info('Tesla API result for %s%s: %o',
//              url,
//              body ? ' ' + JSON.stringify(body) : '',
//              result.response.reason ? result.response.reason : result);
//          }
//        }
//
//        return result;
//      } catch (err) {
//        if (err.statusCode === 401 && !forceRefresh) {
//          // Retry it, but get a new accessToken first
//          return this.teslaApi(method, url, body, true);
//        } else if (err.statusCode === 408) {
//          logger.info('Tesla sleeping and returned error code 408 - use WAKE cmd to wake it up');
//          return err.statusCode;
//        } else {
//          logger.error('Tesla API %s returned: %s', url, err.message);
//          // logger.errorStack(err, 'Error processing tesla API:');
//          throw err;
//        }
//      }
//    }
//    async teslaApiGet(url) {
//      return this.teslaApi('GET', url);
//    }
//
//    async teslaApiPost(url, body) {
//      return this.teslaApi('POST', url, body);
//    }
    
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
// TODO: replace with teslajs      
//      return await this.teslaApiGet('/api/1/vehicles');
      const options = await this.getTJOptions();
      return await tjs.vehiclesAsync(options);
    }

    // Get a specific vehicle
    async getVehicle(id) {
// TODO: replace with teslajs      
//      return await this.teslaApiGet('/api/1/vehicles/' + id);
      const options = await this.getTJOptionsId(id);
      const result = await tjs.vehiclesAsync(options);
      if (result && result[0])
        return result[0];
    }

    // Get all vehicle data
    async getVehicleData(id) {
      // TODO: replace with teslajs      
//      return await this.teslaApiGet('/api/1/vehicles/' + id + '/vehicle_data');
      const options = await this.getTJOptionsId(id);
      return await tjs.vehicleDataAsync(options);
    }

    // Get a vehicle charge state
    async getVehicleChargeState(id) {
      // TODO: replace with teslajs      
//      return await this.teslaApiGet(
//        '/api/1/vehicles/' + id + '/data_request/charge_state');
      const options = await this.getTJOptionsId(id);
      return await tjs.chargeStateAsync(options);
    }

    // Get a vehicle GUI settings
    async getVehicleGuiSettings(id) {
      // TODO: replace with teslajs      
//      return await this.teslaApiGet(
//        '/api/1/vehicles/' + id + '/data_request/gui_settings');
      const options = await this.getTJOptionsId(id);
      return await tjs.guiSettingsAsync(options);
    }

    // Get a vehicle climate state
    async getVehicleClimateState(id) {
      // TODO: replace with teslajs      
//      return await this.teslaApiGet(
//        '/api/1/vehicles/' + id + '/data_request/climate_state');
      const options = await this.getTJOptionsId(id);
      return await tjs.climateStateAsync(options);
      
    }

    async wakeUp(id) {
      // TODO: replace with teslajs      
//      return await this.teslaApiPost('/api/1/vehicles/' + id + '/wake_up');
      const options = await this.getTJOptionsId(id);
      return await tjs.wakeUpAsync(options);
      
    }

    // TODO: replace with teslajs      
//    async command(id, cmd, body = null) {
//      return await this.teslaApiPost('/api/1/vehicles/' + id +
//        '/command/' + cmd, body);
//    }

    async cmdDoorUnlock(id) {
      // TODO: replace with teslajs      
//      return await this.command(id, 'door_unlock');
      const options = await this.getTJOptionsId(id);
      return await tjs.doorUnlockAsync(options);
   }

    async cmdDoorLock(id) {
      // TODO: replace with teslajs      
//      return await this.command(id, 'door_lock');
      const options = await this.getTJOptionsId(id);
      return await tjs.doorLockAsync(options);
   }

    async cmdHonkHorn(id) {
      // TODO: replace with teslajs      
//     return await this.command(id, 'honk_horn');
      const options = await this.getTJOptionsId(id);
      return await tjs.honkHornAsync(options);
    }

    async cmdFlashLights(id) {
      // TODO: replace with teslajs      
//      return await this.command(id, 'flash_lights');
      const options = await this.getTJOptionsId(id);
      return await tjs.flashLightsAsync(options);
    }

    async cmdHvacStart(id) {
      // TODO: replace with teslajs      
//     return await this.command(id, 'auto_conditioning_start');
      const options = await this.getTJOptionsId(id);
      return await tjs.climateStartAsync(options);
    }

    async cmdHvacStop(id) {
      // TODO: replace with teslajs      
//      return await this.command(id, 'auto_conditioning_stop');
      const options = await this.getTJOptionsId(id);
      return await tjs.climateStopAsync(options);
    }

    async cmdSetTemperature(id, driverTempC, passengerTempC) {
      // TODO: replace with teslajs      
//      return await this.command(id, 'set_temps', {
//        driver_temp: driverTempC,
//        passenger_temp: passengerTempC,
//      });
      const options = await this.getTJOptionsId(id);
      return await tjs.setTempsAsync(options, driverTempC, passengerTempC);
    }

    async cmdChargeLimitSetTo(id, percent) {
      // TODO: replace with teslajs      
//      return await this.command(id, 'set_charge_limit', {
//        percent: percent,
//      });
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

      // TODO: replace with teslajs      
//      return await this.command(id, 'sun_roof_control', {
//        state: state,
//      });
      const options = await this.getTJOptionsId(id);
      return await tjs.sunRoofControlAsync(options, state);
      
    }

    async cmdActuateTrunk(id, state) {
      const validTrunks = ['rear', 'front'];
      if (!validTrunks.includes(state)) {
        throw new Error('Invalid trunk requested: ' + state);
      }

      // TODO: replace with teslajs      
//      return await this.command(id, 'actuate_trunk', {
//        which_trunk: state,
//      });
      const options = await this.getTJOptionsId(id);
      return await tjs.openTrunkAsync(options, state);
    }

    async cmdChargePortOpen(id) {
      // TODO: replace with teslajs      
//      return await this.command(id, 'charge_port_door_open');
      const options = await this.getTJOptionsId(id);
      return await tjs.openChargePortAsync(options);
    }

    async cmdChargePortClose(id) {
      // TODO: replace with teslajs      
//      return await this.command(id, 'charge_port_door_close');
      const options = await this.getTJOptionsId(id);
      return await tjs.closeChargePortAsync(options);
    }

    async cmdChargeStart(id) {
      // TODO: replace with teslajs      
//      return await this.command(id, 'charge_start');
      const options = await this.getTJOptionsId(id);
      return await tjs.startChargeAsync(options);
    }

    async cmdChargeStop(id) {
      // TODO: replace with teslajs      
//      return await this.command(id, 'charge_stop');
      const options = await this.getTJOptionsId(id);
      return await tjs.stopChargeAsync(options);
    }

    async cmdWindows(id, state) {
      const validStates = ['vent', 'close'];
      if (!validStates.includes(state)) {
        throw new Error('Invalid window position state requested: ' + state);
      }

      // TODO: replace with teslajs      
//      return await this.command(id, 'window_control', {
//        command: state,
//        lat: 0,
//        long: 0,
//      });
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

      // TODO: replace with teslajs      
//      return await this.command(id, 'remote_seat_heater_request', {
//        heater: seat,
//        level: level,
//      });
      const options = await this.getTJOptionsId(id);
      return await tjs.seatHeaterAsync(options, seat, level);
      
    }

    async cmdSentryMode(id, state) {
      const validStates = ['on', 'off'];
      if (!validStates.includes(state)) {
        throw new Error('Invalid Sentry Mode state requested: ' + state);
      }

      // TODO: replace with teslajs      
//      return await this.command(id, 'set_sentry_mode', {
//        on: state === 'on',
//      });
      const options = await this.getTJOptionsId(id);
      return await tjs.setSentryModeAsync(options, state);
    }

    async cmdStartSoftwareUpdate(id) {
      // TODO: replace with teslajs      
//      return await this.command(id, 'schedule_software_update', {
//        offset_sec: 0,
//      });
      const options = await this.getTJOptionsId(id);
      return await tjs.scheduleSoftwareUpdateAsync(options, 0);
    }

    async cmdMaxDefrost(id, state) {
      const validStates = ['on', 'off'];
      if (!validStates.includes(state)) {
        throw new Error('Invalid Max Defrost state requested: ' + state);
      }

      // TODO: replace with teslajs      
//      return await this.command(id, 'set_preconditioning_max', {
//        on: state === 'on',
//      });
      const options = await this.getTJOptionsId(id);
      return await tjs.maxDefrostAsync(options, state);
    }

    async cmdSetClimateTemp(id, drivers_temp, passengers_temp) {
      // TODO: replace with teslajs      
//      return await this.command(id, 'set_temps', {
//        driver_temp: drivers_temp,
//        passenger_temp: passengers_temp,
//      });
      const options = await this.getTJOptionsId(id);
      return await tjs.setTempsAsync(options, drivers_temp, passengers_temp);
    }

  }

  return new TeslaInterface(polyInterface); // Module returns a singleton
};
