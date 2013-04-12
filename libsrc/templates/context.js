define([
    'server/context', 'json!server/compiled.assets.json', 'browser/js'
], function(context, assets, util){
	var helpers = {
		asset: function(context, name){
			return assets[name];
		}
	};

    util.copy(helpers, context);
    return context;
});