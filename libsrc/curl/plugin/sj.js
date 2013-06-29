define(['text/stringjay', './_fetchText'], function(sj, fetchText){
	return {
		'load': function (resourceId, require, callback, config) {
            fetchText('/lib/libsrc/' + resourceId, function(text){
				var t = sj.template(text, resourceId);
				callback(t);
            });
		},

		compile: function (pluginId, resId, req, io, config) {
			var absId = pluginId + '!' + resId;
			io.read(
				resId,
				function(source) {
					var out = "define('" + absId	+ "',"
						+ "['text/stringjay'],"
						+ "function(sj){"
							+ "return sj.template(" + JSON.dumps(source)
								+ "," + JSON.dumps(resId) + ");"
						+ "});";
					io.write(out);
				},
				io.error
			);
		}
	}
});
