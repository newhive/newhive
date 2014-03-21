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
){
    var o = { back: false }, route;

    o.init = function(route_args){
        window.c = context; // useful for debugging
        setup_google_analytics();
        if (!util.mobile() && context.flags.mobile_web)
            util.mobile = function() { return "true" };
        // init_history();

        context.server_url = context.config.server_url; // used in many templates
        context.content_url = context.config.content_url = context.is_secure ?
            context.config.secure_content_url : context.config.content_url;

        context.parse_query();
        routing.register_state(route_args);
        if (util.mobile()) {
            $("body").addClass('mobile');
            // var init_scale = 575 / ($(window).width() || 720)
            $('<meta name="viewport" content="width=500">')
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
    };
    o.dispatch = function(route_name, page_data){
        track_pageview(route_name);
        context.route_name = route_name;
        if (route_name == "expr")
            route_name = "view_expr";
        context.route = routes[route_name];
        var cards = context.page_data.cards;
        var cards_route = context.page_data.cards_route;
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

        context.query;

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
            $.ajax(api_call);
        } else 
            callback({});

        function success(data){
            if (push_state == undefined || push_state)
                history.pushState(page_state, null, page_state.page);
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
        var page_state = context.page_state(route_name, route_args, query);
        history.pushState(page_state, null, page_state.page);
        context.parse_query(route_args);
    };

  
    var init_history = function() {(function(window,undefined){
        // Bind to StateChange Event
        history.Adapter.bind(window,'statechange',function(){ // Note: We are using statechange instead of popstate
            var State = history.getState(); // Note: We are using History.getState() instead of event.state
        });

        })(window);
    };

    var setup_google_analytics = function() {
        // review analytics data at google.com:
        // https://www.google.com/analytics/web/
        window._gaq = [];
        _gaq.push(['_setAccount', 'UA-22827299-2']);
        _gaq.push(['_setDomainName', 'none']);
        _gaq.push(['_setAllowLinker', true]);
        _gaq.push(['_setCampaignTrack', true]);
        _gaq.push(['_setCustomVar', 1, 'username', context.user.name, 1]);
        _gaq.push(['_setCustomVar', 2, 'join_date', "" + context.user.created, 1]);
        
        // ?? What is this?
        // nd['signup_group']
        // Out[7]: 1
        // _gaq.push(['_setCustomVar', 3, 'groups', '{{user.groups_to_string()}}', 1]);

        // ?? where did ga_commands live?
        // {% for command in ga_commands %}
        // _gaq.push({{ command | json }});
        // {% endfor %}

        // ?? Pageview now handled in config.js after custom var set
        //_gaq.push(['_trackPageview']);

        if (context.config.use_ga || 1) {
            (function() {
              var ga = document.createElement('script'); ga.type = 'text/javascript'; ga.async = true;
              ga.src = ('https:' == document.location.protocol ? 'https://ssl' : 'http://www') + '.google-analytics.com/ga.js';
              var s = document.getElementsByTagName('script')[0]; s.parentNode.insertBefore(ga, s);
            })();
        }
    }
    var track_pageview = function(route_name) {
        _gaq.push(['_trackPageview']);
    }

    return o;
});
