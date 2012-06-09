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
    
    o.stack = [];
    Hive.makeShuffleable(o.stack);
    o.restack = function() {
        for(var i = 0; i < o.stack.length; i++)
            if(o.stack[i]) o.stack[i].layer(i);
    }
    
    o.add = function(app) {
        var i = o.length;
        o.push(app);
        if(app.layer() === null || o.stack[app.layer()]) o.stack.push(app);
        else o.stack[app.layer()] = app;
        o.restack();
        return i;
    }
    
    o.remove = function(app) {
        array_delete(o, app);
        array_delete(o.stack, app);
    }
    
    init(o);
    return o;
}
Hive.OpenApps = Hive.Apps();

Hive.has_drag_move = function(o) {
    o.pos = function(){
        return [ parseInt(o.div.position().left), parseInt(o.div.position().top) ];
    }

    o.move_start = function(){ o.ref_pos = o.pos(); };
    o.move = function (e, dd, shallow) {
        if( !o.ref_pos ) return;
        var delta = [dd.deltaX, dd.deltaY];
        if( e.shiftKey ) delta[ Math.abs(dd.deltaX) > Math.abs(dd.deltaY) ? 1 : 0 ] = 0;
        o.pos_set([ o.ref_pos[0] + delta[0], o.ref_pos[1] + delta[1] ]);
    };
    o.div.drag('start', o.move_start).drag(o.move);
};

// Creates generic initial object for all App types.
Hive.App = function(initState) {
    var o = {};
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
        if( o.controls ) o.controls.remove();
        o.apps.remove(o);
    };
    
    o.stackBottom = function() {
        o.apps.stack.moveBottom(o.layer());
        o.apps.restack();
    }
    o.stackTop = function() {
        o.apps.stack.moveTop(o.layer());
        o.apps.restack();
    }
    
    o.make_controls = [];

    var focused = false;
    o.focused = function() { return focused };
    o.focus = Funcs(function() {
        if(focused) return;
        focused = true;
    }, function(){ return !o.focused()} );
    o.unfocus = Funcs(function() {
        if(!focused) return;
        focused = false;
    }, o.focused);

    o.keyPress = function(e){
        var nudge = function(dx,dy){
            return function(){
                var refPos = o.pos();
                if (e.shiftKey) {dx = 10*dx; dy = 10*dy;}
                o.pos_set([refPos[0] + dx, refPos[1] + dy]);
                e.preventDefault();
            }
        }

        var handlers = {
            37: nudge(-1,0)   // Left
            , 38: nudge(0,-1) // Up
            , 39: nudge(1,0)  // Right
            , 40: nudge(0,1)  // Down
        }
        handlers[e.keyCode] && handlers[e.keyCode]();
    };

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
    var win = $(window);
    o.sf = function() { return 1000 / win.width(); }
    o.pos_set = function( pos ){
        o.div.css({ 'left' : pos[0], 'top' : pos[1] });
        o.state.position = [pos[0] * o.sf(), pos[1] * o.sf()];
        if(o.controls) o.controls.pos_set([ pos[0], pos[1] + 50 ]);
    }
    o.pos_n = function(dims) {
        o.div.css({left: Math.round(dims[0] * 1/o.sf()), top: Math.round(dims[1] * 1/o.sf()) })
    }
    o.pos_center = function() {
        var dims = o.dims();
        var pos = o.pos();
        return [ pos[0] + dims[0] / 2, pos[1] + dims[1] / 2 ];
    }
    o.dims = function(dims) {
        if(typeof(dims) == 'undefined') return [ o.div.width(), o.div.height() ];
        else {
            o.div.width(dims[0]); o.div.height(dims[1]);
            o.state.dimensions = [dims[0] * o.sf(), dims[1] * o.sf()];
            if(o.controls) o.controls.layout();
        }
    }
    o.dims_n = function(dims) {
        o.div.width(Math.round(dims[0] * 1/o.sf()));
        o.div.height(Math.round(dims[1] * 1/o.sf()));
    }
    o.scale = function(scale) {
        s = 1000 / win.width();
        o.state.scale = scale * s;
        //o.div.css('font-size', scale + 'em');
    }
    o.scale_n = function(s) { o.scale(s * 1/o.sf()) }
    o.center = function(offset) {
        var pos = [win.width() / 2 - o.dims()[0] / 2 + win.scrollLeft(),
            win.height() / 2 - o.dims()[1] / 2 + win.scrollTop()]
        if (typeof(offset) != "undefined") { pos = arrayAddition(pos, offset) };
        o.pos_set(pos);
    }

    o.copy = function( offset ){
        if( !offset ) offset = [ 0, o.dims()[1] + 20 ];
        var state = o.getState();
        state.copy = true;
        var cp = Hive.App(state);
        var pos = o.pos();
        cp.pos_set([ pos[0] + offset[0], pos[1] + offset[1] ]);
        return cp;
    };

    o.opacity = function(s) {
        if(typeof(s) == 'undefined')
            return (o.state.opacity === undefined ? 1 : o.state.opacity);
        o.state.opacity = s;
        o.content_element.css('opacity', s);
    }

    o.load = Funcs(function() {
        o.opacity(o.state.opacity);
        if(o.state.load) o.state.load(o);
        delete o.state.load;
        delete o.state.create;
        delete o.state.copy;
    });

    Hive.App.has_resize(o);

    // initialize
    o.div = $('<div class="ehapp">');
    Hive.has_drag_move( o );
    o.div.click(function(e) { return Hive.Selection.app_click(o, e) });
    o.move_init = function(e) { return Hive.Selection.app_drag_init(o, e) };
    o.div.drag('init', o.move_init)
    $('#content').append(o.div);
    o.pos_n(o.state.position);
    o.dims_n(o.state.dimensions);
    o.layer(o.layer());
      
    o.type(o); // add type-specific properties
    o.index = o.apps.add(o); // add to apps collection

    return o;
}

