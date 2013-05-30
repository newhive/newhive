#! /bin/bash
# Pull down latest v2-community,
# Restart the newhive web server
# Run under crontab as newduke

# Pull latest
cd /var/www/newhive
git pull v2-community
# set permissions
sudo chmod g+rwX -R .
# restart server
sudo hive-server-deploy

