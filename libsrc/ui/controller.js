define([
    'browser/jquery',
    'browser/js',
    'ui/page',
    'ui/page/pages',
    'server/context',
    'json!ui/routes.json',
    'ui/routing'
], function($, util, page, pages, context, routes, routing) {
    var o = { back: false }, route;

    o.init = function(route_args){
        curl.expose('server/context', 'c'); // useful for debugging

        routing.register_state(route_args);
        page.init(o);
        util.each(pages, function(m){
            if(m.init) m.init(o);
        });
        o.dispatch(route_args.route_name, context.page_data);
        wrapLinks();
    };
    o.dispatch = function(route_name, data){
        context.route_name = route_name;
        if(data.owner && (data.owner.id == context.user.id))
            data.user_is_owner = true;
        // BUGBUG. Server error on login?
        if (route_name == "expr")
            route_name = "view_expr";
        if (data.page_data)
            data = data.page_data;
        route = routes[route_name];
        var cards = context.page_data.cards;
        var cards_query = context.page_data.cards_query;
        context.page_data = data;
        if(!data.cards) context.page_data.cards = cards;
        if(!data.cards_query) context.page_data.cards_query = cards_query;
        page.render(route.client_method, context);
    };
    o.refresh = function(){
        o.dispatch(route.method, context);
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

    o.open_route = function(page_state, callback, push_state) {
        // remember scroll position.
        if (page_state.route_name != "view_expr") {
            o.scroll_top = 0;
        } else if (!o.scroll_top) {
            o.scroll_top = $("body").scrollTop();
        }
        o.back = false;
        $('#dialog_shield').click();
        if(page_state.api){
            var api_call = {
                method: 'get',
                url: page_state.api.toString(),
                dataType: 'json',
                success: callback ? callback : success
            };
            $.ajax(api_call);
        } else 
            success({});

        function success(data){
            if (push_state == undefined || push_state)
                history.pushState(page_state, null, page_state.page);
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
    o.open = function(route_name, route_args){
        o.open_route(routing.page_state(route_name, route_args));
    };
    o.get = function(route_name, route_args, callback){
        o.open_route(routing.page_state(route_name, route_args), callback);
    };
    o.fake_open = function(route_name, route_args){
        // Test for old browsers which don't support history.pushState.
        // Fallback to plane old open.
        if (! (window.history && window.history.pushState))
            return o.open(route_name, route_args);
        var page_state = routing.page_state(route_name, route_args);
        history.pushState(page_state, null, page_state.page);
    };
    
    return o;
});
