## Configuring this node server

Before saving the following information, please make sure your car is awake.  It is sufficient to go into the Tesla app on your phone to wake your car.

Please enter your Tesla account email and password. Once saved,
you should see your vehicle node appear in the admin console. You
may have to restart the admin console. 

You can also fine tune how often the node data is refreshed by 
configuring the Short Poll. The Long Poll is used as a timeout for limiting the amount of "wake" time.

The setting *Enable Security Commands* may be set to either "true" or "false".  The value "true" will enable all commands.  Or, individual commands may be enabled with a comma separated list of values from "lock", "sunroof", "charge\_port", "windows", "trunk", "frunk", "sentry", and "software\_update".

If you want to use the Home Location functionality, enter your home latitude and longitude in the *Home Lat Lon*.  The decimal values must be separated by a space.  e.g. 37.4924845 -121.944623

The setting *Custom Logging Level* may have the values "error", "warn", "info", "verbose", "debug".
