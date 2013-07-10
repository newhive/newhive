define([
    'json!ui/routes.json'
], function(ApiRoutes){
    var o = {};

    o.page_state = function(routeName, route_args) {
        var routeObj = ApiRoutes[routeName];
        return {
            "api": o.substitute_variables(routeObj.api_route, route_args, true),
            "page": o.substitute_variables(routeObj.page_route, route_args, true),
            "route_name": routeName
        };
    }
    o.register_state = function(route_info) {
        if (!window.history && window.history.pushState) return;
        var routeObj = ApiRoutes[route_info.route_name];
        history.pushState(o.page_state(
            route_info.route_name, route_info), null, routeObj.page);
    }
    o.substitute_variables = function(inStr, routeVars) {
        for (var routeVar in routeVars) {
            var needle = '<'+routeVar+'>';
            inStr = inStr.replace(needle, routeVars[routeVar]);
        }
        return inStr;
    }

    return o;
});