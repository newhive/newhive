define([
    'server/context',
    'json!server/compiled.assets.json',
    'browser/js',
    'json!ui/routes.json'
], function(context, assets, util, ApiRoutes){
	var helpers = {
		asset: function(context, name){
			return assets[name];
		},
        get_route_anchor_attrs: function(scope, route_name) {
            var route_args = { username: context.user.name };
            // All arguments after route_name are name value pairs
            for(var i = 2; i < arguments.length; i += 2)
                route_args[arguments[i]] = arguments[i + 1];

            var attributes = [ ['data-route-name', route_name] ],
                href = ApiRoutes[route_name]['page_route'],
                api = ApiRoutes[route_name]['api_route'];
            for(var p in route_args){
                href = href.replace('<' + p + '>', route_args[p]);
                api = api.replace('<' + p + '>', route_args[p]);
            }
            //if(base_url.slice(-1) == '/') base_url = base_url.slice(0, -1);
            attributes.push(['href', href]);
            attributes.push(['data-api-path', api]);

            var attributes_str = attributes.map(function(attribute_pair) {
                return attribute_pair[0] + '="' + attribute_pair[1] + '"';
            }).join(' ');
            return attributes_str;
        },
	};


    util.copy(helpers, context);
    return context;
});