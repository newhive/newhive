define([
    'json!ui/routes.json',
], function(ApiRoutes){
    var o = {};
    o.getFormattedRouteObj = function(routeName, routeFormatVars) {
        var routeObj = ApiRoutes[routeName];
        return {
            "api": o.substituteVariables(routeObj.api_route, routeFormatVars),
            "page": o.substituteVariables(routeObj.page_route, routeFormatVars),
            "method": routeObj.client_method
        };
    }
    o.registerState = function(route_info) {
        if (!window.history && window.history.pushState) return;
        var routeObj = ApiRoutes[route_info.route_name];
        history.pushState(o.getFormattedRouteObj(
            route_info.route_name, route_info), null, routeObj.page);
    }
    o.substituteVariables = function(inStr, routeVars, bracketWrapped) {
        var old = inStr;
        for (var routeVar in routeVars) {
            var needle = bracketWrapped ? '<'+routeVar+'>' : routeVar;
                inStr = inStr.replace(needle, routeVars[routeVar]);   
            }
        return inStr;
    }
   return o; 
});