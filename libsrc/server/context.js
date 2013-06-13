// empty object module for server to put stuff in
define([
    'json!server/compiled.assets.json',
    'json!ui/routes.json',
    'ui/routing',
    'browser/js'
], function(assets, api_routes, routing, js_util){
    var o = {};

    o.asset = function(context, name){
        return assets[name];
    };

    o.attrs = function(route_name, route_args, query_args, is_form){
        if(!api_routes[route_name]) throw('Route "' + route_name + '" not found');
        var attributes = [ ['data-route-name', route_name] ],
            href = api_routes[route_name]['page_route'] + query_args,
            api = api_routes[route_name]['api_route'] + query_args;
        if (is_form) {
           if(api) attributes.push(['action',
                routing.substituteVariables(api, route_args, true)]);
        } else {
            if(href) attributes.push(['href',
                routing.substituteVariables(href, route_args, true)]);
            if(api) attributes.push(['data-api-path',
                routing.substituteVariables(api, route_args, true)]);
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

        return o.attrs("search", route_args, "?q=" + encodeURIComponent(query_args));
    };

    // takes route_name, and association argument list.
    // Returns attribute string.
    o.anchor_attrs = function(scope, route_name){
        var route_args = o.route_args(arguments);
        return o.attrs(route_name, route_args, "", false);
    };

    // does the same as function above but for <form>s instead of <a>s
    o.form_attrs = function(scope, route_name){
        var route_args = o.route_args(arguments);

        return o.attrs(route_name, route_args, "", true);
    };

    o.menu = function(scope, block, id, handle_id){
        var tag_open = "<div id='" + id + "' class='menu drawer' data-menu-handle='" + handle_id +"'>";
        // TODO: deal with menu options 
        return tag_open + block(scope) + '</div>';
    };

    // takes rendered string from template, parses into DOM,
    // and adds appropriate handlers for us
    function add_handlers(text){
        var elements = $(text);
        

        function uploader(form, with_client_url, with_data){
            var form = $(form),
                file_api = FileList && Blob,
                input = form.find('[type=file]');

            // TODO: support multiple files
            // TODO: handle erros from file uploads
            // TODO: make file uploads actually work

            inputs.each(function(i, e){
                $(e).on('change', function(){
                    if(file_api)
                        with_client_url(URL.createObjectURL(e.files[0]));
                    form.submit();
                });

                form.on('submit', function(e){
                    // TODO: port <iframe> hack from old code...
                    // will fail on older browsers.
                    var form_data = new FormData(e.target);
                    var el = $(e.target);

                    $.ajax({
                        url: el.attr('action'),
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
                            if(!file_api) with_client_url(data.url);
                            with_data(data);
                        },
                        error: function(){ alert("Sorry :'(") },
                        // Form data
                        data: form_data,

                        //Options to tell JQuery not to process data or
                        // worry about content-type
                        cache: false,
                        contentType: false,
                        processData: false
                    });

                    e.preventDefault();
                    return false;
                });
            });
        };
    }

    return o;
});