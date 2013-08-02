// empty object module for server to put stuff in
define([
    'json!ui/routes.json',
    'ui/routing',
    'browser/js',
    'ui/menu',
    'ui/dialog',
    'ui/util'
], function(api_routes, routing, js, menu, dialog, ui_util){
    var o = {};

    o.asset = function(context, name){ return ui_util.asset(name) };

    // vcenter creates a valigned block (with tables)
    o.vcenter = function(context, block){
        return "<table class='vcenter'><tr><td>" + block(context) + "</td></tr></table>";
    };

    o.recency_time = function(context, time) {
        var now = Date.now();
        var ago = now/1000 - time;
        if (ago < 2*60) {
            return 'moments ago';
        } else if (ago < 60*60) {
            return (ago/60).toFixed(0) + ' minutes ago';
        } else if (ago < 1.5*60*60) {
            return 'about an hour ago';
        } else if (ago < 24*60*60) {
            return (ago/3600).toFixed(0) + ' hours ago';
        } else  if (ago < 7*24*60*60) {
            return (ago/3600/24).toFixed(0) + ' days ago';
        } else {
            var d = new Date(time*1000);
            var d_parts = d.toString().split(" ");
            var now_parts = (new Date(now)).toString().split(" ");
            var display = d_parts[1] + " " + d_parts[2];
            // include year if it is different from today's year.
            if (d_parts[3] != now_parts[3])
                display += " " + d_parts[3];
            return display;
        }
    };

    var attrs = function(route_name, args, query_args, is_form, suppress){
        if (!suppress) suppress = [];
        if(!api_routes[route_name]) throw('Route "' + route_name + '" not found');
        var attributes = suppress.indexOf('attributes') >= 0 ? [] : 
                [ ['data-route-name', route_name] ],
            href = suppress.indexOf('href') >= 0 ? null : 
                api_routes[route_name]['page_route'] + query_args,
            api = suppress.indexOf('api') >= 0 ? null : 
                api_routes[route_name]['api_route'] + query_args;
        if (is_form) {
            attributes.push(['enctype', 'multipart/form-data']);
            if(api) attributes.push(['action',
                routing.substitute_variables(api, args, true)]);
        } else {
            if(href) attributes.push(['href',
                routing.substitute_variables(href, args, true)]);
            if(api) attributes.push(['data-api-path',
                routing.substitute_variables(api, args, true)]);
        }
        return attributes.map(function(attribute_pair) {
            return attribute_pair[0] + '="' + attribute_pair[1] + '"';
        }).join(' ');
    }, get_route_args = function(arguments){
        var args = { username: o.user.name };
        // All arguments after route_name are name value pairs
        for(var i = 2; i < arguments.length; i += 2)
            args[arguments[i]] = arguments[i + 1];

        return args;
    };

    o.search_attrs = function(scope){
        var args = { username: o.user.name };
        var query_args = ""
        // All arguments after route_name are prefix value pairs
        for(var i = 1; i < arguments.length; i += 2)
            query_args += arguments[i] + arguments[i + 1];

        return attrs("search", args, "?q=" + encodeURIComponent(query_args));
    };

    // takes route_name, and association argument list.
    // Returns attribute string.
    o.anchor_attrs = function(scope, route_name){
        var args = get_route_args(arguments);
        return attrs(route_name, args, "", false);
    };

    // takes route_name, and association argument list.
    // Returns attribute string.
    o.href_attrs = function(scope, route_name){
        var args = get_route_args(arguments);
        return attrs(route_name, args, "", false, ['api', 'attributes']);
    };

    // does the same as function above but for <form>s instead of <a>s
    o.form_attrs = function(scope, route_name){
        var args = get_route_args(arguments);

        return attrs(route_name, args, "", true);
    };

    // takes rendered string from template, parses into DOM,
    // and adds appropriate handlers for us
    // stringjay filters the output of all top-level templates through this
    o._after_render_handlers = {};
    o.after_render = function(text){
        var dom = $('<div>');
        dom[0].innerHTML = text;
        var elements = dom.contents();
        
        // Common site-wide handlers
        find_all(elements, 'form[data-route-name]').each(
            function(i, e){ form_handler(e, elements) });
        find_all(elements, '.menu.drawer[data-handle]').each(function(i, e){
            var handle = find_all(elements, $(e).attr('data-handle'));
            if(!handle) throw 'missing handle';
            menu(handle, e);
        });
        find_all(elements, '.dialog[data-handle]').each(function(i, e){
            var handle = find_all(elements, $(e).attr('data-handle'));
            if(!handle) throw 'missing handle';
            var d = dialog.create(e);
            handle.click(d.open);
        });
        find_all(elements, '.hoverable').each(function(){
            ui_util.hoverable(this) });

        js.each(o._after_render_handlers, function(handler, selector){
            find_all(elements, selector).each(function(i,e){ handler($(e)) });
        });

        return elements;
    };
    o.after_render.add = function(selector, handler){
        o._after_render_handlers[selector] = handler;
    };

    function form_handler(form, all){
        var form = $(form),
            file_api = FileList && Blob,
            inputs = form.find('[type=file]');

        // TODO-test: test support for multiple files
        // TODO-polish: handle erros from file uploads
        // TODO-compat: port <iframe> hack from old code and finish
        //     support for browsers without file API (file_api boolean)

        inputs.each(function(i, e){
            var input = $(e);
            input.on('change', function(){
                with_files(e.files);
                submit();
                input.val('');
            });

            var input_id = input.attr('id'),
                drop_areas = find_all(all, 'label[for=' + input_id + ']'),
                drop_selector = input.attr('data-drop-area');
            drop_areas = drop_areas.add(drop_selector).add(find_all(all, drop_selector));
            drop_areas.on('dragenter dragover', function(){ return false; })
            drop_areas.on('drop', function(e){
                var dt = e.originalEvent.dataTransfer;
                if(!dt || !dt.files || !dt.files.length) return;
                with_files(dt.files);
                submit(dt.files);
                return false;
            });
        });

        // make form submission of non-file inputs asynchronous too
        form.on('submit', function(e){
            submit();
            return false;
        });

        var with_files = function(file_list){
            if(!file_api) return;
            var files = [];
            // FileList is not a list at all, has no map :'(
            for(var i = 0; i < file_list.length; i++){
                var f = file_list.item(i), file = {
                    url: URL.createObjectURL(f),
                    name: f.name,
                    mime: f.type
                };
                files.push(file);
            };
            form.trigger('with_files', [files]);
        };

        var submit = function(files){
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
                },
                error: function(data){
                    // TODO: open new window with debugger
                    console.error("Server error post request: " + form.attr('action')
                        + '\n(remove form handlers to see error)');
                    form.trigger('error', [data]);
                },
                // Form data
                data: form_data,

                // Options to tell JQuery not to process data or
                // worry about content-type
                cache: false,
                contentType: false,
                processData: false
            });
        };
    }

    function find_all(elements, selector){
        return elements.filter(selector).add(elements.find(selector));
    }

    return o;
});