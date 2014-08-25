define([
    'browser/jquery'
    ,'browser/js'
    ,'ui/page'
    ,'ui/page/pages'
    ,'ui/util'
    ,'server/context'
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
        if (!util.mobile() && context.flags.mobile_web)
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
            $('<meta id="viewport" name="viewport" content="width=500">')
                .appendTo('head')
                 //, initial-scale=' + init_scale +
                // + ', user-scalable=1"/>').appendTo($("head"));
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
        if (route_name == "home" && context.flags.new_nav)
            route_name = "home_cat"
        analytics.track_pageview(route_name)
        context.route_name = route_name;
        if (route_name == "expr")
            route_name = "view_expr";
        context.route = routes[route_name];
        var cards = context.page_data.cards
            , cards_route = context.page_data.cards_route
        context.page_data.next_cards_at = cards ? cards.length : 0
        context.page_data.cards_at = 0
        if (cards && cards.length && cards[0].collection) {
            cards = null
            cards_route = null
        }
        context.page_data = page_data;
        if(!page_data.cards) context.page_data.cards = cards;
        if(!page_data.cards_route) context.page_data.cards_route = cards_route;
        page.render(context.route.client_method, context);
    };
    o.refresh = function(){
        o.dispatch(context.route.method, context.page_data);
    };

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
    var loading = false;
    o.next_cards = function(with_cards){
        if (loading)
            return false;
        loading = true;
        var add_cards = function(data){
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
            complete: function() { loading = false; },
            data: $.extend({ at: context.page_data.cards.length }, route.query)
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

        callback = callback ? callback : success;
        if(page_state.api){
            var api_call = {
                method: 'get',
                url: page_state.api.toString(),
                dataType: 'json',
                success: callback
            };
            // console.log(api_call)
            $.ajax(api_call);
        } else 
            callback({});

        function success(data){
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
