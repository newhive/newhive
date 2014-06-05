#!/bin/sh
process_group=$(ps h -o pgrp $(pgrep server.py) | head -n 1)
ps ah -o pgrp,pid | egrep '^'$process_group' ' | awk '{print $2}' | xargs kill -9