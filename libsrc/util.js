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
    var re = /(\s|\n|^)(https?:\/\/)?(([0-9a-z]+\.)+[0-9a-z]{2,}\/?[^ ]*)[,.;]? ?/ig;
    // notes  1        2             34                                  5
    // 1: this make sure that the match isn't preceded by anything other than whitespace or newline or the start of the string
    //    this ends up excluding existing links <a href="foo.bar">foo.bar</a>
    // 2: optional http(s):// becomes capture group 2
    // 3: capture group 3 is the url after the http://
    // 5: don't including trailing punctuation.  this makes it so if somebody uses a url in a sentence it doesn't pick up the punctuation
    var match;
    function makeValid(matchArray, regex){
        var href, linkText, completeLink, replaceStart, additionalChar = 0;
        replaceStart = matchArray.index + matchArray[1].length; // if capture group 1 captured a whitespace character, don't count it for positioning
        if (matchArray[3].charAt(matchArray[3].length-1).search(/[,.;]/) === 0) {
            // removes trailing punctuation from url
            matchArray[3] = matchArray[3].slice(0, matchArray[3].length -1);
        }
        if (matchArray[2] === undefined){
            // prepend http:// if it's not already there
            linkText = matchArray[3];
            href = "http://" + linkText;
            additionalChar = 7;
        } else {
            // but don't mess with the protocol if it is already there
            linkText = matchArray[2] + matchArray[3];
            href = linkText;
        }
        additionalChar += 15;
        completeLink = "<a href='" + href + "'>" + linkText + "</a>";

        // modify the string
        string = string.slice(0,replaceStart) + completeLink + string.slice(replaceStart + linkText.length);
        // move the starting point for the next regex search to past our newly lengthened string
        regex.lastIndex += additionalChar;
    }
    while(match = re.exec(string)) {  // loop through all matches
        makeValid(match, re);
    }
    return string;
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
    $.extend(opts, { layout : function(dia) {
        dia.css({ width : '80%' });
        dia.css({ height : dia.width() / parseFloat(dia.attr('data-aspect')) });
        place_apps();
        center(dia, $(window), opts);
    } });
    return loadDialog(url + '?template=expr_div', opts);
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
        $.ajax({ url : url, success : function(h) { 
            var html = h;
            dia = loadDialog.loaded[url] = $(html);
            showDialog(dia,opts);
        }});
    }
}
loadDialog.loaded = {};

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
            dialog.addClass('dialog border selected').detach().appendTo(document.body).css('position', o.opts.absolute ? 'absolute' : 'fixed').show();
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

function btn_listen_click(btn) {
    var btn = $(btn);
    if (! btn.hasClass('inactive')) {
        var action = btn.hasClass('starred') ? 'unstar' : 'star';
        btn.addClass('inactive');
        $.post('', {'action': action, 'domain': window.location.hostname, 'path': '/expressions' }, function(data) {
            btn.removeClass('inactive');
            if(data == "unstarred") {
                btn.removeClass('starred');
                btn.attr('title', btn.attr('data-title-inactive'));
            } else if (data == "starred") {
                btn.addClass('starred');
                btn.attr('title', btn.attr('data-title-active'));
            };
        }, 'json');
    }
}
function btn_star_click(btn) {
    var btn = $(btn);
    if (! btn.hasClass('inactive')) {
        var action = btn.hasClass('starred') ? 'unstar' : 'star';
        btn.addClass('inactive');
        $.post('', {'action': action, 'domain': window.location.hostname, 'path': window.location.pathname }, function(data) {
            var btn_wrapper = btn.parent();
            var countdiv = btn.next();
            btn.removeClass('inactive');
            if(data == "unstarred") {
                btn.removeClass('starred');
                btn_wrapper.attr('title', btn_wrapper.attr('data-title-inactive'));
                countdiv.html(parseInt(countdiv.html())-1);
            } else if (data == "starred") {
                btn.addClass('starred');
                btn_wrapper.attr('title', btn_wrapper.attr('data-title-active'));
                countdiv.html(parseInt(countdiv.html())+1);
            };
        }, 'json');
    }
}
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

