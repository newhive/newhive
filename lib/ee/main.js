// Copyright 2010, Abram Clark & A Reflection Of LLC
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
        }
    }
    o.pos_n = function(dims) { o.div.css({left : dims[0] * 1/o.sf(), top : dims[1] * 1/o.sf()}) }
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
    o.dims_n = function(dims) { o.div.width(dims[0] * 1/o.sf()); o.div.height(dims[1] * 1/o.sf()); }
    o.scale = function(scale) {
        s = 1000 / o.win.width();
        o.state.scale = scale * s;
    }
    o.scale_n = function(s) { o.scale(s * 1/o.sf()) }
    o.resize = function(dims) {
        o.dims(dims);
        if(o.controls) o.controls.layout();
    }
    o.center = function() {
        o.pos([o.win.width() / 2 - o.dims()[0] / 2, o.win.height() / 2 - o.dims()[1] / 2]);
    }

    o.opacity = function(s) {
        if(typeof(s) == 'undefined')
            return (o.state.opacity === undefined ? 1 : o.state.opacity);
        o.state.opacity = s;
        o.content_element.css('opacity', s);
    }

    o.load = function() {
        if(o.state.load) o.state.load(o);
        o.content_element = o.div.find('.content');
        o.opacity(o.state.opacity);
    }

    // initialize
    o.div = $('<div class="happ">');
    $('#body').append(o.div);
    o.pos_n(o.state.position);
    o.dims_n(o.state.dimensions);
    o.div.click(function(e) { o.focus(); });
    o.div.drag(function(e, dd) {
        o.pos([dd.originalX + dd.deltaX, dd.originalY + dd.deltaY]);
        //if(o.controls) o.controls.layout();
    }, { handle : '.drag' } );
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

    o.init = function() {
        var p = o.padding;
        o.c.undo   .css({ top   : -38 - p, right  :  61 - p });
        o.c.copy   .css({ top   : -38 - p, right  :  28 - p });
        o.c.remove .css({ top   : -38 - p, right  :  -5 - p });
        o.c.resize .css({ right : -20 - p, bottom : -20 - p });
        o.c.stack  .css({ right :  18 - p, bottom : -38 - p });
        o.layout();
    }
    o.layout = function() {
        var dims = o.app.dims();
        if(dims[0] < 70) dims[0] = 70;
        if(dims[1] < 40) dims[1] = 40;
        o.div.css({ width : dims[0], height : dims[1] });
        o.select_box.css({ width : dims[0], height : dims[1] });
        var p = o.padding;
        o.c.buttons.css({ left  :  -5 - p, top : dims[1] + p + 10 });
    }

    o.append_color_picker = function(e) {
        var make_picker = function(c) {
            var d = $("<div class='option small'>");
            d.css('background-color', c);
            d.attr('val', c);
            return d.get(0);
        }
        var make_row = function(cs) {
            var d = $("<div>");
            d.append(map(make_picker, cs));
            return d.get(0);
        }
        by_sixes = map(function(n) { return colors.slice(n, n+6)}, [0, 6, 12, 18, 24, 30]);
        var pickers = $('<div>');
        pickers.append(map(make_row, by_sixes));
        e.append(pickers);

        var bar = $("<img class='hue_bar'>");
        bar.attr('src', '/lib/skin/1/saturated.png');
        e.append(bar);
    }

    o.append_link_picker = function(d) {
        var e = $("<div class='control drawer link'><nobr><input type='text'><img class='hoverable' src='/lib/skin/1/sm_arrow.png'></nobr>");
        d.append(e);
        var input = e.find('input');
        var m = hover_menu(d.find('.button.link'), e,
            { open : function() { input.focus(); input.select(); } });
        var link = function() {
            o.app.link(input.val());
            m.close();
        };
        e.find('img').click(link);
        input.keypress(function(e) { if(e.keyCode == 13) link() });
    }

    o.addControl = function(c) { o.div.append(c); }
    o.addControls = function(ctrls) {
        map(o.addControl, ctrls.clone(false).children());
    }

    o.div = $('<div>');
    o.select_box = $("<div class='select_box drag border selected'>");
    o.app.div.append(o.select_box).append(o.div);
    o.addControls($('#controls_common'));
    var d = o.div;
    o.c = {};
    o.c.undo    = d.find('.undo'   );
    o.c.remove  = d.find('.remove' );
    o.c.resize  = d.find('.resize' );
    o.c.stack   = d.find('.stack'  );
    o.c.remove.click(function() { o.app.remove() });
    tool_tip(o.c.remove, 'delete, no undo yet!', true);
    o.c.copy    = d.find('.copy'   );
    o.c.copy.click(function() {
        var cp = Hive.App(o.app.getState());
        cp.pos([cp.pos()[0], cp.pos()[1] + o.app.dims()[1] + 20]);
    });
    tool_tip(o.c.copy, 'copy', true);
    d.find('.stack_up').click(o.app.stackTop);
    d.find('.stack_down').click(o.app.stackBottom);
    o.padding = 0;

    o = o.app.type.Controls(o);

    o.c.buttons = d.find('.buttons');
    o.init();
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
        console.log('ds');
        o.dragging = true;
        o.set_shield();
    });
    o.div.drag('end', function() {
        o.dragging = false;
        o.set_shield();
        o.resize(o.dims());
    });
}

