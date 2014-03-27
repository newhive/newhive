define([
    'browser/jquery'
], function(
    $
){
    var o = {};

    // files = false or list of files to upload
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
                var f = files[i];
                opts.data.append('files', f.slice(0, f.size), f.name);
            }
        }
        // if (files.length)
            $.ajax(opts);
    };

    o.unwrap_file_list = function(file_list){
        // if(!file_api) return;
        var files = [];
        var urlCreator = window.URL || window.webkitURL;
        for(var i = 0; i < file_list.length; i++){
            var f = file_list[i], file = {
                url: urlCreator.createObjectURL(f),
                name: f.name,
                mime: f.type
            };
            files.push(file);
        };
        return files;
    };

    o.file_list_to_list = function(input_file_list) {
        var file_list = [];
        file_list[input_file_list.length - 1] = 0;
        return $.map(input_file_list, function(x, i) {
            return input_file_list.item(i);});
    }
    var filters = [ 
        function(url) { return url; }
        ,function(url) {
            // Test for a google image redirect
            var redirected = unescape(url);
            return redirected.replace(/^.*imgurl=([^&]*)(&.*)?/, '$1');
        }
    ];
    o.drop_target = function(el, on_files, on_response){
        var on_drop = function(ev){
            var dt = ev.originalEvent.dataTransfer,
                files = [],
                orig_url = dt.getData("URL");
            var file_list = o.file_list_to_list(dt.files);
            if (file_list.length == 0 && orig_url.length) {
                for (var n = 0; n < filters.length; ++n) {
                    // TODO-bugbug: make async request for URL, call on_files on
                    // success with actual content-type
                    var url = filters[n](orig_url)
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
                            on_files(files, file_list);
                            break;
                        }
                    }
                }
            } else {
                on_files(o.unwrap_file_list(file_list), file_list);
            }

            o.submit(file_list, { success: on_response });

            return false;
        };

        el.on('dragenter dragover', function(ev){
            ev.preventDefault();
        }).on('drop', on_drop);
    };

    return o;
});