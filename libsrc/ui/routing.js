define([
    'json!ui/routes.json',
], function(ApiRoutes){
    var o = {};
    o.page_state = function(routeName, routeFormatVars) {
        var routeObj = ApiRoutes[routeName];
        return {
            "api": o.substituteVariables(routeObj.api_route, routeFormatVars, true),
            "page": o.substituteVariables(routeObj.page_route, routeFormatVars, true),
            "route_name": routeName
        };
    }
    o.registerState = function(route_info) {
        if (!window.history && window.history.pushState) return;
        var routeObj = ApiRoutes[route_info.route_name];
        history.pushState(o.page_state(
            route_info.route_name, route_info), null, routeObj.page);
    }
    o.substituteVariables = function(inStr, routeVars) {
        for (var routeVar in routeVars) {
            var needle = '<'+routeVar+'>';
            inStr = inStr.replace(needle, routeVars[routeVar]);   
        }
        return inStr;
    }
   return o; 
});