// This App shows an arbitrary single HTML tag.
Hive.App.Html = function(common) {
    var o = {};
    $.extend(o, common);

    o.content = function() { return o.embed.outerHTML(); }

    o.maximizeContent = function() {
        o.embed.removeAttr('width');
        o.embed.removeAttr('height');
        o.embed.css({ width : '100%', height : '100%' });
    }

    Hive.App.makeShielded(o);

    o.init = function(r) {
        var stuffs = $('<div>');
        stuffs.html(o.state.content);
        o.embed = stuffs.children().first();
        o.maximizeContent();
        o.div.append(o.embed);
    }
    o.init();

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
        o.rte.editMode(false);
        o.rte.select(null);
    });
    
    o.link = function(v) {
        o.rte.edit('createlink', v);
    }

    var refScale = o.state.scale ? o.state.scale : 1;
    o.div.drag('start', function() { refScale = scale; });
    o.div.drag('end', function() { o.resize(o.dims()); });
    
    o.calcDims = function() {
        var b = $(o.rte.doc.body);
        var h = b.height();
        var w = $(o.rte.doc).width();
        return [w, h];
    }
    o.resize_h = function(dims1) {
        o.dims(dims1);
        dims2 = o.calcDims();
        return o.resize(dims2);
    }
    var scale = o.state.scale ? o.state.scale * 1/o.sf() : 1;
    o.scale = function(s) {
        if(typeof(s) == 'undefined') return scale;
        scale = s;
        $(o.rte.doc.body).css('font-size', scale + 'em');
        common.scale(s);
    }
    var rsz = null;
    o.refresh_size = function() {
        clearTimeout(rsz);
        rsz = setTimeout(function() { o.resize_h(o.dims()); }, 100);
    }
    o.rescale = function(dims1, s) {
        var dims2 = [dims1[0] * s, dims1[1] * s];
        o.resize(dims2);
        o.scale(refScale * s);
    }
    
    o.load = function() {
        o.scale(scale);
        o.content(content);
        $(o.rte.doc).keypress(o.refresh_size);
        o.resize_h(o.dims());
        common.load();
    }

    Hive.App.makeShielded(o);

    o.div.addClass('text');
    o.set_shield();
    o.rte = Hive.rte({ css : $('#css_base').clone(), parent : o.div,
        class : 'content', load : o.load });
    
    return o;
}
Hive.registerApp(Hive.App.Text, 'hive.text');

