define([
    'json!ui/routes.json',
    'json!server/compiled.config.json'
], function(ApiRoutes, config){
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
            if(route.secure)
                state.api = config.secure_server + state.api.slice(1);
        }
        return state;
    };
    o.register_state = function(route_info) {
        if (!window.history && window.history.pushState) return;
        var state = o.page_state(route_info.route_name, route_info, location.search.slice(1));
        history.pushState(state, null, state.page);
    };
    o.substitute_variables = function(inStr, routeVars) {
        for (var routeVar in routeVars) {
            var needle = '<'+routeVar+'>';
            inStr = inStr.replace(needle, routeVars[routeVar]);
        }
        return inStr;
    };

    return o;
});