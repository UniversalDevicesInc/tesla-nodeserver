## Configuring this node server

Before saving the following information, please make sure your car is awake.  To wake your car it is sufficient to go into the Tesla app on your phone.

Please enter your Tesla account email and password. Once entered,
you should see your vehicle node appear in the admin console. You
may have to restart the admin console. 

You can also fine tune how often the node data is refreshed by 
configuring the Short Poll. The Long Poll is used by the Security and Climate nodes to refresh their status.

The setting *Enable Security Commands* may be set to either "true" or "false".  If you do not want to be able to unlock the car or open the frunk/trunk/windows, then any value other than "true" will disable the security commands.

The setting *Custom Logging Level* may have the values "error", "warn", "info", "verbose", "debug".
