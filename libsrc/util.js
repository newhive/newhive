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
    $.extend(opts, { absolute : true });
    var dia;
    if(loadDialog.loaded[url]) dia = loadDialog.loaded[url];
    else {
        var html;
        $.ajax({ url : url, success : function(h) { html = h }, async : false });
        dia = loadDialog.loaded[url] = $(html);
    }
    return showDialog(dia, opts);
}
loadDialog.loaded = {};

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
            dialog.addClass('dialog').detach().appendTo(document.body).css('position', o.opts.absolute ? 'absolute' : 'fixed').show();
            if(!o.opts.mandatory) {
                dialog.prepend(o.btn_close = $('<div class="btn_dialog_close"></div>'));
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
function reduce(f, list, first) {
    if(first === undefined) first = list.shift();
    for(var i = 0; i < list.length; i++) first = f(first, list[i]);
    return first;
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

function elem(tag, attrs) {
    var e = document.createElement(tag);
    for(name in attrs) e.setAttribute(name, attrs[name]);
    return e;
}

/*** puts alt attribute of input fields in to value attribute, clears
 * it when focused.
 * Adds hover events for elements with class='hoverable'
 * ***/
$(function () {
    $('#btn_share').click(function(){
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
    if(!a.test(this.href)) {
      $(this).click(function(event) {
        event.preventDefault();
        event.stopPropagation();
        window.open(this.href, '_blank');
      });
    }
  });

  $('#dia_referral input[name=forward]').val(window.location);
  $(window).resize(place_apps);
  place_apps();
  qtip_intialize();
});




function center(e, inside, opts) {
    var opts = $.extend({ absolute : false }, opts);
    var w = typeof(inside) == 'undefined' ? $(window) : inside;
    pos = { left : Math.max(0, w.width() / 2 - e.outerWidth() / 2),
        'top' : Math.max(0, w.height() / 2 - e.outerHeight() / 2) };
    if(opts.absolute) {
        pos['left'] += window.scrollX;
        pos['top'] += window.scrollY;
    }
    e.css(pos);
}

function asyncSubmit(form, callback) {
    $.post(server_url, $(form).serialize(), callback);
    return false;
}

function hover_url(url) {
    var h = url.replace(/(.png)|(-.*)$/, '-hover.png');
    var i = $(elem('img', { src : h, style : 'display : none' }));
    $(document.body).append(i);
    return h;
}
function hover_add(o) {
    if(o.src) {
        o.src_d = o.src;
        o.src_h = hover_url(o.src_d);
        o.over = function() { o.src = o.src_h };
        o.out = function() { if(!o.busy) o.src = o.src_d };
    }
    $(o).hover(o.over, o.out);
    $(o).hover(function() { $(o).addClass('active'); }, function() { if(!o.busy) $(o).removeClass('active'); });
}

hover_menu = function(handle, drawer, options) {
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
    };
    $.extend(o.options, options);
    if(!handle.length) throw("no handle"); if(!drawer.length) throw("no drawer");
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
        var top = (handle.offset().top + oy + drawer.outerHeight() > ($(window).height() + window.scrollY))
            && (handle.offset().top - oy - drawer.outerHeight() - window.scrollY > 0) ?
            hp.top - drawer.outerHeight() - o.options.offsetY : hp.top + oy;
        var left = handle.offset().left + drawer.outerWidth() > ($(window).width() + window.scrollX) ?
            hp.left - drawer.outerWidth() + handle.outerWidth() : hp.left;
        drawer.css({ left : left, top : top });
        o.options.open();
    }

    if(o.options.hover) {
        handle.hover(o.open, o.delayed_close);
        drawer.hover(o.cancel_close, o.delayed_close);
        handle.hover(o.open);
    }
    handle.click(o.open);
    $(o.options.click_persist).bind('click contextmenu keydown', function() { o.options.hover_close = false; });

    //if(o.options.auto_close) drawer.click(o.close);
    //if(o.options.auto_close) handle.click(o.close);

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

tool_tip = function(tool, tip, above) {
    var o = { };
    o.drawer = $('<div>').html(tip).addClass('tooltip');
    o.tool = tool;
    tool.after(o.drawer);

    o.show = function() {
        var x = tool.position().left + tool.outerWidth() / 2 - o.drawer.outerWidth() / 2;
        var y = o.tool.position().top + (above ? -5 - o.drawer.outerHeight() : o.tool.outerHeight() + 5);
        o.drawer.css({ 'left' : x, 'top' : y});
        o.drawer.show();
    }

    tool.hover(o.show, function() { o.drawer.hide() });
    return o;
}

qtip_intialize = function (elements) {
    if (!elements) var elements = '*';
    elements = $(elements).find('.hoverable[title]');
    var qtipOptions = {
        style: { 
            background: "#96E2CE",
            color: "black",
            padding: 3,
            border: {width: 3, radius: 3, color: "#96E2CE"},
            name: 'green', 
            "font-family": "Museo, Helvetica, Verdana, sans-serif",
            tip: true } ,
        position: { 
            adjust: { screen: true }
        }
    };
    var pos = {
        N: { target: "topMiddle", tooltip: "bottomMiddle"}
        , NE: { target: "topRight", tooltip: "bottomLeft"}
        , E: { target: "rightMiddle", tooltip: "leftMiddle"}
        , SE: { target: "bottomRight", tooltip: "topLeft"}
        , S: { target: "bottomMiddle", tooltip: "topMiddle"}
        , SW: { target: "bottomLeft", tooltip: "topRight"}
        , W: { target: "leftMiddle", tooltip: "rightMiddle"}
        , NW: { target: "topLeft", tooltip: "bottomRight"}
    };
    // Loop through directions and filter elements having "tip_N", etc.. class
    $.each(pos, function(key, value){
        var current = elements.filter('.tip_' + key);
        elements = elements.not(current);
        qtipOptions.position.corner = value;
        current.qtip(qtipOptions);
    });
    // filter out elements that we don't want custom tooltips for
    elements = elements.not('.tip_none');
    // For all elements not matched by above filters, default tooltip to S
    qtipOptions.position.corner = pos.S;
    elements.qtip(qtipOptions);

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
    document.cookie = name+"="+value+expires+"; path=/";
}

function readCookie(name) {
    var nameEQ = name + "=";
    var ca = document.cookie.split(';');
    for(var i=0;i < ca.length;i++) {
        var c = ca[i];
        while (c.charAt(0)==' ') c = c.substring(1,c.length);
        if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length,c.length);
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
           map(function(p) { c[p] = parseFloat(app_div.style[p]) }, ['left', 'top', 'width', 'height']);
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
}
