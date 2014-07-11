window.requestFileSystem(LocalFileSystem.PERSISTENT, 0, function(fileSystem){
    fileSystem.root.getFile(
        localFileName, {create: true, exclusive: false},
    function(fileEntry){
        var localPath = fileEntry.toURL()
        //if (device.platform === "Android" && localPath.indexOf("file://") === 0){
        //   localPath = localPath.substring(7);
        //}// You need to write IOS instead of Android

        var ft = new FileTransfer();
        ft.download(remoteFile, localPath, function(entry){
            window.fe = entry
            console.log('yay downloaded', entry)

            // Do what you want with successful file downloaded and then
            // call the method again to get the next file
            //downloadFile();
        }, fail)
    }, fail)
}, fail)
