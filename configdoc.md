## Configuring this node server

Before saving the following information, please make sure your car is awake.  To wake your car it is sufficient to go into the Tesla app on your phone.

Please enter your Tesla account email and password. Once entered,
you should see your vehicle node appear in the admin console. You
may have to restart the admin console. 

You can also fine tune how often the node data is refreshed by 
configuring the Short Poll. The Long Poll is used as a timeout for limiting the amount of "wake" time.

The setting *Enable Security Commands* may be set to either "true" or "false".  The value "true" will enable all commands.  Or, individual commands may be enabled with a comma separated list of values from "lock", "sunroof", "charge\_port", "windows", "trunk", "frunk", "sentry", and "software\_update".

The setting *Custom Logging Level* may have the values "error", "warn", "info", "verbose", "debug".
