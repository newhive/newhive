define(['api_routes',
        'card_renderer',
        'js!browser/zepto'], function(_ApiRoutes, _cardRenderer) {
    var cardRenderer = _cardRenderer();
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
                cardRenderer.renderCards(data);
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
    function getFormattedRouteObj(apiRoute, routeFormatVars) {
        var apiRouteObj = ApiRoutes[apiRoute];
        return {
            "api": substituteVariables(apiRoute, routeFormatVars),
            "page": substituteVariables(apiRouteObj.pageRoute, routeFormatVars),
            "title": apiRouteObj.title
        };
    }
    return function() {
        return {
            wrapLinks: function() {
                // If we don't support pushState, fall back on default link behavior.
                if (!window.history && window.history.pushState) return;
                $('body').on('click', '[data-load-route]', function(e) {
                   var apiRoute = e.target.getAttribute('data-load-route');
                   var routeFormatVars = {
                       '<username>': e.target.getAttribute('data-username')
                   };
                   var routeObj = getFormattedRouteObj(apiRoute, routeFormatVars);
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