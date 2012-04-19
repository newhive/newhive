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
function Funcs(fn) {
    var o = [fn];
    var callback = function() { for(i in o) o[i](); }
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
            o.opts = $.extend({ open : noop, close : noop, absolute : false, fade : true,
                mandatory : dialog.hasClass('mandatory'), layout : function() { center(dialog, $(window), opts) } }, opts);

            o.shield = $("<div id='dialog_shield'>")[o.opts.fade ? 'addClass' : 'removeClass']('fade').appendTo(document.body);
            if (! dialog.hasClass('newdialog')) dialog.addClass('dialog border selected');
            dialog.detach().appendTo(document.body).css('position', o.opts.absolute ? 'absolute' : 'fixed').show();
            if(!o.opts.mandatory) {
                o.btn_close = dialog.prepend('<div class="btn_dialog_close"></div>').children().first();
                o.shield.add(o.btn_close).click(o.close);
            }
            $(window).resize(function() { o.opts.layout(o.dialog) });
            o.opts.layout(o.dialog);

            if (o.opts.select) dialog.find(o.opts.select).focus().click();
            o.index = showDialog.opened.length;
            showDialog.opened.push(o);
            o.opts.open();
        }

        o.close = function() {
            showDialog.opened.splice(showDialog.opened.indexOf(o), 1);
            o.shield.remove();
            if(o.btn_close) o.btn_close.remove();
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

var btn_listen_click = require_login(function(entity) {
    btn = $('.listen_button.' + entity); // grab all listen buttons for this user
    if (! btn.hasClass('inactive')) {
        var action = btn.hasClass('starred') ? 'unstar' : 'star';
        btn.addClass('inactive');
        $.post('', {action: action, entity: entity }, function(data) {
            btn.removeClass('inactive');
            if (!data) alert("Something went wrong, please try again");
            else if(data.unstarred) {
                btn.removeClass('starred');
                btn.attr('title', btn.attr('data-title-inactive'));
                $('#dia_listeners .user_cards .' + data.unstarred).remove();
            } else {
                btn.addClass('starred');
                btn.attr('title', btn.attr('data-title-active'));
                $('#dia_listeners .user_cards').prepend(data);
            };
        }, 'json');
    }
    return false;
});
var btn_star_click = require_login(function(entity, btn) {
    var btn = $(btn);
    if (! btn.hasClass('inactive')) {
        var action = btn.hasClass('starred') ? 'unstar' : 'star';
        btn.addClass('inactive');
        _gaq.push(['_trackEvent', 'like']);
        $.post('', {action: action, entity: entity}, function(data) {
            var count = parseInt(btn.attr('data-count'));
            var btn_wrapper = btn.parent();
            btn.removeClass('inactive');
            if (!data) alert("Something went wrong, please try again");
            else if(data.unstarred) {
                btn.removeClass('starred');
                btn_wrapper.attr('title', btn_wrapper.attr('data-title-inactive'));
                btn.attr('data-count', count-1);
                iconCounts();
                $('#dia_starrers .user_cards .' + data.unstarred).remove();
            } else {
                btn.addClass('starred');
                btn_wrapper.attr('title', btn_wrapper.attr('data-title-active'));
                btn.attr('data-count', count+1);
                iconCounts();
                $('#dia_starrers .user_cards').prepend(data);
            };
        }, 'json');
    }
});
function reloadFeed(){
    $.get('?dialog=feed', function(data){
        $('#feed_menu').html(data);
        var count = $('#notification_count').html();
        var count_div = $('#notifications .count').html(count);
        if (count == "0"){
            count_div.parent('.has_count').andSelf().addClass('zero');
        } else {
            count_div.parent('.has_count').andSelf().removeClass('zero');
        }
    });
}

var btn_broadcast_click = require_login(function(btn) {
    var btn = $('#btn_broadcast');
    if (! btn.hasClass('inactive')) {
        btn.addClass('inactive');
        _gaq.push(['_trackEvent', 'broadcast']);
        $.post('', {'action': 'broadcast', 'domain': window.location.hostname, 'path': window.location.pathname }, function(data) {
            var btn_wrapper = btn.parent();
            btn.removeClass('inactive');
            if (!data) { alert("Something went wrong, please try again"); return; }
            btn.addClass('enabled');
            //if(data.unstarred) {
            //    btn.removeClass('starred');
            //    btn_wrapper.attr('title', btn_wrapper.attr('data-title-inactive'));
            //    btn.attr('data-count', count-1);
            //    iconCounts();
            //    $('#dia_starrers .user_cards .' + data.unstarred).remove();
            //}
        }, 'json');
    }
});

var btn_comment_click = function(){
    loadDialog("?dialog=comments");
    _gaq.push(['_trackEvent', 'comment', 'open_dialog']);
}


function updateShareUrls(element, currentUrl) {
    element = $(element);
    var encodedUrl = encodeURIComponent(currentUrl), total=0;
    var encodedTitle = encodeURIComponent(document.title)
    element.find('.copy_url').val(currentUrl);
    element.find('a.twitter')
      .attr('href', 'http://twitter.com/share?url=' + encodedUrl);
    element.find('a.facebook')
      .attr('href', 'http://www.facebook.com/sharer.php?u=' + encodedUrl);
    element.find('a.reddit')
      .attr('href', 'http://www.reddit.com/submit?url=' + encodedUrl);
    element.find('.gplus_button')
      .attr('href', currentUrl);
    element.find('a.stumble')
      .attr('href', 'http://www.stumbleupon.com/submit?url=' + encodedUrl + '&title=' + encodedTitle);

    element.find('.count').each(function(){
      $(this).html($(this).html().replace(/^0$/, "-"))
    });
    //element.find('textarea[name=message]').html("Check out this expression:\n\n" + currentUrl);

    // Activate Google Plus
    (function() {
      var po = document.createElement('script'); po.type = 'text/javascript'; po.async = true;
      po.src = 'https://apis.google.com/js/plusone.js';
      var s = document.getElementsByTagName('script')[0]; s.parentNode.insertBefore(po, s);
    })();
}

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
    
function iconCounts() {
    $('.has_count').each(function(){
        var count = $(this).attr('data-count');
        var count_div = $(this).find('.count');
        if (count_div.length == 0){
            count_div = $(this).append('<div class="count"></div>').children().last();
        }
        if (count == "0") {
            count_div.parent('.has_count').andSelf().addClass('zero');
        } else {
            count_div.parent('.has_count').andSelf().removeClass('zero');
        }
        count_div.html(count);
    });
};

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
    iconCounts();
    $('#btn_share').click(function(){
        logAction('share_button_click');
        _gaq.push(['_trackEvent', 'share', 'open_dialog']);
        var dialog = $('#dia_share');
        if (dialog.length === 0 ) {
            $.get("?dialog=share", function(data){
                showDialog(data, { 'select' : '#expression_url' } );
                updateShareUrls('#dia_share', window.location);
            });
        } else {
            showDialog('#dia_share', { 'select' : '#expression_url' });
            updateShareUrls('#dia_share', window.location);
        }
    });

  $(".hoverable").each(function() { hover_add(this) });

  // Cause external links to open in a new window
  // see http://css-tricks.com/snippets/jquery/open-external-links-in-new-window/
  $('a').each(link_target);

  $(window).resize(place_apps);
  place_apps();

  if (urlParams.loadDialog) loadDialog("?dialog=" + urlParams.loadDialog);
  if (dialog_to_show.name) { showDialog(dialog_to_show.name, dialog_to_show.opts); };
  if (new_fb_connect) {
      _gaq.push(['_trackEvent', 'fb_connect', 'connected']);
      showDialog('#dia_fb_connect_landing');
  };
  // This completely breaks the site on Ios, and is annoying
  // Also likely to be seen by logged out users
  //else if (!logged_in) {
  //    var count = parseInt(readCookie('pageview_count'));
  //    var signup = readCookie('signup_completed') == 'true';
  //    if (! count ) count = 0;
  //    count++;
  //    if ((count == 5 || count == 15) && (!signup)) setTimeout("$('.signup_button').first().click();", 1000);
  //    createCookie('pageview_count', count, 14);
  //};
});
$(window).load(function(){setTimeout(place_apps, 10)}); // position background

