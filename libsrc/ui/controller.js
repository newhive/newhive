define([
    'browser/jquery',
    'browser/js',
    'ui/page',
    'ui/nav',
    'server/context',
    'json!ui/routes.json',
    'ui/routing'
], function($, util, page, nav, context, routes, routing) {
    var o = {}, route;

    o.init = function(route_args){
        routing.registerState(route_args);
        nav.set_expr_view(route_args.route_name == 'view_expr');
        page.init(o);
        o.dispatch(route_args.route_name, context.page_data);
        wrapLinks();
    };
    o.dispatch = function(route_name, data){
        if(data.owner && (data.owner.id == context.user.id))
            data.user_is_owner = true;
        nav.set_expr_view(route_name == 'view_expr');
        route = routes[route_name];
        var cards = context.page_data.cards;
        context.page_data = data;
        if(!data.cards) context.page_data.cards = cards;
        page.render(route.client_method, context);
    };
    o.refresh = function(){ o.dispatch(route.method, context) };

    o.open_route = function (page_state) {
        fetch_route_data(page_state, function() {
            history.pushState(page_state, null, page_state.page);
        });
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

        $('form').on('submit', function(e){
            var el = $(e.target);
            $.post(el.attr('action'), el.serialize(), function(data){
                el.trigger('response', data);
            }, 'json');
            e.preventDefault();
            return false;
        });

        // TODO: Bind this event with jquery?
        window.onpopstate = function(e) {
            if (!e.state) return;
            o.open_route(e.state);
        };
    };

    function fetch_route_data(page_state, callback) {
        var callback = callback || function(){};

        if(page_state.api){
            api_call = {
                method: 'get',
                url: page_state.api.toString(),
                dataType: 'json',
                success: success
            };
            $.ajax(api_call);
        }
        else success(context.page_data);

        function success(data){
            o.dispatch(page_state.route_name, data);
            callback();
        }
    }

    return o;
});
