/* Copyright 2010, A Reflection Of Inc */
// thenewhive.com client-side expression editor version 0.1

var Hive = {};

// gives an array functions for moving an element around
Hive.makeShuffleable = function(arr) {
    arr.moveUp = function(i) {
        if(i == arr.length - 1) return false;
        var tmp = arr[i];
        arr[i] = arr[i + 1];
        arr[i + 1] = tmp;
    }
    arr.moveDown = function(i) {
        if(i == 0) return false;
        var tmp = arr[i];
        arr[i] = arr[i - 1];
        arr[i - 1] = tmp;
    }
    arr.moveBottom = function(i) {
        var tmp = arr[i];
        arr.splice(i, 1);
        arr.unshift(tmp);
    }
    arr.moveTop = function(i) {
        var tmp = arr[i];
        arr.splice(i, 1);
        arr.push(tmp);
    }
}

// collection object for all App objects in page. An App is a widget
// that you can move, resize, and copy. Each App type has more specific
// editing functions.
Hive.Apps = function(initial_state) {
    var o = [];
    
    // selected apps are being interacted with
    //var selected = [];
    
    var init = function(o) {
        if(! initial_state) initial_state = [ ];
        map(Hive.App, initial_state)
    }
    o.getState = function() {
        return map(function(app) { return app.getState(); }, o);
    }
    
    o.focused = null;
    
    o.stack = [];
    Hive.makeShuffleable(o.stack);
    o.restack = function() {
        for(var i = 0; i < o.stack.length; i++)
            if(o.stack[i]) o.stack[i].layer(i); // 0 is for background
    }
    
    o.add = function(app) {
        var i = o.length;
        o.push(app);
        if(app.layer() === null || o.stack[app.layer()]) o.stack.push(app);
        else o.stack[app.layer()] = app;
        o.restack();
        return i;
    }
    
    var array_delete = function(arr, e) {
        for(var n = 0; n < arr.length; n++) {
            if(arr[n] == e) {
                arr.splice(n, 1);
                return true;
            }
        }
        return false;
    }
    
    o.remove = function(app) {
        app.unfocus();
        array_delete(o, app);
        array_delete(o.stack, app);
    }
    
    init(o);
    return o;
}

Hive.OpenApps = Hive.Apps();
var focused = function() { return Hive.OpenApps.focused; }

// Creates generic initial object for all App types.
Hive.App = function(initState) {
    var o = {};
    o.controls = null;
    o.apps = Hive.OpenApps;
    
    o.state = {
        position    : [ 100, 100 ],
        dimensions  : [ 300, 200 ],
        z           : null           // new app is stacked on top
    };
    $.extend(o.state, initState);
    o.type = Hive.appTypes[o.state.type];

    o.remove = function() {
        o.div.remove();
        o.apps.remove(o);
    }
    
    o.stackBottom = function() {
        o.apps.stack.moveBottom(o.layer());
        o.apps.restack();
    }
    o.stackTop = function() {
        o.apps.stack.moveTop(o.layer());
        o.apps.restack();
    }
    
    o.focus = Funcs(function() {
        if(o.focused()) return;
        if(o.apps.focused) o.apps.focused.unfocus();
        o.apps.focused = o;
        if(!o.controls) o.controls = Hive.App.Controls(o);
        qtip_intialize(o.controls.div);
    });
    o.unfocus = Funcs(function() {
        if(o.controls) o.controls.remove();
        o.apps.focused = null;
    });
    o.focused = function() { return o.apps.focused == o }
    
    // stacking order of aps
    o.layer = function(n) {
        if(typeof(n) == 'number') {
            o.state.z = n;
            o.div.css('z-index', o.state.z);
        }
        return o.state.z;
    }
    
    o.getState = function() {
        $.extend(o.state, {
             content    :  o.content()
            ,z          :  o.layer()
            });
        if(o.angle && o.angle() != 0) o.state.angle = o.angle();
        return o.state;
    }
    o.win = $(window);
    o.sf = function() { return 1000 / o.win.width(); }
    o.pos = function(pos) {
        if(typeof(pos) == 'undefined')
            return [ parseInt(o.div.position().left), parseInt(o.div.position().top) ];
        else {
            o.div.css({ 'left' : pos[0], 'top' : pos[1] });
            o.state.position = [pos[0] * o.sf(), pos[1] * o.sf()];
            if(o.controls) o.controls.pos();
        }
    }
    o.pos_n = function(dims) { o.div.css({left : Math.round(dims[0] * 1/o.sf()), top : Math.round(dims[1] * 1/o.sf()) }) }
    o.centerPos = function() {
        var dims = o.dims();
        var pos = o.pos();
        return [ pos[0] + dims[0] / 2, pos[1] + dims[1] / 2 ];
    }
    o.dims = function(dims) {
        if(typeof(dims) == 'undefined') return [ o.div.width(), o.div.height() ];
        else {
            o.div.width(dims[0]); o.div.height(dims[1]);
            o.state.dimensions = [dims[0] * o.sf(), dims[1] * o.sf()];
        }
    }
    o.dims_n = function(dims) { o.div.width(Math.round(dims[0] * 1/o.sf())); o.div.height(Math.round(dims[1] * 1/o.sf())); }
    o.scale = function(scale) {
        s = 1000 / o.win.width();
        o.state.scale = scale * s;
        //o.div.css('font-size', scale + 'em');
    }
    o.scale_n = function(s) { o.scale(s * 1/o.sf()) }
    o.resize = function(dims) {
        o.dims(dims);
        if(o.controls) o.controls.layout();
    }
    o.center = function() {
        o.pos([o.win.width() / 2 - o.dims()[0] / 2 + o.win.scrollLeft(), o.win.height() / 2 - o.dims()[1] / 2 + o.win.scrollTop()]);
    }

    o.opacity = function(s) {
        if(typeof(s) == 'undefined')
            return (o.state.opacity === undefined ? 1 : o.state.opacity);
        o.state.opacity = s;
        o.content_element.css('opacity', s);
    }

    o.load = function() {
        o.content_element = o.div.find('.content');
        o.opacity(o.state.opacity);
        o.content_element.click(function(e) { o.focus(); });
        if(o.state.load) o.state.load(o);
        delete o.state.create;
    }

    // initialize
    o.div = $('<div class="ehapp">');
    $('#content').append(o.div);
    o.pos_n(o.state.position);
    o.dims_n(o.state.dimensions);
    var refPos;
    o.div.drag('start', function() { refPos = o.pos(); });
    o.div.drag(function(e, dd) { o.pos([refPos[0] + dd.deltaX, refPos[1] + dd.deltaY]); }, { handle : '.drag' } );
    o.layer(o.layer());
      
    // add type-specific properties
    o = o.type(o);
    
    // run type-specific code?
    //setTimeout(function() { o.resize(o.dims()) }, 500);
    
    // add to apps collection
    o.index = o.apps.add(o);

    return o;
}