function link_target(i, a) {
    var re = new RegExp(server_name), a = $(a), href = $(a).attr('href');
    if(href && href.indexOf('http') == 0 && !re.test(href))
        $(a).attr('target', '_blank');
}


function center(e, inside, opts) {
    var opts = $.extend({ absolute : false, minimum : true }, opts);
    var w = typeof(inside) == 'undefined' ? $(window) : inside;
    if(!e.width() || !e.height()) return; // As image is loading, sometimes height can be falsely reported as 0
    pos = { left : (w.width() - e.outerWidth()) / 2, 'top' : (w.height() - e.outerHeight()) / 2 };
    if(opts.minimum) {
        pos['left'] = Math.max(0, pos['left']);
        pos['top'] = Math.max(0, pos['top']);
    }
    if(opts.absolute) {
        pos['left'] += window.scrollX;
        pos['top'] += window.scrollY;
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

function asyncSubmit(form, callback) {
    var url = $(form).attr('action')? $(form).attr('action') : server_url
    $.post(url, $(form).serialize(), callback, 'text');
    return false;
}

function asyncUpload(opts) {
    var target, form, opts = $.extend({ json : true, file_name : 'file', multiple : false, action: '/',
        start : noop, success : noop, data : { action : opts.post_action || 'file_create' } }, opts);

    var onload = function() {
        var frame = target.get(0);
        if(!frame.contentDocument || !frame.contentDocument.body.innerHTML) return;
        var resp = $(frame.contentDocument.body).text();
        if(opts.json) {
            resp = JSON.parse(resp);
            if(!opts.multiple){ resp = resp[0]; }
        }
        opts.success(resp);
        form.remove();
    }

    var tname = 'upload' + Math.random();
    form = $("<form method='POST' enctype='multipart/form-data' style='position : absolute; left : -1000px'>").
        attr('target', tname).attr('action', opts.action);
    target = $("<iframe style='position : absolute; left : -1000px'></iframe>").attr('name', tname).appendTo(form).load(onload);
    var input = $("<input type='file'>").attr('name', opts.file_name).change(function() { opts.start(); form.submit() }).appendTo(form);
    if(opts.multiple) { input.attr('multiple', 'multiple'); }
    for(p in opts.data) $("<input type='hidden'>").attr('name', p).attr('value', opts.data[p]).appendTo(form);
    form.appendTo(document.body);
    setTimeout(function() { input.click() }, 0); // It's a mystery why this makes the upload dialog appear on some machines
}

function hover_url(url) {
    var h = url.replace(/(.png)|(-.*)$/, '-hover.png');
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
    $(o).mouseenter(function() { $(this).addClass('active'); })
        .mouseleave(function() { if(!this.busy) $(this).removeClass('active'); });
}

hover_menu = function(handle, drawer, options) {
    handle = $(handle); drawer = $(drawer);
    var o = { handle : handle, drawer : drawer };
    o.options = {
         open : noop
        ,close : noop
        ,auto_close : true
        ,hover_close : true
        ,close_delay : 500
        ,offsetY : 0
        ,click_persist : false
        ,hover : true
        ,open_condition : function(){ return true }
        ,auto_height : true
    };
    $.extend(o.options, options);
    if(!handle.length) throw("hover_menu has no handle");
    if(!drawer.length) throw("hover_menu has no drawer");
    handle.get(0).hover_menu = o;
    //drawer.remove();
    //$(document.body).append(drawer);

    o.opened = false;
    o.close_timer = null;
    o.rollover = null;
    if(handle.attr('src')) o.rollover = handle;
    if(handle.find('img').length) o.rollover = handle.find('img');
    if(o.rollover) {
        o.handle_src = o.rollover.attr('src');
        o.hover_src = hover_url(o.handle_src);
    }

    o.delayed_close = function(e) {
        o.e = e;
        if(o.options.hover_close) o.close_timer = setTimeout(o.close, o.options.close_delay);
    }
    o.cancel_close = function() { if(o.close_timer) clearTimeout(o.close_timer); }

    o.close = function() {
        if(!o.opened) return;
        drawer.hide();
        o.opened = false;
        if(o.rollover) o.rollover.attr('src', o.handle_src);
        handle.removeClass('active');
        o.options.close();
        handle.get(0).busy = false;
    }
    o.open = function() {
        o.cancel_close();
        if (!o.options.open_condition()) return;
        if(o.opened) return;

        o.opened = true;
        handle.get(0).busy = true;
        if(o.rollover) o.rollover.attr('src', o.hover_src);
        handle.addClass('active');
        if(o.options.click_persist) o.options.hover_close = true;

        drawer.show();
        var hp = handle.position();
        var oy = handle.outerHeight() + o.options.offsetY;
        // pick top of menu based on if menu would go past bottom of
        // window if below handle, or above top of window if above the handle
        var css_opts = {};
        css_opts.top = (handle.offset().top + oy + drawer.outerHeight() > ($(window).height() + window.scrollY))
            && (handle.offset().top - oy - drawer.outerHeight() - window.scrollY > 0) ?
            hp.top - drawer.outerHeight() - o.options.offsetY : hp.top + oy;
        css_opts.left = handle.offset().left + drawer.outerWidth() > ($(window).width() + window.scrollX) ?
            hp.left - drawer.outerWidth() + handle.outerWidth() : hp.left;
        if (o.options.auto_height) css_opts.drawer_height = bound(drawer.height(), 0, ( $(window).height() - 50 ) * 0.8);
        drawer.css(css_opts);
        o.options.open();
    }

    if(o.options.hover) {
        handle.hover(o.open, o.delayed_close);
        drawer.hover(o.cancel_close, o.delayed_close);
        handle.hover(o.open);
    }
    handle.click(o.open);
    $(o.options.click_persist).bind('click contextmenu keydown', function() { o.options.hover_close = false; });

    if(o.options.auto_close) drawer.click(o.close);
    $(window).click(function(e) {
        if(handle.get(0) == e.target
            || $.contains(handle.get(0), e.target)
            || drawer.get(0) == e.target
            || $.contains(drawer.get(0), e.target)
            ) return;
        o.close();
    });

    return o;
}

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
function createCookie(name,value,days) {
    if (days) {
        var date = new Date();
        date.setTime(date.getTime()+(days*24*60*60*1000));
        var expires = "; expires="+date.toGMTString();
    }
    else var expires = "";
    document.cookie = name+"="+escape(value)+expires+"; path=/; domain=.thenewhive.com;";
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

var scale_nav = function(s) {
    $('#nav .scale').each(function(i, app_div) {
       var e = $(this);
       if(!e.data('css')) {
           var c = {
               'width': e.width(),
               'height': e.height(),
               'font-size': e.css('font-size')
           }
           e.data('css', c);
       }
       var c = $.extend({}, e.data('css'));
       for(var p in c) c[p] = Math.round(c[p] * s);
       e.css(c);
   });
   $('#nav, #search_box ').css('font-size', s + 'em');
}

var positionHacks = Funcs(noop);
var place_apps = function() {
   $('.happ').each(function(i, app_div) {
       var e = $(this);
       var s = e.parent().width() / 1000;
       if(!e.data('css')) {
           var c = {};
           map(function(p) { c[p] = parseFloat(app_div.style[p]) }, ['left', 'top', 'width', 'height',
               'border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius']);
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
    return debug_mode ? '/lib/libsrc/' + path : '/lib/' + path;
}

function sendRequestViaMultiFriendSelector() {
  function requestCallback(response) {
    $('#dia_referral .btn_dialog_close').click();
    if (response){
      _gaq.push(['_trackEvent', 'fb_connect', 'invite_friends', undefined, response.to.length]);
      showDialog('#dia_sent_invites_thanks');
      $.post('/', {'action': 'facebook_invite', 'request_id': response.request, 'to': response.to.join(',')});
    }
  }
  FB.ui({method: 'apprequests'
    , message: 'Join me on The New Hive'
    , title: 'Invite Friends to Join The New Hive'
    , filters: ['app_non_users']
  }, requestCallback);
}

// works as handler or function modifier
function require_login(fn) {
    var check = function() {
        if(logged_in) return fn.apply(null, arguments);
        showDialog('#dia_must_login');
        return false;
    }
    if(fn) return check;
    else return check();
}
