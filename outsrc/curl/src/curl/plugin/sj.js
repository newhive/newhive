define(['text/stringjay'], function(sj){
	function xhr(){ return new XMLHttpRequest(); };
    
	function fetchText(url, callback, errback){
		var x = xhr();
		x.open('GET', url, true);
		x.onreadystatechange = function (e) {
			if (x.readyState === 4) {
				if (x.status < 400) callback(x.responseText);
				else {
					errback(new Error('fetchText() failed. status: ' + x.statusText));
				}
			}
		};
		x.send(null);
	}

	function set_reference(obj, name, val){
		var path = name.replace(/\//g, '.').split('.'), prop_name, prop;
		while(prop_name = path.shift()){
			prop = obj[prop_name];
			if(!path.length) obj[prop_name] = val;
			else if(typeof(prop) != 'object') prop = obj[prop_name] = {};
			obj = prop;
		}
		obj = val;
	}

	return {
		'load': function (resourceId, require, callback, config) {
            fetchText('/lib/libsrc/' + resourceId, function(text){
				var t = sj.template(text);
				set_reference(sj.base_context, resourceId, t);
				callback(t);
            });
		}
	}
});