var download_feed = function(){
    var download = function(url, on_finish){ download_url(
        function(err){
            console.log('uh oh', err)
        }, url, on_finish)
    }
    download(config.content_url + expr_path, function(expr_file){
        console.log(expr_file)
    })
}

var download_expr = function(expr_path){
}

var download_url = function(on_err, url, on_finish){
    var local_name = url.substring(url.lastIndexOf('/')+1)
        ,xhr = new XMLHttpRequest()
    var save_file = function(){
        window.requestFileSystem(LocalFileSystem.PERSISTENT, 0,
            function(fileSystem){
                fileSystem.root.getFile(local_name,
                    {create: true, exclusive: false},
                    function(fileEntry){
                        fileEntry.createWriter(function(fileWriter){
                            fileWriter.onwriteend = function(e){
                                on_finish(fileEntry.toURL())
                            }
                            fileWriter.write(xhr.response)
    }) } ) } ) }

    xhr.onreadystatechange = function(){
        if (this.readyState == 4){
            if(this.status == 200)
                save_file()
            else
                on_err('download failed')
        }
    }
    xhr.responseType = 'blob'
    xhr.open('GET', url)
    xhr.send()
}

