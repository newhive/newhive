define(
	['text/stringjay', './_fetchText', 'require'],
	function(sj, fetchText, require)
{
	return {
		'load': function (resourceId, require, callback, config) {
			// server/context can't be an explicit dependency because
			// currently curl can not handle a module loader loading another
			// module loader (server/context depends on the json loader)
			var context = require(['server/context'], function(context){
	            fetchText(config.baseUrl + '/' + resourceId, function(text){
					var t = sj.template(text, resourceId, context);
					callback(t);
	            });
	        });
		},

		compile: function (pluginId, resId, req, io, config){
			var absId = pluginId + '!' + resId;
			io.read(
				resId,
				function(source) {
					var out = "define('" + absId	+ "',"
						+ "['text/stringjay', 'server/context'],"
						+ "function(sj, context){"
							+ "return sj.template("
								+ JSON.stringify(source) + ","
								+ JSON.stringify(resId) + ","
								+ "context"
							+ ");"
						+ "});";
					io.write(out);
				},
				io.error
			);
		}
	}
});
