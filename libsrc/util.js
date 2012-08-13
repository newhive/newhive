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
            for(i in o) o[i].apply(this, arguments);
        }
    };
    callback.handlers = o;
    callback.add = function(fn) { o.push(fn); }
    callback.clear = function() { o = []; }
    return callback;
}

function urlValidate(value, method) {
    method = typeof(method) != 'undefined' ? method : "loose";
    var match;
    switch(method)
    {
    case "loose":
        match = /(https?:\/\/)?(([0-9a-z]+\.)+[0-9a-z]{2,}\/?[^ ]*)/i.exec(value);
        if (match) {
            if (match[1] === undefined) {match[1] = "http://"}
            return match[1] + match[2];
        } else {
            return false;
        }
    case "medium":
        return /(https?:\/\/)?[\w\-_]+(\.[\w\-_]+)+([\w\-\.,@?^=%&amp;:/~\+#]*[\w\-\@?^=%&amp;/~\+#])?/i.exec(value);
    case "tight":
        return /^(https?|ftp):\/\/(((([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(%[\da-f]{2})|[!\$&'\(\)\*\+,;=]|:)*@)?(((\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])\.(\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])\.(\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])\.(\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5]))|((([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])))\.)+(([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])))\.?)(:\d*)?)(\/((([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(%[\da-f]{2})|[!\$&'\(\)\*\+,;=]|:|@)+(\/(([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(%[\da-f]{2})|[!\$&'\(\)\*\+,;=]|:|@)*)*)?)?(\?((([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(%[\da-f]{2})|[!\$&'\(\)\*\+,;=]|:|@)|[\uE000-\uF8FF]|\/|\?)*)?(\#((([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(%[\da-f]{2})|[!\$&'\(\)\*\+,;=]|:|@)|\/|\?)*)?$/i.exec(value);
    }
}

function autoLink(string) {
    var re = /(\s|^)(https?:\/\/)?(([0-9a-z-]+\.)+[0-9a-z-]{2,3}(:\d+)?(\/[-\w.~:\/#\[\]@!$&'()*+,;=?]*?)?)([;,.?!]?(\s|$))/ig;
    // groups 1        2             34                       5      6                                   7
    // 1: this ends up excluding existing links <a href="foo.bar">foo.bar</a>
    // 2: optional http(s):// becomes capture group 2
    // 3: The url after the http://
    // 5: Optional path
    // 7: Trailing punctuation to be excluded from URL. Note that the
    //    path is non greedy, so this will fail to correctly match a valid but
    //    uncommon case of a URL with a query string that ends in punctuation.
    function linkify(m, m1, m2, m3, m4, m5, m6, m7) {
        var href = ((m2 === '') ? 'http://' : m2) + m3; // prepend http:// if it's not already there
        return m1 + $('<a>').attr('href', href).text(m2 + m3).outerHTML() + m7; 
    }
    return string.replace(re, linkify);
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
    $.extend(opts, { absolute: true, layout : function(dia) {
        dia.css({ width : '80%' });
        dia.css({ height : dia.width() / parseFloat(dia.attr('data-aspect')) });
        place_apps();
        center(dia, $(window), opts);
    } });
    return loadDialog(url + '?template=expr_iframe', opts);
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
                if( o.opts.close_btn && ! dialog.find('.btn_dialog_close').length )
                    $('<div class="btn_dialog_close">').prependTo(dialog).click(o.close);
                o.shield.click(o.close);
                if(o.opts.click_close) dialog.click(o.close);
            }

            $(window).resize(function(){ o.opts.layout(o.dialog) });
            o.opts.layout(o.dialog);

            if(o.opts.select) dialog.find(o.opts.select).click();
            o.index = showDialog.opened.length;
            showDialog.opened.push(o);
            o.opts.open();
        }

        o.close = function() {
            showDialog.opened.splice(showDialog.opened.indexOf(o), 1);
            o.shield.remove();
            $(window).unbind('resize', o.opts.layout);
            var clean_up = function() {
                dialog.hide();
                o.opts.close();
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
function range(n) { var l = []; while(n) l[--n] = n; return l; }

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
    var L = $.extend([], list), left;
    if(left === undefined) left = L.shift();
    while(right = L.shift()) left = f(left, right);
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
}
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

/*** puts alt attribute of input fields in to value attribute, clears
 * it when focused.
 * Adds hover events for elements with class='hoverable'
 * ***/
$(function () {
  $(".hoverable").each(function() { hover_add(this) });

  // Cause external links to open in a new window
  // see http://css-tricks.com/snippets/jquery/open-external-links-in-new-window/
  $('a').each(link_target);

  if (! Modernizr.touch) {
      $(window).resize(function(){
          place_apps();
      });
  }
  place_apps();

  if (urlParams.loadDialog) loadDialog("?dialog=" + urlParams.loadDialog);
  if( dialog_to_show ){ showDialog(dialog_to_show.name, dialog_to_show.opts); };
  if (new_fb_connect) {
      _gaq.push(['_trackEvent', 'fb_connect', 'connected']);
      showDialog('#dia_fb_connect_landing');
  };

  var dia_referral = $('#dia_referral');
  dia_referral.find('input[type=submit]').click(function(){
      asyncSubmit(dia_referral.find('form'), function(){
          dia_referral.find('.btn_dialog_close').click();
          showDialog('#dia_sent_invites_thanks');
      });
      return false;
  });
});
$(window).load(function(){setTimeout(place_apps, 10)}); // position background

function link_target(i, a) {
    var re = new RegExp(server_name), a = $(a), href = $(a).attr('href');
    if(href && href.indexOf('http') == 0 && !re.test(href))
        $(a).attr('target', '_blank');
}


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

function asyncSubmit(form, callback, opts) {
    var opts = $.extend({ dataType : 'text' }, opts);
    var url = opts.url || $(form).attr('action') || server_url;
    $.post(url, $(form).serialize(), callback, opts.dataType);
    return false;
}

function asyncUpload(opts) {
    var target, form, opts = $.extend({ json : true, file_name : 'file', multiple : false, action: '/',
        start : noop, success : noop, error: noop, data : { action : opts.post_action || 'file_create' } }, opts);

    var onload = function() {
        var frame = target.get(0);
        if(!frame.contentDocument || !frame.contentDocument.body.innerHTML) return;
        var resp = $(frame.contentDocument.body).text();
        if(opts.json) {
            try{
                resp = JSON.parse(resp);
            } catch (e) {
                // JSON parsing will fail if server returns a 500
                // Suppress this and call the error callback
                opts.error(resp);
            }
            if(!opts.multiple){ resp = resp[0]; }
        }
        opts.success(resp);
        form.remove();
    }

    var tname = 'upload' + Math.random();
    form = $('<form>').css({ position: 'absolute', left: -1000 }).addClass('async_upload')
        .attr({ method: 'POST', target: tname, action: opts.action, enctype: 'multipart/form-data' });
    target = $("<iframe style='position : absolute; left : -1000px'></iframe>").attr('name', tname).appendTo(form).load(onload);
    var input = $("<input type='file'>").attr('name', opts.file_name).change(function() { opts.start(); form.submit() }).appendTo(form);
    if(opts.multiple) { input.attr('multiple', 'multiple'); }
    for(p in opts.data) $("<input type='hidden'>").attr('name', p).attr('value', opts.data[p]).appendTo(form);
    form.appendTo(document.body);
    // It's a mystery why this timout is needed to make the upload dialog appear on some machines
    setTimeout(function() { input.click() }, 50);
}

function hovers_active(state){
    hover_add.disabled = !state;
    hover_menu.disabled = !state;
}

function hover_url(url) {
    var h = url.replace(/(.png)|(-\w*)$/, '-hover.png');
    var i = $("<img style='display:none'>").attr('src', h);
    $(document.body).append(i);
    return h;
}
function hover_add(o) {
    if(o.src) {
        o.src_d = o.src;
        o.src_h = hover_url(o.src_d);
        $(o).mouseenter(function() { o.src = o.src_h }).
            mouseleave(function() { if(!o.busy) o.src = o.src_d });
    }
    $(o).mouseenter(function() {
            if(hover_add.disabled) return;
            $(this).addClass('active');
        })
        .mouseleave(function() { if(!this.busy) $(this).removeClass('active'); });
}

hover_menu = function(handle, drawer, options) {
    var handle = $(handle), drawer = $(drawer), o = { handle : handle, drawer : drawer },
        menu_items = drawer.find('.menu_item'), close_timer = false,
        opts = $.extend({
             open: noop
            ,close: noop
            ,open_menu: function(){ drawer.show() }
            ,close_menu: function(){ drawer.hide() }
            ,sticky: false
            ,auto_close: false
            ,hover_close: true
            ,open_delay: 100
            ,close_delay: 500
            ,offset_y: 8
            ,offset_x: 8
            ,focus_persist: true
            ,hover: true
            ,open_condition: function(){ return true }
            ,auto_height: true
            ,default_item: drawer.find('.menu_item.default')
            ,layout: 'bottom'
            ,layout_x: 'auto'
            ,min_y: 0
            ,group: hover_menu
            ,animate_close: false
            ,animate_open: false
            ,opened: false
        }, options)
    ;
    if(!handle.length) throw("hover_menu has no handle");
    if(!drawer.length) throw("hover_menu has no drawer");
    if(!opts.group) opts.group = { menus: [] };

    o.menus = [];
    o.opened = opts.opened;
    o.sticky = opts.sticky;

    o.delayed_close = function(close_delay) {
        if(typeof(close_delay) != 'number') close_delay = false;
        opts.default_item.removeClass('active');
        if(opts.hover_close && ! close_timer) {
            close_timer = setTimeout(o.close, close_delay || opts.close_delay);
        }
        if(opts.group.delayed_close) opts.group.delayed_close();
    };
    o.cancel_close = function(e) {
        if(close_timer) {
            clearTimeout(close_timer);
            close_timer = false;
        }
    };

    // for debugging
    o.opts = function(){ return opts };
    o.drawer = function(){ return drawer };

    o.close = function(force) {
        close_timer = false;
        if(!o.opened) return;

        if(force) $.map(o.menus, function(m){ m.close(force) });
        else if(o.sticky || $.inArray(true, $.map(o.menus, function(m){ return m.opened })) > -1) return;

        if(opts.animate_close){
            if(!opts.animate_open){
                opts.animate_open = {};
                for(p in opts.animate_close) opts.animate_open[p] = drawer.css(p);
            }
            drawer.animate(opts.animate_close, 100);
        } else opts.close_menu();
        if(o.shield) o.shield.remove();

        o.opened = false;
        opts.close();
        handle.get(0).busy = false;
        handle.removeClass('active');

        return o;
    }

    o.open = function() {
        if(hover_menu.disabled || ! opts.open_condition()) return;
        handle.addClass('active');
        opts.default_item.addClass('active');
        o.cancel_close();
        if(o.opened) return;

        o.opened = true;
        if( opts.group.current && (opts.group.current != o) ) opts.group.current.close(true);
        opts.group.current = o;
        handle.get(0).busy = true;

        if(opts.animate_open) drawer.animate(opts.animate_open, 100);
        else opts.open_menu();

        var css_opts = {};
        if(opts.layout){
            // pick top of menu based on if menu would go past bottom of
            // window if below handle, or above top of window if above the handle
            var hp = handle.parent().is(drawer.parent()) ? handle.position() : handle.offset();

            if( opts.layout == 'bottom' ){
                var oy = handle.outerHeight() + opts.offset_y;
                css_opts.top = (handle.offset().top + oy + drawer.outerHeight() > ($(window).height() + window.scrollY))
                    && (handle.offset().top - oy - drawer.outerHeight() - window.scrollY > 0) ?
                    hp.top - drawer.outerHeight() - opts.offset_y : hp.top + oy;

                if( opts.layout_x == 'auto' ) opts.layout_x =
                    (handle.offset().left + drawer.outerWidth() > ($(window).width() + window.scrollX) ?
                        'right' : 'left');
                css_opts.left = ( opts.layout_x == 'right' ?
                    hp.left - drawer.outerWidth() + handle.outerWidth() : hp.left );
            }
            else if( opts.layout == 'center_y' ){
                css_opts.top = Math.max(opts.min_y, hp.top + handle.outerHeight() / 2 -
                     drawer.outerHeight() / 2);
                css_opts.left = hp.left - opts.offset_x - drawer.outerWidth();
            }

            // shield element prevents hovering over gap between handle and menu from closing the menu
            o.shield = $();
            //if(opts.offset_y) o.shield.add($('<div>').css({
            //    'position': 'absolute',
            //    'left': hp.left,
            //    'top': hp.top + handle.outerHeight(),
            //    'width': handle.outerWidth(),
            //    'height': opts.offset_y,
            //    'background-color': 'orange'
            //});
            //if(opts.offset_x) o.shield.add($('<div>').css({
            //    'position': 'absolute',
            //    'left': hp.left - opts.offset_x,
            //    'top': hp.top,
            //    'width': opts.offset_x,
            //    'height': handle.outerHeight(),
            //    'background-color': 'orange'
            //});
            o.shield.insertBefore(handle)
                .mouseover(o.cancel_close)
                .mouseout(o.delayed_close)
            ;
        }

        if(opts.auto_height && css_opts.top + drawer.outerHeight() > $(window).height()) {
            var scroller = drawer.find('.items');
            scroller.css('max-height', $(window).height() - 50 - css_opts.top -
                (drawer.outerHeight() - scroller.outerHeight()));
        }

        drawer.css(css_opts);

        opts.open();
        return o;
    }

    opts.group.menus.push(o);

    if(opts.hover) {
        handle.on('hover', null, { delay: opts.open_delay }, o.open)
            .on('hoverend', o.delayed_close);
        drawer.mouseover(o.cancel_close).mouseout(o.delayed_close);
    }
    handle.click(function(){
        if(o.opened && opts.default_item) opts.default_item.click();
        o.open();
    });
    if(opts.focus_persist){
        drawer.find('input[type=text],input[type=password],textarea').on('click keydown', function(){
            o.sticky = true;
        }).on('blur', function(){
            o.sticky = false;
            o.delayed_close();
        }).on('focus', o.cancel_close);
        drawer.mousedown(function(){ setTimeout(o.cancel_close, 1) });
    }

    menu_items.each(function(i, d){
        var e = $(d);
        e.mouseover(function(){ e.addClass('active'); });
        e.mouseout(function(){ e.removeClass('active'); });
    });

    if(opts.auto_close) drawer.click(o.close);

    return o;
}
hover_menu.menus = [];

var minimize = function(what, to, opts) {
    var o = $.extend({ 'to' : $(to).addClass('active'), 'what' : $(what), 'duration' : 700, 'complete' : noop }, opts);
    if(o.what.data('minimizing')) return;
    o.what.data('minimizing', true);
    o.init_css = { 'top' : o.what.css('top'), 'left' : o.what.css('left'), 'width' : o.what.css('width') || '',
        'height' : o.what.css('height') || '', 'opacity' : o.what.css('opacity') };
    o.reset = function() {
        o.what.hide();
        o.what.css(o.init_css);
        o.what.removeData('minimizing');
        o.complete();
    };
    var pos = o.to.offset();
    if(o.what.css('position') == 'fixed') { pos.left -= $(window).scrollLeft(); pos.top -= $(window).scrollTop() }
    o.what.animate({ 'left' : pos.left, 'top' : pos.top, 'width' : o.to.width(), 'height' : o.to.height(), 'opacity' : 0 }
        , {'duration' : o.duration, complete : o.reset  });
    setTimeout(function() { o.to.removeClass('active'); }, o.duration * 1.5);
    return o;
}

// from http://www.quirksmode.org/js/cookies.html#script
function createCookie(name,value,expiry) {
    var date;
    if (expiry) {
        if (typeof(days) == "number"){
            date = new Date();
            date.setTime(date.getTime()+(expiry*24*60*60*1000));
        } else {
            date = expiry;
        }
        var expires = "; expires="+date.toGMTString();
    }
    else var expires = "";
    var cookie = name + "=" + escape(value) + expires + "; path=/; domain=" + server_url.split('/')[2] + ";";
    document.cookie = cookie;
}

function readCookie(name) {
    var pairs = document.cookie.split(';');
    for(var i=0; i < pairs.length; i++) {
        pair = pairs[i].trim().split('=');
        if(pair[0] == name && pair.length > 1) return unescape(pair[1]);
    }
    return null;
}

function eraseCookie(name) {
    createCookie(name,"",-1);
}

function new_window(b,c,d){var a=function(){if(!window.open(b,'t','scrollbars=yes,toolbar=0,resizable=1,status=0,width='+c+',height='+d)){document.location.href=b}};if(/Firefox/.test(navigator.userAgent)){setTimeout(a,0)}else{a()}};

var positionHacks = Funcs(noop);
var place_apps = function() {
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
   $('.happfill').each(function(i, div) {
       var e = $(div);
       //e.width(e.parent().width()).height(e.parent().height());
       img_fill(e.find('img'))
   });
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

    // fix top tab placement
    var card_width = $('#feed .card').outerWidth();
    $('#top_tabs').css({'right': $('#feed').outerWidth() - columns * card_width });
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
function require_login(fn) {
    var check = function() {
        if(logged_in) {
            if(fn) return fn.apply(null, arguments);
            else return;
        }
        showDialog('#dia_must_login');
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

Hive.logout_submit = function(form){
    var form = $(form);
    form.find('[name=url]').val(window.location.href);
    _gaq.push(['_trackEvent', 'logout']);
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

Hive.AB_Test = {
    tests: [],
    ga_string: function(){
        return $.map(Hive.AB_Test.tests, function(el){ return el.id + el.chosen_case_id }).join(',');
    },
    add_test: function(opts){
        // Required options (oxymoron I know, but named arguments are easier to work with than positional)
        //   id:
        //     short name used for cookie name and google analytics variable.
        //     conventionally 3 characters all caps, e.g. `NAV`
        //   config_doc:
        //     the configuration document or sub-doc that gets extended by each test case.
        //     e.g. `Hive.config.frame`
        //   start_date:
        //     javascript Date object
        //   duration:
        //     number of days to run test
        //   cases:
        //     mapping of test cases of the form {caseID: definition}. caseID can be any
        //     short alphanumeric, but is conventionally an integer (this goes in
        //     the cookie and GA variable). See "Case definition" below
        //
        // Optional options (haha)
        //   name:
        //     descriptive string describing the test
        //   auto_weight:
        //     if set to true each test case has an equal probability of being chosen
        //   logged_in_case:
        //     value matching the caseID mapping to the case that should be
        //     used for logged in users
        //
        // Case definition
        //   Each case is defined as an object literal with the following attributes
        //     config_overrides:
        //       this is a mapping of config options that override values set in the `config_doc`,
        //       e.g. {open_initially: false, auto_close_delay: 5000}
        //     weight:
        //       weighted probability of this case being chose. optional if `auto_weight` is true
        //       these probabilities get normalized, so can really be any number
        //     name:
        //       optional descriptive string describing this case

        var o = $.extend({}, opts);

        // Stop execution if the current time is not in the test time range
        o.end_date = new Date(o.start_date.getTime() + o.duration * 24 * 3600 * 1000);
        var now = Date.now();
        if (o.start_date > now || o.end_date < now) return;

        // Register the test with Hive.AB_Test, used to set GA variables
        Hive.AB_Test.tests.push(o);

        // this function ensures that the sum of weights of cases = 1
        function normalize_weights(){
            var total = 0;
            $.each(o.cases, function(i, test_case){
                total += o.auto_weight ? 1 : test_case.weight;
            });
            $.each(o.cases, function(i, test_case){
                var weight = o.auto_weight ? 1 : test_case.weight;
                test_case.weight = weight / total;
            });
        };

        function pick_random_case(){
            normalize_weights();
            var rand = Math.random();
            var current = 0;
            var chosen_id;
            $.each(o.cases, function(i, test_case){
                if (typeof(chosen_id) != "undefined") return;
                current = current + test_case.weight;
                if (current > rand) {
                    chosen_id = i;
                }
            });
            return chosen_id;
        };

        function assign_group(id){
            o.chosen_case = o.cases[id];
            o.chosen_case_id = id;
            createCookie("AB_" + o.id, id, o.end_date)
        };

        // Does the actual overriding of config_doc with chosen case definition
        function update_config(){
            $.extend(o.config_doc, o.chosen_case.config_overrides);
        };

        // Use case for logged in user if set, else case defined in cookie if
        // set, else pick a random case. Can't just use || with assignment
        // because case_id could be 0
        var case_id = logged_in && o.logged_in_case;
        if (!case_id && case_id !== 0) case_id = readCookie("AB_" + o.id);
        if (!case_id && case_id !== 0) case_id = pick_random_case();
        assign_group(case_id);

        update_config();

        return o;
    }
};
