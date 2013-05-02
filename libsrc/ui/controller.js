define([
    'browser/jquery',
    'ui/page',
    'ui/nav',
    'server/context',
    'json!ui/routes.json',
    'ui/routing'
], function($, page, nav, context, routes, routing) {
    var o = {}, data, route;

    o.init = function(route_args){
        wrapLinks();
        routing.registerState(route_args);
        page.init(routes[route_args.route_name].client_method);
        o.dispatch(route_args.route_name, context);
        nav.render(route_args.route_name == 'view_expr');
    };
    o.dispatch = function(route_name, data){
        route = routes[route_name];
        data = data;
        page.render(route.client_method, data);
    };
    o.refresh = function(){ o.dispatch(route, data) };
    
    function wrapLinks() {
        // If we don't support pushState, fall back on default link behavior.
        if (!window.history && window.history.pushState) return;
        $('body').on('click', '[data-route-name]', function(e) {
            var anchor = $(e.target).closest('[data-route-name]'),
                route_name = anchor.attr('data-route-name'),
                route_obj = routes[route_name],
                page_state = {
                    page: anchor.attr('href'),
                    api: anchor.attr('data-api-path'),
                    route_name: route_name
                };
            e.preventDefault();
            navToRoute(page_state);
            return false;
        });

        // TODO: Bind this event with jquery?
        window.onpopstate = function(e) {
            if (!e.state) return;
            fetchRouteData(e.state);
        };

        function fetchRouteData(page_state, callback) {
            var callback = callback || function(){};
            api_call = {
                method: 'get',
                url: page_state.api.toString(),
                dataType: 'json',
                success: function(data) {
                    o.dispatch(page_state.route_name, data);
                    callback();
                }
            };
            $.ajax(api_call);
        }

        function navToRoute(page_state) {
            fetchRouteData(page_state, function() {
                history.pushState(page_state, null, page_state.page);
                nav.render(page_state.route_name == 'view_expr');
            });
        }
    };

    return o;
});
