// TODO: accept an optional namespace parameter to prevent crapping
// all over your global object
function include(library) {
    var lib_path = '/lib/';
    $.getScript(lib_path + library + '.js');
}

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
            

function id(x) { return x; };
function noop() { };
// takes f, a1, a2, ... and returns function() { f(a1, a2, ...) }
//function ap(f) { var args = arguments; return function() { return f.apply(null, Array.prototype.slice.call(args, 1)); }; };
// oo version, takes f, a1, a2, ... returns function() { a1.f(a2, ...) }
//function apo(f) { var args = arguments; return function() { return f.apply(args[1], Array.prototype.slice.call(args, 2)); }; };
function accessor(name) { return function(o) { return o[name] } }
function cp(f, g) { return function(a) { f(g(a)); } }
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

$(document).ready(function () {
  $("input[alt]").each(function() {
    var defaultValue = $(this).attr('alt');
    this.onfocus = function() { if(this.value == defaultValue) this.value = ""; }
    this.onblur = function() { if(this.value == "") this.value = defaultValue };
    if(this.value == "") this.value = defaultValue;
  });

  $(".hoverable").each(function() { hover_add(this) });
});

function asyncSubmit(form, callback) {
    var data = {};
    $(form).find("input").each(function() { data[this.name] = this.value; });
    var path = $(form).attr('action');
    if(!path) path = '.';
    $.post(path, data, callback);
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
    else if($(o).css('background-image').match(/^url/)) {
        var s = o.src_d = $(o).css('background-image');
        s = s.replace(/url\("?/, '').replace(/"?\)/, '');
        o.src_h = 'url(' + hover_url(s) + ')';
        o.over = function() { $(o).css('background-image', o.src_h) };
        o.out = function() { if(!o.busy) $(o).css('background-image', o.src_d) };
    }
    else {
        o.over = function() { $(o).addClass('active'); }
        o.out =  function() { $(o).removeClass('active'); }
    }
    $(o).hover(o.over, o.out);
}

hover_menu = function(handle, drawer, options_arg) {
    var options = {
         open : noop
        ,close : noop
    };
    $.extend(options, options_arg);
    if(!handle.length) throw("no handle"); if(!drawer.length) throw("no drawer");
    var o = { handle : handle, drawer : drawer };
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

    o.delayed_close = function() { o.close_timer = setTimeout(o.close, 500); }
    o.cancel_close = function() { if(o.close_timer) clearTimeout(o.close_timer); }

    o.close = function() {
        drawer.hide();
        o.opened = false;
        if(o.rollover) o.rollover.attr('src', o.handle_src);
        options.close();
        handle.get(0).busy = false;
    }
    o.open = function() {
        o.cancel_close();
        handle.get(0).busy = true;
        if(!o.opened) {
            o.opened = true;
            if(o.rollover) o.rollover.attr('src', o.hover_src);

            drawer.fadeIn(200);
            var hp = handle.position();
            var oy = handle.outerHeight() + 5;
            var top = handle.offset().top + oy + drawer.outerHeight() > ($(window).height() + window.scrollY) ?
                hp.top - drawer.outerHeight() - 20 : hp.top + oy;
            var left = hp.left + drawer.outerWidth() > ($(window).width() + window.scrollX) ?
                hp.left - drawer.outerWidth() + handle.outerWidth() : hp.left;
            drawer.css({ left : left, top : top });
        }
        options.open();
    }
    
    handle.hover(o.open, o.delayed_close);
    drawer.hover(o.cancel_close, o.delayed_close);
    if(!options.no_close) drawer.click(o.close);
    handle.click(function() { o.close() });

    return o;
}

click_dialogue = function(handle, drawer) {
    var o = { handle : handle, drawer : drawer };

    o.opened = false;
    o.rollover = null;
    if(handle.attr('src')) o.rollover = handle;
    if(handle.find('img').length) o.rollover = handle.find('img');
    if(o.rollover) {
        o.handle_src = o.rollover.attr('src');
        o.hover_src = hover_url(o.handle_src);
    }

    o.close = function(e) {
        if(!o.opened) return;
        handle.removeClass('active');
        drawer.fadeOut(30);
        o.opened = false;
        if(o.rollover) o.rollover.attr('src', o.handle_src);
    }
    o.open = function() {
        if(o.opened) return;
        handle.addClass('active');
        o.opened = true;
        if(o.rollover) o.rollover.attr('src', o.hover_src);
        drawer.fadeIn(100);
        return false;
    }
    
    handle.click(o.open);
    $(window).click(function(e) {
        if(drawer.get(0) == e.target
            || $.contains(drawer.get(0), e.target)
            ) return;
        o.close();
    });

    return o;
}

tool_tip = function(tool, tip, above) {
    var o = {};
    o.drawer = $('<div class="tooltip">' + tip + '</div>');
    o.tool = tool;
    o.above = above ? true : false;
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

function redirect(u) { window.location = u; }

colors = [
      '#000000'
    , '#F03C30'
    , '#EF8120'
    , '#7DB22A'
    , '#B6E6D5'
    , '#7893A5'
    , '#4C4549'
    , '#AE1C22'
    , '#F9B00F'
    , '#36B63F'
    , '#6ACCA8'
    , '#213565'
    , '#666D7A'
    , '#93153F'
    , '#F3591B'
    , '#227134'
    , '#35A586'
    , '#904AAB'
    , '#8C867E'
    , '#F02F5B'
    , '#7F4322'
    , '#A8921E'
    , '#3B7C6D'
    , '#5DAAAD'
    , '#B8B2A9'
    , '#EB79C3'
    , '#A8737F'
    , '#5E6D24'
    , '#78C19D'
    , '#A1A5B7'
    , '#E7E5D8'
    , '#F8D9C9'
    , '#F9F66B'
    , '#D3E33B'
    , '#DDF3E8'
    , '#FFFFFF'
];
colors.selected = colors[4];
colors.unselected = colors[30];
colors.active = [19];