Hive.App.Text.Controls = function(common) {
    var o = {};
    $.extend(o, common);

    o.padding = 5;
    o.init = function() {
        common.init();
        o.c.resize_h.css({ right : -20 - o.padding });
    }
    o.layout = function() {
        common.layout();
        var p = o.padding;
        o.c.resize_h.css({ bottom : Math.max(o.app.dims()[1] / 2 - 20, 20 - p) });
    }

    o.addControls($('#controls_text'));

    var d = o.div;
    o.c.resize_h = d.find('.resize_h');

    o.append_link_picker(d.find('.buttons'));

    o.get_pointsize = function() { return Math.round(o.app.scale() * 13) }

    //o.c.text_size = d.find('.fontsize input');
    //o.c.text_size.change(function(e) {
    //    var v = parseInt(o.c.text_size.val());
    //    if(!v || v < 0) o.c.text_size.val(o.get_pointsize());
    //    else o.app.rte.edit('fontsize', v / o.get_pointsize() + 'em');
    //});

    var cmd_buttons = function(query, func) {
        $(query).each(function(i, e) {
            $(e).click(function() { func($(e).attr('val')) });
        })
    }

    hover_menu(d.find('.button.fontsize'), d.find('.drawer.fontsize'));
    d.find('.drawer.fontsize .option').each(function(i, e) { $(e).click(function() {
        o.app.rte.edit('fontsize', (parseFloat($(e).attr('val')) / o.app.scale()) + 'em')
        o.app.resize_h(o.app.dims());
    }) });

    d.find('.undo').click(function() { o.app.rte.undo() });

    hover_menu(d.find('.button.fontname'), d.find('.drawer.fontname'));
    //cmd_buttons('.fontname .option', function(v) { o.app.rte.css('font-family', v) });

    o.append_color_picker(d.find('.drawer.color'));
    hover_menu(d.find('.button.color'), d.find('.drawer.color'));
    cmd_buttons('.color .option', function(v) { o.app.rte.edit('forecolor', v) });

    //cmd_buttons('.button.bold',   function(v) { o.app.rte.css('font-weight', '700'   , { toggle : '400'   }) });
    //cmd_buttons('.button.italic', function(v) { o.app.rte.css('font-style' , 'italic', { toggle : 'normal'}) });

    hover_menu(d.find('.button.align'), d.find('.drawer.align'));
    //cmd_buttons('.align .option', function(v) { o.app.rte.css('text-align', v, { body : true }) });

    //cmd_buttons('.button.unformat', function(v) { o.app.rte.edit('removeformat') });
    tool_tip(d.find('.button.unformat'), 'unformat');

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
        o.app.rescale(o.refDims, (o.refDims[0] + dd.deltaX) / o.refDims[0]);
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
        o.img.load(o.img_load);
    }
    o.img_load = function() {
        o.imageWidth  = o.img.width();
        o.imageHeight = o.img.height();
        o.aspectRatio = o.imageWidth / o.imageHeight;
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

    o.frameApp = function() {
        var dims = o.dims();
        var h = o.rotateHandle.height();
        var y = dims[1] / 2 > h ? dims[1] / 2 - h / 2 : dims[1] - h - h / 2;
        o.rotateHandle.css('top', dims[0] + 5, y);
    }

    o.init = function() {
        common.init();
        o.rotateHandle.css({ right : -20 - o.padding });
    }
    o.layout = function() {
        common.layout();
        var p = o.padding;
        o.rotateHandle.css({ bottom : Math.max(o.app.dims()[1] / 2 - 20, 20 - p) });
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

    o.rotateHandle = $(elem('img', { src : '/lib/skin/1/rotate.png',  class : 'control rotate' }));
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
    $(window).click(function(e) {
        if(!focused()) return;
        if(!$.contains(focused().div.get(0), e.target) && e.target.parentNode) focused().unfocus();
    });

    $(window).resize(function(e) {
        map(function(a) {
                a.pos_n(a.state.position);
                a.dims_n(a.state.dimensions);
                a.scale_n(a.state.scale);
                if(focused()) focused().controls.layout();
            }, Hive.OpenApps);
    });

    $(document.body).drag('start', Hive.select_start);
    $(document.body).drag(Hive.select_move);
    $(document.body).drag('end', Hive.select_finish);

    $(document.body).filedrop({
         data : { action : 'files_create' }
        ,uploadFinished : function(i, f, r) { Hive.new_app(r) }
        ,drop : Hive.upload_start
    });
    
    $('#insert_text,#text_default').click(function(e) { Hive.new_app({
        type : 'hive.text', content : ' ' }); });
    $('#text_header').click(function(e) {
        Hive.new_app({ type : 'hive.text', content : ' ', scale : 2,
            load : function(app) { app.rte.edit('bold') } });
    });

    $('#insert_image').click(Hive.pick_file);
    $('#image_upload').click(Hive.pick_file);

    $('#insert_audio').click(Hive.pick_file);
    $('#audio_upload').click(Hive.pick_file);

    $('#insert_file').click(Hive.pick_file);

    var embed_menu = hover_menu($('#insert_embed'), $('#menu_embed'), { auto_close : false });
    $('#embed_done').click(function() { console.log('start'); Hive.embed_code(); embed_menu.close(); });
    
    $('#btn_grid').click(Hive.toggle_grid);
    
    //$('#insert_shape').click(function() {
    //    var app = Hive.App({ type : 'hive.shape', content : { type : 'rectangle' } });
    //});

    $('#file_input').change(function() {
        Hive.upload_start();
        $('#upload_form').submit();
    });
    $('#upload_target').load(function() {
        var frame = $('#upload_target').get(0);
        if(!frame.contentDocument || !frame.contentDocument.body.innerHTML) return;
        var resp = JSON.parse($(frame.contentDocument.body).text());
        Hive.new_app(resp);
    });
    
    Hive.Apps(Hive.Exp.apps);
}
$(main);

Hive.pick_file = function() { $('#file_input').click() }

// Matches youtube and vimeo URLs, any URL pointing to an image, and
// creates the appropriate App state to be passed to Hive.new_app.
Hive.embed_code = function() {
    var c = $('#embed_code').val(), app;

    if(m = c.match(/^https?:\/\/www.youtube.com\/.*?v=(.*)$/))
        app = { type : 'hive.html', content : 
              '<object type="application/x-shockwave-flash" style="width:100%; height:100%" data="http://www.youtube.com/v/' + m[1]
            + '?rel=0&amp;showsearch=0&amp;showinfo=0&amp;fs=1"><param name="movie" value="http://www.youtube.com/v/' + m[1]
            + '?rel=0&amp;showsearch=0&amp;showinfo=0&amp;fs=1"><param name="allowFullScreen" value="true"></object>' };
    else if(m = c.match(/^https?:\/\/(www.)?vimeo.com\/(.*)$/))
        app = { type : 'hive.html', content :
            '<iframe src="http://player.vimeo.com/video/' + m[2] + '?title=0&amp;byline=0&amp;portrait=0" border="0"></iframe>' };
    else if(m = c.match(/^https?:\/\/(.*)(jpg|jpeg|png|gif)$/))
        app = { type : 'hive.image', content : c }
    else app = { type : 'hive.html', content : c };

    Hive.new_app(app);
    $('#embed_code').val('');
} 

Hive.upload_start = function() { center($('#loading').show()); }
Hive.upload_finish = function() { $('#loading').hide(); }

Hive.save = function() {
    var on_response = function(ret) {
        if(typeof(ret) != 'object') alert("There was a problem saving your stuff :(.");
        if(ret.error) alert(ret.error);
        else if(ret.location) window.location = ret.location;
    }

    $.ajax( {
        type : "POST",
        //url : '/' + Hive.Exp.path,
        dataType : 'json',
        data : { action : 'expr_save', exp : JSON.stringify(Hive.get_state()) },
        success : on_response
    } );
}

Hive.get_state = function() {
    Hive.Exp.apps = Hive.OpenApps.getState();
    Hive.Exp.title = $('#title').val();
    Hive.Exp.name = $('#url').val();
    Hive.Exp.tags = $('#tags').val();
    Hive.Exp.auth = $('#menu_privacy .selected').attr('val');
    if(Hive.Exp.auth == 'password') Hive.Exp.password = $('#password').val();
    return Hive.Exp;
}

Hive.grid = false;
Hive.toggle_grid = function() {
    Hive.grid = ! Hive.grid;
    var e = $('#btn_grid').get(0);
    e.src = e.src_d = '/lib/skin/1/grid-' + (Hive.grid ? 'on' : 'off') + '.png';
    $(document.body).css(Hive.grid ?
          { 'background-image' : "url('/lib/skin/1/grid_square.png')", 'background-repeat' : 'repeat' }
        : { 'background-image' : '' }
    );
}

//function remove_all_apps() {
//    var aps = map(id, Hive.OpenApps); // store a copy of OpenApps so we can destructively update it
//    map(Hive.OpenApps.removeApp, aps);
//}

// Creates iframe for Hive.App.Text
Hive.rte = function(options) {
    var o = {};
    o.options = typeof(options) == 'object' ? options : {};

    o.create_editor = function() {
        o.iframe = $("<iframe style='border : none; width : 100%; height : 100%; overflow : hidden'>").get(0);
        o.iframe.src = 'javascript:void(0)';
        if(o.options.class) $(o.iframe).addClass(o.options.class);
        $(o.options.parent || document.body).append(o.iframe);
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
        o.doc = o.win.document;
        if(o.options.css) $(o.doc).find('head').append(o.options.css);
        $(o.doc.body).css('white-space', 'pre-wrap');

        //o.editor_cmd('styleWithCSS', true);
        if(options.load) options.load();
    }

    o.editor_cmd = function(command, args) {
        o.doc.execCommand(command, false, args);
    }
    o.range = null;
    o.edit = function(command, args) {
        o.range = o.get_range();
        var r = o.range;
        if(!r || !r.toString()) {
            r = o.range_all(o.win);
            o.select(r);
        }
        o.editor_cmd(command, args);

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
        o.select(null);
    }
    o.undo = function() {
        o.select(o.range);
        o.editor_cmd('undo');
    }

    o.get_range = function() {
        s = o.win.getSelection();
        if(s.rangeCount) return o.win.getSelection().getRangeAt(0).cloneRange();
        else return null;
    }

    // Select all text in document.body
    o.range_all = function(w) {
        var r = w.document.createRange();
        r.setStart(w.document.body, 0);
        var last = w.document.body;
        while(last.lastChild) last = last.lastChild;
        r.setEnd(last, last.length ? last.length : 0);
        return r;
    }

    o.select = function(range) {
        s = o.win.getSelection();
        s.removeAllRanges();
        if(range) s.addRange(range);
    }

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
        } else {
            o.doc.designMode = 'off';
            o.iframe.blur();
        }
    }

    o.get_content = function() {
        o.doc.normalize();
        return $(o.doc.body).html();

        //var attr = [];
        //var data = [];
        //var text_node = function(n) {
        //    if(n.nodeType == Node.TEXT_NODE) {
        //        data.push(n.data);

        //        var attrs = {};
        //        var p = n.parentNode;
        //        if(p.style.fontSize)   attrs['font-size'  ] = p.style.fontSize;
        //        if(p.style.fontFamily) attrs['font-family'] = p.style.fontFamily;
        //        if(p.style.fontFamily) attrs['color'      ] = p.style.color;
        //        if(p.style.fontFamily) attrs['font-weight'] = p.style.fontWeight;
        //        if(p.style.fontFamily) attrs['font-style' ] = p.style.fontStyle;
        //        if($(p).attr('href'))  attrs['href'       ] = $(p).attr('href');
        //        attr.push(attrs);
        //    } else if(n.childNodes) {
        //        for(p in n.childNodes) text_node(n.childNodes[p]);
        //    }
        //}
        //text_node(o.doc.body);

        //return { data : data, attr : attr };
    }

    o.set_content = function(c) {
        return $(o.doc.body).html(c);
    }

    o.create_editor();
    return o;
}

// For the color picker.
// Returns a fully saturated color in the RGB color wheel.
// This function generated lib/skin/1/saturated.png.
// The max param must be >= 1536 to get every possible fully saturated
// color in a 24 bit color space.
Hive.saturated_color = function(n, max) {
    if(!max) max = 1536;
    if(n < 0) n = 0;
    if(n > max) n = max;

    var scale = 256;
    var r = [1, 1, 0, 0, 0, 1, 1];
    var g = [0, 1, 1, 1, 0, 0, 0];
    var b = [0, 0, 0, 1, 1, 1, 0];

    var linear_interp = function(points) {
        var p = (n / max) * (points.length - 1);
        var p0 = Math.floor(p);
        var v = p - p0;
        if(p0 == points.length - 1) p0--;
        delta = points[p0 + 1] * scale - points[p0] * scale;
        return delta * v + points[p0] * scale;
    }

    return [linear_interp(r), linear_interp(g), linear_interp(b)]; 
}
