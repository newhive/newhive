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
        get_route_anchor_attrs: function(context, route_name, args) {
            var attributes = [];
            for (var arg_name in args) {
                attributes.push(['data-'+arg_name,args[arg_name]]);
            };
            var href = ApiRoutes[route_name]['page_route'];
            var base_url = '//:';
            alert(context.server_url);
            if (base_url.charAt(base_url.length-1) == '/') {
                base_url = base_url.substring(0, base_url.length-1);
            }
            for (var arg_name in args) {
                href = href.replace('<' + arg_name + '>', args[arg_name]);
            }
            attributes.push(['href', base_url + href]);
            attributes.push(['data-route-name',route_name]);
            // # For use inside of templates
            // # Format {"key": "val"} to data-key="val"
            // attributes = map(lambda x: ('data-'+x[0],x[1]),kwargs.iteritems())
            // # Add href attribute for fallback
            // href = self.routes_obj[route_name]['page_route']
            // # Substitute <variable> names in href URL
            // base_url = abs_url()
            // # Trim trailing slash from abs_url(), if present
            // if base_url[-1] == '/': base_url = base_url[:-1]
            // for variable,replacement in kwargs.iteritems():
            //     href = href.replace('<%s>' % variable,replacement)
            // attributes.append(('href',base_url + href))
            // # Add data-route-name attribute
            // attributes.append(('data-route-name',route_name))
            var attributes_str = attributes.map(function(attribute_pair) {
                return attribute_pair[0] + '="' + attribute_pair[1] + '"';
            }).join(' ');
            // attributes_str = ' '.join(map(lambda x: '%s="%s"' % x,attributes))
            return attributes_str
        }
	};

    util.copy(helpers, context);
    return context;
});