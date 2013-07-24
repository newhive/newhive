// empty object module for server to put stuff in
define([
    'json!server/compiled.assets.json',
    'json!ui/routes.json',
    'ui/routing',
    'browser/js',
    'ui/menu',
    'ui/dialog',
    'ui/util'
], function(assets, api_routes, routing, js, menu, dialog, ui_util){
    var o = {};

    // vcenter creates a valigned block (with tables)
    o.vcenter = function(context, block){
        return "<table class = 'vcenter'><tr><td>" + block(context) + "</td></tr></table>";
    };

    o.asset = function(context, name){
        return assets[name];
    };

    var attrs = function(route_name, route_args, query_args, is_form, suppress){
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
                routing.substitute_variables(api, route_args, true)]);
        } else {
            if(href) attributes.push(['href',
                routing.substitute_variables(href, route_args, true)]);
            if(api) attributes.push(['data-api-path',
                routing.substitute_variables(api, route_args, true)]);
        }
        return attributes.map(function(attribute_pair) {
            return attribute_pair[0] + '="' + attribute_pair[1] + '"';
        }).join(' ');
    };

    o.route_args = function(arguments){
        var route_args = { username: o.user.name };
        // All arguments after route_name are name value pairs
        for(var i = 2; i < arguments.length; i += 2)
            route_args[arguments[i]] = arguments[i + 1];

        return route_args;
    };

    o.search_attrs = function(scope){
        var route_args = { username: o.user.name };
        var query_args = ""
        // All arguments after route_name are prefix value pairs
        for(var i = 1; i < arguments.length; i += 2)
            query_args += arguments[i] + arguments[i + 1];

        return attrs("search", route_args, "?q=" + encodeURIComponent(query_args));
    };

    // takes route_name, and association argument list.
    // Returns attribute string.
    o.anchor_attrs = function(scope, route_name){
        var route_args = o.route_args(arguments);
        return attrs(route_name, route_args, "", false);
    };

    // takes route_name, and association argument list.
    // Returns attribute string.
    o.href_attrs = function(scope, route_name){
        var route_args = o.route_args(arguments);
        return attrs(route_name, route_args, "", false, ['api', 'attributes']);
    };

    // does the same as function above but for <form>s instead of <a>s
    o.form_attrs = function(scope, route_name){
        var route_args = o.route_args(arguments);

        return attrs(route_name, route_args, "", true);
    };

    // takes rendered string from template, parses into DOM,
    // and adds appropriate handlers for us
    // stringjay filters the output of all top-level templates through this
    o._after_render_handlers = {};
    o.after_render = function(text){
        var elements = $(text.trim());
        
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
        // TODO-compat: port <iframe> hack from old code for older browsers

        inputs.each(function(i, e){
            var input = $(e);
            input.on('change', function(){ submit(); });

            var input_id = input.attr('id'),
                label = find_all(all, 'label[for=' + input_id + ']');
            label.on('dragenter dragover', function(){ return false; })
            label.on('drop', function(e){
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

        var with_files = function(files){
            if(!file_api) return;
            var urls = [];
            // FileList is not a list at all, has no map :'(
            for(var i = 0; i < files.length; i++)
                urls.push(URL.createObjectURL(files.item(i)));
            form.trigger('with_files', [urls]);
        };

        var submit = function(files){
            var form_data = new FormData(form[0]);
            if(files){
                for(var i = 0; i < files.length; i++){
                    var f = files.item(i);
                    form_data.append('files', f.slice(0, f.size), f.name);
                }
            }

            // doesn't seem to work with FormData
            // $.post(form.attr('action'), form_data, function(data){
            //     form.trigger('response', [data]);
            // }, 'json');

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
                    // if(!file_api) input.trigger('with_files', [data]);
                    form.trigger('response', [data]);
                },
                error: function(){ alert("Sorry :'(") },
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