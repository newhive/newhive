function asyncUpload(opts) {
    var target, form, opts = $.extend({
        json : true, file_name : 'file', multiple : false, action: '/'
        , start : noop, success : noop, error: noop, input_click: true
        , data : { action : opts.post_action || 'file_create' } 
    }, opts);

    var onload = function() {
        var frame = target.get(0);
        if(!frame.contentDocument || !frame.contentDocument.body.innerHTML) return;
        var resp = $(frame.contentDocument.body).text();
        if(opts.json) {
            try{
                resp = JSON.parse(resp);
            } catch (e) {
                // JSON parsing will fail if server returns a 500
                // Suppress this and call the error callback
                opts.error(resp);
            }
            if(!opts.multiple){ resp = resp[0]; }
        }
        opts.success(resp);
        form.remove();
    }

    var tname = 'upload' + Math.random();
    form = $('<form>').css({ position: 'absolute', left: -1000 }).addClass('async_upload')
        .attr({ method: 'POST', target: tname, action: opts.action, enctype: 'multipart/form-data' });
    target = $("<iframe style='position : absolute; left : -1000px'></iframe>")
        .attr('name', tname).appendTo(form).load(onload);
    var input = $("<input type='file'>").attr('name', opts.file_name)
        .change(function() { opts.start(); form.submit() }).appendTo(form);
    Hive.profile_upload_input = input;
    if(opts.multiple) { input.attr('multiple', 'multiple'); }
    for (p in opts.data) {
        $("<input type='hidden'>").attr('name', p).attr('value', opts.data[p]).appendTo(form);
    }
    form.appendTo(document.body);
    // It's a mystery why this timout is needed to make the upload dialog appear on some machines
    if (opts.input_click) setTimeout(function() { input.click(); }, 50);
    return form;
}

function asyncSubmit(form, callback, opts) {
    var opts = $.extend({ dataType : 'text' }, opts);
    var url = opts.url || $(form).attr('action') || server_url;
    $.post(url, $(form).serialize(), callback, opts.dataType);
    return false;
}
