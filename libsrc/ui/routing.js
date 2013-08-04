define([
    'json!ui/routes.json'
], function(ApiRoutes){
    var o = {};

    o.page_state = function(route_name, route_args) {
        var route = ApiRoutes[route_name], state = {
            'route_name': route_name,
            'page': o.substitute_variables(route.page_route, route_args, true)
        };
        if(route.api_route) state.api = o.substitute_variables(
            route.api_route, route_args, true);
        return state;
    };
    o.register_state = function(route_info) {
        if (!window.history && window.history.pushState) return;
        var route = ApiRoutes[route_info.route_name];
        history.pushState(o.page_state(
            route_info.route_name, route_info), null, route.page);
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