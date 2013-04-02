function dfilter(o, plist) {
    var ret = {};
    plist.map(function(p){ ret[p] = o[p] });
    return ret;
}

function zip(list1, list2) {
    var ret = [];
    for(var i = 0; i < list1.length; i++) ret.push([list1[i], list2[i]]);
    return ret;
}

op = {
    '+' : function(a, b) { return a + b },
    '-' : function(a, b) { return a - b },
    '*' : function(a, b) { return a * b },
    '/' : function(a, b) { return a / b },
    '%' : function(a, b) { return a % b }
};

// debugging function logs time between events, grouped by label
function time_since_last(label, extra_log) {
    var that = time_since_last;
    var delta;
    var time = Date.now();

    if (!that.storage) that.storage = {};
    if (that.storage[label]) {
        delta = time - that.storage[label];
    } else {
        delta = NaN;
    }
    that.storage[label] = time;

    if (typeof(extra_log) == "undefined") { console.log(label, time, delta); }
    else { console.log(label, extra_log, time, delta); }
    return delta;
};

// TODO: Put this in a debug mode module, along with curl.expose
o.console_log = function(m){ console.log(m); };

// TODO: put these two somewhere in server?
function logAction(action, data){
    if (!data) data=false;
    $.ajax({
        url: '', 
        type: 'POST',
        data: {action: 'log', log_action: action, data: JSON.stringify(data)}
    });
};
function logShare(service){
    var data = {'service': service};
    if (typeof(expr_id) != 'undefined') data.expr_id = expr_id
    logAction('share', data);
    _gaq.push(['_trackEvent', 'share', service]);
};

