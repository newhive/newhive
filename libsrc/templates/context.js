define(['server/session', 'server/compiled.assets'], function(s, assets){
	var helpers = {
		asset: function(name){
			return assets[name]
		}
	};

	return { s: s, h: helpers };
});