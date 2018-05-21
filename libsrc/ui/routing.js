define([
    'jquery',
    'json!ui/routes.json',
    // 'history/history',
    'json!server/compiled.config.json'
], function($, ApiRoutes, /*history, */config){
    var o = {};

    // turns out I don't really need this, but could be useful in the future
    // (untested)
    // o.abs_url = function(opts){
    //     var ssl = (typeof opts.secure == 'boolean') ? opts.secure : o.is_secure,
    //         proto = 'https' if ssl else 'http',
    //         port = ssl ? config.ssl_port : config.plain_port,
    //         port = (port == 80 || port == 443) ? '' : ':' + port,
    //         domain = config.server_name;
    //     if(config.dev_prefix) domain = config.dev_prefix + '.' + domain;
    //     var url = proto + '://' + domain + port + '/';
    //     if(opts.path) url += opts.path.replace(/^\//,'');
    //     return url;

    o.page_state = function(route_name, route_args, query) {
        if(typeof query == 'object') query = $.param(query);
        query = query ? '?' + query : '';
        var route = ApiRoutes[route_name];
        if(!route) throw('Route "' + route_name + '" not found');
        var state = { 'route_name': route_name };
        if(route.page_route){
            state.page = o.substitute_variables(
                route.page_route, route_args, true) + query;
        };
        if(route.api_route){
            state.api = o.substitute_variables(
                route.api_route, route_args, true) + query;

            // api routes are http://content_domain/foo,
            // https://content_domain/foo, https://server_domain/foo, or /foo
            var prefix = ''
            if(route.content_domain) prefix = (route.secure ?
                config.secure_content_url : config.content_url).slice(0,-1)
            else if(route.secure) prefix = config.secure_server.slice(0,-1)
            state.api = prefix + state.api
        }
        return state;
    };
    o.register_state = function(route_info) {
        if (!window.history && window.history.pushState) return;
        var state = o.page_state(route_info.route_name, route_info, location.search.slice(1));
        history.pushState(state, null, state.page);
    };
    o.substitute_variables = function(route_pattern, routeVars) {
        // hack to deal with any() hack to fix werkzeug route ordering
        // https://github.com/mitsuhiko/werkzeug/issues/727
        route_pattern = route_pattern.replace(/<any\((\w+)\):\w+>/, '$1')
        for (var routeVar in routeVars){
            var needle = RegExp('<([^:<]+:)?' + routeVar +'>')
            route_pattern = route_pattern.replace(needle, routeVars[routeVar])
        }
        return route_pattern
    };

    return o;
});
