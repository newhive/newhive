define(['text/mustache'], function(Mustache){
	function xhr () {
		if (typeof XMLHttpRequest !== "undefined") {
			// rewrite the getXhr method to always return the native implementation
			xhr = function () { return new XMLHttpRequest(); };
		}
		else {
			// keep trying progIds until we find the correct one, then rewrite the getXhr method
			// to always return that one.
			var noXhr = xhr = function () {
					throw new Error("getXhr(): XMLHttpRequest not available");
				};
			while (progIds.length > 0 && xhr === noXhr) (function (id) {
				try {
					new ActiveXObject(id);
					xhr = function () { return new ActiveXObject(id); };
				}
				catch (ex) {}
			}(progIds.shift()));
		}
		return xhr();
	}
    
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
			window.req = require;
            // TODO: Get this working properly with assets
            fetchText('/lib/libsrc/' + resourceId, callback);
		}
	}
});

		// var sheets, resources, cssWatchPeriod, cssNoWait, loadingCount, i;
		// sheets = [];
		// resources = (resourceId || '').split(",");
		// cssWatchPeriod = config['cssWatchPeriod'] || 50;
		// cssNoWait = config['cssNoWait'];
		// loadingCount = resources.length;