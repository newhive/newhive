define(['card_renderer','js!browser/zepto'], function(_cardRenderer) {
    var cardRenderer = _cardRenderer();
    
    const lookupTable = {
        "/api/(username)/profile/network" : {
            "title" : 'Network Feed',
            "pageRoute": '/(username)/profile/network'
        },
        "/api/(username)/profile/expressions/public": {
            "title": "User Feed",
            "pageRoute": "/(username)/profile/expressions/public"
        }
        
    };
    
    // routeVars is a dictionary that maps {"(var)": "replaceVal"}
    function substituteVariables(inStr, routeVars) {
        for (var routeVar in routeVars)
            inStr = inStr.replace(routeVar, routeVars[routeVar]);
        return inStr;
    }
    return function() {
        return {
            wrapLinks: function() {
                $('body').on('click', '[data-load-route]', function(e) {
                   var apiRoute = e.target.getAttribute('data-load-route');
                   var routeFormatVars = {
                       '(username)': e.target.getAttribute('data-username')
                   };
                   formattedApiRoute = substituteVariables(apiRoute, routeFormatVars);
                   $.ajax({
                       method: 'get',
                       url: formattedApiRoute.toString(),
                       dataType: 'json',
                       success: function(data) {
                           cardRenderer.renderCards(data);
                           history.pushState({
                               "apiRoute": formattedApiRoute
                           }
                           ,null
                           ,substituteVariables(lookupTable[apiRoute].pageRoute,routeFormatVars));
                       }
                   })
                   e.preventDefault();
                   return false;
                });
            }
        };
    }
});