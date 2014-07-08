#!/bin/bash
cd $(dirname $0)

name=$1
if [ -z $name ]; then
    echo need name argument. use one of:
    cd configs; echo *; cd ..
    exit
fi

# JS config
config=configs/$name
cp $config/config.js www/compiled.config.js

# app icon
convert $config/icon.* icon.png
# TODO-ios-compat
for d in platforms/android/res/drawable*; do
    cp icon.png $d;
done
rm icon.png

# cordova xml config
cat config_head.xml $config/config.xml <(echo '</widget>') > config.xml
