#!/bin/sh
pgrep -g $(ps h -o pgrp $(pgrep server.py)) | xargs kill -9
