#!/bin/sh
process_group=$(ps h -o pgrp $(pgrep server.py))
ps ah -o pid,pgrp | egrep ' '$process_group'$' | cut -d' ' -f1 | xargs kill
