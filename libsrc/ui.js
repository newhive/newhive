define(['api_routes',
        'ui/community',
        'js!browser/zepto'], function(_ApiRoutes, community) {
    var ApiRoutes = _ApiRoutes();
    function substituteVariables(inStr, routeVars) {
        for (var routeVar in routeVars)
            inStr = inStr.replace(routeVar, routeVars[routeVar]);
        return inStr;
    }
    function fetchRouteData(routeObj, callback) {
        var callback = callback || function(){};
        $.ajax({
            method: 'get',
            url: routeObj.api.toString(),
            dataType: 'json',
            success: function(data) {
                community.render(data);
                callback();
            }
        });
    }
    function navToRoute(routeObj) {
        renderRoute(routeObj, function() {
            history.pushState(routeObj,null,routeObj.page);
        });
    }
    function renderRoute(routeObj, callback) {
        if (!callback) callback = function(){};
        fetchRouteData(routeObj, callback);
    }
    function getFormattedRouteObj(routeName, routeFormatVars) {
        var routeObj = ApiRoutes[routeName];
        return {
            "api": substituteVariables(routeObj.apiRoute, routeFormatVars),
            "page": substituteVariables(routeObj.pageRoute, routeFormatVars),
            "title": routeObj.title
        };
    }
    return function() {
        return {
            wrapLinks: function() {
                // If we don't support pushState, fall back on default link behavior.
                if (!window.history && window.history.pushState) return;
                $('body').on('click', '[data-route-name]', function(e) {
                   var routeName = e.target.getAttribute('data-route-name');
                   var routeFormatVars = {
                       '<username>': e.target.getAttribute('data-username')
                   };
                   var routeObj = getFormattedRouteObj(routeName, routeFormatVars);
                   navToRoute(routeObj);
                   e.preventDefault();
                   return false;
                });
                // TODO: Bind this event with jquery?
                window.onpopstate = function(e) {
                    if (!e.state) return;
                    renderRoute(e.state);
                };

            }
        };
    }
});