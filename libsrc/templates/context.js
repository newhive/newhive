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
            var arg_values = {
                "username": context.user.name
            };
            // Assume all arguments after the first are template parameters
            var args = Array.prototype.slice.call(arguments);
            args=args.slice(1);
            var attributes = [];
            for (var arg_idx = 0; arg_idx < args.length; arg_idx++) {
                var arg_name = args[arg_idx];
                if (arg_name in arg_values) {
                    attributes.push(['data-'+arg_name,arg_values[arg_name]]);   
                }
            };
            var href = ApiRoutes[route_name]['page_route'];
            var base_url = context.server_url;
            if (base_url.charAt(base_url.length-1) == '/') {
                base_url = base_url.substring(0, base_url.length-1);
            }
            for (var arg_idx = 0; arg_idx < args.length; arg_idx++) {
                href = href.replace('<' + args[arg_idx] + '>', arg_values[args[arg_idx]]);
            }
            attributes.push(['href', base_url + href]);
            attributes.push(['data-route-name',route_name]);
            var attributes_str = attributes.map(function(attribute_pair) {
                return attribute_pair[0] + '="' + attribute_pair[1] + '"';
            }).join(' ');
            return attributes_str;
        }
	};

    util.copy(helpers, context);
    return context;
});