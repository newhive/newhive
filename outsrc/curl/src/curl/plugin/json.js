/** MIT License (c) copyright B Cavalier & J Hann */

/**
 * curl json! plugin
 *
 * Like the text! plugin, will only load same-domain resources.
 */

(function (globalEval) {
define(/*=='curl/plugin/json',==*/ ['./_fetchText'], function (fetchText) {

	var hasJsonParse, missingJsonMsg;

	hasJsonParse = typeof JSON != 'undefined' && JSON.parse;
	missingJsonMsg = 'Cannot use strictJSONParse without JSON.parse';

	return {

		load: function (absId, require, loaded, config) {
			var evaluator, errback;

			errback = loaded['error'] || error;

			if (config.strictJSONParse) {
				if (!hasJsonParse) error(new Error(missingJsonMsg));
				evaluator = parseSource;
			}
			else {
				evaluator = evalSource;
			}

			// get the text, then eval it
			fetchText(require['toUrl'](absId), evaluator, errback);

			function evalSource (source) {
				try {
					var return_container = {},
						result = globalEval('(' + source + ')',
							return_container, 'value');
					loaded(return_container.value);
				}
				catch (ex) {
					errback(ex);
				}
			}

			function parseSource (source) {
				return JSON.parse(source);
			}

		},

		'cramPlugin': '../cram/json'

	};

});
}(
	function (source, obj, prop) {/*jshint evil:true*/ obj[prop] = eval(source); }
));
