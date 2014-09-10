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

    window.asset_loaded = function(el) {
        var $el = $(el)
        while (true) {
            $el.removeClass("loading").addClass("loaded").trigger("lazy_load")
            if ($el.is(".lazy_load"))
                break
            $el = $el.parent()
            if ($el.find(".loading").length)
                break
        }
    }
    o.lazy_load = function(context, block, extra_classes) {
        var out = '<div class="lazy_load ' + extra_classes + '">'
            ,args = Array.prototype.slice.call(arguments, 3)
        if (args.length == 1 && args[0].reverse) // it's a list
            args = args[0]
        for(var i = 0; i < args.length; ++i) {
            if (args[i]) {
                var loop_context = {};
                loop_context["item"] = args[i];
                out += block(context.concat(loop_context));
            }
        }
        return out + "</div>"
    }
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

    o.location = function(context){ return window.location.toString() }

    o.param = function(context, v){
        return window.encodeURIComponent(v) }
    
    o.defer = function(context, block, extra_classes){
        extra_classes = extra_classes ? " " + extra_classes : ""
        return '<div class="defer' + extra_classes + '" data-content="' + escapeHtml(block(context)) + '"></div>';
    };
    o.undefer = function(el) {
        var $new_el = $($(el).data("content"))
        $(el).replaceWith($new_el)
        return $new_el
    }

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

    o.page_state = function(route_name, args, query_args){
        var s = routing.page_state(route_name, args, query_args)
            server = o.config.server_url.slice(0,-1)
        // attempt to make routing work on custom domain,
        // foiled by history API not allowing to change domain
        // s.page = server + s.page
        // s.api = server + s.api
        return s
    }

    var attrs = function(route_name, args, query_args, is_form, suppress){
        if(!suppress) suppress = [];
        if (o.referer && !is_form){
            var page_state = o.page_state(route_name, args, query_args)
            if (page_state.page){
                // slice is to remove the trailing "/"
                var abs_url =  o.config.server_url.slice(0,-1) + page_state.page
            }
            var attributes = 'target="_top"' + ' href="' + abs_url + '"';
            return attributes;
        } else {       
            var attributes = suppress.indexOf('attributes') >= 0 ? [] : 
                    [ ['data-route-name', route_name] ],
                page_state = o.page_state(route_name, args, query_args)

            if (is_form) {
                attributes.push(['enctype', 'multipart/form-data']);
                if(page_state.api) attributes.push(['action', page_state.api]);
            } else {
                if(suppress.indexOf('href') < 0 && page_state.page)
                    attributes.push(['href', page_state.page]);
                if(suppress.indexOf('api') < 0 && page_state.api)
                    attributes.push(['data-api-path', page_state.api]);
            }
        }
        // TODO-cleanup: make another func that just returns a dict of attrs
        return attributes.map(function(attribute_pair) {
            return attribute_pair[0] + '="' + attribute_pair[1] + '"';
        }).join(' ');
    };

    var get_route_args = function(arguments){
        var args = {}
        if(o.user) args.username = o.user.name
        // All arguments after route_name are name value pairs
        for(var i = 2; i < arguments.length; i += 2)
            args[arguments[i]] = arguments[i + 1];

        return args;
    };

    // TODO-cleanup: merge with query_attrs
    o.search_attrs = function(scope){
        var args = {}
        if(o.user) args.username = o.user.name
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
        query = $.map(query.split("&"),function(e) {
            return $.map(e.split("="),function(k) {
                return encodeURIComponent(k)}).join("=")
        }).join("&");
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

    var debug_log = function(text) {
        console.log(ui_util.stack_readable(2) + text)
    }
    // comment to enable debugging
    debug_log = function(text) {}

    // takes rendered string from template, parses into DOM,
    // and adds appropriate handlers for us
    // stringjay filters the output of all top-level templates through this
    o._after_render_handlers = {};
    o.after_render = function(text){
        debug_log("enter")
        var dom = $('<div>');
        dom[0].innerHTML = text;
        // var elements = dom;

        // Common site-wide handlers
        dom.find('*[data-class-toggle]').each(function(i, el) {
            var click_func = function(klass) {
                return function() {
                    $(el).toggleClass(klass);
                };
            }
            var class_toggles = $(el).attr('data-class-toggle');
            if (class_toggles) {
                class_toggles = JSON.parse(class_toggles);
            }
            // TODO: also be able to set behavior, not just click, but
            // arbitrary events: mouseenter mouseleave, etc
            for (var toggle in class_toggles) {
                var klass = class_toggles[toggle];
                dom.find(toggle).on('click', click_func(klass));
            }
        });
        // TODO-cleanup: this is a subcase of class-toggle.
        dom.find('*[data-link-show]').each(function(i, el) {
            var handle = dom.find($(el).attr('data-link-show'));
            if(!handle) throw 'missing handle';
            handle.on('click', function(ev) { 
                $(el).toggleshow();
            });
        });

        dom.find('form[data-route-name]').each(
            function(i, el){ form_handler(el, dom) });

        dom.find('.menu.drawer[data-handle]').each(function(i, el){
            var selector = $(el).attr('data-handle')
                , handle = dom.find(selector)
            // if(!handle.length) throw 'missing handle';
            var parent = dom.find($(el).attr('data-parent'));
            var opts = {};
            if (parent.length && parent.data('menu')) {
                opts['group'] = parent.data('menu');
                opts['layout_x'] = 'submenu';
                // opts['layout'] =  'center_y';
            }
            menu(handle, el, opts);
        });

        dom.find('.dialog[data-handle]').each(function(i, el){
            var selector = $(el).attr('data-handle')
                , handle = dom.find(selector)
            //!! TODO: investigate render order, and why sometimes this fails.
            // if(!handle.length) 
                // debug_log(selector + " missing")
            var d = dialog.create(el);
            handle.click(d.open);
        });

        dom.find('.hoverable').each(function(i, el){
            ui_util.hoverable($(el)) });

        js.each(o._after_render_handlers, function(handler, selector){
            dom.find(selector).each(function(i,el){ handler($(el)) });
        });

        // replace the contents (children) of {parent} with {this}
        var replace_contents = function(parent) {
            $(parent).empty().append(this)
        }
        // for each element in the dom (inserted or existing) with property 
        // data-{binding_name}, run {fn} with the argument of the insertion point
        // indicated by the binding value.  If fn is a string, run the jQuery
        // function {fn}
        // Ex: <div data-insert-after="#footer">Some footer text></div>
        var do_to_all = function(binding_name, fn, throw_name) {
            binding_name = "data-" + binding_name
            dom.find('*[' + binding_name + ']').each(function(i, el){
                // Look inside the about-to-be-added DOM before adding to real DOM
                var $el= $(el), selector = $el.attr(binding_name)
                    , $insert_point = dom.find(selector);
                if (! $insert_point.length)
                    $insert_point = $(selector);
                if ($insert_point.length) {
                    if (typeof fn == "string")
                        fn = $el[fn]
                    if (typeof fn == "function")
                        fn.apply($el, $insert_point)
                } else if (throw_name) {
                    throw throw_name
                }
            })
        }
        var do_to_all_dict = {
            "insert-after": "insertAfter"
            ,"replace-with": "replaceWith"
            ,"replace-contents": replace_contents
        }
        $.each(do_to_all_dict, function(i, v) {
            do_to_all(i, v)
        })

        return dom.contents();
    };
    o.after_render.add = function(selector, handler){
        o._after_render_handlers[selector] = handler;
    };

    var submit_form = function(form){
        var opts = {};
        opts.url = form.attr('action');
        opts.success = function(data){
            // if(!file_api) input.trigger('with_files',
                // [ data.map(function(f){ return f.url }) ]);
            form.trigger('success', [data]);
        };
        opts.error = function(data){
            if(config.debug_mode){
                // TODO: open new window with debugger
                console.error("Server error post request: "
                    + form.attr('action') + '\n(remove form handlers to '
                    + 'see error) $("form").unbind("submit")'
                )
            }
            form.trigger('error', [data]);
        };
        opts.complete = function(){
            form.find("*[type=submit]").
                removeClass('disabled').prop('disabled','')
        }
        opts.type = form.attr("method")
        var ev = $.Event("before_submit")
        form.trigger(ev)
        if (ev.isDefaultPrevented())
            return
        opts.data = new FormData($(form)[0]);
        if (opts.type && opts.type.toUpperCase() == "GET")
            opts.data = $(form).serialize();
        // do the actual form submit.  Shares code with file upload
        upload.submit(false, opts);
        form.trigger('after_submit');
        form.find("*[type=submit]")
            .addClass('disabled').prop('disabled','true');
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
                var file_list = upload.file_list_to_list(el.files);
                form.trigger('with_files', 
                    [upload.unwrap_file_list(el.files), file_list]);
                el.files = file_list;
                submit_form(form);
                input.val('');
            });

            var input_id = input.attr('id'),
                drop_selector = input.attr('data-drop-area');
                drop_areas = all.find('label[for=' + input_id + ']')
                    .add(drop_selector).add(all.find(drop_selector));
                upload.drop_target(drop_areas,
                    function(files, file_list){
                        form.trigger('with_files', [files, file_list]); },
                    function(file_records){
                        form.trigger('success', [file_records]); }
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
        o.search_query = o.query.q || "";//url.substring((url + '?').indexOf('?') + 1);
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
                o.search_query = o.search_query + query_from_route;
                    // ((o.search_query != "") ? "&" : "") + "q=" + query_from_route;
            }
        }
        if (o.search_query != "")
            o.search_query = "q=" + o.search_query;

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

    return o;
});
