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
$(document).ready(function () {
  $("input[alt], textarea[alt]").each(function() {
    var defaultValue = $(this).attr('alt');
    this.onfocus = function() { if(this.value == defaultValue) this.value = ""; }
    this.onblur = function() { if(this.value == "") this.value = defaultValue };
    if(this.value == "") this.value = defaultValue;
  });

  $(".hoverable").each(function() { hover_add(this) });
});

function center(e, inside) {
    var w = typeof(inside) == 'undefined' ? $(window) : inside;
    e.css({ left : w.width() / 2 - e.width() / 2,
        top : w.height() / 2 - e.height() / 2});
}

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
        ,auto_close : true
        ,offsetY : 5
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
        if(!o.opened) return;
        drawer.hide();
        o.opened = false;
        if(o.rollover) o.rollover.attr('src', o.handle_src);
        handle.removeClass('menu_open');
        options.close();
        handle.get(0).busy = false;
    }
    o.open = function() {
        o.cancel_close();
        if(o.opened) return;

        o.opened = true;
        handle.get(0).busy = true;
        if(o.rollover) o.rollover.attr('src', o.hover_src);
        handle.addClass('menu_open');

        drawer.show();
        var hp = handle.position();
        var oy = handle.outerHeight() + options.offsetY;
        var top = handle.offset().top + oy + drawer.outerHeight() > ($(window).height() + window.scrollY) ?
            hp.top - drawer.outerHeight() - options.offsetY : hp.top + oy;
        var left = hp.left + drawer.outerWidth() > ($(window).width() + window.scrollX) ?
            hp.left - drawer.outerWidth() + handle.outerWidth() : hp.left;
        drawer.css({ left : left, top : top });
        options.open();
    }
    
    handle.hover(o.open, o.delayed_close);
    drawer.hover(o.cancel_close, o.delayed_close);
    if(options.auto_close) drawer.click(o.close);
    //if(options.auto_close) handle.click(o.close);

    return o;
}

click_dialogue = function(handle, drawer, options_arg) {
    var o = { handle : handle, drawer : drawer };
    var options = {
         open : noop
        ,close : noop
        ,auto_close : true
    };
    $.extend(options, options_arg);

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
        options.close(o);
    }
    o.open = function() {
        if(o.opened) return;
        handle.addClass('active');
        o.opened = true;
        if(o.rollover) o.rollover.attr('src', o.hover_src);
        drawer.fadeIn(100);
        options.open(o);
    }
    
    handle.click(o.open);
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

function redirect(u) { window.location = u; }

