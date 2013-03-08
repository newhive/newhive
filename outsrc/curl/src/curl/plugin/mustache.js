define(['text/mustache'], function(Mustache){
	function fetchText (url, callback, errback) {
		var x = xhr();
		x.open('GET', url, true);
		x.onreadystatechange = function (e) {
			if (x.readyState === 4) {
				if (x.status < 400) {
					callback(x.responseText);
				}
				else {
					errback(new Error('fetchText() failed. status: ' + x.statusText));
				}
			}
		};
		x.send(null);
	}

	return {
		'load': function (resourceId, require, callback, config) {
			console.log(resourceId, require, callback, config);
			window.req = require;
		}
	}
});

		// var sheets, resources, cssWatchPeriod, cssNoWait, loadingCount, i;
		// sheets = [];
		// resources = (resourceId || '').split(",");
		// cssWatchPeriod = config['cssWatchPeriod'] || 50;
		// cssNoWait = config['cssNoWait'];
		// loadingCount = resources.length;