// Generic object for all App.Controls types. The Controls objects are
// responsible for the selection border, and all the buttons
// surounding the App when selected, and for these button's behavior.
Hive.App.Controls = function(app) {
    var o = {};
    o.app = app;

    o.remove = function() {
        o.div.remove();
        o.select_box.remove();
        o.app.controls = false;
    }

    o.dims = function() {
        var dims = o.app.dims();
        if(dims[0] < 70) dims[0] = 70;
        if(dims[1] < 40) dims[1] = 40;
        return dims;
    }

    o.pos = function() {
        o.div.css(o.app.div.offset());
    }

    o.layout = function() {
        o.pos();
        var dims = o.dims();
        o.select_box.css({ width : dims[0], height : dims[1] });

        var p = o.padding;
        //o.c.undo   .css({ top   : -38 - p, right  :  61 - p });
        o.c.copy   .css({ left  : dims[0] - 45 + p, top   : -38 - p });
        o.c.remove .css({ left  : dims[0] - 14 + p, top   : -38 - p });
        o.c.resize .css({ left  : dims[0] - 20 + p, top   : dims[1] - 20 + p });
        o.c.stack  .css({ left  : dims[0] - 78 + p, top   : dims[1] + 8 + p });
        o.c.buttons.css({ left  :  -5 - p, top : dims[1] + p + 10, width : dims[0] - 60 });
    }

    o.append_link_picker = function(d) {
        var e = $("<div class='control drawer link'><nobr><input type='text'> <img class='hoverable' src='/lib/skin/1/delete_sm.png' title='Clear link'></nobr>");
        d.append(e);
        var input = e.find('input');
        var m = hover_menu(d.find('.button.link'), e, {
             open : function() {
                 input.focus();
                 input.val(o.app.link());
             }
            ,click_persist : input
            ,close : function() {
                input.blur();
                o.app.focus();
            }
        });
        var set_link = function(){
            var v = input.val();
            // TODO: improve URL guessing
            if(!v.match(/^https?\:\/\//i) && !v.match(/^\//) && v.match(/\./)) v = 'http://' + v;
            o.app.link(v);
        };
        input.bind('change keyup mouseup paste', function(){setTimeout(set_link, 10)} );
        e.find('img').click(function() { input.val(''); o.app.link(''); m.close(); });
        input.keypress(function(e) { if(e.keyCode == 13) m.close() });
        return m;
    }

    o.addControl = function(c) { o.div.append(c); }
    o.addControls = function(ctrls) {
        map(o.addControl, ctrls.clone(false).children());
    }

    o.div = $("<div style='position : absolute; z-index : 3; width : 0; height : 0' class='controls'>");
    o.select_box = $("<div class='select_box drag border selected'>");
    o.app.div.append(o.select_box);
    $('body').append(o.div);
    o.addControls($('#controls_common'));
    var d = o.div;
    o.c = {};
    //o.c.undo    = d.find('.undo'   );
    o.c.remove  = d.find('.remove' );
    o.c.resize  = d.find('.resize' );
    o.c.stack   = d.find('.stack'  );
    o.c.remove.click(function() { o.app.remove() });
    o.c.copy    = d.find('.copy'   );
    o.c.copy.click(function() {
        var cp = Hive.App(o.app.getState());
        cp.pos([cp.pos()[0], cp.pos()[1] + o.app.dims()[1] + 20]);
    });
    d.find('.stack_up').click(o.app.stackTop);
    d.find('.stack_down').click(o.app.stackBottom);
    o.padding = 0;

    o = o.app.type.Controls(o);

    o.c.buttons = d.find('.buttons');
    o.layout();
    d.find('.hoverable').each(function() { hover_add(this) });

    return o;
}


Hive.appTypes = { };
Hive.registerApp = function(app, name) {
    app.tname = name;
    Hive.appTypes[name] = app;
}

/* Hack to prevent iframe or object in an App from capturing mouse events
 * @param {Hive.App} o The app to add shielding to
 * */
Hive.App.makeShielded = function(o) {
    o.dragging = false;

    o.shield = function() {
        if(o.eventCapturer) return;
        o.eventCapturer = $("<div class='drag shield'>");
        o.eventCapturer.click(function(e) { console.log(e); o.focus(); });
        o.div.append(o.eventCapturer);
        o.eventCapturer.css('opacity', 0.0);
    }
    o.unshield = function() {
        if(!o.eventCapturer) return;
        o.eventCapturer.remove();
        o.eventCapturer = false;
    }
    o.set_shield = function() {
        if(o.dragging || !o.focused()) o.shield();
        else o.unshield();
    }

    o.focus.add(o.set_shield)
    o.unfocus.add(o.set_shield)

    o.div.drag('start', function() {
        o.dragging = true;
        o.set_shield();
    });
    o.div.drag('end', function() {
        o.dragging = false;
        o.set_shield();
        o.resize(o.dims());
        return false;
    });
}

// This App shows an arbitrary single HTML tag.
Hive.App.Html = function(common) {
    var o = {};
    $.extend(o, common);

    o.content = function(c) {
        if(typeof(c) != 'undefined') 
        return o.embed.outerHTML();
    }

    o.embed = $(o.state.content).addClass('content');
    o.div.append(o.embed);
    if(o.embed.is('object') || o.embed.is('embed') || o.embed.is('iframe')) {
        Hive.App.makeShielded(o);
        o.set_shield = function() { o.shield(); }
        o.shield();
    }

    setTimeout(function(){ o.load(); }, 100);

    return o;
}
Hive.registerApp(Hive.App.Html, 'hive.html');

Hive.App.Html.Controls = function(common) {
    var o = {};
    $.extend(o, common);

    var d = o.div;
    d.find('.resize').drag('start', function(e, dd) { o.refDims = o.app.dims(); });
    d.find('.resize').drag(function(e, dd) {
        //cos(atan2(x, y) - atan2(w, h))
        o.app.resize([o.refDims[0] + dd.deltaX, o.refDims[1] + dd.deltaY]);
    });

    o.addControls($('#controls_html'));

    var input = d.find('input.opacity');
    var m = hover_menu(d.find('.button.opacity'), d.find('.drawer.opacity'),
        { open : function() { input.focus(); input.select(); } });
    input.val((o.app.opacity() * 100) + '%');
    input.keyup(function(e) {
        if(e.keyCode == 13) { input.blur(); m.close(); }
        o.app.opacity(parseFloat(input.val()) / 100);
    });

    d.find('.render').click(o.app.toggle_render);

    return o;
}

var is_chrome = navigator.userAgent.toLowerCase().indexOf('chrome') > -1;

// Contains an iframe that has designMode set when selected
Hive.App.Text = function(common) {
    var o = {};
    $.extend(o, common);
    
    var content = o.state.content;
    o.content = function(content) {
        if(typeof(content) != 'undefined') {
            if(content == null || content == '') o.rte.set_content(' '); // seems to avoid giant or invisible cursor bug in FF
            else o.rte.set_content(content);
        }
        return o.rte.get_content();
    }

    o.focus.add(function() { o.rte.editMode(true) });
    o.unfocus.add(function() {
        o.rte.set_content(autoLink(o.rte.get_content()));
        o.rte.editMode(false);
    });
    
    o.link = function(v) {
        if(typeof(v) == 'undefined') return o.rte.get_link();
        v = v.trim();
        if(!v) o.rte.edit('unlink');
        else o.rte.edit('createlink', v);
    }

    var refScale = o.state.scale ? o.state.scale : 1;
    o.div.drag('start', function() { refScale = scale; });
    o.div.drag('end', function() { o.resize(o.dims()); });
    
    o.calcHeight = function() {
        if(is_chrome) {
            o.div.css('height', 1).css('height', '');
            o.dims(o.dims());
        }
        return $(o.rte.doc.body).height(); 
    }
    o.resize_h = function(dims) {
        o.dims(dims);
        return o.resize([dims[0], o.calcHeight()]);
    }
    o.refresh_size = function() { o.resize_h(o.dims()); }
    var scale = o.state.scale ? o.state.scale * 1/o.sf() : 1;
    o.scale = function(s) {
        if(typeof(s) == 'undefined') return scale;
        scale = s;
        $(o.rte.doc.body).css('font-size', scale + 'em');
        common.scale(s);
    }
    o.rescale = function(dims1, s) {
        var dims2 = [dims1[0] * s, dims1[1] * s];
        o.resize(dims2);
        o.scale(refScale * s);
    }
    
    o.load = function() {
        o.scale_n(refScale);
        o.content(content);
        $(o.rte.doc).keypress(throttle(o.refresh_size, 200));
        common.load();
    }

    Hive.App.makeShielded(o);

    o.div.addClass('text');
    o.set_shield();
    o.rte = Hive.rte({ css : $('#css_base').clone(), parent : o.div,
        'class' : 'content', load : o.load, click : function() { o.controls.close() } });
    
    return o;
}
Hive.registerApp(Hive.App.Text, 'hive.text');

Hive.App.Text.Controls = function(common) {
    var o = {};
    $.extend(o, common);

    o.padding = 5;
    o.layout = function() {
        common.layout();
        var p = o.padding;
        var dims = o.dims();
        o.c.resize_h.css({ left : dims[0] - 20 + o.padding, top : Math.min(dims[1] / 2 - 20, dims[1] - 54) });
    }

    o.addControls($('#controls_text'));

    var d = o.div;
    o.c.resize_h = d.find('.resize_h');

    o.link_menu = o.append_link_picker(d.find('.buttons'));
    o.close = function() { o.link_menu.close(); }

    var cmd_buttons = function(query, func) {
        $(query).each(function(i, e) {
            $(e).click(function() { func($(e).attr('val')) });
        })
    }

    //hover_menu(d.find('.button.fontsize'), d.find('.drawer.fontsize'));
    //d.find('.drawer.fontsize .option').each(function(i, e) { $(e).click(function() {
    //    o.app.rte.edit('fontsize', (parseFloat($(e).attr('val')) / o.app.scale()) + 'em')
    //    o.app.resize_h(o.app.dims());
    //}) });

    //d.find('.undo').click(function() { o.app.rte.undo() });

    hover_menu(d.find('.button.fontname'), d.find('.drawer.fontname'));
    //cmd_buttons('.fontname .option', function(v) { o.app.rte.css('font-family', v) });

    append_color_picker(d.find('.drawer.color'), function(v) { o.app.rte.edit('forecolor', v) });
    hover_menu(d.find('.button.color'), d.find('.drawer.color'), { auto_close : false });

    //cmd_buttons('.button.bold',   function(v) { o.app.rte.css('font-weight', '700'   , { toggle : '400'   }) });
    //cmd_buttons('.button.italic', function(v) { o.app.rte.css('font-style' , 'italic', { toggle : 'normal'}) });

    hover_menu(d.find('.button.align'), d.find('.drawer.align'));
    //cmd_buttons('.align .option', function(v) { o.app.rte.css('text-align', v, { body : true }) });

    //cmd_buttons('.button.unformat', function(v) { o.app.rte.edit('removeformat') });

    $('.option[cmd],.button[cmd]').each(function(i, e) { $(e).click(function() {
        o.app.rte.edit($(e).attr('cmd'), $(e).attr('val'))
    }); })

    d.find('.resize, .resize_h').drag('start', function(e, dd) {
        o.refDims = o.app.dims();
        o.dragging = e.target;
        o.dragging.busy = true;
        o.dragging.over();
        o.app.div.drag('start');
    });
    o.refDims = null;
    o.c.resize.drag(function(e, dd) {
        //cos(atan2(x, y) - atan2(w, h))
        o.app.rescale(o.refDims, Math.max((o.refDims[0] + dd.deltaX) / o.refDims[0], (o.refDims[1] + dd.deltaY) / o.refDims[1]));
    });
    o.c.resize_h.drag(function(e, dd) {
        o.app.resize_h([o.refDims[0] + dd.deltaX, o.refDims[1]]);
    });
    d.find('.resize, .resize_h').drag('end', function(e, dd) {
        o.dragging.busy = false;
        o.dragging.out();
        o.app.div.drag('end');
    });

    return o;
}


Hive.App.Image = function(common) {
    var o = {};
    $.extend(o, common);

    o.content = function(content) {
        if(typeof(content) != 'undefined') o.image_src(content);
        return o.img.attr('src');
    }

    o.link = function(v) {
        if(typeof(v) == 'undefined') return o.state.href;
        o.state.href = v;
    }

    var angle = o.state.angle ? o.state.angle : 0;
    o.angle = function(a) {
        if(typeof(a) == 'undefined') return angle;
        angle = a;
        o.img.rotate(a);
    }
    o.image_src = function(src) {
        if(o.img) o.img.remove();
        o.img = $("<img class='content drag'>");
        o.img.hide();
        o.img.attr('src', src);
        o.div.append(o.img);
        o.img.load(function(){setTimeout(o.img_load, 1)});
    }
    o.img_load = function() {
        o.imageWidth  = o.img.width();
        o.imageHeight = o.img.height();
        o.aspectRatio = o.imageWidth / o.imageHeight;
        if(o.state.create) {
            var w = o.imageWidth > $(window).width() * 0.8 ? $(window).width() * 0.8 : o.imageWidth;
            o.resize([w,w]);
        }
        o.img.css('width', '100%');
        o.img.show();
        if(o.angle()) o.angle(o.angle());
        common.load();
    }

    o.resize = function(dims) {
        var newWidth = dims[1] * o.aspectRatio;
        var dims = newWidth < dims[0] ? [newWidth, dims[1]] : [dims[0], dims[0] / o.aspectRatio];
        common.resize(dims);
        return dims;
    }

    o.image_src(o.state.content);

    return o;
}
Hive.registerApp(Hive.App.Image, 'hive.image');

Hive.App.Image.Controls = function(common) {
    var o = {};
    $.extend(o, common);

    o.layout = function() {
        common.layout();
        var p = o.padding;
        var dims = o.dims();
        o.rotateHandle.css({ left : dims[0] - 20 + o.padding, top : Math.min(dims[1] / 2 - 20, dims[1] - 54) });
    }

    o.refDims = null;
    var refAngle = null;
    var offsetAngle = null;
    var angle = o.app.angle();
    o.getAngle = function(e) {
        var cpos = o.app.centerPos();
        var x = e.pageX - cpos[0];
        var y = e.pageY - cpos[1];
        return Math.atan2(y, x) * 180 / Math.PI;
    }

    o.addControls($('#controls_image'));

    var d = o.div;
    o.append_link_picker(d.find('.buttons'));

    var input = d.find('input.opacity');
    var m = hover_menu(d.find('.button.opacity'), d.find('.drawer.opacity'),
        { open : function() { input.focus(); input.select(); } });
    input.val((o.app.opacity() * 100) + '%');
    input.keyup(function(e) {
        if(e.keyCode == 13) { input.blur(); m.close(); }
        o.app.opacity(parseFloat(input.val()) / 100);
    });

    d.find('.button.set_bg').click(function() { Hive.set_bg_img(o.app.getState()) });

    o.rotateHandle = $(elem('img', { src : '/lib/skin/1/rotate.png',  'class' : 'control rotate hoverable' }));
    o.addControl(o.rotateHandle);
    d.find('.resize, .rotate').drag('start', function(e, dd) {
        o.refDims = o.app.dims();
        refAngle = angle;
        offsetAngle = o.getAngle(e);
    });
    d.find('.resize').drag(function(e, dd) {
        //cos(atan2(x, y) - atan2(w, h))
        o.app.resize([o.refDims[0] + dd.deltaX, o.refDims[1] + dd.deltaY]);
    });
    d.find('.rotate').drag(function(e, dd) {
        angle = o.getAngle(e) - offsetAngle + refAngle;
        o.app.angle(angle);
    });

    //activate_drawer('link');

    return o;
}


Hive.App.Shape = function(common) {
    var o = {};
    $.extend(o, common);
    o.type = 'hive.shape.0';

    o.content = function(content) {
        //if(typeof(content) != 'undefined') o.imageSrc(content);
        //return o.img.attr('src');
    }

    o.canvas = Raphael(o.div.get(0), o.dims()[0], o.dims()[1]);
    o.shape = o.canvas.rect(0, 0, o.dims()[0] - 1, o.dims()[1] - 1);

    o.fillColor = function(c) { o.shape.attr({ 'fill' : c }) }
    o.strokeColor = function(c) { o.shape.attr({ 'stroke' : c }) }

    return o;
}
Hive.registerApp(Hive.App.Shape, 'hive.shape.0');

Hive.App.Shape.Controls = function(app) {
}


// For selecting multilpe Apps. Not implemented
Hive.select_start = function(e, dd) {
    var o = Hive.selection = {};
    o.selected = [];
    o.div = $("<div class='app_select'>");
    o.select_box = $("<div class='select_box border selected'>");
    $(document.body).append(o.div);
    o.div.append(o.select_box);
    o.start = [e.pageX, e.pageY];
}
Hive.select_move = function(e, dd) {
    var o = Hive.selection;
    o.dims = [Math.abs(dd.deltaX), Math.abs(dd.deltaY)];
    o.pos = [dd.deltaX < 0 ? e.pageX : o.start[0], dd.deltaY < 0 ? e.pageY : o.start[1]];
    o.div.css({ left : o.pos[0], top : o.pos[1], width : o.dims[0], height : o.dims[1] });
}
Hive.select_finish = function() {
    if(!Hive.selection.selected.length) Hive.select_none();
}
Hive.select_none = function() {
    Hive.selection.div.remove();
    Hive.selection = false;
}

Hive.new_app = function(s) {
    s.create = true;
    var load = s.load;
    s.load = function(a) {
        Hive.upload_finish();
        a.center();
        a.resize(a.dims());
        a.focus();
        if(load) load(a);
    }
    Hive.App(s);
    return false;
}

var main = function() {
    // Warn the user if they leave the page by any route other than the save button TODO: actually check if they've made any changes
    if(!debug_mode) window.onbeforeunload = function(){ return "If you leave this page any unsaved changes to your expression will be lost." }

    if(/Firefox[\/\s](\d+\.\d+)/.test(navigator.userAgent) && parseInt(RegExp.$1) < 5)
        if(confirm("You're using an oldish version of Firefox. Click OK to get the newest version"))
            window.location = 'http://www.mozilla.com/en-US/products/download.html';

    if(!(/Firefox[\/\s](\d+\.\d+)/.test(navigator.userAgent) || /Chrome/.test(navigator.userAgent)))
        showDialog('#editor_browsers');

    $(window).click(function(e) {
        if(!focused()) return;
        if(!$.contains(focused().div.get(0), e.target) && e.target.parentNode
            && !$.contains($('.controls').get(0), e.target)) focused().unfocus();
    });

    $(document.body).drag('start', function() { return false; });
    $(document.body).drag(function() { return false; });
    $(document.body).drag('end', function() { return false; });

    $(document.body).filedrop({
         data : { action : 'files_create' }
        ,uploadFinished : function(i, f, r) { Hive.new_app(r) }
        ,drop : Hive.upload_start
    });

    $(window).resize(function(e) {
        map(function(a) {
                a.pos_n(a.state.position);
                a.dims_n(a.state.dimensions);
                a.scale_n(a.state.scale);
                if(focused()) focused().controls.layout();
            }, Hive.OpenApps);
        center($('#app_btns'), $('#nav_bg'));
    });
    $(window).resize();


    $('#insert_text,#text_default').click(function(e) {
        Hive.new_app({ type : 'hive.text', content : ' ' });
    });
    $('#text_header').click(function(e) {
        Hive.new_app({ type : 'hive.text', content : '<span style="font-weight:bold">&nbsp;</span>', scale : 3 });
    });


    if(!Hive.Exp.background) Hive.Exp.background = { };
    if(!Hive.Exp.background.color) Hive.Exp.background.color = '#FFFFFF';
    Hive.bg_div = $('.happfill');
    var bg_set_color = function(c) {
        Hive.bg_div.add('#bg_preview').css('background-color', c);
        Hive.Exp.background.color = c;
    };
    append_color_picker($('#color_pick'), bg_set_color, Hive.Exp.background.color);
    $('#image_background').click(function() { showDialog('#dia_edit_bg', { fade : false }); });
    $('#bg_remove').click(function() { delete Hive.Exp.background.url; Hive.update_bg_img(); });
    $('#bg_opacity').focus(function() { $('#bg_opacity').select() }).keyup(function(e) {
        Hive.Exp.background.opacity = parseFloat($(e.target).val()) / 100;
        Hive.update_bg_img();
    });
    $('#bg_upload').click(function() { asyncUpload({ start : Hive.upload_start,
        success : function(r) { Hive.set_bg_img(r); Hive.upload_finish() } }); });
    Hive.update_bg_img();
    bg_set_color(Hive.Exp.background.color);

    var pick_file = function() { asyncUpload({ start : Hive.upload_start, success : Hive.new_app }); };
    $('#insert_image').click(pick_file);
    $('#image_upload').click(pick_file);
    $('#insert_audio').click(pick_file);
    $('#audio_upload').click(pick_file);
    $('#insert_file' ).click(pick_file);
    $('#menu_file'   ).click(pick_file);

    hover_menu($('#insert_text'), $('#menu_text'));
    hover_menu($('#insert_image'), $('#menu_image'));
    hover_menu($('#insert_audio'), $('#menu_audio'));
    hover_menu($('#insert_file'), $('#menu_file'));
    var embed_menu = hover_menu($('#insert_embed'), $('#menu_embed'), { click_persist : $('#embed_code') } );
    $('#embed_done').click(function() { Hive.embed_code(); embed_menu.close(); });
    hover_menu($('#insert_shape'), $('#menu_shape'));
    
    $('#btn_grid').click(Hive.toggle_grid);
    
    var checkUrl = function(){
        var u = $('#url').val();
        if(u.match(/[^\w.\/-]/)) {
            alert("Please just use letters, numbers, dash, period and slash in URLs. It makes it easier to share on other websites.");
            $('#url').focus();
            return false;
        } else {
            return true;
        }
    }

    hover_menu($('#btn_save'), $('#menu_save'), { hover : false });
    $('#save_submit').click(function(){
        if (! $(this).hasClass('disabled')){ 
            $(this).addClass('disabled');
            if ( checkUrl() ){
                window.onbeforeunload = null; //Cancel the warning for leaving the page
                Hive.save();
            }
        }
    });
    $('#save_overwrite').click(function() {
        Hive.Exp.overwrite = true;
        Hive.save();
    });
    var dia_thumbnail;
    $('#btn_thumbnail').click(function() {
        // Set thumb_src property for the server to generate a new thumb
        dia_thumbnail = showDialog('#dia_thumbnail');
        $('#expr_images').empty().append(map(function(thumb) {
            var img = $('<img>').attr('src', thumb.src);
            var e = $("<div class='thumb'>").append(img).get(0);
            return e;
        }, $('.ehapp img')));
        $('#expr_images .thumb img').each(function() { var img = $(this); setTimeout(function() { img_fill(img) }, 1) });
        $('#expr_images img').click(function() {
            Hive.Exp.thumb_src = this.src;
            dia_thumbnail.close();
            return false;
        });
    });
    $('#default_thumbs img').click(function() {
        // The thumb property is set directly
        Hive.Exp.thumb = this.src;
        dia_thumbnail.close();
        return false;
    });
    
    // Automatically update url unless it's an already saved expression or the user has modified the url manually
    $('#menu_save #title').bind('keydown keyup', function(){
        if (!(Hive.Exp.home || Hive.Exp.name || $('#url').hasClass('modified') )){
            $('#url').val(
                $('#title').val().replace(/[^0-9a-zA-Z]/g, "-").replace(/--+/g, "-").toLowerCase()
            );
        }
    }).keydown();

    $('#url').focus(function(){
        $(this).addClass('modified');
    });

    $('#menu_save #title').blur( function(){
        $('#title').val($('#title').val().trim());
    }).blur();

    $('#url').change(checkUrl);

    hover_menu($('#privacy' ), $('#menu_privacy'));
    $('#menu_privacy').click(function(e) {
        $('#menu_privacy div').removeClass('selected');
        var t = $(e.target);
        t.addClass('selected');
        $('#privacy span').text(t.text());
        var v = t.attr('val');
        if(v == 'password') $('#password_ui').show();
        else $('#password_ui').hide();
    });
    if(Hive.Exp.auth) $('#menu_privacy [val=' + Hive.Exp.auth +']').click();

    
    Hive.Apps(Hive.Exp.apps);
}
$(main);

// Matches youtube and vimeo URLs, any URL pointing to an image, and
// creates the appropriate App state to be passed to Hive.new_app.
Hive.embed_code = function() {
    var c = $('#embed_code').val().trim(), app;

    if(m = c.match(/^https?:\/\/www.youtube.com\/.*?v=(.*)$/) || (m = c.match(/src="https?:\/\/www.youtube.com\/embed\/(.*?)"/)))
        app = { type : 'hive.html', content : 
              '<object type="application/x-shockwave-flash" style="width:100%; height:100%" data="http://www.youtube.com/v/' + m[1]
            + '?rel=0&amp;showsearch=0&amp;showinfo=0&amp;fs=1"><param name="movie" value="http://www.youtube.com/v/' + m[1]
            + '?rel=0&amp;showsearch=0&amp;showinfo=0&amp;fs=1"><param name="allowFullScreen" value="true"><param name="wmode" value="opaque"/></object>' };
    else if(m = c.match(/^https?:\/\/(www.)?vimeo.com\/(.*)$/))
        app = { type : 'hive.html', content :
            '<iframe src="http://player.vimeo.com/video/' + m[2] + '?title=0&amp;byline=0&amp;portrait=0" style="width:100%;height:100%;border:0"></iframe>' };
    else if(m = c.match(/^https?:\/\/(.*)mp3$/i))
        app = { type : 'hive.html', content : "<object type='application/x-shockwave-flash' data='/lib/player.swf' width='100%' height='24'>"
            + "<param name='FlashVars' value='soundFile=" + c + "'><param name='wmode' value='transparent'></object>" }
//<object width="100%" height="100%" type="application/x-shockwave-flash" id="cover23798312_2084961807" name="cover23798312_2084961807" class="" data="http://a.vimeocdn.com/p/flash/moogalover/1.1.9/moogalover.swf?v=1.0.0" style="visibility: visible;"><param name="allowscriptaccess" value="always"><param name="allowfullscreen" value="true"><param name="scalemode" value="noscale"><param name="quality" value="high"><param name="wmode" value="opaque"><param name="bgcolor" value="#000000"><param name="flashvars" value="server=vimeo.com&amp;player_server=player.vimeo.com&amp;cdn_server=a.vimeocdn.com&amp;embed_location=&amp;force_embed=0&amp;force_info=0&amp;moogaloop_type=moogaloop&amp;js_api=1&amp;js_getConfig=player23798312_2084961807.getConfig&amp;js_setConfig=player23798312_2084961807.setConfig&amp;clip_id=23798312&amp;fullscreen=1&amp;js_onLoad=player23798312_2084961807.player.loverLoaded&amp;js_onThumbLoaded=player23798312_2084961807.player.loverThumbLoaded&amp;js_setupMoog=player23798312_2084961807.player.loverInitiated"></object>
//http://player.vimeo.com/video/                                                   13110687
//<object width="100%" height="100%" type="application/x-shockwave-flash" id="cover13110687_812701010" name="cover13110687_812701010" data="http://a.vimeocdn.com/p/flash/moogalover/1.1.9/moogalover.swf?v=1.0.0" style="visibility: visible;"><param name="allowscriptaccess" value="always"><param name="allowfullscreen" value="true"><param name="scalemode" value="noscale"><param name="quality" value="high"><param name="wmode" value="opaque"><param name="bgcolor" value="#000000"><param name="flashvars" value="server=vimeo.com&amp;player_server=player.vimeo.com&amp;cdn_server=a.vimeocdn.com&amp;embed_location=&amp;force_embed=0&amp;force_info=0&amp;moogaloop_type=moogaloop&amp;js_api=1&amp;js_getConfig=player13110687_812701010.getConfig&amp;js_setConfig=player13110687_812701010.setConfig&amp;clip_id=13110687&amp;fullscreen=1&amp;js_onLoad=player13110687_812701010.player.loverLoaded&amp;js_onThumbLoaded=player13110687_812701010.player.loverThumbLoaded&amp;js_setupMoog=player13110687_812701010.player.loverInitiated"></object>
    else if(m = c.match(/^https?:\/\/(.*)(jpg|jpeg|png|gif)$/i))
        app = { type : 'hive.image', content : c }
    else if(m = c.match(/https?:\/\/.*soundcloud.com/i)) {
        var stuffs = $('<div>');
        stuffs.html(c);
        var embed = stuffs.children().first();
        if(embed.is('object')) embed.append($('<param name="wmode" value="opaque"/>'));
        if(embed.is('embed')) embed.attr('wmode', 'opaque');
        embed.attr('width', '100%');
        embed.find('[width]').attr('width', '100%');
        embed.find('embed').attr('wmode', 'opaque');
        app = { type : 'hive.html', content : embed.outerHTML() };
    }
     else {
        var stuffs = $('<div>');
        stuffs.html(c);
        var embed = stuffs.children().first();
        if(embed.is('object')) embed.append($('<param name="wmode" value="opaque"/>'));
        if(embed.is('embed')) embed.attr('wmode', 'opaque');
        embed.attr('width', '100%').attr('height', '100%');
        embed.find('[width]').attr('width', '100%').attr('height', '100%');
        embed.find('embed').attr('wmode', 'opaque');
        app = { type : 'hive.html', content : embed.outerHTML() };
    }

    Hive.new_app(app);
    $('#embed_code').val('');
} 

Hive.upload_start = function() { center($('#loading').show()); }
Hive.upload_finish = function() { $('#loading').hide(); }

Hive.save = function() {
    var expr = Hive.get_state();

    if(expr.name.match(/^expressions/)) {
        alert('The url "/expressions" is reserved for your profile page.');
        return false;
    }

    var on_response = function(ret) {
        if(typeof(ret) != 'object') alert("Sorry, something is broken :(. Please send us feedback");
        if(ret.error == 'overwrite') {
            $('#expr_name').html(expr.name);
            showDialog('#dia_overwrite');
            $('#save_submit').removeClass('disabled');
        }
        else if (ret.location) {
            if (ret['new']){
                showDialog('#dia_share');
                $('#btn_share').show();
                updateShareUrls('#dia_share', ret.location);
                $('#mail_form [name=forward]').attr('value', ret.location);
                $('#mail_form [name=id]').attr('value', ret.id);
                $('#app_btns').add('#btn_save').add('#btn_grid').add('#menu_save').add('#btn_help').hide();
                $('#dialog_shield, .btn_dialog_close').unbind('click').click(function(){
                    minimize($('#dia_share'), $('#btn_share'), { duration : 1000,
                        complete : function() { window.location = ret.location } });
                    });
                $('#expression_url').html(ret.location);
                $('#congrats_message').html('<h1>Now you can share your expression anywhere.</h1>');
            } else {
                window.location = ret.location;
            }
        }
    }

    $.ajax( {
        type : "POST",
        dataType : 'json',
        data : { action : 'expr_save', exp : JSON.stringify(Hive.get_state()) },
        success : on_response
    } );
};

Hive.get_state = function() {
    //Hive.Exp.domain = $('#domain').val();
    Hive.Exp.name = $('#url').val();
    Hive.Exp.apps = Hive.OpenApps.getState();
    Hive.Exp.title = $('#title').val();
    Hive.Exp.tags = $('#tags_input').val();
    Hive.Exp.auth = $('#menu_privacy .selected').attr('val');
    if(Hive.Exp.auth == 'password') Hive.Exp.password = $('#password').val();

    // get height
    var h = 0;
    for(var i in Hive.Exp.apps) {
        var a = Hive.Exp.apps[i], y = a.dimensions[1] + a.position[1];
        if(y > h) h = y;
    }
    Hive.Exp.dimensions = [1000, Math.ceil(h)];

    return Hive.Exp;
}

Hive.grid = false;
Hive.toggle_grid = function() {
    Hive.grid = ! Hive.grid;
    var e = $('#btn_grid').get(0);
    e.src = e.src_d = '/lib/skin/1/grid-' + (Hive.grid ? 'on' : 'off') + '.png';
    $('#grid_guide').css(Hive.grid ?
          { 'background-image' : "url('/lib/skin/1/grid_square.png')", 'background-repeat' : 'repeat' }
        : { 'background-image' : '' }
    );
}

Hive.update_bg_img = function() {
    if(!Hive.bg_div.find('img').length) Hive.bg_div.append($('<img>'));
    var imgs = Hive.bg_div.find('img').add('#bg_preview_img');
    if(Hive.Exp.background.url) {
        imgs.show();
        imgs.attr('src', Hive.Exp.background.url).css('opacity', Hive.Exp.background.opacity);
    } else { imgs.hide(); }
};
Hive.set_bg_img = function(app) {
    Hive.Exp.background.url = app.content;
    Hive.Exp.background.opacity = app.opacity;
    Hive.update_bg_img();
    Hive.bg_div.find('img').load(function() { setTimeout(place_apps, 10) });
};

function remove_all_apps() {
    var aps = map(id, Hive.OpenApps); // store a copy of OpenApps so we can destructively update it
    map(function(a) { a.remove() }, aps);
}

// Creates iframe for Hive.App.Text
Hive.rte = function(options) {
    var o = { };
    o.options = $.extend({ click : noop }, options);

    o.create_editor = function() {
        o.iframe = $("<iframe style='border : none; width : 100%; height : 100%;'>").get(0);
        o.iframe.src = 'javascript:void(0)';
        if(o.options['class']) $(o.iframe).addClass(o.options['class']);
        $(o.options.parent).append(o.iframe);
        o.doc_poll = setTimeout(o.wait_for_doc, 1);
    }
    o.wait_for_doc = function() {
        if(o.iframe.contentWindow.document) {
            o.setup_editor();
            clearTimeout(o.doc_poll);
        }
    }
    o.setup_editor = function() {
        o.win = o.iframe.contentWindow;
        $(o.win).click(function(){ o.range = null; o.options.click(); });
        o.doc = o.win.document;
        if(o.options.css) $(o.doc).find('head').append(o.options.css);
        o.doc.body.style.overflow = 'hidden';
        //o.editor_cmd('styleWithCSS', true);
        if(options.load) options.load();
    }

    o.editor_cmd = function(command, args) {
        o.doc.execCommand(command, false, args);
    }
    o.range = null;
    o.edit = function(command, args) {
        //o.range = o.get_range();
        //var r = o.range;
        //var edit_all = !r || !r.toString();
        //if(edit_all) {
        //    r = o.range_all();
        //    if(r.toString().trim()) o.select(r);
        //}

        // Fix Chrome's incompatibile behavior of inserting href as text 
        if(command == 'createlink' && !o.get_range().toString()) return;

        o.editor_cmd(command, args);

        //if(command == 'removeformat') {
        //    var brs = $(o.doc.body).find('br');
        //    if(brs.length) brs.replaceWith("\n");
        //    var c = o.get_content();
        //    //c = c.replace(/[ \f\t\u00A0]+[\n\u2028\u2029]/g, "\n"); // remove trailing whitespace
        //    // remove single newlines
        //    // TODO: only remove newlines from selected region.
        //    c = c.replace(/([^\n])\n([^\n])/g, '$1 $2');
        //    o.set_content(c);
        //}

        // Major hack here. When changing fontsize in designmode,
        // FireFox creates deprecated <font size='N'> tags. This code
        // replaces the size attribute with css em units, so that text
        // boxes can scale like other Apps. A similar hack must be
        // done for all browsers, as they all use a slightly different
        // form of absolute text sizing.
        if(command == 'fontsize') {
            var broken = $(o.doc.body).find('font[size]');
            $(broken).css('font-size', args);
            $(broken).removeAttr('size');
        }

        //if(edit_all) o.select(null);
    }
    o.undo = function() {
        o.select(o.range);
        o.editor_cmd('undo');
    }

    o.get_range = function() {
        var s = o.win.getSelection();
        if(s.rangeCount) return o.win.getSelection().getRangeAt(0).cloneRange();
        else return null;
    }

    // Finds link element the cursor is on, selects it after saving
    // any existing selection, returns its href
    o.get_link = function() {
        o.range = o.get_range(); // save existing selection
        var r = o.range.cloneRange();

        // Look for link in parents
        var node = r.startContainer;
        while(node.parentNode) {
            node = node.parentNode;
            if($(node).is('a')) {
                r.selectNode(node);   
                o.select(r);
                return $(node).attr('href');
            }
        }

        // Look for the first link that intersects r
        var find_intersecting = function(r) {
            var link = false;
            $(o.doc.body).find('a').each(function() { if(!link && rangeIntersectsNode(r, this)) link = this });
            if(link) {
                r.selectNode(link);
                o.select(r);
                return $(link).attr('href');
            };
            return '';
        }
        var link = find_intersecting(r);
        if(link) return link;

        // If there's still no link, select current word
        if(!r.toString()) {
            // select current word
            // r.expand('word') // works in IE and Chrome
            var s = o.select(r);
            // If the cursor is not at the beginning of a word...
            if(!r.startContainer.data || !/\W|^$/.test(r.startContainer.data.charAt(r.startOffset - 1)))
                s.modify('move','backward','word');
            s.modify('extend','forward','word');
        }

        // It's possible to grab a previously missed link with the above code 
        var link = find_intersecting(o.get_range());
        return link;
    }

    o.select = function(range) {
        var s = o.win.getSelection();
        if(!s) return;
        s.removeAllRanges();
        if(range)
        s.addRange(range);
        return s;
    }

    // An attempt to replace execCommand?
    //o.css = function(prop, val, options) {
    //    if(typeof(options) == 'undefined') options = {};
    //    rng = o.get_selection_range();
    //    if(!rng.toString() || options.body)
    //        if(options.toggle) {
    //            var c = $(o.doc.body).css(prop);
    //            $(o.doc.body).css(prop, c == val ? options.toggle : val);
    //        } else $(o.doc.body).css(prop, val);
    //    else {
    //        var s = $(o.doc.createElement('span'));
    //        s.css(prop, val);
    //        rng.surroundContents(s);
    //    }
    //}

    o.editMode = function(mode) {
        if(mode) {
            o.doc.designMode = 'on';
            o.iframe.contentWindow.focus();
            if(o.range) o.select(o.range);
        } else {
            //o.range = o.get_range(); // attempt to save cursor positoion breaks deleting textboxes
            o.doc.designMode = 'off';
            o.iframe.blur();
        }
    }

    o.get_content = function() {
        o.doc.normalize();
        return $(o.doc.body).html();
    }
    o.set_content = function(c) {
        return $(o.doc.body).html(c);
    }

    function rangeIntersectsNode(range, node) {
        var nodeRange = node.ownerDocument.createRange();
        try {
          nodeRange.selectNode(node);
        }
        catch (e) {
          nodeRange.selectNodeContents(node);
        }

        return range.compareBoundaryPoints(Range.END_TO_START, nodeRange) == -1 &&
               range.compareBoundaryPoints(Range.START_TO_END, nodeRange) == 1;
    }

    o.create_editor();
    return o;
}

var append_color_picker = function(container, callback, init_color) {
    var e = $('<div>').addClass('color_picker');
    container.append(e);

    var make_picker = function(c) {
        var d = $('<div>').addClass('color_select');
        d.css('background-color', c).attr('val', c).click(function() { set_color(c); manual_input.val(c); callback(c) });
        return d.get(0);
    }
    var make_row = function(cs) {
        var d = $("<div>");
        d.append(map(make_picker, cs));
        return d.get(0);
    }
    by_sixes = map(function(n) { return colors.slice(n, n+6)}, [0, 6, 12, 18, 24, 30]);
    var pickers = $("<div class='palette'>");
    pickers.append(map(make_row, by_sixes));
    e.append(pickers);

    var bar = $("<img class='hue_bar'>");
    bar.attr('src', '/lib/skin/1/saturated.png');
    var shades = $("<div class='shades'><img src='/lib/skin/1/greys.png'></div>");
    var manual_input = $("<input type='text' size='6' class='color_input'>").val(init_color);

    var update_hex = function() {
        var v = manual_input.val();
        var c = $('<div>').css('color', v).css('color');
        set_color(c);
        callback(c);
    };
    manual_input.change(update_hex).keyup(update_hex);

    // saturated color picked from color bar
    var hsv = [0, 0, 1];
    var get_hue = function(e) {
        hsv[0] = bound(Math.floor(e.pageY - bar.offset().top) / bar.height(), 0, 1);
        shades.css('background-color', 'rgb(' + hsvToRgb(hsv[0], 1, 1).join(',') + ')');
        calc_color();
    }
    bar.click(get_hue).drag(get_hue);

    var set_color = function(c) {
        var rgb = map(parseInt, $('<div>').css('color', c).css('color').replace(/[^\d,]/g,'').split(','));
        hsv = rgbToHsv(rgb[0], rgb[1], rgb[2]);
        shades.css('background-color', 'rgb(' + hsvToRgb(hsv[0], 1, 1).join(',') + ')');
    }
    set_color(init_color);

    var x = 1, y = 0; // gamma (x), saturation (y)
    var get_shade = function(e) {
        hsv[2] = bound((e.pageX - shades.offset().left) / 120, 0, 1);
        hsv[1] = bound((e.pageY - shades.offset().top) / 120, 0, 1);
        calc_color();
    }
    shades.click(get_shade).drag(get_shade);

    var calc_color = function() {
        var color = hsvToRgb(hsv[0], hsv[1], hsv[2]);
        var hex = '#' + map(function(c) { var s = c.toString(16); return s.length == 1 ? '0' + s : s }, color).join('').toUpperCase();
        manual_input.val(hex);
        callback(hex);
    }

    e.append(bar);
    e.append(shades);
    e.append(manual_input);

    function hsvToRgb(h, s, v){
        var r, g, b;

        var i = Math.floor(h * 6);
        var f = h * 6 - i;
        var p = v * (1 - s);
        var q = v * (1 - f * s);
        var t = v * (1 - (1 - f) * s);

        switch(i % 6){
            case 0: r = v, g = t, b = p; break;
            case 1: r = q, g = v, b = p; break;
            case 2: r = p, g = v, b = t; break;
            case 3: r = p, g = q, b = v; break;
            case 4: r = t, g = p, b = v; break;
            case 5: r = v, g = p, b = q; break;
        }

        return map(Math.round, [r * 255, g * 255, b * 255]);
    }

    function rgbToHsv(r, g, b){
        r = r/255, g = g/255, b = b/255;
        var max = Math.max(r, g, b), min = Math.min(r, g, b);
        var h, s, v = max;

        var d = max - min;
        s = max == 0 ? 0 : d / max;

        if(max == min){
            h = 0; // achromatic
        }else{
            switch(max){
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }

        return [h, s, v];
    }
}