// Generic widgets for all App types. This objects is responsible for the
// selection border, and all the buttons surounding the App when selected, and for
// these button's behavior.  App specific behavior is added by
// Hive.App.Foo.Controls function, and a list of modifiers in app.make_controls
Hive.Controls = function(app, multiselect) {
    if(app.controls) {
        // Check if existing controls are same type as requested
        if(app.controls.multiselect == multiselect) return;
        else app.controls.remove(); // otherwise destroy them and reconstruct requested type
    }
    var o = app.controls = {};
    o.app = app;
    o.multiselect = multiselect;

    o.remove = function() {
        o.div.remove();
        o.app.controls = false;
    };

    o.pos_set = function( pos ){ o.div.css({ 'left' : pos[0], 'top' : pos[1] }); };
    o.pos_update = function(){
        var p = o.app.pos();
        o.div.css({ 'left': p[0], 'top': p[1] + 50 });
    };
    o.dims = function() {
        var dims = o.app.dims();
        if(dims[0] < 135) dims[0] = 135;
        if(dims[1] < 40) dims[1] = 40;
        return dims;
    };

    o.layout = function() {
        o.pos_update();
        var dims = o.dims(), p = o.padding, ad = o.app.dims(),
            cx = Math.round(ad[0] / 2), cy = Math.round(ad[1] / 2), rf = ad[0] % 2,
            bw = o.border_width, outer_l = -cx -bw - p,
            outer_width = ad[0] + bw*2 + p*2, outer_height = ad[1] + p * 2 + 1;

        o.select_box.css({ left: cx, top: cy });
        o.select_borders.eq(0).css({ left: outer_l, top: -cy -bw -p, width: outer_width, height: bw });
        o.select_borders.eq(1).css({ left: cx + p -rf, top: -cy -p, height: outer_height, width: bw });
        o.select_borders.eq(2).css({ left: outer_l, top: cy + p, width: outer_width, height: bw });
        o.select_borders.eq(3).css({ left: outer_l, top: -cy -p, height: outer_height, width: bw });
        if(o.multiselect) return;

        //o.c.undo   .css({ top   : -38 - p, right  :  61 - p });
        o.c.copy   .css({ left  : dims[0] - 45 + p, top   : -38 - p });
        o.c.remove .css({ left  : dims[0] - 14 + p, top   : -38 - p });
        o.c.stack  .css({ left  : dims[0] - 78 + p, top   : dims[1] + 8 + p });
        o.c.buttons.css({ left  :  -bw - p, top : dims[1] + p + 10, width : dims[0] - 60 });
    };

    o.append_link_picker = function(d) {
        var e = $("<div class='control drawer link'><nobr><input type='text'> "
            + "<img class='hoverable' src='" + asset('skin/1/delete_sm.png')
            + "' title='Clear link'></nobr>");
        d.append(e);
        var input = e.find('input');
        var m = o.hover_menu(d.find('.button.link'), e, {
             open : function() {
                 input.focus();
                 input.val(o.app.link());
             }
            ,click_persist : input
            ,close : function() {
                input.blur();
                o.app.focus();
            }
            ,auto_close : false
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
    };

    o.appendControl = function(c) { 
        o.div.append(c); 
    };
    o.appendButton = function(c) {
        var buttons = o.div.find('.buttons');
        if (buttons.length == 0)
            buttons = $('<div class="control buttons"></div>').appendTo(o.div);
        buttons.append(c);
    }

    o.addControl = function(ctrls) { map(o.appendControl, ctrls.clone(false)); };
    o.addButton = function(ctrls) { map(o.appendButton, ctrls.clone(false)); };
    o.addControls = function(ctrls) { map(o.appendControl, ctrls.clone(false).children()); };
    o.hover_menu = function(h, d, opts) {
        return hover_menu(h, d, $.extend({offsetY : o.padding + 1}, opts)) };

    o.div = $("<div style='position: absolute; z-index: 3; width: 0; height: 0' class='controls'>");
    $('body').append(o.div);

    // add borders
    o.select_box = $("<div style='position: absolute'>");
    var border = $('<div>').addClass('select_border drag ehapp');
    o.select_borders = border.add(border.clone()).add(border.clone()).add(border.clone());
    o.select_borders.drag('init', function(e) { return Hive.Selection.app_drag_init(o.app, e) })
        .drag('start', o.app.move_start).drag(o.app.move);
    o.div.append(o.select_box.append(o.select_borders));
    o.select_box.click(function( e ){
        e.stopPropagation();
        o.app.unfocus();
    });

    o.padding = 4;
    o.border_width = 5;
    if( multiselect ){ o.padding = 1; o.border_width = 2; }
    else {
        o.addControls($('#controls_common'));
        var d = o.div;
        o.c = {};
        //o.c.undo    = d.find('.undo'   );
        o.c.remove  = d.find('.remove' );
        o.c.resize  = d.find('.resize' );
        o.c.stack   = d.find('.stack'  );
        o.c.remove.click(function() { o.app.remove() });
        o.c.copy    = d.find('.copy'   );
        o.c.copy.click( function(){ o.app.copy() });
        d.find('.stack_up').click(o.app.stackTop);
        d.find('.stack_down').click(o.app.stackBottom);

        map( function( f ){ f(o) }, o.app.make_controls );

        o.c.buttons = d.find('.buttons');
        d.find('.hoverable').each(function() { hover_add(this) });
    }

    o.layout();
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
Hive.App.has_shield = function(o, opts) {
    if (typeof(opts) == "undefined") opts = {};
    o.dragging = false;

    o.shield = function() {
        if(o.shield_div) return;
        o.shield_div = $("<div class='drag shield'>");
        o.div.append(o.shield_div);
        o.shield_div.css('opacity', 0.0);
    }
    o.unshield = function() {
        if (opts.always) return;
        if(!o.shield_div) return;
        o.shield_div.remove();
        o.shield_div = false;
    }
    o.set_shield = function(){ return o.dragging || !o.focused() }
    o.update_shield = function(){
        if(o.set_shield()) o.shield();
        else o.unshield();
    }

    o.focus.add(o.update_shield);
    o.unfocus.add(o.update_shield);

    var start = function(){
        o.dragging = true;
        o.update_shield();
    };
    var end = function(){
        o.dragging = false;
        o.update_shield();
    }
    o.div.drag('start', start).drag('end', end);
    o.make_controls.push( function(o){
        o.div.find('.drag').drag('start', start).drag('end', end);
    } );
};

Hive.App.has_resize = function(o) {
    var dims_ref;
    o.resize_start = function(){ dims_ref = o.dims() };
    o.resize = function(delta){ o.dims( o.resize_to(delta) ); };
    o.resize_to = function(delta){ return [ dims_ref[0] + delta[0], dims_ref[1] + delta[1] ]; }

    function controls(o) {
        var common = $.extend({}, o);

        o.addControl($('#controls_misc .resize'));
        o.c.resize = o.div.find('.resize');

        o.layout = function() {
            common.layout()
            var p = o.padding;
            var dims = o.dims();
            o.c.resize .css({ left  : dims[0] -18 + p, top   : dims[1] - 20 + p });
        }

        o.c.resize.drag('start', function(e, dd) {
            o.drag_target = e.target;
            o.drag_target.busy = true;
            o.app.resize_start();
        });
        o.c.resize.drag( function(e, dd){ o.app.resize([ dd.deltaX, dd.deltaY ]); } );
        o.c.resize.drag( 'end', function(e, dd){ o.drag_target.busy = false; } );

        return o;
    }
    o.make_controls.push(controls);
}

Hive.App.has_resize_h = function(o) {
    o.resize_h = function(dims) {
        o.dims(dims);
        return o.dims([dims[0], o.calcHeight()]);
    }

    o.refresh_size = function() {
        o.resize_h(o.dims());
    };

    function controls(o) {
        var common = $.extend({}, o);

        o.addControl($('#controls_misc .resize_h'));
        o.c.resize_h = o.div.find('.resize_h');
        o.refDims = null;

        o.layout = function() {
            common.layout()
            var p = o.padding;
            var dims = o.dims();
            o.c.resize_h.css({ left: dims[0] -18 + o.padding, top: Math.min(dims[1] / 2 - 20,
                dims[1] - 54) });
        }

        // Dragging behavior
        o.c.resize_h.drag('start', function(e, dd) {
            o.refDims = o.app.dims();
            o.drag_target = e.target;
            o.drag_target.busy = true;
            o.app.div.drag('start');
        }).drag('end', function(e, dd) {
            o.drag_target.busy = false;
            o.app.div.drag('end');
        }).drag(function(e, dd) { 
            o.app.resize_h([ o.refDims[0] + dd.deltaX, o.refDims[1] ]);
        });

        return o;
    }
    o.make_controls.push(controls);
}


// This App shows an arbitrary single HTML tag.
Hive.App.Html = function(o) {
    var common = $.extend({}, o);

    o.content = function(c) {
        if(typeof(c) != 'undefined') 
        return o.embed.outerHTML();
    }

    o.content_element = $(o.state.content).addClass('content');
    o.div.append(o.content_element);
    if(    o.content_element.is('object')
        || o.content_element.is('embed')
        || o.content_element.is('iframe'))
    {
        Hive.App.has_shield(o, {always: true});
        o.set_shield = function(){ return true; }
        o.shield();
    }

    function controls(o) {
        var common = $.extend({}, o);

        var d = o.div;
        d.find('.resize').drag('start', function(e, dd) { o.refDims = o.app.dims(); });
        d.find('.resize').drag(function(e, dd) {
            //cos(atan2(x, y) - atan2(w, h))
            o.app.resize([o.refDims[0] + dd.deltaX, o.refDims[1] + dd.deltaY]);
        });

        o.addControls($('#controls_html'));
        // TODO: create interface for editing HTML
        // d.find('.render').click(o.app.toggle_render);

        return o;
    }
    o.make_controls.push(controls);

    setTimeout(function(){ o.load(); }, 100);

    return o;
}
Hive.registerApp(Hive.App.Html, 'hive.html');

var is_chrome = navigator.userAgent.toLowerCase().indexOf('chrome') > -1;

// Contains an iframe that has designMode set when selected
Hive.App.Text = function(o) {
    var common = $.extend({}, o);
    
    Hive.App.has_resize_h(o);

    var content = o.state.content;
    o.content = function(content) {
        if(typeof(content) != 'undefined') {
            if(content == null || content == '') o.rte.setHtml(false, ' '); // seems to avoid giant or invisible cursor bug in FF
            else o.rte.setHtml(false, content);
        }
        return o.rte.getCleanContents();
    }

    var edit_mode = false;
    o.edit_mode = function(mode) {
        if (mode === edit_mode) return;
        if (mode) {
            o.rte.makeEditable();
            o.content_element.bind('mousedown keydown', function(e){ e.stopPropagation(); });
            edit_mode = true;
        }
        else {
            o.rte.makeUneditable();
            o.content_element.unbind('mousedown keydown');
            edit_mode = false;
        }
    }
    o.focus.add(function(){ o.edit_mode(true); });
    o.unfocus.add(function(){ o.edit_mode(false); });

    // focus and unfocus handlers for set_shield must be added after handlers that set edit_mode

    o.link = function(v) {
        if(typeof(v) == 'undefined') return o.rte.get_link();
        v = v.trim();
        if(!v) o.rte.edit('unlink');
        else o.rte.edit('createlink', v);
    }

    o.calcHeight = function() {
        return o.content_element.height();
    }

    var scale = o.state.scale ? o.state.scale * 1/o.sf() : 1;
    o.scale = function(s) {
        if(typeof(s) == 'undefined') return scale;
        scale = s;
        o.div.css('font-size', s + 'em');
        common.scale(s);
    };

    // New scaling code
    var scale_ref, dims_ref;
    o.resize_start = function(){
        scale_ref = scale;
        dims_ref = o.dims();
    };
    o.resize = function(delta) {
        var scale_by = Math.min( (dims_ref[0] + delta[0]) / dims_ref[0],
            (dims_ref[1] + delta[1]) / dims_ref[1] );
        var dims = [ dims_ref[0] * scale_by, dims_ref[1] * scale_by ];
        o.scale( scale_ref * scale_by );
        o.dims( dims );
    };
    
    o.load = function() {
        o.scale_n(scale);
        o.content(content);
        common.load();
        o.refresh_size();
    }

    function controls(o) {
        var common = $.extend({}, o), d = o.div;

        o.addControls($('#controls_text'));

        o.link_menu = o.append_link_picker(d.find('.buttons'));

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

        o.hover_menu(d.find('.button.fontname'), d.find('.drawer.fontname'));
        //cmd_buttons('.fontname .option', function(v) { o.app.rte.css('font-family', v) });

        Hive.append_color_picker(d.find('.drawer.color'),
            function(v) { o.app.rte.edit('forecolor', v) });
        o.color_menu = o.hover_menu(d.find('.button.color'), d.find('.drawer.color'),
            { auto_close : false });

        //cmd_buttons('.button.bold',   function(v) { o.app.rte.css('font-weight', '700'   , { toggle : '400'   }) });
        //cmd_buttons('.button.italic', function(v) { o.app.rte.css('font-style' , 'italic', { toggle : 'normal'}) });

        o.align_menu = o.hover_menu(d.find('.button.align'), d.find('.drawer.align'));
        //cmd_buttons('.align .option', function(v) { o.app.rte.css('text-align', v, { body : true }) });

        //cmd_buttons('.button.unformat', function(v) { o.app.rte.edit('removeformat') });

        o.close_menus = function() {
            o.link_menu.close();
            o.color_menu.close();
        }

        $('.option[cmd],.button[cmd]').each(function(i, e) { $(e).click(function() {
            o.app.rte.execCommand($(e).attr('cmd'), $(e).attr('val'))
        }); })

        // Old scaling code
        //d.find('.resize').drag('start', function(e, dd) {
        //    o.refDims = o.app.dims();
        //    o.refScale = o.app.scale();
        //    o.dragging = e.target;
        //    o.dragging.busy = true;
        //    o.app.div.drag('start');
        //});
        //o.refDims = null;
        //o.c.resize.drag(function(e, dd) {
        //    //cos(atan2(x, y) - atan2(w, h))
        //    o.app.scale(o.refScale * (o.refDims[1] + dd.deltaY) / o.refDims[1]);
        //    var div = o.app.content_element.contents().find('body').children('div').first()
        //    var height = o.app.calcHeight();
        //    o.app.resize([o.refDims[0] + dd.deltaX, height]);
        //    e.stopPropagation();
        //});
        //d.find('.resize').drag('end', function(e, dd) {
        //    o.dragging.busy = false;
        //    o.app.div.drag('end');
        //    e.stopPropagation();
        //});

        return o;
    }
    o.make_controls.push(controls);

    o.div.addClass('text');
    o.content_element = $('<div></div>');
    o.content_element.attr('id', Hive.randomStr()).css('width', '100%');
    o.div.append(o.content_element);
    o.rte = new goog.editor.SeamlessField(o.content_element.attr('id'));
    o.rte.registerPlugin(new goog.editor.plugins.BasicTextFormatter());
    goog.events.listen(o.rte, goog.editor.Field.EventType.DELAYEDCHANGE, o.refresh_size);
    
    setTimeout(function(){ o.load(); }, 100);
    return o;
}
Hive.registerApp(Hive.App.Text, 'hive.text');


Hive.App.has_rotate = function(o) {
    var angle = o.state.angle ? o.state.angle : 0;
    o.angle = function(a) {
        if(typeof(a) == 'undefined') return angle;
        angle = a;
        o.content_element.rotate(a);
    }
    o.load.add(function() { if(o.angle()) o.angle(o.angle()) });

    function controls(o) {
        var common = $.extend({}, o), refAngle = null, offsetAngle = null;

        o.getAngle = function(e) {
            var cpos = o.app.pos_center();
            var x = e.pageX - cpos[0];
            var y = e.pageY - cpos[1];
            return Math.atan2(y, x) * 180 / Math.PI;
        }

        o.layout = function() {
            common.layout();
            var p = o.padding;
            var dims = o.dims();
            o.rotateHandle.css({ left: dims[0] - 20 + o.padding,
                top: Math.min(dims[1] / 2 - 20, dims[1] - 54) });
        }

        o.rotateHandle = $("<img class='control rotate hoverable drag' title='Rotate'>")
            .attr('src', asset('skin/1/rotate.png'));
        o.appendControl(o.rotateHandle);

        var angleRound = function(a) { return Math.round(a / 45)*45; }
        o.rotateHandle.drag('start', function(e, dd) {
            refAngle = angle;
            offsetAngle = o.getAngle(e);
        }).drag(function(e, dd) {
            angle = o.getAngle(e) - offsetAngle + refAngle;
            if (e.shiftKey && Math.abs(angle - angleRound(angle)) < 10) angle = angleRound(angle);
            o.app.angle(angle);
            o.select_box.rotate(angle);
        });
        o.select_box.rotate(o.app.angle());

        return o;
    }
    o.make_controls.push(controls);
}

//Hive.App.has_percent_

Hive.App.has_slider_menu = function(o, handle, callback, init) {
    function controls(o) {
        var common = $.extend({}, o);

        var input = $("<input class='control drawer' type='text' size='2'>");
        o.div.find('.buttons').append(input);
        var m = o.hover_menu(o.div.find(handle), input,
            { open : function() { input.val(init()); input.focus().select(); } });
        input.keyup(function(e) {
            if(e.keyCode == 13) { input.blur(); m.close(); }
            var v = parseFloat(input.val());
            callback(v === NaN ? init() : v);
        });

        return o;
    }
    o.make_controls.push(controls);
}
Hive.App.has_opacity = function(o) {
    function controls(o) {
        var common = $.extend({}, o);

        o.addButton($('#controls_misc .opacity'));
        o.c.opacity = o.div.find('.opacity');

        return o;

    }
    o.make_controls.push(controls);
    Hive.App.has_slider_menu(o, '.opacity', function(v) { o.opacity(v/100) },
        function() { return Math.round(o.opacity() * 100) });
}
    
Hive.App.has_color = function(o, opts) {
    function controls(o) {
        var common = $.extend({}, o);

        o.addButton($('#controls_misc .button.color'));
        o.addButton($('#controls_misc .drawer.color'));
        o.c.color = o.div.find('.button.color');
        o.c.color_drawer = o.div.find('.drawer.color');

        var callback = function(color){
            o.app.state.color = color;
            opts.callback(color);
        }
        Hive.append_color_picker(o.c.color_drawer, callback, o.app.state.color);
        o.hover_menu(o.c.color, o.c.color_drawer, { auto_close : false });
        return o;

    }
    o.make_controls.push(controls);
}


Hive.App.Image = function(o) {
    var common = $.extend({}, o);

    o.content = function(content) {
        if(typeof(content) != 'undefined') o.image_src(content);
        return o.img.attr('src');
    }

    o.link = function(v) {
        if(typeof(v) == 'undefined') return o.state.href;
        o.state.href = v;
    }

    o.image_src = function(src) {
        if(o.img) o.img.remove();
        o.content_element = o.img = $("<img class='content drag'>");
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
            var w = o.imageWidth > $(window).width() * 0.8 ?
                $(window).width() * 0.8 : o.imageWidth;
            o.dims([w,w]);
        }
        o.img.css('width', '100%');
        o.img.show();
        common.load();
    }

    o.resize = function(delta) {
        var dims = o.resize_to(delta);
        if(!dims[0] || !dims[1]) return;
        var newWidth = dims[1] * o.aspectRatio;
        var dims = newWidth < dims[0] ? [newWidth, dims[1]] : [dims[0], dims[0] / o.aspectRatio];
        o.dims(dims);
    }

    function controls(o) {
        var common = $.extend({}, o);

        o.addControls($('#controls_image'));
        o.append_link_picker(o.div.find('.buttons'));
        o.div.find('.button.set_bg').click(function() { Hive.set_bg_img(o.app.getState()) });

        return o;
    };
    o.make_controls.push(controls);
    Hive.App.has_rotate(o);
    Hive.App.has_opacity(o);

    o.image_src(o.state.content);

    return o;
}
Hive.registerApp(Hive.App.Image, 'hive.image');


Hive.App.Rectangle = function(o) {
    var common = $.extend({}, o);

    var state = {};
    o.content = function(content) { return $.extend({}, state); };
    o.set_css = function(props) {
        props['background-color'] = props.color || props['background-color'];
        o.content_element.css(props);
        $.extend(state, props);
        if(o.controls) o.controls.layout();
    }
    o.css_setter = function(css_prop) { return function(v) {
        var ps = {}; ps[css_prop] = v; o.set_css(ps);
    } }

    function controls(o) {
        var common = $.extend({}, o);
        
        o.addControls($('#controls_rectangle'));
        Hive.append_color_picker(o.div.find('.drawer.fill'), o.app.css_setter('color'), state.color);
        o.hover_menu(o.div.find('.button.fill'), o.div.find('.drawer.fill'),
            { auto_close : false });
        //Hive.append_color_picker(o.div.find('.drawer.stroke'), function(v) {
        //    if(!state['border-width']) o.app.set_css({'border-width':'5px'});
        //    o.layout();
        //    o.app.set_css({'border-color':v});
        //}, state['border-color']);
        //o.hover_menu(o.div.find('.button.stroke'), o.div.find('.drawer.stroke'), { auto_close : false });

        return o;
    };
    o.make_controls.push(controls);
    Hive.App.has_rotate(o);
    Hive.App.has_opacity(o);
    //Hive.App.has_slider_menu(o, '.bwidth', function(v) { o.set_css({'border-width':v+'px'}); }, function() { return parseInt(state['border-width']) });
    Hive.App.has_slider_menu(o, '.rounding', function(v) { o.set_css({'border-radius':v+'px'}); },
        function() { return parseInt(state['border-radius']) });

    o.content_element = $("<div class='content rectangle drag'>").appendTo(o.div);
    o.set_css(o.state.content);
    setTimeout(function(){o.load()},1);

    return o;
};
Hive.registerApp(Hive.App.Rectangle, 'hive.rectangle');


Hive.App.Sketch = function(o) {
    var common = $.extend({}, o);

    var state = {};
    o.content = function() { return {
         'src' : o.win.get_image()
        ,'fill_color' : o.win.COLOR
        ,'brush' : o.win.get_brush()
        ,'brush_size' : o.win.BRUSH_SIZE
    }; };
    o.set_content = function(c) {
        if(c.src) o.win.set_image(c.src);
        if(c.brush) o.win.set_brush(c.brush);
        if(c.fill_color) o.win.COLOR = c.fill_color;
        if(c.brush_size) o.win.BRUSH_SIZE = c.brush_size;
    };

    o.resize = function(delta) {
        var dims = o.resize_to(delta), aspect = o.win.SCREEN_WIDTH / o.win.SCREEN_HEIGHT,
            width = Math.max( dims[0], Math.round(dims[1] * aspect) );
        o.dims([ width, Math.round(width / aspect) ]);
    };

    o.focus.add(function() { o.win.focus() });

    function controls(o) {
        var common = $.extend({}, o);
        
        o.addControls($('#controls_sketch'));
        Hive.append_color_picker(o.div.find('.drawer.fill'), o.app.fill_color, '#000000');

        o.hover_menu(o.div.find('.button.fill'), o.div.find('.drawer.fill'),
            { auto_close : false });
        o.hover_menu(o.div.find('.button.brush'), o.div.find('.drawer.brush'));
        o.div.find('.drawer.brush .option').each(function(i, e) { $(e).click(function() {
            o.app.win.set_brush($(e).attr('val'));
        }); })

        return o;
    };
    o.make_controls.push(controls);
    Hive.App.has_rotate(o);
    Hive.App.has_opacity(o);
    Hive.App.has_shield(o);
    Hive.App.has_slider_menu(o, '.size', function(v) { o.win.BRUSH_SIZE = v; },
        function() { return o.win.BRUSH_SIZE; });

    o.content_element = $('<iframe>').attr('src', asset('harmony_sketch.html'))
        .css({'width':'100%','height':'100%','position':'absolute'});
    o.iframe = o.content_element.get(0);
    o.fill_color = function(hex, rgb) { o.win.COLOR = rgb; }
    o.div.append(o.content_element);
    o.content_element.load(function() {
        o.win = o.content_element.get(0).contentWindow;
        o.load();
        if(o.state.content) o.set_content(o.state.content);
    });
    o.update_shield();

    return o;
};
Hive.registerApp(Hive.App.Sketch, 'hive.sketch');

Hive.App.Audio = function(o) {
    var common = $.extend({}, o);

    o.content = function() {
        return o.content_element.outerHTML();
    };

    o.resize = function(delta) {
        var dims = o.resize_to( delta );
        if(!dims[0] || !dims[1]) return;

        //Hack that forces play/pause image element to resize, at least on chrome
        //o.div.find('.jp-controls img').click();
        //o.player.jPlayer("playHead", 0);

        // enforce 25px < height < 400px and minimum aspect ratio of 2.5:1
        var sf = o.sf();
        if (dims[1] * sf < 25) dims[1] = 25 / sf;
        if (dims[1] * sf > 400) dims[1] = 400 / sf;
        if (dims[0] < 2.5 * dims[1]) dims[0] = 2.5 * dims[1];

        o.scale(dims[1]/35);

        o.dims( dims );
    };
    //
    // Audio players always go on top
    //o.layer = function(n) {
    //    common.layer(n + 1000);
    //}

    o.set_color = function(color){ o.div.find('.jp-play-bar, .jp-interface')
        .css('background-color', color); };

    o.scale = function(s) {
        if(typeof(s) == 'undefined') return scale;
        scale = s;
        o.div.css('font-size', s + 'em');
        var height = o.div.find('.jp-interface').height();
        o.div.find('.jp-button').width(height).height(height);

        common.scale(s);
    }

    o.load = function(){
        o.dims( o.dims() );
        //o.scale_n(1);
        common.load()
    }

    // Mixins
    Hive.App.has_shield(o, {always: true});
    Hive.App.has_opacity(o);
    Hive.App.has_color(o, { callback: function(val){
        o.div.find('.jp-play-bar, .jp-interface').css('background-color', val); } });

    // Initialization
    if(o.state.create) o.dims([200, 35]);

    // TODO: get title, filename, and track length from state and show it in skin
    var audio_data = o.state.type_specific;
    o.content_element = $(o.state.create || o.state.copy ?
            $.jPlayer.skin.minimal(o.state.src, Hive.randomStr()) : o.state.content )
        .addClass('content')
        .css('position', 'relative')
        .css('height', '100%');
    o.div.append(o.content_element).attr('title', audio_data ?
            [audio_data.artist, audio_data.album, audio_data.title].join(' - ') : '');

    o.set_color(o.state.color);

    o.set_shield = function() { return true; }
    o.update_shield();
    setTimeout(function(){ o.load(); }, 100);
    return o;
}
Hive.registerApp(Hive.App.Audio, 'hive.audio');


Hive.Selection = function(){
    var o = Hive.Selection;
    o.elements = [];
    o.count = function(){ return o.elements.length; };
    o.each = function(fn){ $.each(o.elements, fn) };
    o.make_controls = [];
    o.dragging = false;

    o.multi_test = function(e) { return e.shiftKey || e.ctrlKey; }

    o.app_drag_init = function (app, e) {
        var drag_items = [];
        if( o.selected( app ) || app === o ) {
            $.merge( drag_items, o.divs() );
            if( o.controls ) $.merge( drag_items, o.controls.div );
        }
        return drag_items;
    };
    o.app_click = function (app, e) {
        // Prevent window click handler from unfocusing everything
        e.stopPropagation();

        if( o.multi_test(e) ){
            if( o.selected( app ) ) o.unfocus(app);
            else o.push(app);
        }
        else o.update([ app ]);
    }

    o.app_select = function(app, multi) {
        if(multi) app.unfocus();
        else app.focus();
        Hive.Controls(app, multi);
    };
    o.app_unselect = function(app, multi) {
        app.unfocus();
        if(app.controls) app.controls.remove();
    };

    o.update = function(apps){
        var multi = o.dragging || (apps.length > 1);

        // Previously unfocused elements that should be focused
        $.each( apps, function(i, el){ o.app_select( el, multi ); } );
        // Previously focused elements that should be unfocused
        o.each( function(i, el){ if( !inArray( apps, el ) ) o.app_unselect( el, multi ) } );

        o.elements = $.merge([], apps);

        if(!o.dragging && multi) {
            Hive.Controls(o, false);
            o.controls.layout();
        }
        if( apps.length <= 1 && o.controls ) o.controls.remove();
    };
    o.unfocus = function(app){
        if( app ) o.update( $.grep( o.elements, function(el){ return el !== app } ) );
        else o.update( [] );
    };
    o.push = function(element) { 
        o.update(o.elements.concat([element]));
    };
    o.select = function( app_or_apps ){
        return o.update( $.isArray(app_or_apps) ? app_or_apps : [app_or_apps] );
    }
    o.selected = function( app ){ return inArray( o.elements, app ); };

    o.divs = function(){
        return $.map(o.elements, function(a){ return a.div[0] });
    }

    o.bounds = function() { 
        return {
            left:   Array.min($.map(o.elements, function(el){ return el.pos()[0]})),
            right:  Array.max($.map(o.elements, function(el){ return el.pos()[0] + el.dims()[0]})),
            top:    Array.min($.map(o.elements, function(el){ return el.pos()[1]})),
            bottom: Array.max($.map(o.elements, function(el){ return el.pos()[1] + el.dims()[1]}))
        };
    };
    o.pos = function(){
        var bounds = o.bounds();
        return [bounds.left, bounds.top];
    };
    o.dims = function(){
        var bounds = o.bounds();
        return [bounds.right - bounds.left, bounds.bottom - bounds.top];
    };

    o.update_focus = function(event){
        // TODO: remove this offset when we base app positions on 0 = top of window
        var nav_bar_offset = 50;
        var select = { top: o.drag_pos[1] - nav_bar_offset, right: o.drag_pos[0] + o.drag_dims[0],
            bottom: o.drag_pos[1] + o.drag_dims[1] - nav_bar_offset, left: o.drag_pos[0] };
        o.old_selection = o.new_selection;
        o.new_selection = $.grep(Hive.OpenApps, function(el){
            var dims = el.dims();
            var pos = el.pos();
            return (select.top <= pos[1] && select.left <= pos[0]
                && select.right >= pos[0] + dims[0] && select.bottom >= pos[1] + dims[1]);
        });
        if (o.old_selection.length != o.new_selection.length){
            o.update($.unique($.merge(o.new_selection, o.initial_elements)));
        }
    };

    o.dragstart = function(e, dd) {
        // Don't do anything if user is dragging one of the controls. This
        // should probably be handled with jQuery.event.stopPropagation, but we
        // are triggering drag events on app div from the drag handler for the
        // controls, so the situation is more complicated.
        if ($(e.target).hasClass('ehapp')) return;

        o.new_selection = [];
        o.dragging = true;
        $('.app_select').remove();
        o.div = $("<div class='app_select'>");
        o.select_box = $("<div class='select_box border selected dragbox'>")
            .css({position: 'relative', padding: 0, left: '-5px', top: '-5px'});
        $(document.body).append(o.div);
        o.div.append(o.select_box);
        o.start = [e.pageX, e.pageY];
        if (e.shiftKey || e.ctrlKey){
            o.initial_elements = $.extend({}, o.elements);
        } else {
            o.initial_elements = [];
            o.unfocus();
        }
    };
    o.drag = function(e, dd) {
        if (!o.dragging || $(e.target).hasClass('ehapp')) return;

        o.drag_dims = [Math.abs(dd.deltaX), Math.abs(dd.deltaY)];
        o.drag_pos = [dd.deltaX < 0 ? e.pageX : o.start[0], dd.deltaY < 0 ? e.pageY : o.start[1]];
        o.div.css({ left : o.drag_pos[0], top : o.drag_pos[1],
            width : o.drag_dims[0], height : o.drag_dims[1] });
        o.update_focus(e);
    };
    o.dragend = function (e, dd) {
        if( !o.drag_dims ) return;
        o.dragging = false;
        if (o.pos) { o.update_focus(); }
        if (o.div) o.div.remove();
        o.update(o.elements);
    }

    o.copy = function(){
        var offset = [ 0, o.dims()[1] + 20 ]
        var new_apps = $.map(o.get_stack(), function( el ){ return el.copy( offset ) } );
        o.update(new_apps);
    }
    o.remove = function(){
        var sel = $.merge( [], o.elements );
        o.unfocus();
        $.each( sel, function(i, el){ el.remove() } );
    };

    Hive.App.has_resize( o );
    o.resize_start = function(){
        o.pos_ref = o.pos();
        o.dims_ref = o.dims();
        o.each( function(i, el){
            var pos = el.pos();
            el.pos_ref = [ pos[0] - o.pos_ref[0], pos[1] - o.pos_ref[1] ];
            el.dims_ref = el.dims();
            el.scale_ref = el.scale();
        } );
    };
    o.resize = function(delta){
        var scale_by = Math.max( (o.dims_ref[0] + delta[0]) / o.dims_ref[0],
            (o.dims_ref[1] + delta[1]) / o.dims_ref[1] );
        var dims = [ o.dims_ref[0] * scale_by, o.dims_ref[1] * scale_by ];
        o.each( function(i, el){
            el.pos_set([ el.pos_ref[0] * scale_by + o.pos_ref[0],
                el.pos_ref[1] * scale_by + o.pos_ref[1] ]);
            el.dims([ el.dims_ref[0] * scale_by, el.dims_ref[1] * scale_by ]);
            el.scale( el.scale_ref * scale_by );
        } );
        o.controls.layout();
    };

    o.get_stack = function(){
        return o.elements.sort( function( a, b ){ a.layer() - b.layer() } );
    };
    o.stackTop = function(){
        $.each( o.get_stack(), function( i, el ){ el.stackTop() } )
    };
    o.stackBottom = function(){
        $.each( o.get_stack().reverse(), function( i, el ){ el.stackBottom() } )
    };

    o.make_controls.push( function( o ){
        Hive.has_drag_move( o );
        o.pos = function(){ var p = o.app.pos(); return [ p[0], p[1] + 50 ]; }
        o.padding = 7;
    } );

    $(function() {
        $('#grid_guide').drag(o.drag).drag('start', o.dragstart).drag('end', o.dragend);

        // Fallthrough click handler that unfocuses all apps if user clicks on background.
        $(window).click(function(e) {
            if(!Hive.Selection.count()) return;
            var hit = false;
            Hive.Selection.each(function(i,el){
                if( $.contains(el.div.get(0), e.target)
                    || (el.controls && $.contains(el.controls.div.get(0), e.target))
                ) hit = true;
            });
            if( o.controls && $.contains( o.controls.div.get(0), e.target ) ) hit = true;
            if (!hit) Hive.Selection.unfocus();
        });

        $(document).keydown(function(e){ 
            o.each(function(i, el){ el.keyPress(e) });
            // TODO: improve efficiency by using o.controls.pos_set like drag handler
            // or improving o.bounds
            if(o.controls) o.controls.pos_update();
        });
    });
    return o;
};
Hive.Selection();

Array.max = function( array ){
    return Math.max.apply( Math, array );
};
Array.min = function( array ){
    return Math.min.apply( Math, array );
};

Hive.new_app = function(s, offset) {
    s.create = true;
    var load = s.load;
    s.load = function(a) {
        Hive.upload_finish();
        a.center(offset);
        a.dims( a.dims() );
        Hive.Selection.select(a);
        if(load) load(a);
    };
    Hive.App(s);
    return false;
};

Hive.new_file = function(files, opts) {
    for (i=0; i < files.length; i++) {
        var file = files[i];
        var app = $.extend({ file_id: file.file_id, file_name: file.name,
            type_specific: file.type_specific }, opts);

        if(file.mime.match(/text\/html/)){
            // Not using code for auto-embeding urls that resolve to html
            // pages because of too many problems with sites that
            // don't want to be framed. Just link to site instead.
            // app = {type: 'hive.html', content: '<iframe src="' + file.original_url + '" style="width: 100%; height: 100%;"></iframe>'};
            $.extend(app, { type: 'hive.text', content:
                $('<a>').attr('href', file.original_url).text(file.original_url).outerHTML() });
        } else if(file.mime.match(/image\/(png|gif|jpeg)/)) {
            Hive.Exp.images.push(file);
            $.extend(app, {
                 type: 'hive.image'
                ,content: file.url
            });
        } else if(file.mime.match(/audio\/mpeg/)) {
            $.extend(app, {
                src: file.url
                ,type: 'hive.audio'
            });
        } else {
            $.extend(app, { type: 'hive.text', content:
                $('<a>').attr('href', file.url).text(file.name).outerHTML() });
        }

        Hive.new_app(app, [20*i, 20*i]);
    };
    return false;
}

var main = function() {
    if (typeof(Hive.Exp.images) == "undefined" || typeof(Hive.Exp.images) == "number") {
        if (typeof(Hive.Exp.apps) == "undefined") {
            Hive.Exp.images = [];
        } else {
            Hive.Exp.images = $.map(Hive.Exp.apps, function(app){
                if ( app.type == 'hive.image' && app.file_id ) {
                    return { 
                        file_id: app.file_id, 
                        thumb: app.content + "_190x190?v=1", 
                        url: app.content
                    }
                }
            });
            if (typeof(Hive.Exp.background.url) != "undefined"){
                var image = {
                    thumb: Hive.Exp.background.url + "_190x190?v=1"
                    , url: Hive.Exp.background.url
                };
                var match = Hive.Exp.background.url.match(/[a-f0-9]+$/);
                if (match !== null) image.file_id = match[0]; // If match doesn't exists it's not on S3
                Hive.Exp.images.push(image);
            }
        }
    };
    //setInterval(Hive.set_draft, 5000);
    window.onbeforeunload = function(){
        //try { Hive.set_draft(); }
        //catch(e) { return "If you leave this page any unsaved changes to your expression will be lost."; }
        return "If you leave this page any unsaved changes to your expression will be lost.";
    };
    //var draft = Hive.get_draft();
    //if(draft) Hive.Exp = draft;

    if(/Firefox[\/\s](\d+\.\d+)/.test(navigator.userAgent) && parseInt(RegExp.$1) < 5)
        if(confirm("You're using an oldish version of Firefox. Click OK to get the newest version"))
            window.location = 'http://www.mozilla.com/en-US/products/download.html';

    if(!(/Firefox[\/\s](\d+\.\d+)/.test(navigator.userAgent) || /Chrome/.test(navigator.userAgent)))
        showDialog('#editor_browsers');

    $(document.body).filedrop({
         data : { action : 'file_create' }
        ,uploadFinished : function(i, f, data) {
            Hive.new_file(data, { 'load' : Hive.upload_finish } );
         }
        ,drop : Hive.upload_start
    });

    $(window).resize(function(e) {
        map(function(a) {
                a.pos_n(a.state.position);
                a.scale_n(a.state.scale);
                a.dims_n(a.state.dimensions);
                if( a.controls ) a.controls.layout();
            }, Hive.OpenApps);
        center($('#app_btns'), $('#nav_bg'));
        if( Hive.Selection.controls ) Hive.Selection.controls.layout();
    });
    $(window).resize();


    $('#insert_text,#text_default').click(function(e) {
        Hive.new_app({ type : 'hive.text', content : '' });
    });
    $('#text_header').click(function(e) {
        Hive.new_app({ type: 'hive.text', content: '<span style="font-weight:bold">&nbsp;</span>',
            scale : 3 });
    });


    if(!Hive.Exp.background) Hive.Exp.background = { };
    if(!Hive.Exp.background.color) Hive.Exp.background.color = '#FFFFFF';
    Hive.bg_div = $('.happfill');
    var bg_set_color = function(c) {
        Hive.bg_div.add('#bg_preview').css('background-color', c);
        Hive.Exp.background.color = c;
    };
    Hive.append_color_picker($('#color_pick'), bg_set_color, Hive.Exp.background.color);
    $('#image_background').click(function() { showDialog('#dia_edit_bg', { fade : false }); });
    $('#bg_remove').click(function() { delete Hive.Exp.background.url; Hive.set_bg_img({}); });
    $('#bg_opacity').focus(function() { $('#bg_opacity').focus().select() }).keyup(function(e) {
        Hive.Exp.background.opacity = parseFloat($(e.target).val()) / 100;
        Hive.set_bg_img(Hive.Exp.background);
    });
    var uploadErrorCallback = function(){
        Hive.upload_finish();
        alert('Sorry, your file failed to upload');
    }
    $('#bg_upload').click(function() { asyncUpload({
        start: Hive.upload_start, error: uploadErrorCallback,
        success: function(data) { 
            Hive.Exp.images.push(data);
            data['load'] = Hive.upload_finish; 
            Hive.set_bg_img(data); 
        } 
    }); });
    Hive.set_bg_img(Hive.Exp.background);
    bg_set_color(Hive.Exp.background.color);

    var new_file = function() { asyncUpload({
        multiple: true, start: Hive.upload_start, success: Hive.new_file,
        error: uploadErrorCallback
    }); };
    var new_link = function() { asyncUpload({
        start: Hive.upload_start, error: uploadErrorCallback,
        success : function(data) {
            if(data.error) { return error(); }
            var app = { type: 'hive.text', content:
                $('<a>').attr('href', data.url).text(data.name).outerHTML() };
            Hive.new_app(app);
        }
    }); };
    $('#insert_image').click(new_file);
    $('#image_upload').click(new_file);
    $('#insert_audio').click(new_file);
    $('#audio_upload').click(new_file);
    $('#insert_file' ).click(new_link);
    $('#menu_file'   ).click(new_link);

    var image_menu = hover_menu($('#insert_image'), $('#menu_image'),
        { click_persist : $('#image_embed_code'), auto_close: false});
    var image_embed_menu = hover_menu($('#image_from_url'), $('#image_embed_submenu'),
        { click_persist : $('#image_embed_code'), auto_close: false});
    //$('#image_embed_submenu').children().not('#embed_done').add('#image_from_url').click(function(e){e.stopPropagation();});
    $('#image_embed_done').click(function() {
        Hive.embed_code('#image_embed_code');
        image_embed_menu.close();
        image_menu.close();
    });

    hover_menu($('#insert_text'), $('#menu_text'));
    hover_menu($('#insert_audio'), $('#menu_audio'));
    hover_menu($('#insert_file'), $('#menu_file'));

    var embed_menu = hover_menu($('#insert_embed'), $('#menu_embed'),
        { click_persist : $('#embed_code'), auto_close : false } );
    $('#embed_done').click(function() { Hive.embed_code('#embed_code'); embed_menu.close(); });

    hover_menu($('#insert_shape'), $('#menu_shape'));
    $('#insert_shape,#shape_rectangle').click(function(e) {
        Hive.new_app({ type : 'hive.rectangle', content :
            { color : colors[24], 'border-color' : 'black', 'border-width' : 0,
                'border-style' : 'solid', 'border-radius' : 0 } });
    });
    $('#shape_sketch').click(function(e) {
        Hive.new_app({ type : 'hive.sketch', dimensions : [700, 700 / 1.6] });
    });
    
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

    var pickDefaultThumb = function(){
        if (! (Hive.Exp.thumb_file_id || Hive.Exp.thumb)) {
            var image_apps = $.map(Hive.get_state().apps, function(app){
                if (app.type == 'hive.image' && app.file_id) { return app; }
            });
            if (image_apps.length > 0){
                setThumb(image_apps[0]);
            }
        }
    };

    var setThumb = function(app){
        // Set thumb_id property for the server to find the appropriate file object
        // if a default thumb a pseudo file_id, id<10 is chosen. 
        // this should be replaced when default thumbs are handled as file objects -JDT 2012-01-13
        Hive.Exp.thumb_file_id = app.file_id;
        $('#current_thumb').attr('src',
            app.content.replace(/(amazonaws.com\/[0-9a-f]*$)/,'$1_190x190') );
    };

    hover_menu($('#btn_save'), $('#menu_save'),
        { auto_height : false, auto_close : false,
            open: pickDefaultThumb, click_persist : '#menu_save' });
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
        dia_thumbnail = showDialog('#dia_thumbnail');
        var user_thumbs = $.map(Hive.Exp.images, function(app){
           if (typeof(app.file_id) != "undefined") { // Non S3 images can't be used for thumbs
               var img = $('<img>').attr('src', app.thumb).attr('data-file-id', app.file_id);
               var e = $("<div class='thumb'>").append(img).get(0);
               return e;
           };
        });
        $('#expr_images').empty().append(user_thumbs);
        $('#dia_thumbnail .thumb img').click(function() {
            setThumb({file_id: $(this).attr('data-file-id'), content: this.src});
            dia_thumbnail.close();
            return false;
        });
    });
    
    // Automatically update url unless it's an already saved
    // expression or the user has modified the url manually
    $('#menu_save #title').bind('keydown keyup', function(){
        if (!(Hive.Exp.home || Hive.Exp._id || $('#url').hasClass('modified') )) {
            $('#url').val( $('#title').val().replace(/[^0-9a-zA-Z]/g, "-")
                .replace(/--+/g, "-").replace(/-$/, "").toLowerCase());
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
Hive.embed_code = function(element) {
    var c = $(element).val().trim(), app;

    if(m = c.match(/^https?:\/\/www.youtube.com\/.*?v=(.*)$/i)
        || (m = c.match(/src="https?:\/\/www.youtube.com\/embed\/(.*?)"/i))
        || (m = c.match(/http:\/\/youtu.be\/(.*)$/i))
    ) {
        var url = 'http://www.youtube.com/v/' + m[1]
            + '?rel=0&amp;showsearch=0&amp;showinfo=0&amp;fs=1';
        app = { type : 'hive.html', content : 
              '<object type="application/x-shockwave-flash" style="width:100%; height:100%" '
            + 'data="' + url + '"><param name="movie" value="' + url + '">'
            + '<param name="allowFullScreen" value="true">'
            + '<param name="wmode" value="opaque"/></object>' };
    }

    else if(m = c.match(/^https?:\/\/(www.)?vimeo.com\/(.*)$/i))
        app = { type : 'hive.html', content :
            '<iframe src="http://player.vimeo.com/video/'
            + m[2] + '?title=0&amp;byline=0&amp;portrait=0"'
            + 'style="width:100%;height:100%;border:0"></iframe>' };

    else if(m = c.match(/^https?:\/\/(.*)mp3$/i))
        app = { type : 'hive.audio', content : {url : c, player : minimal} }
//<object width="100%" height="100%" type="application/x-shockwave-flash" id="cover23798312_2084961807" name="cover23798312_2084961807" class="" data="http://a.vimeocdn.com/p/flash/moogalover/1.1.9/moogalover.swf?v=1.0.0" style="visibility: visible;"><param name="allowscriptaccess" value="always"><param name="allowfullscreen" value="true"><param name="scalemode" value="noscale"><param name="quality" value="high"><param name="wmode" value="opaque"><param name="bgcolor" value="#000000"><param name="flashvars" value="server=vimeo.com&amp;player_server=player.vimeo.com&amp;cdn_server=a.vimeocdn.com&amp;embed_location=&amp;force_embed=0&amp;force_info=0&amp;moogaloop_type=moogaloop&amp;js_api=1&amp;js_getConfig=player23798312_2084961807.getConfig&amp;js_setConfig=player23798312_2084961807.setConfig&amp;clip_id=23798312&amp;fullscreen=1&amp;js_onLoad=player23798312_2084961807.player.loverLoaded&amp;js_onThumbLoaded=player23798312_2084961807.player.loverThumbLoaded&amp;js_setupMoog=player23798312_2084961807.player.loverInitiated"></object>
//http://player.vimeo.com/video/                                                   13110687
//<object width="100%" height="100%" type="application/x-shockwave-flash" id="cover13110687_812701010" name="cover13110687_812701010" data="http://a.vimeocdn.com/p/flash/moogalover/1.1.9/moogalover.swf?v=1.0.0" style="visibility: visible;"><param name="allowscriptaccess" value="always"><param name="allowfullscreen" value="true"><param name="scalemode" value="noscale"><param name="quality" value="high"><param name="wmode" value="opaque"><param name="bgcolor" value="#000000"><param name="flashvars" value="server=vimeo.com&amp;player_server=player.vimeo.com&amp;cdn_server=a.vimeocdn.com&amp;embed_location=&amp;force_embed=0&amp;force_info=0&amp;moogaloop_type=moogaloop&amp;js_api=1&amp;js_getConfig=player13110687_812701010.getConfig&amp;js_setConfig=player13110687_812701010.setConfig&amp;clip_id=13110687&amp;fullscreen=1&amp;js_onLoad=player13110687_812701010.player.loverLoaded&amp;js_onThumbLoaded=player13110687_812701010.player.loverThumbLoaded&amp;js_setupMoog=player13110687_812701010.player.loverInitiated"></object>

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

    else if(c.match(/^https?:\/\//i)) {
        var error = function(data){
            alert('Sorry, failed to load url ' + c);
            Hive.upload_finish();
        };
        var callback = function(data) {
            if (data.error) {
                if(m = c.match(/^https?:\/\/(.*)(jpg|jpeg|png|gif)$/i)){
                    app = { type : 'hive.image', content : c }
                    Hive.new_app(app);
                } else {
                    return error();
                }
            }
            Hive.new_file(data, { load: Hive.upload_finish });
            $(element).val('');
        }
        Hive.upload_start();
        $.ajax(server_url, {
            data: { action: 'file_create', remote: true, url: c }
            , success: callback
            , dataType: 'json'
            , error: error
            , type: 'POST'
        });
        return;
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
    $(element).val('');
} 

// TODO: create Hive.Task which returns an object with .start() and .finish()
// to support multiple busy processes
Hive.upload_start = function() { center($('#loading').show()); }
Hive.upload_finish = function() { $('#loading').hide(); }

Hive.save = function() {
    var expr = Hive.get_state();

    if(expr.name.match(/^expressions/)) {
        alert('The url "/expressions" is reserved for your profile page.');
        return false;
    }

    var on_response = function(ret) {
        Hive.upload_finish();
        if(typeof(ret) != 'object')
            alert("Sorry, something is broken :(. Please send us feedback");
        if(ret.error == 'overwrite') {
            $('#expr_name').html(expr.name);
            showDialog('#dia_overwrite');
            $('#save_submit').removeClass('disabled');
        }
        else if(ret.location) {
            //Hive.del_draft();
            window.location = ret.location;
        }
    }

    var on_error = function(ret) {
        Hive.upload_finish();
        if (ret.status == 403){
            relogin(function(){ $('#btn_save').click(); });
        }
        $('#save_submit').removeClass('disabled');
    }

    Hive.upload_start();
    $.ajax( {
        type : "POST",
        dataType : 'json',
        data : { action : 'expr_save', exp : JSON.stringify(Hive.get_state()) },
        success : on_response,
        error: on_error
    } );
};
Hive.get_draft = function() {
    return localStorage.expr_draft ? JSON.parse(localStorage.expr_draft) : null }
Hive.set_draft = function() { localStorage.expr_draft = JSON.stringify(Hive.get_state()); }
Hive.del_draft = function() { delete localStorage.expr_draft; }


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
    e.src = e.src_d = asset('skin/1/grid-' + (Hive.grid ? 'on' : 'off') + '.png');
    $('#grid_guide').css(Hive.grid ?
          { 'background-image' : "url('" + asset('skin/1/grid_square.png') + "')",
              'background-repeat' : 'repeat' }
        : { 'background-image' : '' }
    );
}

Hive.set_bg_img = function(app) {
    var url = Hive.Exp.background.url = app.content || app.url;
    if(app.opacity) Hive.Exp.background.opacity = app.opacity;
    var img = Hive.bg_div.find('img'), imgs = img.add('#bg_preview_img');

    if(url) imgs.show();
    else { imgs.hide(); return }

    imgs.attr('src', url);
    img.load(function(){ setTimeout(place_apps, 0); if(app.load) app.load(); });
    //img_fill('#bg_preview_img');
    if(app.opacity) imgs.css('opacity', app.opacity);
};

function remove_all_apps() {
    var aps = map(id, Hive.OpenApps); // store a copy of OpenApps so we can destructively update it
    map(function(a) { a.remove() }, aps);
}

// Creates iframe for Hive.App.Text
Hive.rte = function(options) {
    var o = $.extend({ click : noop, change : noop }, options);

    o.create_editor = function() {
        o.iframe = $("<iframe style='border : none; width : 100%; height : 100%;'>").get(0);
        o.iframe.src = 'javascript:void(0)';
        $(o.parent).append(o.iframe);
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
        $(o.win).click(function(){ o.range = null; o.click(); });
        o.doc = o.win.document;
        if(o.css) $(o.doc).find('head').append(o.css);
        o.doc.body.style.overflow = 'hidden';
        
        o.cache_content = function() { o.previous_content = $(o.doc.body).text(); }
        o.cache_content();
        $(o.win).bind('keypress', o.cache_content);
        $(o.win).bind('paste', function() { setTimeout(function(e){
            // TODO: determine which part was actually pasted, if
            // pasting with existing text
            if(o.previous_content.trim() == "") o.unformat();
            o.change();
        }, 10)});

        $(o.win).bind('keypress', o.change);

        //o.editor_cmd('styleWithCSS', true);
        if(o.load) o.load();
    }

    o.unformat = function() {
        // TODO: figure out how to splice out selection,
        // and splice in unformatted text. Preserve newlines, and
        // possibly create another unformat command to remove those too
        $(o.doc.body).html($(o.doc.body).text());
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
        // 
        // This is currently unused due to significant layout
        // inconsistencies with opposing font sizes in app container
        // and inline tags
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
            $(o.doc.body).find('a').each(function() {
                if(!link && rangeIntersectsNode(r, this)) link = this });
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
            if(!r.startContainer.data || !/\W|^$/.test(
                r.startContainer.data.charAt(r.startOffset - 1))
            ) s.modify('move','backward','word');
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
            window.focus(); // Needed so keypress events don't get stuck on RTE iframe
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

    // Text wrapping hack: insert explicit line breaks where text is
    // soft-wrapped before saving, remove them on loading
    o.eachTextNodeIn = function(node, fn) {
        if(node.nodeType == 3) fn(node);
        else {
            for(var i = 0; i < node.childNodes.length; i++)
                o.eachTextNodeIn(node.childNodes[i], fn);
        }
    }
    o.addBreaks = function() {
        // clone body to off-page element
        var e = $(o.doc.body); //.clone();
        //e.css({'left':-5000, width:$(o.iframe).width(), height:$(o.iframe).height()}).appendTo(document.body);

        // wrap all words with spans
        o.eachTextNodeIn(e.get(0), function(n) {
            $(n).replaceWith(n.nodeValue.replace(/(\w+)/g, "<span class='wordmark'>$1</span>"))
        });

        // TODO: iterate over wordmarks, add <br>s where line breaks occur
        var y = 0;
        e.find('.wordmark').each(function(i, e) {
            var ely = $(e).offset().top;
            if(ely > y) {
                var br = $('<br class="softbr">');
                $(e).before(br);
                if(ely != $(e).offset().top) br.remove(); // if element moves, oops, remove <br>
            }
            y = ely;
        });

        // unwrap all words
        e.find('.wordmark').each(function(i, e) { $(e).replaceWith($(e).text()) });

        var html = e.wrapInner($("<span class='viewstyle' style='white-space:nowrap'>")).html();
        //e.remove();
        return html;
    }
    o.removeBreaks = function() {
        $(o.doc.body).find('.softbr').remove();
        var wrapper = $(o.doc.body).find('.viewstyle');
        if(wrapper.length) $(o.doc.body).html(wrapper.html());
    }

    o.create_editor();
    return o;
}

Hive.append_color_picker = function(container, callback, init_color) {
    init_color = init_color || '#FFFFFF';
    var e = $('<div>').addClass('color_picker');
    container.append(e);

    var to_rgb = function(c) {
        return map(parseInt, $('<div>').css('color', c).css('color')
            .replace(/[^\d,]/g,'').split(','));
    }
    var to_hex = function(color) {
        if (typeof(color) == "string") color = to_rgb(color);
        return '#' + map(function(c) {
                var s = c.toString(16);
                return s.length == 1 ? '0' + s : s },
            color).join('').toUpperCase();
    }
    init_color = to_hex(init_color);
    var make_picker = function(c) {
        var d = $('<div>').addClass('color_select');
        d.css('background-color', c).attr('val', c).click(function() {
            set_color(c); manual_input.val(c); callback(c, to_rgb(c)) });
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
    bar.attr('src', asset('skin/1/saturated.png'));
    var shades = $("<div class='shades'><img src='" + asset('skin/1/greys.png') +"'></div>");
    var manual_input = $("<input type='text' size='6' class='color_input'>").val(init_color);

    var update_hex = function() {
        var v = manual_input.val();
        var c = $('<div>').css('color', v).css('color');
        callback(c, to_rgb(c));
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
        var rgb = to_rgb(c);
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
        var hex = to_hex(color);
        manual_input.val(hex);
        callback(hex, color);
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
};

Hive.randomStr = function(){ return Math.random().toString(16).slice(2);};

// Convenience functions for interactive coding
function sel(n) {
    if( !n ) n = 0;
    return Hive.Selection.elements[n];
}
