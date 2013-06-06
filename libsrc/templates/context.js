define([
    'server/context',
    'json!server/compiled.assets.json',
    'json!ui/routes.json',
    'ui/routing',
    'browser/js'
], function(context, assets, ApiRoutes, routing, js_util){
	var helpers = {
		asset: function(context, name){
			return assets[name];
		},
        anchor_attrs: function(scope, route_name) {
            var route_args = { username: context.user.name };
            // All arguments after route_name are name value pairs
            for(var i = 2; i < arguments.length; i += 2)
                route_args[arguments[i]] = arguments[i + 1];

            var attributes = [ ['data-route-name', route_name] ],
                href = ApiRoutes[route_name]['page_route'],
                api = ApiRoutes[route_name]['api_route'];
            attributes.push(['href',
                routing.substituteVariables(href, route_args, true)]);
            if(api) attributes.push(['data-api-path',
                routing.substituteVariables(api, route_args, true)]);
            
            var attributes_str = attributes.map(function(attribute_pair) {
                return attribute_pair[0] + '="' + attribute_pair[1] + '"';
            }).join(' ');
            return attributes_str;
        },
        feed_action: function(scope, r){
            if(r.class_name == 'Star' && r.entity_class == 'Expr') return 'loves';
            if(r.class_name == 'Star' && r.entity_class == 'User') return 'follows';
            if(r.class_name == 'Comment') return 'comments';
            if(r.class_name == 'FriendJoined') return 'joined';
            if(r.class_name == 'Broadcast') return 'republishes';
        }
	};

    js_util.copy(helpers, context);
    return context;
});