var append_color_picker = function(container, callback, init_color) {
    var e = $("<div style='width : 310px; height : 165px'>");
    container.append(e);

    var make_picker = function(c) {
        var d = $("<div style='display : inline-block; width : 20px; height : 20px; margin : 2px'>");
        d.css('background-color', c).attr('val', c).click(function() { manual_input.val(c); callback(c) });
        return d.get(0);
    }
    var make_row = function(cs) {
        var d = $("<div>");
        d.append(map(make_picker, cs));
        return d.get(0);
    }
    by_sixes = map(function(n) { return colors.slice(n, n+6)}, [0, 6, 12, 18, 24, 30]);
    var pickers = $("<div>");
    pickers.append(map(make_row, by_sixes));
    e.append(pickers);

    var bar = $("<img style='width : 10px; height : 165px; position : absolute; top : 5px; left : 162px'>");
    bar.attr('src', '/lib/skin/1/saturated.png');
    var shades = $("<div style='width : 120px; height : 120px; position : absolute; top : 5px; left : 190px'><img src='/lib/skin/1/greys.png' style='width : 100%; position : absolute'></div>");
    var manual = $("<div style='position : absolute; top : 130px; left : 190px; width : 120px'>#</div>");
    var manual_input = $("<input type='text' size='5'>").val(init_color);
    manual.append(manual_input);

    var update_hex = function() {
        var v = manual_input.val();
        if(v.match(/[\dA-Z]{6}/i) || v.match(/[\dA-Z]{3}/i)) callback('#' + v);
    };
    manual_input.change(update_hex).keyup(update_hex);

    // saturated color picked from color bar
    var scolor = [255, 255, 255];
    var get_hue = function(e) {
        var o = Math.floor(e.pageY - bar.offset().top);
        if(o < 0) o = 0;
        if(o > 164) o = 164;
        scolor = saturated_color(o, 165);
        var color = 'rgb(' + scolor.join(',') + ')';
        shades.css('background-color', color);
        calc_color();
    }
    bar.click(get_hue).drag(get_hue);

    var x = 1, y = 0; // gamma (x), saturation (y)
    var get_shade = function(e) {
        x = (e.pageX - shades.offset().left) / 120;
        y = (e.pageY - shades.offset().top) / 120;
        if(x < 0) x = 0;
        if(x > 1) x = 1;
        if(y < 0) y = 0;
        if(y > 1) y = 1;
        calc_color();
    }
    shades.click(get_shade).drag(get_shade);

    var calc_color = function() {
        var a = 1 - x, b = 1 - y;
        // blend saturated color with brightness and saturation
        var blend = function(c) { return Math.floor(a * b * 255 + (1 - a) * c); }
        var color = map(blend, scolor);
        var hex = map(function(c) { var s = c.toString(16); return s.length == 1 ? '0' + s : s }, color).join('').toUpperCase();
        manual_input.val(hex);
        callback('#' + hex);
    }

    e.append(bar);
    e.append(shades);
    e.append(manual);

    // Returns a fully saturated color in the RGB color wheel.
    // This function generated lib/skin/1/saturated.png.
    // The max param must be >= 1536 to get every possible fully saturated
    // color in a 24 bit color space.
    var saturated_color = function(n, max) {
        if(!max) max = 1536;
        if(n < 0) n = 0;
        if(n > max) n = max;

        var scale = 255;
        var r = [1, 1, 0, 0, 0, 1, 1];
        var g = [0, 1, 1, 1, 0, 0, 0];
        var b = [0, 0, 0, 1, 1, 1, 0];

        var linear_interp = function(points) {
            var p = (n / max) * (points.length - 1);
            var p0 = Math.floor(p);
            var v = p - p0;
            if(p0 == points.length - 1) p0--;
            delta = points[p0 + 1] * scale - points[p0] * scale;
            return Math.floor(delta * v + points[p0] * scale);
        }

        return [linear_interp(r), linear_interp(g), linear_interp(b)]; 
    }
}

var background_pick = function() {
    var e = $("<div id='bg_select' style='position : fixed; background-color : white; width : 530px; height : 320px' class='border selected'>"
        + "<div style='color : "+colors[1]+"; font-size : 1.5em'>Edit Background</div>"
        //+ "<div id='bg_upload'>Upload Image</div>"
        //+ "<div style='position : absolute; top : 100px'>Opacity</div>"
        //+ "<div id='bg_opacity' style='position : absolute; height : 10px; width : 160px; top : 130px'><img src='/lib/skin/1/opacity_bar.png'><div style='position : absolute; width : 10px; height : 20px; background-color : black'></div>"
        + "<div id='color_pick' style='position : absolute; left : 10px; top : 50px'></div>"
        + "<div class='medbold' id='bg_done' style='cursor : default; position : absolute; right : 10px; bottom : 10px'>Done</div>"
        + "</div>");
    $('#body').append(e);
    $('#bg_done').click(function() { $('#bg_select').remove() });
    if(!Hive.Exp.background) Hive.Exp.background = {};
    append_color_picker($('#color_pick'), function(c) { $('#bg').css('background-color', c); Hive.Exp.background.color = c; }, Hive.Exp.background.color);
    center(e);
}

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
