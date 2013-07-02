/** MIT License (c) copyright 2010-2013 B Cavalier & J Hann */

/**
 * curl json! plugin
 *
 * Like the text! plugin, will only load same-domain resources.
 */

(function (globalEval) {
define(/*=='curl/plugin/json',==*/ ['./_fetchText', '../cram/json'],
	function (fetchText, json_src)
{

	var hasJsonParse, missingJsonMsg;

	hasJsonParse = typeof JSON != 'undefined' && JSON.parse;
	missingJsonMsg = 'Cannot use strictJSONParse without JSON.parse';

	return {

		load: function (absId, require, loaded, config) {
			var evaluator, errback;

			errback = loaded['error'] || error;

			// create a json evaluator function
			if (config.strictJSONParse) {
				if (!hasJsonParse) error(new Error(missingJsonMsg));
				evaluator = guard(parseSource, loaded, errback);
			}
			else {
				evaluator = guard(evalSource, loaded, errback);
			}

			// get the text, then eval it
			fetchText(require['toUrl'](absId), evaluator, errback);

			function evalSource (source) {
				return globalEval('(' + source + ')');
			}

			function parseSource (source) {
				return JSON.parse(source);
			}

		},

		// 'cramPlugin': '../cram/json'
		compile: json_src.compile,
	};

	function error (ex) {
		throw ex;
	}

	function guard (evaluator, success, fail) {
		return function (source) {
			success(evaluator(source));
			// Eats exceptions in success call back for some reason
			// try {
			// 	success(evaluator(source));
			// }
			// catch (ex) {
			// 	fail(ex);
			// }
		}
	}

});
}(
	function () {/*jshint evil:true*/ return (1,eval)(arguments[0]); }
));
