#!/bin/sh
adb kill-server
adb start-server
adb devices
