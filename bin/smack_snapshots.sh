#!/bin/sh

pgrep start_snapshots | xargs kill
pgrep awesomium | xargs kill
killall -9 Xvfb
rm -f /tmp/*
/var/www/newhive/bin/start_snapshots.py > /var/log/newhive/snapshot &
