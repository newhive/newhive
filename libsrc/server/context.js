// empty object module for server to put stuff in
define([
    'json!ui/routes.json',
    'json!server/compiled.config.json',
    'ui/routing',
    'browser/js',
    'browser/upload',
    'ui/menu',
    'ui/dialog',
    'ui/util'
], function(api_routes, config, routing, js, upload, menu, dialog, ui_util){
    var o = { config: config };

    o.asset = function(context, name){
        // if supplied with single argument (old code), use that as name.
        return ui_util.asset(name ? name : context);
    };

    // vcenter creates a valigned block
    o.vcenter = function(context, block){
        var extra_classes = ((arguments.length > 2) ? " " + arguments[2] : "");
        return "<div class='vcenter_outer" + extra_classes +
            "'><div class='vcenter_middle'>" + block(context) + "</div></div>";
    };

    var entityMap = {
       "&": "&amp;",
       "<": "&lt;",
       ">": "&gt;",
       '"': '&quot;',
       "'": '&#39;',
       "/": '&#x2F;'
    };
    function escapeHtml(string) {
        return String(string).replace(/[&<>"'\/]/g, function (s) {
            return entityMap[s];
        });
    };
    
    o.defer = function(context, block){
        return '<div class="defer" data-content="' + escapeHtml(block(context)) + '"></div>';
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

    // TODO-cleanup: merge with query_attrs
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
    // TODO-cleanup: make query argument an object, using stringjay
    //   object constructor, see TODO-cleanup-object in text/stringjay
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
        find_all(dom, '*[data-class-toggle]').each(function(i, ev) {
            var click_func = function(klass) {
                return function(el) {
                    $(ev).toggleClass(klass);
                };
            }
            var class_toggles = $(ev).attr('data-class-toggle');
            if (class_toggles) {
                class_toggles = JSON.parse(class_toggles);
            }
            // TODO: also be able to set behavior, not just click, but
            // arbitrary events: mouseenter mouseleave, etc
            for (var toggle in class_toggles) {
                var klass = class_toggles[toggle];
                find_all(dom, toggle).on('click', click_func(klass));
            }
        });
        // TODO-cleanup: this is a subcase of class-toggle.
        find_all(elements, '*[data-link-show]').each(function(i, ev) {
            var handle = find_all(elements, $(ev).attr('data-link-show'));
            if(!handle) throw 'missing handle';
            handle.on('click', function(el) { 
                $(ev).toggleshow();
            });
        });

        find_all(elements, 'form[data-route-name]').each(
            function(i, ev){ form_handler(ev, elements) });

        find_all(elements, '.menu.drawer[data-handle]').each(function(i, ev){
            var handle = find_all(elements, $(ev).attr('data-handle'));
            if(!handle) throw 'missing handle';
            var parent = find_all(elements, $(ev).attr('data-parent'));
            var opts = {};
            if (parent.length && parent.data('menu')) {
                opts['group'] = parent.data('menu');
                opts['layout_x'] = 'submenu';
                // opts['layout'] =  'center_y';
            }
            menu(handle, ev, opts);
        });

        find_all(elements, '.dialog[data-handle]').each(function(i, ev){
            var handle = find_all(elements, $(ev).attr('data-handle'));
            if(!handle) throw 'missing handle';
            var d = dialog.create(ev);
            handle.click(d.open);
        });

        find_all(elements, '.hoverable').each(function(i, ev){
            ui_util.hoverable($(ev)) });

        js.each(o._after_render_handlers, function(handler, selector){
            find_all(elements, selector).each(function(i,ev){ handler($(ev)) });
        });

        return elements;
    };
    o.after_render.add = function(selector, handler){
        o._after_render_handlers[selector] = handler;
    };

    var submit_form = function(form){
        var opts = {};
        opts.url = form.attr('action');
        opts.data = new FormData($(form)[0]);
        opts.success = function(data){
            // if(!file_api) input.trigger('with_files',
                // [ data.map(function(f){ return f.url }) ]);
            form.trigger('response', [data]);
            form.find("*[type=submit]").
                removeClass('disabled').prop('disabled','');
        };
        opts.error = function(data){
            // TODO: open new window with debugger
            console.error("Server error post request: " + form.attr('action')
                + '\n(remove form handlers to see error) $("form").unbind("submit")');
            form.trigger('error', [data]);
        };
        form.trigger('before_submit');
        upload.submit(false, opts);
        form.trigger('after_submit');
        form.find("*[type=submit]").addClass('disabled').prop('disabled','true');
    };

    function form_handler(form, all){
        // TODO-polish: handle erros from file uploads
        // TODO-compat: port <iframe> hack from old code and finish
        //     support for browsers without file API (file_api boolean)

        var form = $(form),
            file_api = FileList && Blob;

        form.find('[type=file]').each(function(i, el){
            var input = $(el)

            input.on('change', function(){
                form.trigger('with_files', [upload.unwrap_file_list(el.files)]);
                submit_form(form);
                input.val('');
            });

            var input_id = input.attr('id'),
                drop_selector = input.attr('data-drop-area');
                drop_areas = find_all(all, 'label[for=' + input_id + ']')
                    .add(drop_selector).add(find_all(all, drop_selector));
                upload.drop_target(drop_areas,
                    function(files){
                        form.trigger('with_files', [files]); },
                    function(file_records){
                        form.trigger('response', [file_records]); }
                );
        });

        // make form submission of non-file inputs asynchronous too
        form.on('submit', function(ev){
            submit_form(form);
            return false;
        });
    }

    o.parse_query = function(route_args){
        var url = window.location.toString();
        o.query = js.parse_query(url);
        o.query_raw = url.substring((url + '?').indexOf('?') + 1);
        if (!route_args)
            if (o.page_data && o.page_data.cards_route)
                route_args = o.page_data.cards_route.route_args;
        var query_from_route = "";
        if (route_args) {
            query_from_route = route_args.search_query || "";
            query_from_route = 
                routing.substitute_variables(query_from_route, route_args);
            if (query_from_route != "") {
                // TODO: merge the raw query attrs (removing dupes) 
                // with the generated ones.
                o.query_raw += 
                    ((o.query_raw != "") ? "&" : "") + "q=" + query_from_route;
            }
        }

        // Save error message and remove it from hash args
        // Note, we can't put the error info into query args, because altering the URL
        // causes a redirect.  Thus it has to be in hash args
        // window.location.search = window.location.search.replace(/[?&]error[^&]*/,"")
        var d = function (s) {
            return s ? decodeURIComponent(s.replace(/\+/, " ")) : null;
        }
        $.each(window.location.hash.split("#"), function(i,v) {
            var pair = v.split("=");
            if (d(pair[0]) == "error") {
                o.error = d(pair[1]);
            }
        });
        // window.location.hash = window.location.hash.replace(/#error[^#]*/,"")
    };
    o.query = {}; // set by ui.controller

    function find_all(elements, selector){
        // TODO: BUGBUG: This fails to find selectors which match top-level items.
        // e.g., ".toplevel .foo" will not match anything.
        return elements.filter(selector).add(elements.find(selector));
    }

    return o;
});