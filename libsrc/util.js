if (typeof(Hive) == "undefined") Hive = {};
/*** For debugging.
 * Returns a function that calls that.callback no less than min_delay
 * milliseconds apart. Useful for wrapping mouse event handlers ***/
function throttle(callback, min_delay, that) {
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
function Funcs(fn, filter) {
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

function exprDialog(url, opts) {
    $.extend(opts, { absolute: true, layout : function(e) {
        var w = e.parent().width(), h = e.parent().height(), a = parseFloat(e.attr('data-aspect'));
        if(e.width() / e.height() < w / h) e.width(h * .8 * a).height(h * .8);
        else e.width(w * .8).height(w * .8 / a);
        center(e, $(window), opts);
        place_apps();
    } });
    return loadDialog(url + '?template=expr_dialog', opts);
}
exprDialog.loaded = {};

function loadDialog(url, opts) {
    $.extend({ absolute : true }, opts);
    var dia;
    if(loadDialog.loaded[url]) {
        dia = loadDialog.loaded[url];
        showDialog(dia,opts);
    }
    else {
        $.ajax({ url : url, dataType: 'text', success : function(h) { 
            var html = h;
            dia = loadDialog.loaded[url] = $(html);
            showDialog(dia,opts);
        }});
    }
}
loadDialog.loaded = {};

function loadDialogPost(name, opts) {
    var dia;
    opts = $.extend({reload: false, hidden: false}, opts);
    if(loadDialog.loaded[name]) {
        dia = loadDialog.loaded[name];
    } 
    if (dia && !opts.reload && !opts.hidden) {
        showDialog(dia,opts);
    } else {
        $.post(window.location, {action: 'dialog', dialog: name}, function(h){
            var html = h;
            if (dia && opts.reload ) {
                dia.filter('div').replaceWith($(html).filter('div'));
            } else {
                dia = loadDialog.loaded[name] = $(html);
                if (!opts.hidden){
                    showDialog(dia,opts);
                }
            }
        }, 'text');
    }
}

function secureDialog(type, opts) {
    var dia;
    var params = $.extend({'domain': window.location.hostname, 'path': window.location.pathname}, opts.params)
    if (loadDialog.loaded[type]) dia = loadDialog.loaded[type];
    else {
        dia = loadDialog.loaded[type] = '<iframe style="' + opts.style + '" src="' + server_url + type + '?' + $.param(params) + '" />';
    }
    return showDialog(dia, opts);
};

function showDialog(name, opts) {
    var dialog = $(name);
    if(!dialog.length) throw "dialog element " + name + " not found";
    var o = dialog.data('dialog');
    if(!o) {
        var o = { dialog : dialog };
        dialog.data('dialog', o);

        o.open = function() {
            if(o.opened) return;
            o.opened = true;
            o.opts = $.extend({
                open : noop, close : noop, absolute : false, fade : true,
                manual_close: noop, // Function to run if dialog is closed by clicking button or shield
                mandatory: dialog.hasClass('mandatory'),
                layout: function() { center(dialog, $(window), opts) },
                close_btn: true
            }, opts);

            o.shield = $("<div id='dialog_shield'>");
            if(o.opts.fade) o.shield.addClass('fade');
            o.shield.appendTo(document.body);

            dialog.detach().appendTo(document.body)
                .css('position', o.opts.absolute ? 'absolute' : 'fixed').show();

            if(!o.opts.mandatory) {
                var manual_close = function(){ o.close(true); };
                if( o.opts.close_btn && ! dialog.find('.btn_dialog_close').length )
                    $('<div class="btn_dialog_close">').prependTo(dialog).click(manual_close);
                o.shield.click(manual_close);
                if(o.opts.click_close) dialog.click(manual_close);
            }

            $(window).resize(function(){ o.opts.layout(o.dialog) });
            o.opts.layout(o.dialog);

            if(o.opts.select) dialog.find(o.opts.select).click();
            o.index = showDialog.opened.length;
            showDialog.opened.push(o);
            o.opts.open();
        }

        o.close = function(manual) {
            // If manual is true this means dialog was closed by clicking button or shield
            showDialog.opened.splice(showDialog.opened.indexOf(o), 1);
            o.shield.remove();
            $(window).unbind('resize', o.opts.layout);
            var clean_up = function() {
                dialog.hide();
                o.opts.close();
                if (manual) o.opts.manual_close();
                o.opened = false;
            }
            if(o.opts.minimize_to) minimize(dialog, $(o.opts.minimize_to), { 'complete' : clean_up });
            else clean_up();
        }
    }
    o.open();

    return o;
}
showDialog.opened = [];
closeDialog = function() { showDialog.opened[showDialog.opened.length - 1].close(); }

function id(x) { return x; };
function noop() { };
// takes f, a1, a2, ... and returns function() { f(a1, a2, ...) }
//function ap(f) { var args = arguments; return function() { return f.apply(null, Array.prototype.slice.call(args, 1)); }; };
// oo version, takes f, a1, a2, ... returns function() { a1.f(a2, ...) }
//function apo(f) { var args = arguments; return function() { return f.apply(args[1], Array.prototype.slice.call(args, 2)); }; };
//function accessor(name) { return function(o) { return o[name] } }
function cp(f, g) { return function(a) { f(g(a)); } } // functional composition
function range(start, end) {
    if (typeof(end) == "undefined") { end=start; start=0; }
    var l = [];
    for (var i = start; i < end; i++){
        l.push(i);
    }
    return l;
}

function map(f, list) {
    var ret = [];
    for(var i = 0; i < list.length; i++) ret.push(f(list[i]));
    return ret;
}
function map2(f, list1, list2) {
    var ret = [];
    for(var i = 0; i < list1.length; i++) ret.push(f(list1[i], list2[i]));
    return ret;
}
function propsin(o, plist) {
    var ret = {};
    for(var i = 0; i < plist.length; i++) ret[plist[i]] = o[plist[i]];
    return ret;
}
// Combination of foldl and foldl1
function reduce(f, list, left) {
    var i = 0;
    if(left === undefined) {
        left = L[0];
        i = 1;
    }
    for(; i < list.length; i++){ left = f(left, L[i]) }
    return left;
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
function bound(num, lower_bound, upper_bound) {
    if(num < lower_bound) return lower_bound;
    if(num > upper_bound) return upper_bound;
    return num;
}

function array_delete(arr, e) {
    for(var n = 0; n < arr.length; n++) {
        if(arr[n] == e) {
            arr.splice(n, 1);
            return true;
        }
    }
    return false;
}
function array_sum( a, b ){
    if (a.length != b.length) { throw "Arrays must be equal length" };
    rv = []
    for (i=0; i< a.length; i++){
        rv[i] = a[i] + b[i]
    }
    return rv
}
function inArray(array, el){
    for (i=0; i<array.length; i++){
        if (el === array[i]) return true;
    }
    return false;
}

    
var urlParams = {};
(function () {
    var d = function (s) { return s ? decodeURIComponent(s.replace(/\+/, " ")) : null; }
    if(window.location.search) $.each(window.location.search.substring(1).split('&'), function(i, v) {
        var pair = v.split('=');
        urlParams[d(pair[0])] = d(pair[1]);
    });
})();

function center(e, inside, opts) {
    if(!e.width() || !e.height()) return; // As image is loading, sometimes height can be falsely reported as 0

    var w = typeof(inside) == 'undefined' ? $(window) : inside,
        opts = $.extend({
            absolute: false,
            minimum: true,
            h: true,
            v: true 
        }, opts),
        pos = {}
    ;

    if(opts.h) pos.left = (w.width() - e.outerWidth()) / 2;
    if(opts.v) pos.top = (w.height() - e.outerHeight()) / 2;

    if(opts.minimum) {
        if(opts.h) pos.left = Math.max(0, pos.left);
        if(opts.v) pos.top = Math.max(0, pos.top);
    }
    if(opts.absolute) {
        if(opts.h) pos.left += window.scrollX;
        if(opts.v) pos.top += window.scrollY;
    }

    e.css(pos);
}

function img_fill(img) {
    var e = $(img), w = e.parent().width(), h = e.parent().height();
    if(!e.length) return;
    e.css('position', 'absolute');
    if(e.width() / e.height() > w / h) e.width('').height(h);
    else e.width(w).height('');
    center(e, e.parent(), { minimum : false });
    return e;
}

var positionHacks = Funcs(noop);
var place_apps = function() {
    var win_width = $(window).width();
    $('.happfill').each(function(i, div) {
        var e = $(div);
        //e.width(e.parent().width()).height(e.parent().height());
        img_fill(e.find('img'))
    });
    if (Hive.expr && Hive.expr.fixed_width) return;
    $('.happ').each(function(i, app_div) {
        var e = $(this);
        var s = e.parent().width() / 1000;
        if(!e.data('css')) {
            var c = {}, props = ['left', 'top', 'width', 'height'];
            if($(app_div).css('border-radius').indexOf('px') > 0) $.merge(props,
                     ['border-top-left-radius', 'border-top-right-radius',
                         'border-bottom-right-radius', 'border-bottom-left-radius']
                 );
            map(function(p) { c[p] = parseFloat(app_div.style[p]) }, props);
            var scale = parseFloat(e.attr('data-scale'));
            if(scale) c['font-size'] = scale;
            e.data('css', c);
            var a; if(a = e.attr('data-angle')) e.rotate(parseFloat(a));
            e.css('opacity', this.style.opacity);
        }
        var c = $.extend({}, e.data('css'));
        for(var p in c) {
            if(p == 'font-size') c[p] = (c[p] * s) + 'em';
            else c[p] = Math.round(c[p] * s);
        }
        e.css(c);
    });
    positionHacks();
}

var fix_borders = function(items){
    var items = $(items);
    if(!items.length) return;
    var initial_offset = $(items[0]).offset().left;
    var i = 1;
    while (i < items.length && $(items[i]).offset().left != initial_offset) i++;
    var columns = i;
    var remainder = items.length % columns

    items.each(function(i,el){
        if ( (i + 1) % columns == 0 ) {
            $(el).removeClass('border_right');
        } else {
            $(el).addClass('border_right');
        }
        if ( i > items.length - remainder - 1 || items.length == 1 ) {
            $(el).removeClass('border_bottom');
        } else {
            $(el).addClass('border_bottom');
        }
    });
}

var context_to_string = function(opt_arg){
    var opts = {'plural': true};
    $.extend(opts, opt_arg);
    var rv = "";
    var tag = (urlParams.tag? urlParams.tag.toLowerCase(): '')
    if (typeof(urlParams) == "object") {
        if (tag == 'recent' || tag == 'featured'){
            rv += tag + " expression" + (opts.plural? "s": "" );
        } else if (urlParams.user) {
            if (opts.plural){
                rv += urlParams.user + "'s expressions";
            } else {
                rv += "expression by " + urlParams.user;
            }
        } else {
            rv += (opts.plural? "all expressions": "expression");
        }
        if (tag){
            if (!(tag == "recent" || tag == "featured")) {
                rv += " tagged " + tag;
            }
        }
        return rv;
    }
};

var asset = function(path) {
    return hive_asset_paths[path];
};

// works as handler or function modifier
function require_login(label, fn) {
    if (typeof(fn) == "undefined" && typeof(label) == "function"){
        fn = label;
        label = undefined;
    }
    var check = function() {
        if(logged_in) {
            if(fn) return fn.apply(null, arguments);
            else return;
        }
        showDialog('#dia_must_login');
        $('#dia_must_login [name=initiating_action]').val(label);
        _gaq.push(['_trackEvent', 'signup', 'open_dialog', label]);
        return false;
    }
    if(fn) return check;
    else return check();
}

Hive.login_submit = function(form){
    var form = $(form);
    var identifier = form.parent().attr('id') || form.parents('.dialog').attr('id');
    form.find('[name=url]').val(window.location.href);
    _gaq.push(['_trackEvent', 'login', identifier]);
};

Hive.logout_submit = function(that){
    var form = $(that).parents('form');
    form.find('[name=url]').val(window.location.href);
    _gaq.push(['_trackEvent', 'logout', 'complete']);
    // Delay ensures that event is tracked
    setTimeout(function(){ form.submit(); }, 800);
};

function relogin(success){
    var dia = $('#dia_relogin');
    showDialog(dia);
    var form = dia.find('form');
    var callback = function(data){
        if (data.login) { 
            dia.find('.btn_dialog_close').click();
            success();
        } else { failure(); };
    }
    form.find("[type=submit]").click(function(){
        return asyncSubmit(form, callback, {dataType: 'json'});
    });
};

function callback_log(message){
    return function(){
        console.log(message);
    };
};

var log_stub = function(m){
    window.m = m;
    console.log(m);
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

// useful for inserting a breakpoing
//$(window).keydown(function(e){
//    if (e.keyCode == 113){ // F2
//        noop();
//    }
//});

Hive.is_fullscreen = function(){
    return document.height == window.screen.height && document.width == window.screen.width;
};