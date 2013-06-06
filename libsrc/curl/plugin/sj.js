define(['text/stringjay', './_fetchText'], function(sj, fetchText){
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
				t.template_name = resourceId;
				set_reference(sj.base_context, resourceId, t.template_apply);
				callback(t);
            });
		}
	}
});