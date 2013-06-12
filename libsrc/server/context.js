// empty object module for server to put stuff in
define([
    'json!server/compiled.assets.json',
    'json!ui/routes.json',
    'ui/routing',
    'browser/js'
], function(assets, api_routes, routing, js_util){
    var o = {};

    o.asset = function(context, name){
        return assets[name];
    };

    // TODO: factor out common code from these two
    // takes route_name, and association argument list.
    // Returns attribute string.
    o.anchor_attrs = function(scope, route_name){
        var route_args = { username: o.user.name };
        // All arguments after route_name are name value pairs
        for(var i = 2; i < arguments.length; i += 2)
            route_args[arguments[i]] = arguments[i + 1];

        if(!api_routes[route_name]) throw('Route "' + route_name + '" not found');
        var attributes = [ ['data-route-name', route_name] ],
            href = api_routes[route_name]['page_route'],
            api = api_routes[route_name]['api_route'];
        if(href) attributes.push(['href',
            routing.substituteVariables(href, route_args, true)]);
        if(api) attributes.push(['data-api-path',
            routing.substituteVariables(api, route_args, true)]);

        return attributes.map(function(attribute_pair) {
            return attribute_pair[0] + '="' + attribute_pair[1] + '"';
        }).join(' ');
    };

    // does the same as function above but for <form>s instead of <a>s
    o.form_attrs = function(scope, route_name){
        var route_args = { username: o.user.name };
        // All arguments after route_name are name value pairs
        for(var i = 2; i < arguments.length; i += 2)
            route_args[arguments[i]] = arguments[i + 1];

        if(!api_routes[route_name]) throw('Route "' + route_name + '" not found');
        var attributes =
            [['data-route-name', route_name],
                ['enctype', 'multipart/form-data']],
            api = api_routes[route_name]['api_route'];
        if(api) attributes.push(['action',
            routing.substituteVariables(api, route_args, true)]);

        return attributes.map(function(attribute_pair) {
            return attribute_pair[0] + '="' + attribute_pair[1] + '"';
        }).join(' ');
    };

    return o;
});