function updateShareUrls(element, currentUrl) {
    element = $(element);
    var encodedUrl = encodeURIComponent(currentUrl), total=0;
    var encodedTitle = encodeURIComponent(document.title)
    element.find('.copy_url').val(currentUrl);
    element.find('.embed_code').val('<iframe src="' + currentUrl + '" style="width: 100%; height: 100%" scrolling="no" marginwidth="0" marginheight="0" frameborder="0" vspace="0" hspace="0"></iframe>');
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
    var e,
        a = /\+/g,  // Regex for replacing addition symbol with a space
        r = /([^&=]+)=?([^&]*)/g,
        d = function (s) { return decodeURIComponent(s.replace(a, " ")); },
        q = window.location.search.substring(1);

    while (e = r.exec(q))
       urlParams[d(e[1])] = d(e[2]);
})();

/*** puts alt attribute of input fields in to value attribute, clears
 * it when focused.
 * Adds hover events for elements with class='hoverable'
 * ***/
$(function () {
    iconCounts();
    $('#btn_share').click(function(){
        logAction('share_button_click');
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

  $("input[alt], textarea[alt]").each(function() {
    var defaultValue = $(this).attr('alt');
    this.onfocus = function() { if(this.value == defaultValue) this.value = ""; }
    this.onblur = function() { if(this.value == "") this.value = defaultValue };
    if(this.value == "") this.value = defaultValue;
  });

  $(".hoverable").each(function() { hover_add(this) });

  // Cause external links to open in a new window
  // see http://css-tricks.com/snippets/jquery/open-external-links-in-new-window/
  $('a').each(function() {
    var a = new RegExp(server_name);
    if(this.href.indexOf('http') == 0 && !a.test(this.href)) {
      $(this).click(function(event) {
        event.preventDefault();
        event.stopPropagation();
        window.open(this.href, '_blank');
      });
    }
  });
  $(window).resize(place_apps);
  place_apps();
  if (urlParams.loadDialog) loadDialog("?dialog=" + urlParams.loadDialog);
});
$(window).load(function(){setTimeout(place_apps, 10)}); // position background



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
    $.post(server_url, $(form).serialize(), callback);
    return false;
}

function asyncUpload(opts) {
    var target, form, opts = $.extend({ json : true, file_name : 'file',
        start : noop, success : noop, data : { action : 'files_create' } }, opts);

    var onload = function() {
        var frame = target.get(0);
        if(!frame.contentDocument || !frame.contentDocument.body.innerHTML) return;
        var resp = $(frame.contentDocument.body).text();
        if(opts.json) resp = JSON.parse(resp);
        opts.success(resp);
        form.remove();
    }

    var tname = 'upload' + Math.random();
    form = $("<form method='POST' enctype='multipart/form-data' action='/' style='position : absolute; left : -1000px'>").attr('target', tname);
    target = $("<iframe style='position : absolute; left : -1000px'></iframe>").attr('name', tname).appendTo(form).load(onload);
    var input = $("<input type='file'>").attr('name', opts.file_name).change(function() { opts.start(); form.submit() }).appendTo(form);
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
        o.over = function() { o.src = o.src_h };
        o.out = function() { if(!o.busy) o.src = o.src_d };
        if (o.over && o.out) {
            $(o).hover(o.over, o.out);
        };
    }
    $(o).hover(function() { $(this).addClass('active'); }, function() { if(!this.busy) $(this).removeClass('active'); });
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

    o.delayed_close = function() {
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
    if(o.options.auto_close) handle.click(o.close);

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
    document.cookie = name+"="+escape(value)+expires+"; path=/";
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

var place_apps = function() {
   $('.happ').each(function(i, app_div) {
       var e = $(this);
       var s = e.parent().width() / 1000;
       if(!e.data('css')) {
           var c = {};
           map(function(p) { c[p] = parseFloat($(app_div).css(p)) }, ['left', 'top', 'width', 'height',
               'border-left-width', 'border-top-width', 'border-right-width', 'border-bottom-width',
               'border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius']);
           var scale = parseFloat(e.attr('data-scale'));
           if(scale) c['font-size'] = scale;
           e.data('css', c);
           var a; if(a = e.attr('data-angle')) e.rotate(parseFloat(a));
           e.css('opacity', this.style.opacity);
       }
       var c = $.extend({}, e.data('css'));
       for(var p in c) c[p] *= s;
       if(c['font-size']) c['font-size'] += 'em';
       e.css(c);
   });
   $('.happfill').each(function(i, div) {
       var e = $(div);
       e.width(e.parent().width()).height(e.parent().height());
       img_fill(e.find('img'))
   });
}

var fix_borders = function(items){
    var items = $(items);
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

var asset = function(path) {
    return debug_mode ? '/lib/' + path : '/lib/libsrc/' + path;
}
