define([
    'browser/jquery',
    'ui/routing',
    'ui/page',
    'ui/nav',
    'server/context',
    'json!ui/routes.json',
    'sj!templates/card_master.html',
    'sj!templates/profile_edit.html',
    'sj!templates/expr_card.html',
    'sj!templates/feed_card.html',
    'sj!templates/user_card.html'
], function($, routing, page, nav, context, routes, card_template, profile_edit_template) {
    var o = {}, page_data, current_route;
    const ANIM_DURATION = context.ANIM_DURATION || 700;

    o.init_page = function(route_args){
        o.dispatch(route_args.route_name, context);
        wrapLinks();
        routing.registerState(route_args);
        nav.render(o.refreh);
        $(window).resize(o.layout);
        o.layout();
    };

    o.dispatch = function(route_name, data){
        var route = routes[route_name];
        current_route = route_name;
        page_data = data;
        return o[route.client_method](data.page_data);
    };
    o.refresh = function(){ o.dispatch(current_route, page_data) };

    o.expr_detail = function(data){
        render_site(data);
        expr_column();
    };

    o.columns = function(data){
        render_site(data);
    };

    o.profile = function(data){
        render_site(data);
        expr_column();
    };

    o.profile_edit = function(data){
         
    };

    o.profile_private = function(data){
        data.page_data.profile.sub_heading = 'Private';
        render_site(data);
        expr_column();
    };
    
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
                }
            ;
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
            });
        }
    };

    return o;
});
