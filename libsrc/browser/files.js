define([
    'browser/jquery'
], function(
    $
){
    var o = {};

    var _submit = function(form, files){
        var form_data = new FormData(form[0]);
        if(files){
            for(var i = 0; i < files.length; i++){
                var f = files.item(i);
                form_data.append('files', f.slice(0, f.size), f.name);
            }
        }

        // TODO-polish: add busy indicator while uploading
        $.ajax({
            url: form.attr('action'),
            type: 'POST',
            // xhr: function() {  // custom xhr
            //     var myXhr = $.ajaxSettings.xhr();
            //     if(myXhr.upload) myXhr.upload.addEventListener(
            //         'progress', on_progress, false);
            //     return myXhr;
            // },
            //Ajax events
            // beforeSend: beforeSendHandler,
            success: function(data){
                // if(!file_api) input.trigger('with_files',
                    // [ data.map(function(f){ return f.url }) ]);
                form.trigger('response', [data]);
                form.find("*[type=submit]").
                    removeClass('disabled').prop('disabled','');
            },
            error: function(data){
                // TODO: open new window with debugger
                console.error("Server error post request: " + form.attr('action')
                    + '\n(remove form handlers to see error) $("form").unbind("submit")');
                form.trigger('error', [data]);
            },
            data: form_data,

            cache: false,
            contentType: false,
            processData: false
        });
    };

    o.submit = function(form){ _submit(form); };

    o.drop_target = function(el, on_files, on_response){
        var with_files = function(file_list){
            if(!file_api) return;
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
            on_files(files);
        };

        var on_drop = function(ev){
            var dt = ev.originalEvent.dataTransfer;
            if(!dt || !dt.files || !dt.files.length) return;

            var dt = ev.originalEvent.dataTransfer,
                files = [];
                file_list = dt.files,
                url = dt.getData("URL");
            if (file_list.length == 0 && url.length) {
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
                with_files(file_list);
            }

            _submit(dt.files);
        };

        el.on('dragenter dragover', function(ev){
                ev.preventDefault();
            }).on('drop', on_drop);
    };

    return o;
});