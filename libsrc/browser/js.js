define(function(){

var o = {};

// Has various limitations: no cycle checking obviously,
// doesn't handle DontEnum properties
// (so primitive object types aren't copied properly. If needed, see commented code below),
// probably other weird cases too.
// This is part of an experiment to see how many modules can avoid depending on jquery
o.copy = function(from, to, deep){
    if (from == null || typeof from != "object") return from;
    to = to || new from.constructor();
    for(var p in from) to[p] = deep ? o.copy(from[p], to[p], deep) : from[p];
    return to;
};

// This improves upon jQuery.extend, in that it actually copies native objects (second if)
// function copy(from, to) {
//     if (from == null || typeof from != "object") return from;
//     // Any sane code will treat these objects as immutable, but...
//     if (from.constructor == Date || from.constructor == RegExp || from.constructor == Function ||
//         from.constructor == String || from.constructor == Number || from.constructor == Boolean)
//         return new from.constructor(from);
//     if (from.constructor != Object && from.constructor != Array) return from;

//     to = to || new from.constructor();

//     for (var name in from){
//         to[name] = typeof to[name] == "undefined" ? extend(from[name], null) : to[name];
//     }

//     return to;
// }

o.id = function(x) { return x; };
o.noop = function() { };
o.cp = function(f, g) { return function(a) { f(g(a)); } }

o.range = function(start, end) {
    if (typeof(end) == "undefined") { end=start; start=0; }
    var l = [];
    for (var i = start; i < end; i++){
        l.push(i);
    }
    return l;
}

o.bound = function(num, lower_bound, upper_bound) {
    if(num < lower_bound) return lower_bound;
    if(num > upper_bound) return upper_bound;
    return num;
}

o.dfilter = function(o, plist) {
    var ret = {};
    plist.map(function(p){ ret[p] = o[p] });
    return ret;
}

o.zip = function(list1, list2) {
    var ret = [];
    for(var i = 0; i < list1.length; i++) ret.push([list1[i], list2[i]]);
    return ret;
}

o.op = {
    '+' : function(a, b) { return a + b },
    '-' : function(a, b) { return a - b },
    '*' : function(a, b) { return a * b },
    '/' : function(a, b) { return a / b },
    '%' : function(a, b) { return a % b }
};

/* Returns a function that calls that.callback no less than min_delay
 * milliseconds apart. Useful for wrapping mouse event handlers */
o.throttle = function(callback, min_delay, that) {
    var then = null;
    return function() {
        var now = new Date();
        if(now - then > min_delay) {
            then = now;
            callback.apply(that, arguments);
        }
    }
}

/*** Returns a function that calls a list of functions ***/
// I have a feeling this should not be used anywhere
o.Funcs = function(fn, filter) {
    var o = [];
    if(fn) o.push(fn);
    var callback = function() {
        if (!filter || filter()){
            for(var i in o) o[i].apply(this, arguments);
        }
    };
    callback.handlers = o;
    callback.add = function(fn) { o.push(fn); }
    callback.clear = function() { o = []; }
    return callback;
}

return o;
});