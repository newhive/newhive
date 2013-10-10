// empty object module for server to put stuff in
define([
    'json!ui/routes.json',
    'json!server/compiled.config.json',
    'ui/routing',
    'browser/js',
    'ui/menu',
    'ui/dialog',
    'ui/util'
], function(api_routes, config, routing, js, menu, dialog, ui_util){
    var o = { config: config };

    o.server_url = o.config.server_url; // used in many templates

    o.asset = function(context, name){ 
        return ui_util.asset(name);
    };

    // vcenter creates a valigned block
    o.vcenter = function(context, block){
        var extra_classes = ((arguments.length > 2) ? " " + arguments[2] : "");
        return "<div class='vcenter_outer" + extra_classes +
            "'><div class='vcenter_middle'>" + block(context) + "</div></div>";
    };

    o.recency_time = function(context, time) {
        var now = Date.now();
        var ago = now/1000 - time;
        if (ago < 2*60) {
            return 'moments ago';
        } else if (ago < 60*60) {
            return (ago/60).toFixed(0) + ' min ago';
        } else if (ago < 1.5*60*60) {
            return '1 hour ago';
        } else if (ago < 24*60*60) {
            return (ago/3600).toFixed(0) + ' hrs ago';
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

    o.untitled = function(context, str) {
        if (str.length)
            return str;
        return "[Untitled]";
    }

    var attrs = function(route_name, args, query_args, is_form, suppress){
        if(!suppress) suppress = [];
        var attributes = suppress.indexOf('attributes') >= 0 ? [] : 
                [ ['data-route-name', route_name] ],
            page_state = routing.page_state(route_name, args, query_args);

        if (is_form) {
            attributes.push(['enctype', 'multipart/form-data']);
            if(page_state.api) attributes.push(['action', page_state.api]);
        } else {
            if(suppress.indexOf('href') < 0 && page_state.page)
                attributes.push(['href', page_state.page]);
            if(suppress.indexOf('api') < 0 && page_state.api)
                attributes.push(['data-api-path', page_state.api]);
        }
        // TODO-cleanup: make another func that just returns a dict of attrs
        return attributes.map(function(attribute_pair) {
            return attribute_pair[0] + '="' + attribute_pair[1] + '"';
        }).join(' ');
    };

    var get_route_args = function(arguments){
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

        return attrs("search", args, "q=" + encodeURIComponent(query_args));
    };

    o.routing_href = function(scope, route_name){
        var args = get_route_args(arguments);
        page_state = routing.page_state(route_name, args);
        return page_state.page.slice(1);
    }

    // takes route_name, and association argument list.
    // Returns attribute string.
    o.query_attrs = function(scope, route_name, query){
        var args = get_route_args(Array.prototype.slice.call(arguments, 1));
        return attrs(route_name, args, query, false);
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

    // o.user_thumb = 

    // takes rendered string from template, parses into DOM,
    // and adds appropriate handlers for us
    // stringjay filters the output of all top-level templates through this
    o._after_render_handlers = {};
    o.after_render = function(text){
        var dom = $('<div>');
        dom[0].innerHTML = text;
        var elements = dom.contents();
        // var all_elements = elements.add(document.body);

        // Common site-wide handlers
        find_all(elements, 'form[data-route-name]').each(
            function(i, e){ form_handler(e, elements) });
        find_all(elements, '.menu.drawer[data-handle]').each(function(i, e){
            var handle = find_all(elements, $(e).attr('data-handle'));
            if(!handle) throw 'missing handle';
            var parent = find_all(elements, $(e).attr('data-parent'));
            var opts = {};
            if (parent.length && parent.data('menu')) {
                opts['group'] = parent.data('menu');
                opts['layout_x'] = 'submenu';
                // opts['layout'] =  'center_y';
            }
            menu(handle, e, opts);
        });
        find_all(elements, '.dialog[data-handle]').each(function(i, e){
            var handle = find_all(elements, $(e).attr('data-handle'));
            if(!handle) throw 'missing handle';
            var d = dialog.create(e);
            handle.click(d.open);
        });
        find_all(elements, '.hoverable').each(function(i, e){
            ui_util.hoverable($(e)) });

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
                drop_selector = input.attr('data-drop-area');
                drop_areas = find_all(all, 'label[for=' + input_id + ']')
                    .add(drop_selector).add(find_all(all, drop_selector));
            drop_areas.on('dragenter dragover', function(ev){
                    ev.preventDefault();
                })
                .on('drop', function(e){
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
            form.trigger('after_submit');
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
                        + '\n(remove form handlers to see error) $("form").unbind("submit")');
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

    o.query = {}; // set by ui.controller

    function find_all(elements, selector){
        return elements.filter(selector).add(elements.find(selector));
    }

    return o;
});