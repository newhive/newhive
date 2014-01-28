define([
    'browser/jquery'
], function(
    $
){
    var o = {};

    o.submit = function(files, opts){
        opts = $.extend({
            url: '/api/file/create',
            data: new FormData(),
            type: 'POST',

            // beforeSend: beforeSendHandler,
            // xhr: function() {  // custom xhr
            //     var myXhr = $.ajaxSettings.xhr();
            //     if(myXhr.upload) myXhr.upload.addEventListener(
            //         'progress', on_progress, false);
            //     return myXhr;
            // },

            cache: false,
            contentType: false,
            processData: false
        }, opts);

        if(files){
            for(var i = 0; i < files.length; i++){
                var f = files.item(i);
                opts.data.append('files', f.slice(0, f.size), f.name);
            }
        }

        $.ajax(opts);
    };

    o.unwrap_file_list = function(file_list){
        // if(!file_api) return;
        var files = [];
        var urlCreator = window.URL || window.webkitURL;
        // FileList is not a list at all, has no map :'(
        for(var i = 0; i < file_list.length; i++){
            var f = file_list.item(i), file = {
                url: urlCreator.createObjectURL(f),
                name: f.name,
                mime: f.type
            };
            files.push(file);
        };
        return files;
    };

    o.drop_target = function(el, on_files, on_response){
        var on_drop = function(ev){
            var dt = ev.originalEvent.dataTransfer,
                files = [],
                file_list = dt.files,
                url = dt.getData("URL");
            if (file_list.length == 0 && url.length) {
                // TODO-bugbug: make async request for URL, call on_files on
                // success with actual content-type
                var file_name = url.split("/").slice(-1)[0];
                var i = file_name.lastIndexOf(".");
                if (i > 0) {
                    var name = file_name.slice(0, i);
                    var ext = file_name.slice(i + 1);
                    // TODO-cleanup: have this live somewhere global
                    // TODO-dnd: handle audio
                    var image_mimes = {
                        "jpg": "image/jpeg",
                        "jpeg": "image/jpeg",
                        "gif": "image/gif",
                        "png": "image/png"
                    };
                    var mime = image_mimes[ext];
                    if (mime) {
                        files.push({
                            url: url,
                            name: name,
                            mime: mime
                        });
                    }
                    on_files(files);
                }
            } else{
                on_files(o.unwrap_file_list(file_list));
            }

            o.submit(dt.files, { success: on_response });

            return false;
        };

        el.on('dragenter dragover', function(ev){
                ev.preventDefault();
            }).on('drop', on_drop);
    };

    return o;
});