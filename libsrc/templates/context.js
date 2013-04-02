define(['server/session', 'server/compiled.assets'], function(s, assets){
	var helpers = {
		asset: function(fn){
			console.log(fn());
			return assets[fn()];
		}
	};

	return { s: s, h: helpers };
});