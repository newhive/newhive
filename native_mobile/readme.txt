# etting up native mobile dev for Android on Linux

## probably not necessary or recommended
##download Appcelerator Titanium SDK from:
##https://my.appcelerator.com/resources
##run /path/to/download/Titanium_Studio/TitaniumStudio to install and update CLI

# download Android SDK from, symlink to /opt/google/adt:
# https://developer.android.com/sdk/index.html#ExistingIDE
# and NDK from:
# http://developer.android.com/tools/sdk/ndk/index.html

# install titanium CLI, and android debugger
sudo npm instal -g titanium alloy node-inspector
# fix ti binary by changing node to nodejs on first line
sudo vim $(which titanium )

titanium login
titanium sdk install

# download Oracle JDK from:
# http://www.oracle.com/technetwork/java/javase/downloads/jdk7-downloads-1880260.html
# unzip or symlink to /opt/oracle/jdk
# add "export JAVA_HOME=/opt/oracle/jdk" to .bashrc

titanium setup
# 8 for android setup, enter /opt/google/adt

cd ~/bin
ln -s /opt/google/adt/platform-tools/adb .
sudo adb start-server
adb devices
# if device doesn't appear, see
# http://forum.xda-developers.com/showthread.php?p=11823740&__utma=248941774.1310678152.1395404344.1395404344.1395404344.1&__utmb=248941774.3.10.1395404344&__utmc=248941774&__utmx=-&__utmz=248941774.1395404344.1.1.utmcsr=google|utmccn=(organic)|utmcmd=organic|utmctr=(not%20provided)&__utmv=-&__utmk=37989536#post11823740

# copy ~/.titanium/modules/android/ti.imagefactory/ from another dev machine

# To run interactive debugger on device, goto project directory and run:
node-inspector
# in another terminal
titanium build -p android -T device --debug-host localhost:5858 --skip-js-minify
# open localhost:8080/debug?port=5858 in chrome, F8 to start app execution
