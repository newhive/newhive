define([
    'browser/jquery',
    'browser/js',
    'ui/page',
    'ui/page/pages',
    'server/context',
    'json!ui/routes.json',
    'ui/routing'
], function($, util, page, pages, context, routes, routing) {
    var o = {}, route;

    o.init = function(route_args){
        routing.register_state(route_args);
        page.init(o);
        util.each(pages, function(m){
            if(m.init) m.init(o);
        });
        o.dispatch(route_args.route_name, context.page_data);
        wrapLinks();

        curl.expose('server/context', 'c'); // useful for debugging
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
        context.page_data = data;
        if(!data.cards) context.page_data.cards = cards;
        page.render(route.client_method, context);
    };
    o.refresh = function(){
        o.dispatch(route.method, context);
    };

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
            o.open_route(e.state);
        };
    };

    o.open_route = function(page_state, callback) {
        if(page_state.api){
            var api_call = {
                method: 'get',
                url: page_state.api.toString(),
                dataType: 'json',
                success: callback ? callback : success
            };
            $.ajax(api_call);
        }
        else success({});

        function success(data){
            o.dispatch(page_state.route_name, data);
            history.pushState(page_state, null, page_state.page);
        }
    };
    o.open = function(route_name, route_args){
        o.open_route(routing.page_state(route_name, route_args));
    };
    o.get = function(route_name, route_args, callback){
        o.open_route(routing.page_state(route_name, route_args), callback);
    }
    o.fake_open = function(route_name, route_args){
        // TODO: test for old browsers which don't support history.pushState.
        // Fallback to plane old open.
        var page_state = routing.page_state(route_name, route_args);
        history.pushState(page_state, null, page_state.page);
    };
    
    return o;
});
