#! /bin/bash
# Restart the newhive web server
# This file usually runs under crontab as root.

sudo service apache2 restart
sudo hive-server-deploy

