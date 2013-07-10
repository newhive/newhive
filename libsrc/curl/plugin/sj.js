define(
	['text/stringjay', './_fetchText', 'require'],
	function(sj, fetchText, require)
{
	return {
		'load': function (resourceId, require, callback, config) {
			var context = require(['server/context'], function(context){
	            fetchText('/lib/libsrc/' + resourceId, function(text){
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
								+ JSON.dumps(source) + ","
								+ JSON.dumps(resId) + ","
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
