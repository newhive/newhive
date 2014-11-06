define([
    'browser/jquery'
    ,'browser/js'

    ,'ui/page'
    ,'ui/page/pages'
    ,'ui/util'
    ,'ui/menu'
    ,'context'
    ,'json!ui/routes.json'
    // ,'history/history'
    ,'ui/routing'
    ,'analytics'
    // ,'browser/jquery.mobile.custom'
], function(
     $
    ,js

    ,page
    ,pages
    ,util
    ,menu
    ,context
    ,routes
    //,history
    ,routing
    ,analytics
){
    var o = { back: false }, route;

    // So code modules can use this variable safely
    editor = undefined
    var ajax_pending = false
    o.ajax_pending = function() { return ajax_pending }

    o.init_mobile = function(){
        context.native_mobile = true;
        // TODO: redirect code goes here
        o.init({route_name: 'home', client_method: 'home'})
    };  

    // Make the visibility of the tab known
    (function() {
        var hidden = "hidden";

        // Standards:
        if (hidden in document)
            document.addEventListener("visibilitychange", onchange);
        else if ((hidden = "mozHidden") in document)
            document.addEventListener("mozvisibilitychange", onchange);
        else if ((hidden = "webkitHidden") in document)
            document.addEventListener("webkitvisibilitychange", onchange);
        else if ((hidden = "msHidden") in document)
            document.addEventListener("msvisibilitychange", onchange);
        // IE 9 and lower:
        else if ('onfocusin' in document)
            document.onfocusin = document.onfocusout = onchange;
        // All others:
        else
            window.onpageshow = window.onpagehide 
                = window.onfocus = window.onblur = onchange;

        function onchange (evt) {
            var v = 'visible', h = 'hidden', visibility = ''
                evtMap = { 
                    focus:v, focusin:v, pageshow:v, blur:h, focusout:h, pagehide:h 
                };

            evt = evt || window.event;
            if (evt.type in evtMap)
                visibility = evtMap[evt.type];
            else        
                visibility = this[hidden] ? "hidden" : "visible";
            $("body").removeClass("hidden visible").addClass(visibility)
        }
        // set the initial state
        onchange({type:(document.visibilityState == "visible") ? "focus" : "blur"})
    })();

    o.init = function(route_args){
        window.c = context; // useful for debugging
        analytics.setup();
        if (!util.mobile() && context.flags && context.flags.mobile_web)
            util.mobile = function() { return "true" };
        // init_history();

        context.server_url = context.config.server_url; // used in many templates
        context.content_url = context.config.content_url = context.is_secure ?
            context.config.secure_content_url : context.config.content_url;

        context.parse_query();
        // context.referer holds the site host of the containing frame, if one exists.
        // If it does not, it comes back as the same as server host, so we delete it here.
        if (context.referer && (context.referer.replace(/.*\/\//,"") == 
            context.server_url.replace(/.*\/\//,"")))
            context.referer = null


        routing.register_state(route_args);
        if (util.mobile()) {
            $("body").addClass('mobile');
            context.flags.mobile = util.mobile();
        }
        page.init(o);
        js.each(pages, function(m){
            if(m.init) m.init(o);
        });
        o.dispatch(route_args.route_name, context.page_data);
        wrapLinks();

        $(document).ajaxStart(function(){
            ajax_pending = true
        }).ajaxStop(function(){
            ajax_pending = false
        }).ajaxError(function(ev, jqXHR, ajaxOptions){
            // TODO-polish-upload-error: show some warning, and somehow indicate
            // which app(s) failed to save
        });

    };
    o.dispatch = function(route_name, page_data){
        if(route_name == "home")
            route_name = "home_cat"
        analytics.track_pageview(route_name)
        context.route_name = route_name;
        if (route_name == "expr")
            route_name = "view_expr";
        context.route = routes[route_name];
        
        // We need to know if the route came via category to control the 
        // behavior of the page through arrows
        if (context.route.include_categories)
            context.from_categories = true
        else if (context.route.client_method != "expr")
            context.from_categories = false
        var old_cards = context.page_data.cards
            , old_cards_route = context.page_data.cards_route
        context.page_data = page_data;
        // Don't use category card data for expression page-throughs
        if (old_cards && old_cards.length && old_cards[0].collection) {
            old_cards = null
            old_cards_route = null
        }
        if(!page_data.cards) context.page_data.cards = old_cards;
        if(!page_data.cards_route) context.page_data.cards_route = old_cards_route;
        context.page_data.next_cards_at =
            context.page_data.cards ? context.page_data.cards.length : 0
        context.page_data.cards_at = 0

        $('#viewport').attr('content',
            o.viewport_opts(route_name == 'view_expr'))
        page.render(context.route.client_method, context);
    };
    o.refresh = function(){
        o.dispatch(context.route_name, context.page_data);
    };

    o.viewport_opts = function(expr_page){
        var opts = ''
        if(util.mobile()){
            opts = 'width=500'
            if(!expr_page) opts += ',user-scalable=0'
        }
        return opts
    }

    function pop_route_success() {
        o.dispatch(page_state.route_name, data);
        $("body").scrollTop(0);
    }
    function wrapLinks() {
        // If we don't support pushState, fall back on default link behavior.
        if (!window.history && window.history.pushState) return;
        $('body').on('click', 'a[data-route-name]', function(e) {
            var anchor = $(e.target).closest('a[data-route-name]'),
                route_name = anchor.attr('data-route-name'),
                route_obj = routes[route_name],
                page_state = {
                    page: anchor.attr('href'),
                    api: anchor.attr('data-api-path'),
                    route_name: route_name
                };
            e.preventDefault();
            // TODO: decide if this (and dialog.close_all) should be called
            // on every open_route
            menu.close_all();
            o.open_route(page_state);
            return false;
        });

        // TODO: Bind this event with jquery?
        window.onpopstate = function(e) {
            if (!e.state) return;
            o.open_route(e.state, false, false);
            o.back = true;
        };
    };

    // TODO-cleanup: merge with open_route?
    o.next_cards = function(with_cards){
        if (context.loading_cards)
            return false;
        context.loading_cards = true;
        var add_cards = function(data){
            // TODO: should also send card_at data from server and bail
            // if there is a discrepency.
            context.page_data.cards = context.page_data.cards.concat(data.cards);
            context.page_data.cards_at = context.page_data.next_cards_at
            context.page_data.next_cards_at += data.cards.length
            if(with_cards) with_cards(data);
        };
        var route = context.page_data.cards_route;
        var api_call = {
            method: 'get',
            url: context.page_state(route.route_args.route_name,
                route.route_args, route.query).api,
            dataType: 'json',
            success: add_cards,
            complete: function() { context.loading_cards = false; },
            data: $.extend({ at: context.page_data.next_cards_at }, route.query)
        };
        $.ajax(api_call);
    };

    o.set_exit_warning = function(warning, exit_condition){
        o.exit_warning = warning;
        o.exit_condition = exit_condition || function(){ return true }
        if(warning){
            window.onbeforeunload = function(){
                if(!o.exit_condition())
                    return o.exit_warning;
            };
        } else {
            window.onbeforeunload = null;
        }
    };

    o.loading_start = function(){
        $(document.body).addClass('loading')
    }
    o.loading_end = function(){
        $(document.body).removeClass('loading')
    }

    // TODO-cleanup: refactor these into distinct functionalities of
    // fetching data from server and opening a new page
    o.open_route = function(page_state, callback, push_state) {
        if(o.exit_warning && !o.exit_condition() && !confirm(o.exit_warning))
            return;
        o.set_exit_warning(false)

        // context.query;

        // remember scroll position.
        if (page_state.route_name != "view_expr") {
            o.scroll_top = 0;
        } else if (!o.scroll_top) {
            o.scroll_top = $("body").scrollTop();
        }
        o.back = false;

        var success = ( callback ? function(d){
            callback(d)
            o.loading_end()
        } : success_default )

        if(page_state.api){
            var api_call = {
                method: 'get',
                url: page_state.api.toString(),
                dataType: 'json',
                success: success,
                // TODO-polish: make an error report dialog
                error: o.loading_end
            };
            // console.log(api_call)
            $.ajax(api_call);
            o.loading_start()
        } else 
            callback({})

        function success_default(data){
            if (push_state == undefined || push_state) {
                if (history.state && history.state.route_name == "view_expr" &&
                    page_state.route_name == "view_expr"
                ) {
                    history.replaceState(page_state, null, page_state.page);
                } else {
                    history.pushState(page_state, null, page_state.page);
                }
            }
            context.parse_query(data.cards_route && data.cards_route.route_args);
            o.dispatch(page_state.route_name, data);
            o.loading_end()
            if (page_state.route_name != "view_expr")
                $("body").scrollTop(0);
        }
    };

    o.direct_open = function(card_query) {
        o.open(card_query['route_name'], card_query);
    };
    o.direct_fake_open = function(card_query) {
        o.fake_open(card_query['route_name'], card_query);
    };
    o.open = function(route_name, route_args, query){
        o.open_route(context.page_state(route_name, route_args, query));
    };
    o.get = function(route_name, route_args, callback, query){
        o.open_route(context.page_state(
            route_name, route_args, query), callback);
    };
    o.fake_open = function(route_name, route_args, query){
        // Test for old browsers which don't support history.pushState.
        // Fallback to plane old open.
        if (! (window.history && window.history.pushState))
            return o.open(route_name, route_args);
        var page_state = context.page_state(route_name, route_args, query)
            , push_state = window.history.pushState
        if (push_state == undefined || push_state) {
            if (history.state && history.state.route_name == "view_expr" &&
                page_state.route_name == "view_expr"
            ) {
                history.replaceState(page_state, null, page_state.page);
            } else {
                history.pushState(page_state, null, page_state.page);
            }
        }
        context.parse_query(route_args);
    };

  
    var init_history = function() {(function(window,undefined){
        // Bind to StateChange Event
        history.Adapter.bind(window,'statechange',function(){ // Note: We are using statechange instead of popstate
            var State = history.getState(); // Note: We are using History.getState() instead of event.state
        });

        })(window);
    };

    return o;
});
