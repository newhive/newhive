/* Copyright 2010, A Reflection Of Inc */
// thenewhive.com client-side expression editor version 0.1
define([
    'browser/jquery', 
    'browser/js',
    'ui/menu', 
    'ui/codemirror',
    'ui/dialog',
    'ui/util',
    'browser/layout',
    'server/context',
    'ui/colors',
    'sj!templates/color_picker.html',
    'browser/jquery/jplayer/skin',
    'js!browser/jquery/event/drag.js',
    'js!browser/jquery/rotate.js',
    'js!google_closure.js'
], function(
    $,
    js,
    Menu,
    CodeMirror,
    dialog,
    util,
    layout,
    context,
    colors,
    color_picker_template
){

var Hive = {}, debug_mode = context.config.debug_mode, bound = js.bound,
    hover_menu = Menu, noop = function(){}, Funcs = js.Funcs,
    asset = util.asset;
Hive.asset = asset;

var showDialog = function(jq, opts){
    var d = dialog.create(jq, opts);
    d.open();
    return d;
};

// gives an array function for moving an element around
Hive.has_shuffle = function(arr) {
    arr.move_element = function(from, to){
        var e = arr.splice(from, 1)[0];
        arr.splice(to, 0, e);
    };
};

// collection object for all App objects in page. An App is a widget
// that you can move, resize, and copy. Each App type has more specific
// editing functions.
Hive.Apps = (function(){
    var o = [];

    o.state = function() {
        return $.map(o.all(), function(app) { return app.state(); });
    };
    
    var stack = [], restack = function() {
        for(var i = 0; i < stack.length; i++)
            if(stack[i]) stack[i].layer_set(i);
    };
    Hive.has_shuffle(stack);
    o.stack = function(from, to){
        stack.move_element(from, to);
        restack();
    };
    o._stack = stack;
    
    o.add = function(app) {
        var i = o.length;
        o.push(app);

        if(typeof(app.layer()) != 'number') stack.push(app);
        // if there's already an app at this layer, splice in the new app one layer above
        else if( stack[app.layer()] ) stack.splice(app.layer() + 1, 0, app);
        else stack[app.layer()] = app;
        restack();
        return i;
    };
    
    o.remove = function(app) {
        array_delete(o, app);
        array_delete(stack, app);
    };

    o.fetch = function(id){
        for(var i = 0; i < o.length; i++) if( o[i].id == id ) return o[i];
    };
    o.all = function(){ return $.grep(o, function(e){ return ! e.deleted; }); };
    
    o.init = function(initial_state, load){
        stack.splice(0);
        o.splice(0);

        if(!load) load = noop;
        
        if(!initial_state) initial_state = [];
        var load_count = initial_state.length;
        var load_counter = function(){
            load_count--;
            if(!load_count) load();
        };
        $.map(initial_state, function(e){ Hive.App(e, { load: load_counter }) } );
    };

    return o;
})();

Hive.env = function(){
    scale = Hive.Exp.fixed_width ? 1 : $(window).width() / 1000;
    return {scale: scale};
};

// Creates generic initial object for all App types.
Hive.App = function(init_state, opts) {
    var o = {};
    o.apps = Hive.Apps;
    if(!opts) opts = {};
    
    o.init_state = { z: null };
    $.extend(o.init_state, init_state);
    o.type = Hive.appTypes[init_state.type];
    o.id = init_state.id || Hive.random_str();

    o._remove = function(){
        o.unfocus();
        o.div.hide();
        o.deleted = true;
        if(o.controls) o.controls.remove();
    };
    o._unremove = function(){
        o.div.show();
        o.deleted = false;
    };
    o.remove = function(){
        o._remove();
        Hive.History.save(o._unremove, o._remove, 'delete');
    };

    var stack_to = function(i){ o.apps.stack(o.layer(), i); };
    o.stack_to = function(to){
        var from = o.layer();
        if(from == to) return;
        Hive.History.saver(o.layer, stack_to, 'change layer').exec(to);
    };
    o.stack_bottom = function(){ o.stack_to(0) };
    o.stack_top = function(){ o.stack_to(o.apps.length -1) };
    
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
    var layer = init_state.z;
    o.layer = function(){ return layer; };
    o.layer_set = function(n){
        layer = n;
        o.div.css('z-index', n);
    };
    
    var _pos;
    o.pos = function(){ return [ _pos[0], _pos[1] ]; };
    o.pos_set = function(pos){
        _pos = [ Math.round(pos[0]), Math.round(pos[1]) ];
        o.div.css({ 'left' : _pos[0], 'top' : _pos[1] });
        if(o.controls) o.controls.pos_set([ _pos[0], _pos[1] ]);
    };
    o.pos_center = function() {
        var dims = o.dims();
        var pos = o.pos();
        return [ pos[0] + dims[0] / 2, pos[1] + dims[1] / 2 ];
    };

    var history_point;
    o.move_start = function(){
        Hive.drag_start();
        o.ref_pos = o.pos();
        history_point = o.history_helper_relative('move');
    };
    o.move = function (e, dd, shallow) {
        if(!o.ref_pos) return;
        var delta = [dd.deltaX, dd.deltaY];
        if(e.shiftKey) delta[ Math.abs(dd.deltaX) > Math.abs(dd.deltaY) ? 1 : 0 ] = 0;
        o.pos_set([ o.ref_pos[0] + delta[0], o.ref_pos[1] + delta[1] ]);
    };
    o.move_end = function(){
        Hive.drag_end();
        history_point.save()
    };

    var _dims;
    o.dims = function() { return [ _dims[0], _dims[1] ]; };
    o.dims_set = function(dims){
        _dims = [ Math.round(dims[0]), Math.round(dims[1]) ];
        o.div.width(_dims[0]).height(_dims[1]);
        if(o.controls) o.controls.layout();
    };
    o.width = function(){ return _dims[0] };
    o.height = function(){ return _dims[1] };

    o.center = function(offset) {
        var win = $(window),
            pos = [ ( win.width() - o.width() ) / 2 + win.scrollLeft(),
                ( win.height() - o.height() ) / 2 + win.scrollTop() ];
        if(typeof(offset) != "undefined"){ pos = array_sum(pos, offset) };
        o.pos_set(pos);
    };

    o.copy = function(opts){
        if(!opts) opts = {};
        if(!opts.offset) opts.offset = [ 0, o.dims()[1] + 20 ];
        var app_state = o.state();
        if(opts.z_offset) app_state.z += opts.z_offset;
        var cp = Hive.App(app_state, opts);
        Hive.History.save(cp._remove, cp._unremove, 'copy');
        return cp;
    };

    var opacity = o.init_state.opacity === undefined ? 1 : o.init_state.opacity;
    o.opacity = function(){ return opacity; };
    o.opacity_set = function(s){
        opacity = s;
        o.content_element.css('opacity', s);
    };

    o.state_relative = function(env){ return {
          position: [ _pos[0] / env.scale, _pos[1] / env.scale ]
        , dimensions: [ _dims[0] / env.scale, _dims[1] / env.scale ]
    }};
    o.state_relative_set = function(env, s){
        o.pos_set([ Math.round(s.position[0] * env.scale),
            Math.round(s.position[1] * env.scale) ]);
        o.dims_set([ Math.round(s.dimensions[0] * env.scale),
            Math.round(s.dimensions[1] * env.scale) ]);
    };

    o.state = function(){
        var s = $.extend({}, o.init_state, o.state_relative(Hive.env()), {
            z: o.layer(),
            // TODO-cleanup: flatten state and use o.state() and
            // o.state_update to simplify behavior around shared attributes
            content: o.content(),
            id: o.id
        });
        if(opacity != 1) s.opacity = opacity;
        return s;
    };
    o.state_update = function(s){
        $.extend(o.init_state, s);
    };

    o.history_helper_relative = function(name){
        var o2 = { name: name };
        o2.old_state = o.state_relative(Hive.env());
        o2.save = function(){
            o2.new_state = o.state_relative(Hive.env());
            Hive.History.save(
                function(){ o.state_relative_set(Hive.env(), o2.old_state) },
                function(){ o.state_relative_set(Hive.env(), o2.new_state) },
                o2.name
            );
        };
        return o2;
    };

    o.load = Funcs(function() {
        if( ! o.init_state.position ) o.init_state.position = [ 100, 100 ];
        if( ! o.init_state.dimensions ) o.init_state.dimensions = [ 300, 200 ];
        if( opts.offset ) o.init_state.position = array_sum(o.init_state.position, opts.offset);
        o.state_relative_set( Hive.env(), o.init_state );
        o.opacity_set(opacity);
        if(opts.load) opts.load(o);
    });

    // initialize
    Hive.Selection();

    o.div = $('<div class="ehapp">');
    o.div.drag('start', o.move_start).drag(o.move).drag('end', o.move_end);
    o.div.click(function(e) { return Hive.Selection.app_click(o, e) });
    o.move_init = function(e) { return Hive.Selection.app_drag_init(o, e) };
    o.div.drag('init', o.move_init)
    $('#happs').append(o.div);

    o.type(o); // add type-specific properties
    o.apps.add(o); // add to apps collection

    return o;
};

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

    o.pos_set = function(pos){ o.div.css({ 'left' : pos[0], 'top' : pos[1] }); };
    o.pos_update = function(){
        var p = o.app.pos();
        o.div.css({ 'left': p[0], 'top': p[1] });
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
        o.select_borders.eq(0).css({ left: outer_l, top: -cy -bw -p, width: outer_width, height: bw }); // top
        o.select_borders.eq(1).css({ left: cx + p -rf, top: -cy -p - bw + 1, height: outer_height + bw * 2 -2, width: bw }); // right
        o.select_borders.eq(2).css({ left: outer_l, top: cy + p, width: outer_width, height: bw }); // bottom
        o.select_borders.eq(3).css({ left: outer_l, top: -cy -p - bw + 1, height: outer_height + bw * 2 -2, width: bw }); // left
        if(o.multiselect) return;

        //o.c.undo   .css({ top   : -38 - p, right  :  61 - p });
        o.c.copy   .css({ left  : dims[0] - 45 + p, top   : -38 - p });
        o.c.remove .css({ left  : dims[0] - 14 + p, top   : -38 - p });
        o.c.stack  .css({ left  : dims[0] - 78 + p, top   : dims[1] + 8 + p });
        o.c.buttons.css({ left  :  -bw - p, top : dims[1] + p + 10, width : dims[0] - 60 });
    };

    o.append_link_picker = function(d, opts) {
        // opts = $.extend({ open: noop, close: noop }, opts);
        // var e = $("<div class='control drawer link'>");
        // var cancel_btn = $("<img>").addClass('hoverable')
        //     .attr('src', asset('skin/edit/delete_sm.png'))
        //     .attr('title', 'Clear link')
        //     .css('margin', '12px 0 0 5px');
        // var input = $('<input type="text">');

        // d.append(e);
        // Hive.input_frame(input, e);
        // e.append(cancel_btn);

        // // set_link is called when input is blurred
        // var set_link = function(){
        //     var v = input.val();
        //     // TODO: improve URL guessing
        //     if(!v.match(/^https?\:\/\//i) && !v.match(/^\//) && v.match(/\./)) v = 'http://' + v;
        //     o.app.link(v);
        // };

        // // Don't have to worry about duplicating handlers because all elements
        // // were just created from scratch
        // input.on('blur', set_link);

        // var m = o.hover_menu(d.find('.button.link'), e, {
        //      open : function() {
        //          var link = o.app.link();
        //          opts.open();
        //          input.focus();
        //          input.val(link);
        //      }
        //     ,click_persist : input
        //     ,close : function() {
        //         // No need for explicit call to set_link here because it is
        //         // handled on blur, and blur is always triggered by one of the
        //         // clauses below
        //         if (opts.field_to_focus) {
        //             opts.field_to_focus.focus();
        //         }
        //         input.blur();
        //         opts.close();
        //     }
        //     ,auto_close : false
        // });

        // // timeout needed to get around firefox bug
        // var close_on_delay = function(){
        //     setTimeout(function(){m.close(true)}, 0);
        // };
        // e.find('img').click(function() {
        //     input.focus();
        //     input.val('');
        //     close_on_delay();
        // });
        // input.keypress(function(e) {
        //     if(e.keyCode == 13) {
        //         close_on_delay();
        //     }
        // });
        // return m;
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

    o.addControl = function(ctrls) { $.map(ctrls.clone(false), o.appendControl); };
    o.addButton = function(ctrls) { $.map(ctrls.clone(false), o.appendButton); };
    o.addControls = function(ctrls) { $.map(ctrls.clone(false).children(), o.appendControl); };
    o.hover_menu = function(h, d, opts) {
        return Menu(h, d, $.extend({offset_y : o.padding + 1}, opts)) };

    o.div = $('<div>').addClass('controls');
    $('#controls').append(o.div);

    // add borders
    o.select_box = $("<div style='position: absolute'>");
    var border = $('<div>').addClass('select_border drag ehapp');
    o.select_borders = border.add(border.clone().addClass('right'))
        .add(border.clone().addClass('bottom'))
        .add(border.clone().addClass('left'));
    border.eq(0).addClass('top'); // add 'left' class after the others were cloned
    o.select_borders.drag('init', function(e) { return Hive.Selection.app_drag_init(o.app, e) })
        .drag('start', o.app.move_start).drag(o.app.move).drag('end', o.move_end);
    o.div.append(o.select_box.append(o.select_borders));
    o.select_box.click(function( e ){
        e.stopPropagation();
        o.app.unfocus();
    });

    o.padding = 4;
    o.border_width = 5;
    if(multiselect){
        o.padding = 1;
        o.border_width = 2;
    }
    else {
        o.addControls($('#controls_common'));
        var d = o.div;
        o.c = {};
        //o.c.undo    = d.find('.undo'   );
        o.c.remove  = d.find('.remove' );
        o.c.resize  = d.find('.resize' );
        o.c.stack   = d.find('.stack'  );
        o.c.remove.click(function() { o.app.remove(); });
        o.c.copy    = d.find('.copy'   );
        o.c.copy.click(function(){
            var copy = o.app.copy({ load: function(){ Hive.Selection.select(copy); } });
        });
        d.find('.stack_up').click(o.app.stack_top);
        d.find('.stack_down').click(o.app.stack_bottom);

        $.map(o.app.make_controls, function(f){ f(o) });

        o.c.buttons = d.find('.buttons');
        // TODO: use templates to add controls?
        // d.find('.hoverable').each(function() { hover_add(this) });
    }

    // disable hover handlers while dragging
    o.div.find('.drag').drag('start', Hive.drag_start).drag('end', Hive.drag_end);

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
    opts = $.extend({auto: true}, opts);
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
    };

    // If auto is false, app can be shielded/unshielded but update_shield is
    // not bound to drag events, for example auto=false in text app
    if (opts.auto) {
        o.div.drag('start', start).drag('end', end);
        o.make_controls.push(function(o){
            o.div.find('.drag').drag('start', start).drag('end', end);
        });
    }
};

Hive.App.has_resize = function(o) {
    var dims_ref, history_point;
    o.resize_start = function(){
        dims_ref = o.dims();
        history_point = o.history_helper_relative('resize');
    };
    o.resize = function(delta){ o.dims_set(o.resize_to(delta)); };
    o.resize_end = function(){ history_point.save() };
    o.resize_to = function(delta){
        return [ Math.max(1, dims_ref[0] + delta[0]), Math.max(1, dims_ref[1] + delta[1]) ];
    };

    function controls(o) {
        var common = $.extend({}, o);

        o.addControl($('#controls_misc .resize'));
        o.c.resize = o.div.find('.resize');

        o.layout = function() {
            common.layout()
            var p = o.padding;
            var dims = o.dims();
            o.c.resize.css({ left: dims[0] -18 + p, top: dims[1] - 18 + p });
        }

        o.c.resize.drag('start', function(e, dd) {
                o.drag_target = e.target;
                o.drag_target.busy = true;
                o.app.resize_start();
            })
            .drag(function(e, dd){ o.app.resize([ dd.deltaX, dd.deltaY ]); })
            .drag('end', function(e, dd){
                o.drag_target.busy = false;
                o.app.resize_end();
            });

        return o;
    }
    o.make_controls.push(controls);
}

Hive.App.has_resize_h = function(o) {
    o.resize_h = function(dims) {
        o.dims_set(dims);
        return o.dims_set([ dims[0], o.calcHeight() ]);
    }

    function controls(o) {
        var common = $.extend({}, o);

        o.addControl($('#controls_misc .resize_h'));
        o.c.resize_h = o.div.find('.resize_h');
        o.refDims = null;

        o.layout = function() {
            common.layout()
            var p = o.padding;
            var dims = o.dims();
            o.c.resize_h.css({ left: dims[0] -18 + o.padding, top: Math.min(dims[1] / 2 - 18,
                dims[1] - 54) });
        }

        // Dragging behavior
        o.c.resize_h.drag('start', function(e, dd) {
                o.refDims = o.app.dims();
                o.drag_target = e.target;
                o.drag_target.busy = true;
                o.app.div.drag('start');
            })
            .drag('end', function(e, dd) {
                o.drag_target.busy = false;
                o.app.div.drag('end');
            })
            .drag(function(e, dd) { 
                o.app.resize_h([ o.refDims[0] + dd.deltaX, o.refDims[1] ]);
            });

        return o;
    }
    o.make_controls.push(controls);
}

Hive.has_scale = function(o){
    var scale = o.init_state.scale ? o.init_state.scale * Hive.env().scale : 1;
    o.scale = function(){ return scale; };
    o.scale_set = function(s){ scale = s; };

    var _state_relative = o.state_relative, _state_relative_set = o.state_relative_set;
    o.state_relative = function(env){
        return $.extend(_state_relative(env), { 'scale': scale / env.scale });
    };
    o.state_relative_set = function(env, s){
        _state_relative_set(env, s);
        if(s.scale) o.scale_set(s.scale * env.scale);
    };
};

// This App shows an arbitrary single HTML tag.
Hive.App.Html = function(o) {
    Hive.App.has_resize(o);
    o.content = function() { return o.content_element[0].outerHTML; };

    o.content_element = $(o.init_state.content).addClass('content');
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
        o.addControls($('#controls_html'));
        // TODO: create interface for editing HTML
        // d.find('.render').click(o.app.toggle_render);
        return o;
    }
    o.make_controls.push(controls);

    setTimeout(function(){ o.load(); }, 100);

    return o;
};
Hive.registerApp(Hive.App.Html, 'hive.html');

Hive.App.RawHtml = function(o) {
    Hive.App.has_resize(o);
    o.content = function() { return o.content_element[0].outerHTML; };
    o.content_element = $(o.init_state.content).addClass('content');
    o.div.append(o.content_element);

    var controls = function(o){
        o.addControls($('#controls_raw_html'));
        o.div.find('.edit').click(function(){
            var dia = $($('#dia_edit_code')[0].outerHTML);
            showDialog(dia, {
                fade: false,
                close: function() {
                    var new_content = dia.find('textarea').val();
                    o.app.content_element.html(new_content);
                },
                open: function() {
                    dia.find('textarea').val(o.app.content_element.html());
                }
            });
        });
        //var inner = o.app.content_element.children();
        //var width = inner.width();
        //if (width < 100) width = 40;
        //var height = inner.height();
        //if (height < 100) height = 40;
        //o.app.dims_set([width, height]);

        return o;
    };
    o.make_controls.push(controls);

    setTimeout(function(){ o.load(); }, 100);

    return o;
};
Hive.registerApp(Hive.App.RawHtml, 'hive.raw_html');

Hive.App.Script = function(o){
    o.content = function(){ return o.content_element.html(); };

    o.run = function(){
        o.script_element.html(o.content_element.val()).remove().appendTo('body');
    };

    function controls(o) {
        o.addControls($('#controls_script'));
        o.div.find('.code').click(o.app.run);
        return o;
    }
    o.make_controls.push(controls);
    Hive.App.has_shield(o);

    o.focus.add(function(){ o.content_element.focus() });
    o.unfocus.add(function(){ o.content_element.blur() });

    o.content_element = $('<textarea>').addClass('content code drag').appendTo(o.div);
    o.script_element = $('<script>').html(o.init_state.content);
    o.load();

    return o;
};
Hive.registerApp(Hive.App.Script, 'hive.script');

var is_chrome = navigator.userAgent.toLowerCase().indexOf('chrome') > -1;
Hive.App.Text = function(o) {
    Hive.App.has_resize(o);
    Hive.App.has_resize_h(o);
    Hive.App.has_shield(o, {auto: false});

    var content = o.init_state.content;
    o.content = function(content) {
        if(typeof(content) != 'undefined') {
            // avoid 0-height content element in FF
            if(content == null || content == '') o.rte.setHtml(false, '&nbsp;');
            else o.rte.setHtml(false, content);
        } else {
            // remove any remaining selection-saving carets
            o.rte.content_element.find('span[id^="goog_"]').remove();
            return o.rte.getCleanContents();
        }
    }

    var edit_mode = false;
    o.edit_mode = function(mode) {
        if (mode === edit_mode) return;
        if (mode) {
            o.unshield();
            o.rte.remove_breaks();
            o.rte.makeEditable();
            o.rte.restore_cursor();
            o.content_element
                .bind('mousedown keydown', function(e){ e.stopPropagation(); });
            edit_mode = true;
        }
        else {
            o.rte.unwrap_all_selections();
            o.rte.save_cursor();
            o.rte.add_breaks();
            o.rte.make_uneditable();
            o.content_element
                .unbind('mousedown keydown')
                .blur();
            edit_mode = false;
            o.shield();
        }
    }

    o.focus.add(function(){
        o.refresh_size();
        o.edit_mode(true);
    });
    o.unfocus.add(function(){
        o.edit_mode(false);
    });

    o.link = function(v) {
        if(typeof(v) == 'undefined') return o.rte.get_link();
        //if(!v) o.rte.edit('unlink');
        //else o.rte.make_link(v);
        o.rte.make_link(v);
    };

    o.calcWidth = function() {
        return o.content_element.width();
    }
    o.calcHeight = function() {
        return o.content_element.height();
    }

    o.refresh_size = function() {
        o.resize_h([o.calcWidth(), o.dims()[1]]);
    };

    Hive.has_scale(o);
    var _scale_set = o.scale_set;
    o.scale_set = function(s){
        _scale_set(s);
        o.div.css('font-size', s + 'em');
    };

    // New scaling code
    var scale_ref, dims_ref, history_point;
    o.resize_start = function(){
        scale_ref = o.scale();
        dims_ref = o.dims();
        history_point = o.history_helper_relative('resize');
    };
    o.resize = function(delta) {
        var scale_by = Math.min( (dims_ref[0] + delta[0]) / dims_ref[0],
            (dims_ref[1] + delta[1]) / dims_ref[1] );
        var dims = [ Math.max(1, dims_ref[0] * scale_by), Math.max(1, dims_ref[1] * scale_by) ];
        o.scale_set(scale_ref * scale_by);
        o.dims_set(dims);
    };
    o.resize_end = function(){ history_point.save() };
    
    var _load = o.load;
    o.load = function() {
        o.scale_set(o.scale());
        o.content(content);
        _load();
        o.refresh_size();
    };

    o.history_saver = function(){
        var exec_cmd = function(cmd){ return function(){
            var uneditable = o.rte.isUneditable();
            if(uneditable) o.rte.makeEditable();
            o.rte.exec_command(cmd);
            if(uneditable) o.rte.makeUneditable();
            o.rte.unwrap_all_selections();
        } };
        Hive.History.save(exec_cmd('+undo'), exec_cmd('+redo'), 'edit');
    };

    function controls(o) {
        var common = $.extend({}, o), d = o.div;

        o.addControls($('#controls_text'));

        var link_open = function(){
            var link = o.app.rte.get_link();
        }
        o.link_menu = o.append_link_picker(d.find('.buttons'),
                        {open: link_open, field_to_focus: o.app.content_element});

        var cmd_buttons = function(query, func) {
            $(query).each(function(i, e) {
                $(e).click(function() { func($(e).attr('val')) });
            })
        }

        o.hover_menu(d.find('.button.fontname'), d.find('.drawer.fontname'));

        o.color_picker = Hive.append_color_picker(
            d.find('.drawer.color'),
            function(v) {
                o.app.rte.exec_command('+foreColor', v);
            },
            undefined,
            {field_to_focus: o.app.content_element, iframe: true}
        );
        o.color_menu = o.hover_menu(
            d.find('.button.color'),
            d.find('.drawer.color'),
            { 
                auto_close : false,
                open: function(){
                    // Update current color. Range should usually exist, but
                    // better to do nothing than throw error if not
                    var range = o.app.rte.getRange();
                    if (range){
                        var current_color = $(o.app.rte.getRange().getContainerElement()).css('color');
                        o.color_picker.set_color(current_color);
                    }
                },
            }
        );

        o.align_menu = o.hover_menu(d.find('.button.align'), d.find('.drawer.align'));

        o.close_menus = function() {
            o.link_menu.close();
            o.color_menu.close();
        }

        $('.option[cmd],.button[cmd]').each(function(i, el) {
            $(el).bind('mousedown', function(e) {
                e.preventDefault();
            }).click(function(){
                o.app.rte.exec_command($(el).attr('cmd'), $(el).attr('val'));
            });
        });

        o.select_box.click(function(e){
            e.stopPropagation();
            o.app.edit_mode(false);
        });

        return o;
    }
    o.make_controls.push(controls);

    o.div.addClass('text');
    if(!o.init_state.dimensions) o.dims_set([ 300, 20 ]);
    o.content_element = $('<div></div>');
    o.content_element.attr('id', Hive.random_str()).addClass('text_content_element');
    o.div.append(o.content_element);
    o.rte = new Hive.goog_rte(o.content_element, o);
    goog.events.listen(o.rte.undo_redo.undoManager_,
            goog.editor.plugins.UndoRedoManager.EventType.STATE_ADDED,
            o.history_saver);
    goog.events.listen(o.rte, goog.editor.Field.EventType.DELAYEDCHANGE, o.refresh_size);
    o.shield();

    setTimeout(function(){ o.load(); }, 100);
    return o;
}
Hive.registerApp(Hive.App.Text, 'hive.text');

Hive.goog_rte = function(content_element, app){
    var that = this;
    var id = content_element.attr('id');
    this.content_element = content_element;
    this.app = app;

    goog.editor.SeamlessField.call(this, id);

    this.make_uneditable = function() {
        // Firefox tries to style the entire content_element, which google
        // clobbers with makeUneditable.  This solution works, but results
        // in multiple nested empty divs in some cases. TODO: improve
        that.content_element.css('opacity', ''); //Opacity isn't supported for text anyway yet
        var style = that.content_element.attr('style');
        if (style != '') {
            var inner_wrapper = $('<div></div>');
            inner_wrapper.attr('style', style);
            that.content_element.wrapInner(inner_wrapper[0]);
        }
        that.makeUneditable();
    };

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

    this.select = function(range) {
        var s = window.getSelection();
        if(!s) return;
        s.removeAllRanges();
        if(range)
        s.addRange(range);
        return s;
    }

    this.get_range = function() {
        var s = window.getSelection();
        if(s.rangeCount) return window.getSelection().getRangeAt(0).cloneRange();
        else return null;
    }

    // Finds link element the cursor is on, selects it after saving
    // any existing selection, returns its href
    this.get_link = function() {
        // If the color menu is still open the selection needs to be restored.
        // TODO: make this work right :)
        if (saved_range) that.restore_selection();

        that.range = that.get_range();
        var r = that.range.cloneRange(); // save existing selection

        // Look for link in parents
        var node = r.startContainer;
        while(node.parentNode) {
            node = node.parentNode;
            if (node == that.content_element) return;
            if($(node).is('a')) {
                r.selectNode(node);   
                that.select(r);
                return $(node).attr('href');
            }
        }

        // Look for the first link that intersects r
        var find_intersecting = function(r) {
            var link = false;
            $(document).find('a').each(function() {
                if(!link && rangeIntersectsNode(r, this)) link = this;
            });
            if(link) {
                r.selectNode(link);
                that.select(r);
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
            var s = that.select(r);
            // If the cursor is not at the beginning of a word...
            if(!r.startContainer.data || !/\W|^$/.test(
                r.startContainer.data.charAt(r.startOffset - 1))
            ) s.modify('move','backward','word');
            s.modify('extend','forward','word');
        }

        // It's possible to grab a previously missed link with the above code 
        var link = find_intersecting(that.get_range());
        return link;
    }

    this.make_link = function(href) {
        // TODO: don't use browser API directly
        if (href === ''){
            document.execCommand('unlink', false);
        } else {
            document.execCommand('createlink', false, href);
        }
    };

    var saved_range;
    this.save_selection = function(){
        var range = this.getRange();
        saved_range = range.saveUsingCarets();
    };

    this.restore_selection = function(){
        if (!saved_range || saved_range.isDisposed()) return false;
        saved_range.restore();
        saved_range = false;
        return true;
    };

    // Wrap a node around selecte text, even if selection spans multiple block elements
    var current_selection;
    this.wrap_selection = function(wrapper){
        if (current_selection) return;
        wrapper = wrapper || '<span class="hive_selection"></span>';
        var range, node, nodes;

        // Turn wrapper into DOM object
        if (typeof(wrapper) == "string") wrapper = $(wrapper)[0];

        // Get selection
        range = that.getRange();
        if (!range) return;

        if (range.getStartNode() === range.getEndNode()) {
            // Return if selection is empty
            if (range.getStartOffset() === range.getEndOffset()) return;

            // Check if selection is already a link
            var node = $(range.getStartNode());
            if (node.parent().is('a')) nodes = node.parent();
        }

        that.save_selection();
        range.select(); // For some reason on FF save_selection unselects the range
        if (!nodes){
            // Create temporary anchor nodes using execcommand
            document.execCommand('createLink', false, 'temporary_link');

            // Replace temporary nodes with desired wrapper, saving reference in
            // closure for use by unwrap_selection
            nodes = $(range.getContainer()).find('a[href=temporary_link]');
        }
        current_selection = nodes.wrapInner(wrapper)
        current_selection = current_selection.children()
        current_selection = current_selection.unwrap();

        // Remove browser selection
        window.getSelection().removeAllRanges();
        return current_selection;
    };
    this.unwrap_selection = function(){
        if (! current_selection) return;
        current_selection.each(function(i,el){ $(el).replaceWith($(el).html()); });
        that.restore_selection();
        current_selection = false;
    };
    this.unwrap_all_selections = function(){
        var selection =  that.content_element.find('.hive_selection');
        if (selection.length) {
            current_selection = selection;
            that.unwrap_selection();
        }
    };

    this.undo_redo = new goog.editor.plugins.UndoRedo();
    this.basic_text = new goog.editor.plugins.BasicTextFormatter();
    this.registerPlugin(this.undo_redo);
    this.registerPlugin(this.basic_text);
    this.registerPlugin(new goog.editor.plugins.RemoveFormatting());

    var previous_range = {};
    this.content_element.on('paste', function(){
        setTimeout(function(){
            that.strip_sizes();

            // Unformat all text, google RTE doesn't have selectAll so we use browser
            document.execCommand('selectAll');
            that.execCommand('+removeFormat');
        }, 0);

        // Paste unformatting code
        //    var current_range = that.getRange();
        //    var pasted_range = goog.dom.Range.createFromNodes(
        //        previous_range.before.getStartNode(), 
        //        previous_range.before.getStartOffset(), 
        //        current_range.getStartNode(), 
        //        current_range.getStartOffset()
        //        );
        //    pasted_range.select();
        //    that.execCommand('+removeFormat');

        //    // Place cursor at end of pasted range
        //    var range = that.getRange();
        //    previous_range.before = goog.dom.Range.createFromNodes(
        //        range.getEndNode(), 
        //        range.getEndOffset(), 
        //        range.getEndNode(), 
        //        range.getEndOffset()
        //        );
        //    previous_range.before.select();
        //}, 0);
    });

    var range_change_callback = function(type){
        return function(){
            var range = that.getRange();
            $.each(type, function(i, name){
                previous_range[name] = range;
            });
        }
    };

    this.exec_command = function(cmd, val){
        that.execCommand(cmd, val);
        that.strip_sizes();
    };

    this.strip_sizes = function(){
        that.content_element.find('*').css('font-size', '');
        //    .css('width', '').css('height', '')
        //    .attr('width', '').attr('height', '');
    };


    goog.events.listen(this, goog.editor.Field.EventType.DELAYEDCHANGE, range_change_callback(['delayed']));
    goog.events.listen(this, goog.editor.Field.EventType.BEFORECHANGE, range_change_callback(['before']));
    goog.events.listen(this, goog.editor.Field.EventType.SELECTIONCHANGE, range_change_callback(['delayed', 'before']));
    //goog.events.listen(this, goog.editor.Field.EventType.FOCUS, range_change_callback(['before']));

    var saved_cursor;
    this.save_cursor = function(){
        saved_cursor = previous_range.delayed.saveUsingCarets();
    };
    this.restore_cursor = function(){
        if (saved_cursor){
            that.focus();
            saved_cursor.restore();
            return true;
        } else {
            that.focusAndPlaceCursorAtStart();
            return false;
        };
    };
    //goog.events.listen(this, goog.editor.Field.EventType.LOAD, this.restore_cursor);

    // Text wrapping hack: insert explicit line breaks where text is
    // soft-wrapped before saving, remove them on loading
    this.add_breaks = function(){
        var text_content = that.content_element;

        // Get text nodes: .find gets all non-textNode elements, contents gets
        // all child nodes (inc textNodes) and the not() part removes all
        // non-textNodes. Technique by Nathan MacInnes, nathan@macinn.es from
        // http://stackoverflow.com/questions/4671713/#7431801
         var textNodes = text_content.find('*').add(text_content).contents()
            .not(text_content.find('*'));

        // Split each textNode into individual textNodes, one for each word
        textNodes.each(function (index, lastNode) {
            var startOfWord = /\W\b/,
                result;
            while (startOfWord.exec(lastNode.nodeValue) !== null) {
                result = startOfWord.exec(lastNode.nodeValue);
                // startOfWord matches the character before the start of a
                // word, so need to add 1.
                lastNode = lastNode.splitText(result.index + 1);
            }
        });
        // end contributed code

        var textNodes = text_content.find('*').add(text_content).contents()
            .not(text_content.find('*'));

        textNodes.wrap('<span class="wordmark">');

        // iterate over wordmarks, add <br>s where line breaks occur
        var y = 0;
        text_content.find('.wordmark').each(function(i, e) {
            var ely = $(e).offset().top;
            if($(e).text().length && ely > y) {
                var br = $('<br class="softbr">');
                $(e).before(br);
                if(ely != $(e).offset().top){
                    br.remove(); // if element moves, oops, remove <br>
                }
            }
            y = ely;
        });

        // unwrap all words
        text_content.find('.wordmark').each(function(i, e) {
            $(e).replaceWith($(e).text());
        });

        var html = text_content.wrapInner($("<span class='viewstyle' style='white-space:nowrap'>")).html();
        return html;
    }
    this.remove_breaks = function() {
        that.content_element.find('.softbr').remove();
        var wrapper = that.content_element.find('.viewstyle');
        if(wrapper.length) that.content_element.html(wrapper.html());
    }
}
goog.editor.Field.DELAYED_CHANGE_FREQUENCY = 100;
goog.inherits(Hive.goog_rte, goog.editor.SeamlessField);


Hive.App.has_rotate = function(o) {
    var angle = o.init_state.angle ? o.init_state.angle : 0;
    o.angle = function(){ return angle; };
    o.angle_set = function(a){
        angle = a;
        o.content_element.rotate(a);
        if(o.controls) o.controls.select_box.rotate(a);
    }
    o.load.add(function() { if(o.angle()) o.angle_set(o.angle()) });

    var _state = o.state;
    o.state = function(){
        var s = _state();
        if(angle) s.angle = angle;
        return s;
    };

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
            o.rotateHandle.css({ left: dims[0] - 18 + o.padding,
                top: Math.min(dims[1] / 2 - 20, dims[1] - 54) });
        }

        o.rotate = function(a){
            o.app.angle_set(a);
        };

        o.rotateHandle = $("<img class='control rotate hoverable drag' title='Rotate'>")
            .attr('src', asset('skin/edit/rotate.png'));
        o.appendControl(o.rotateHandle);

        var angleRound = function(a) { return Math.round(a / 45)*45; },
            history_point;
        o.rotateHandle.drag('start', function(e, dd) {
                refAngle = angle;
                offsetAngle = o.getAngle(e);
                history_point = Hive.History.saver(o.app.angle, o.app.angle_set, 'rotate');
            })
            .drag(function(e, dd) {
                angle = o.getAngle(e) - offsetAngle + refAngle;
                if( e.shiftKey && Math.abs(angle - angleRound(angle)) < 10 )
                    angle = angleRound(angle);
                o.app.angle_set(angle);
            })
            .drag('end', function(){ history_point.save(); })
            .dblclick(function(){ o.app.angle_set(0); });

        o.app.angle_set(o.app.angle());

        return o;
    }
    o.make_controls.push(controls);
}

//Hive.App.has_percent_

Hive.App.has_slider_menu = function(o, handle, set, init, start, end) {
    function controls(o) {
        var common = $.extend({}, o), changed = false;
        if(!start) start = noop;
        if(!end) end = noop;

        var input = $("<input class='control drawer' type='text' size='3'>");
        o.div.find('.buttons').append(input);
        var m = o.hover_menu(o.div.find(handle), input, {
            open: function(){
                    input.val(init());
                    input.focus().select();
                    start();
                },
            close: function(){ if(changed) end() }
        });
        input.keyup(function(e) {
            if(e.keyCode == 13) { input.blur(); m.close(); }
            var v = parseFloat(input.val());
            if(v != init()) {
                changed = true;
                set(v === NaN ? init() : v);
            }
        });

        return o;
    };
    o.make_controls.push(controls);
};
Hive.App.has_opacity = function(o) {
    function controls(o) {
        var common = $.extend({}, o);

        o.addButton($('#controls_misc .opacity'));
        o.c.opacity = o.div.find('.opacity');

        return o;
    };
    o.make_controls.push(controls);

    var history_point;
    Hive.App.has_slider_menu(o, '.button.opacity',
        function(v) { o.opacity_set(v/100) },
        function() { return Math.round(o.opacity() * 100) },
        function(){ history_point = Hive.History.saver(o.opacity, o.opacity_set, 'change opacity') },
        function(){ history_point.save() }
    );
};
    
Hive.App.has_color = function(o) {
    function controls(o) {
        var common = $.extend({}, o);

        o.addButton($('#controls_misc .drawer.color'));
        o.c.color = o.div.find('.button.color');
        o.c.color_drawer = o.div.find('.drawer.color');

        Hive.append_color_picker(o.c.color_drawer, o.app.color_set, o.app.color);
        var history_point;
        o.hover_menu(o.c.color, o.c.color_drawer, {
            auto_close: false,
            open: function(){ history_point = Hive.History.saver(o.app.color, o.app.color_set, 'color'); },
            close: function(){ history_point.save() }
        });
        return o;

    }
    o.make_controls.push(controls);
}


Hive.App.Image = function(o) {
    Hive.App.has_resize(o);
    o.content = function(content) {
        if(typeof(content) != 'undefined') o.url_set(content);
        return o.init_state.url;
    }

    var link_set = function(v){ o.init_state.href = v; };
    o.link = function(v) {
        if(typeof(v) == 'undefined') return o.init_state.href;
        Hive.History.saver(o.link, link_set, 'link image').exec(v);
    };
    
    var _state_update = o.state_update;
    o.state_update = function(s){
        // TODO-cleanup: migrate to use only url for consistency with other apps
        s.content = s.url = (s.url || s.content);
        _state_update(s);
    };

    o.url_set = function(src) {
        if(o.img) o.img.remove();
        o.content_element = o.img = $("<img class='content drag'>");
        o.img.attr('src', src);
        o.div.append(o.img);
        o.img.load(function(){setTimeout(o.img_load, 1)});
    };
    o.img_load = function() {
        o.imageWidth  = o.img.width();
        o.imageHeight = o.img.height();
        o.aspect = o.imageWidth / o.imageHeight;
        if( ! o.init_state.dimensions ){
            var ww = $(window).width(), wh = $(window).height(), iw, ih, wa = ww / wh;
            if( (o.imageWidth > ww * .8) || (o.imageHeight > wh * .8) ){
                if( wa < o.imageWidth / o.imageHeight ){
                    iw = 800;
                    ih = iw / o.aspect;
                } else {
                    ih = 800 / wa;
                    iw = ih * o.aspect;
                }
            } else {
                iw = o.imageWidth / Hive.env().scale;
                ih = iw / o.aspect;
            }
            o.init_state.dimensions = [ iw, ih ];
        }
        o.img.css('width', '100%');
        o.load();
    };

    o.resize = function(delta) {
        var dims = o.resize_to(delta);
        if(!dims[0] || !dims[1]) return;
        var newWidth = dims[1] * o.aspect;
        var dims = newWidth < dims[0] ? [newWidth, dims[1]] : [dims[0], dims[0] / o.aspect];
        o.dims_set(dims);
    }

    o.pixel_size = function(){
        return [img.naturalWidth, img.naturalHeight]
    };

    function controls(o) {
        o.addControls($('#controls_image'));
        o.append_link_picker(o.div.find('.buttons'));
        o.div.find('.button.set_bg').click(function() { Hive.bg_change(o.app.state()) });
        return o;
    };
    o.make_controls.push(controls);

    Hive.App.has_rotate(o);
    Hive.App.has_opacity(o);

    o.state_update(o.init_state);
    o.url_set(o.init_state.url);
    return o;
}
Hive.registerApp(Hive.App.Image, 'hive.image');


Hive.App.Rectangle = function(o) {
    Hive.App.has_resize(o);
    var common = $.extend({}, o);

    var state = {};
    o.content = function(content) { return $.extend({}, state); };
    o.set_css = function(props) {
        props['background-color'] = props.color || props['background-color'];
        props['box-sizing'] = 'border-box';
        o.content_element.css(props);
        $.extend(state, props);
        if(o.controls) o.controls.layout();
    }
    o.css_setter = function(css_prop) { return function(v) {
        var ps = {}; ps[css_prop] = v; o.set_css(ps);
    } }

    o.color = function(){ return state.color };
    o.color_set = o.css_setter('color');

    o.border_radius = function(){ return parseInt(state['border-radius']) };
    o.border_radius_set = function(v){ o.set_css({'border-radius':v+'px'}); };

    o.make_controls.push(function(o){
        o.addControls($('#controls_rectangle'));
    });

    Hive.App.has_rotate(o);
    Hive.App.has_color(o);
    Hive.App.has_opacity(o);
    var history_point;
    Hive.App.has_slider_menu(o, '.rounding', o.border_radius_set, o.border_radius,
        function(){ history_point = Hive.History.saver(
            o.border_radius, o.border_radius_set, 'border radius'); },
        function(){ history_point.save() }
    );

    o.content_element = $("<div class='content rectangle drag'>").appendTo(o.div);
    o.set_css(o.init_state.content);
    setTimeout(function(){ o.load() }, 1);

    return o;
};
Hive.registerApp(Hive.App.Rectangle, 'hive.rectangle');


Hive.App.Sketch = function(o) {
    Hive.App.has_resize(o);
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
        if(c.brush) o.set_brush(c.brush);
        if(c.fill_color) o.win.COLOR = c.fill_color;
        if(c.brush_size) o.win.BRUSH_SIZE = c.brush_size;
    };

    o.resize = function(delta) {
        var dims = o.resize_to(delta), aspect = o.win.SCREEN_WIDTH / o.win.SCREEN_HEIGHT,
            width = Math.max( dims[0], Math.round(dims[1] * aspect) );
        o.dims_set([ width, Math.round(width / aspect) ]);
    };

    o.focus.add(function() { o.win.focus() });

    o.set_brush = function( val ){
        o.brush_name = val;
        o.win.set_brush(val);
    };

    function controls(o) {
        var common = $.extend({}, o);
       
        o.addControls($('#controls_sketch'));
        Hive.append_color_picker(o.div.find('.drawer.fill'), o.app.fill_color, '#000000');

        o.hover_menu(o.div.find('.button.fill'), o.div.find('.drawer.fill'),
            { auto_close : false });
        //TODO: What does this click on the brush handle do?
        var brush_btn = o.div.find('.button.brush')
            .click( function(){
                 o.app.set_brush( o.app.brush_name );
            });
        var brush_menu = o.hover_menu(brush_btn, o.div.find('.drawer.brush'));
        o.div.find('.button.eraser').click( function(){ o.app.win.set_brush( 'eraser' ) });
        o.div.find('.drawer.brush .option').each(function(i, e) { $(e).click(function() {
            o.app.set_brush($(e).attr('val'));

            o.div.find('.drawer.brush .option').removeClass("selected");
            $(e).addClass("selected");
            brush_menu.close();
        }); })
        o.div.find('.drawer.brush .option[val=' + o.app.brush_name + ']').click();

        return o;
    };
    o.make_controls.push(controls);
    Hive.App.has_rotate(o);
    Hive.App.has_opacity(o);
    Hive.App.has_shield(o);
    Hive.App.has_slider_menu(o, '.size', function(v) { o.win.BRUSH_SIZE = v; },
        function() { return o.win.BRUSH_SIZE; });

    o.content_element = $('<iframe>').attr('src', '/lib/harmony_sketch.html')
        .css({'width':'100%','height':'100%','position':'absolute'});
    o.iframe = o.content_element.get(0);
    o.fill_color = function(hex, rgb) { o.win.COLOR = rgb; }
    o.div.append(o.content_element);
    o.content_element.load(function() {
        o.win = o.content_element.get(0).contentWindow;
        if(o.init_state.content) o.set_content(o.init_state.content);
        o.load();
    });
    o.update_shield();

    return o;
};
Hive.registerApp(Hive.App.Sketch, 'hive.sketch');

Hive.App.Audio = function(o) {
    Hive.App.has_resize(o);
    o.content = function() {
        return o.content_element[0].outerHTML;
    };

    o.resize = function(delta) {
        var dims = o.resize_to(delta);

        //Hack that forces play/pause image element to resize, at least on chrome
        //o.div.find('.jp-controls img').click();
        //o.player.jPlayer("playHead", 0);

        // enforce 25px < height < 400px and minimum aspect ratio of 2.5:1
        var sf = Hive.env().scale;
        if (dims[1] / sf < 25) dims[1] = 25 * sf;
        if (dims[1] / sf > 400) dims[1] = 400 * sf;
        if (dims[0] < 2.5 * dims[1]) dims[0] = 2.5 * dims[1];

        o.scale_set(dims[1] / 35);

        o.dims_set(dims);
    };

    var colored;
    o.color = function(){ return o.init_state.color; };
    o.color_set = function(v){
        o.init_state.color = v;
        colored.css('background-color', v);
    };

    Hive.has_scale(o);
    var _scale_set = o.scale_set;
    o.scale_set = function(s) {
        _scale_set(s);
        o.div.css('font-size', s + 'em');
        var height = o.div.find('.jp-interface').height();
        o.div.find('.jp-button').width(height).height(height);
    };

    var _load = o.load;
    o.load = function(){
        _load();
        o.dims_set(o.dims());
        o.scale_set(o.dims()[1] / 35);
    };

    o.set_shield = function() { return true; }

    o.make_controls.push(function(o){
        o.addButton($('#controls_misc .button.color'))
    });

    var _state_update = o.state_update;
    o.state_update = function(s){
        _state_update(s);
        if(typeof s.file_meta == 'object')
            o.content_element.attr('title', [s.file_meta.artist, s.file_meta.album,
                s.file_meta.title].join(' - '));
        if(typeof s.url != 'undefined'){
            o.content_element.jPlayer('setMedia', s.url);
        }
    };

    // Mixins
    Hive.App.has_shield(o, {always: true});
    Hive.App.has_opacity(o);
    Hive.App.has_color(o);

    // Initialization
    if(! o.init_state.dimensions) o.init_state.dimensions = [ 200, 35 ];
    o.content_element = $( $.jPlayer.skin.minimal(
            o.init_state.url, Hive.random_str() ) )
        .addClass('content')
        .css('position', 'relative')
        .css('height', '100%')
        .appendTo(o.div);
    colored = o.div.find('.jp-play-bar, .jp-interface');
    if(!o.init_state.color) o.init_state.color = colors[23];

    o.update_shield();
    setTimeout(function(){ o.load(); }, 100);
    return o;
};
Hive.registerApp(Hive.App.Audio, 'hive.audio');


Hive.Selection = function(){
    var o = Hive.Selection;
    o.elements = [];
    o.count = function(){ return o.elements.length; };
    o.each = function(fn){ $.each(o.elements, fn) };
    o.make_controls = [];
    o.dragging = false;

    Hive.App.has_resize(o);

    o.multi_test = function(e) { return e.shiftKey || e.ctrlKey; }

    o.app_drag_init = function (app, e) {
        var drag_items = [];
        if(o.selected(app) || app === o) {
            $.merge(drag_items, o.divs());
            if(o.controls) $.merge(drag_items, o.controls.div);
        }
        return drag_items;
    };
    o.app_click = function (app, e) {
        // Prevent window click handler from unfocusing everything
        e.stopPropagation();

        if(o.multi_test(e)){
            if(o.selected(app)) o.unfocus(app);
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
        if(!apps) apps = $.grep(o.elements, function(e){ return ! e.deleted; });
        var multi = o.dragging || (apps.length > 1);

        // Previously unfocused elements that should be focused
        $.each(apps, function(i, el){ o.app_select(el, multi); });
        // Previously focused elements that should be unfocused
        o.each(function(i, el){
            if($.inArray(el, apps) == -1)
                o.app_unselect(el, multi);
        });

        o.elements = $.merge([], apps);

        if(!o.dragging && multi) {
            Hive.Controls(o, false);
            o.controls.layout();
        }
        if(apps.length <= 1 && o.controls) o.controls.remove();
    };
    o.unfocus = function(app){
        if(app) o.update($.grep(o.elements, function(el){ return el !== app }));
        else o.update([]);
    };
    o.push = function(element) { 
        o.update(o.elements.concat([element]));
    };
    o.select = function(app_or_apps){
        return o.update($.isArray(app_or_apps) ? app_or_apps : [app_or_apps]);
    };
    o.selected = function(app){
        return $.inArray(app, o.elements) != -1;
    };

    o.divs = function(){
        return $.map(o.elements, function(a){ return a.div[0] });
    };

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
        var select = { top: o.drag_pos[1], right: o.drag_pos[0] + o.drag_dims[0],
            bottom: o.drag_pos[1] + o.drag_dims[1], left: o.drag_pos[0] };
        o.old_selection = o.new_selection;
        o.new_selection = $.grep(Hive.Apps.all(), function(el){
            var dims = el.dims();
            var pos = el.pos();
            return (select.top <= pos[1] && select.left <= pos[0] + o.offset
                && select.right >= pos[0] + dims[0] + o.offset && select.bottom >= pos[1] + dims[1]);
        });
        if (o.old_selection.length != o.new_selection.length){
            o.update($.unique($.merge(o.new_selection, o.initial_elements)));
        }
    };

    o.drag_start = function(e, dd) {
        Hive.drag_start();
        o.offset = $('#happs').offset().left;

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
    o.drag_end = function (e, dd) {
        Hive.drag_end();

        if(!o.drag_dims) return;
        o.dragging = false;
        if (o.pos) { o.update_focus(); }
        if (o.div) o.div.remove();
        o.update(o.elements);
    }

    o.copy = function(){
        var offset = [ 0, o.dims()[1] + 20 ], load_count = o.elements.length, copies;
        var load_counter = function(){
            load_count--;
            if( ! load_count ) {
                o.select( copies );
                Hive.History.group('copy group');
            }
        };
        Hive.History.begin();
        copies = $.map( o.elements, function(e){
            return e.copy({ offset: offset, load: load_counter, 'z_offset': o.elements.length })
        });
    }
    o.remove = function(){
        var sel = $.merge([], o.elements);
        o.unfocus();
        Hive.History.begin();
        $.each(sel, function(i, el){ el.remove() });
        Hive.History.group('delete group');
    };

    o.resize_start = function(){
        o.pos_ref = o.pos();
        o.dims_ref = o.dims();
        Hive.History.begin();
        o.each(function(i, el){
            var pos = el.pos();
            el.pos_ref = [ pos[0] - o.pos_ref[0], pos[1] - o.pos_ref[1] ];
            el.dims_ref = el.dims();
            el.scale_ref = el.scale ? el.scale() : null;
            el.history_point = el.history_helper_relative('resize');
        });
    };
    o.resize = function(delta){
        var scale_by = Math.max( (o.dims_ref[0] + delta[0]) / o.dims_ref[0],
            (o.dims_ref[1] + delta[1]) / o.dims_ref[1] );
        var dims = [ o.dims_ref[0] * scale_by, o.dims_ref[1] * scale_by ];
        o.each(function(i, el){
            el.pos_set([ el.pos_ref[0] * scale_by + o.pos_ref[0],
                el.pos_ref[1] * scale_by + o.pos_ref[1] ]);
            el.dims_set([ el.dims_ref[0] * scale_by, el.dims_ref[1] * scale_by ]);
            if(el.scale_ref !== null) el.scale_set(el.scale_ref * scale_by);
        });
        o.controls.layout();
    };
    o.resize_end = function(){
        o.each(function(i, el){ el.history_point.save() });
        Hive.History.group('resize group');
    };

    o.get_stack = function(){
        return o.elements.sort(function(a, b){ a.layer() - b.layer() });
    };
    o.stack_top = function(){
        Hive.History.begin();
        $.each(o.get_stack(), function(i, el){ el.stack_top() })
        Hive.History.group('stack group to top');
    };
    o.stack_bottom = function(){
        Hive.History.begin();
        $.each(o.get_stack().reverse(), function(i, el){ el.stack_bottom() })
        Hive.History.group('stack group to bottom');
    };

    o.make_controls.push(function(o){
        o.move_start = function(){
            Hive.drag_start();
            o.ref_pos = o.pos();
            Hive.History.begin();
        };
        o.move = function (e, dd, shallow) {
            var delta = [dd.deltaX, dd.deltaY];
            if(e.shiftKey) delta[ Math.abs(dd.deltaX) > Math.abs(dd.deltaY) ? 1 : 0 ] = 0;
            o.pos_set([ o.ref_pos[0] + delta[0], o.ref_pos[1] + delta[1] ]);
        };
        o.move_end = function(){
            Hive.drag_end();
            Hive.History.group('move group');
        };
        o.pos = function(){ var p = o.app.pos(); return [ p[0], p[1] ]; }

        o.padding = 7;

        o.div.drag('start', o.move_start).drag(o.move).drag('end', o.move_end);
    });

    $('#grid_guide').drag(o.drag).drag('start', o.drag_start).drag('end', o.drag_end);

    // Fallthrough click handler that unfocuses all apps if user clicks on background.
    $(window).click(function(e) {
        if(!Hive.Selection.count()) return;
        var hit = false;
        Hive.Selection.each(function(i,el){
            if( $.contains(el.div.get(0), e.target)
                || (el.controls && $.contains(el.controls.div.get(0), e.target))
            ) hit = true;
        });
        if(o.controls && $.contains(o.controls.div.get(0), e.target)) hit = true;
        if (!hit) Hive.Selection.unfocus();
    });

    $(document).keydown(function(e){ 
        // ctrl+[shift+]a to select all or none
        if( e.keyCode == 65 && e.ctrlKey ){
            o.select( e.shiftKey ? [] : Hive.Apps.all() );
            e.preventDefault();
            return;
        }

        o.each(function(i, el){ el.keyPress(e) });

        // TODO: improve efficiency by using o.controls.pos_set like drag handler
        // or improving o.bounds
        if(o.controls) o.controls.pos_update();
    });

    return o;
};

Hive.History = [];
Hive.History.init = function(){
    var o = Hive.History, group_start;
    o.current = -1;

    // These two methods are used to collapse multiple history actions into one. Example:
    //     Hive.History.begin()
    //     // code that that creates a lot of history actions
    //     Hive.History.group('group move')
    // TODO: replace begin and group with existing version of saver
    o.begin = function(){ group_start = o.current + 1 };
    o.group = function(name){
        var group_length = o.current - group_start + 1;
        if(group_length < 1) return;
        post_change = Hive.Selection.update;
        var action_group = o.splice(group_start, group_length);
        o.save(
            function(){ $.map(action_group, function(e){ e.undo() }); post_change() },
            function(){ $.map(action_group, function(e){ e.redo() }); post_change() },
            name
        );
        o.current = group_start;
        o.update_btn_titles();
    };

    // pushes an action into the history stack
    o.save = function(undo, redo, action_name){
        if( o[o.current + 1] ) o.splice(o.current + 1); // clear redo stack when saving
        o.push({ undo: undo, redo: redo, name: action_name });
        o.current += 1;
        o.update_btn_titles();
    };

    o.undo = function(){
        if(! o[o.current]) return false;
        o[o.current].undo();
        o.current -= 1;
        o.update_btn_titles();
        return false;
    };

    o.redo = function(){
        var next = o[ o.current + 1 ];
        if( ! next ) return false;
        next.redo();
        o.current += 1;
        o.update_btn_titles();
        return false;
    };
        
    o.update_btn_titles = function(){
        var current = o[o.current], next = o[ o.current + 1 ];
        $('#btn_undo').attr('title', current ? 'undo ' + current.name : 'nothing to undo');
        $('#btn_redo').attr('title', next ? 'redo ' + next.name : 'nothing to redo');
    };

    // Wrapper around o.save() for creating a history action from a getter and a setter
    // instead of an undo redo action. This is useful for the pattern of:
    //     var history_point = Hive.History.saver(get_foo_state, set_foo_state, 'foo');
    //     // perform some action that changes foo state
    //     history_point.save();
    // There is also history_point.exec(foo_state) for the case where no user interaction is
    // needed to change the state
    o.saver = function(getter, setter, name){
        var o2 = { name: name };
        o2.old_state = getter();

        o2.save = function(){
            o2.new_state = getter();
            o.save(
                function(){ setter(o2.old_state) },
                function(){ setter(o2.new_state) },
                o2.name
            );
        };

        o2.exec = function(state){
            setter(state);
            o2.save();
        };

        return o2;
    };

    o.update_btn_titles();
    $(window).keydown(function(e){
        if(e.ctrlKey && e.keyCode == 90) {
            o.undo();
            return false;
        }
        if(e.ctrlKey && e.keyCode == 89) {
            o.redo();
            return false;
        }
    });
    $('#btn_undo').click(Hive.History.undo);
    $('#btn_redo').click(Hive.History.redo);
};

Array.max = function(array){
    return Math.max.apply(Math, array);
};
Array.min = function(array){
    return Math.min.apply(Math, array);
};

Hive.new_app = function(s, opts) {
    if(!opts) opts = {};
    var load = opts.load;
    opts.load = function(a) {
        // Hive.upload_finish();
        a.center(opts.offset);
        a.dims_set(a.dims());
        Hive.Selection.select(a);
        if(load) load();
    };
    var app = Hive.App(s, opts);
    Hive.History.save(app._remove, app._unremove, 'create');
    return app;
};

Hive.new_file = function(files, opts) {
    // TODO-feature: depending on type and number of files, create grouping of
    // media objects. Multiple audio files should be assembled into a play
    // list. Multiple images should be placed in a table, or slide-show

    $.map(files, function(file, i){
        var app = $.extend({ file_name: file.name },
            js.dfilter(file, ['id', 'meta']), opts);

        // TODO: html files should just be saved on s3 and inserted as an <iframe>
        // if(file.mime.match(/text\/html/)){
        //     // Not using code for auto-embeding urls that resolve to html
        //     // pages because of too many problems with sites that
        //     // don't want to be framed. Just link to site instead.
        //     // app = {type: 'hive.html', content: '<iframe src="' + file.original_url + '" style="width: 100%; height: 100%;"></iframe>'};
        //     $.extend(app, { type: 'hive.text', content:
        //         $('<a>').attr('href', file.original_url).text(file.original_url).outerHTML() });
        // }

        // TODO: make this work...
        // image = { content: file.url }
        // audio = { src: file.url }
        // link = { content: $('<a>').attr('href', file.url).text(file.name).outerHTML() }

        if(file.mime.match(/image\/(png|gif|jpeg)/)) app.type = 'hive.image';
        else if(file.mime.match(/audio\//)) app.type = 'hive.audio';
        else {
            app.type = 'hive.text';
            // TODO: implement read-only for text app so server response can simply
            // reset the link content, and not potentially lose changes to
            // text box made while file was uploading
            // app.read_only = true;
        }
        app.url = file.url;

        Hive.new_app(app, { offset: [20*i, 20*i] } );
    });

    return false;
}

Hive.init = function(exp, page){
    Hive.Exp = exp;
    Hive.edit_page = page;

    //setInterval(Hive.set_draft, 5000);
    if(!debug_mode){
        window.onbeforeunload = function(){
            //try { Hive.set_draft(); }
            //catch(e) { return "If you leave this page any unsaved changes to your expression will be lost."; }
            return "If you leave this page any unsaved changes to your expression will be lost.";
        };
    }
    //var draft = Hive.get_draft();
    //if(draft) Hive.Exp = draft;

    var ua = navigator.userAgent;
    if ( !ua.match(/(Firefox|Chrome|Safari)/i) || ua.match(/OS 5(_\d)+ like Mac OS X/i)) {
        showDialog('#editor_browsers');
    }

    var old_env = Hive.env();
    $(window).resize(function(e) {
        var new_env = Hive.env();
        $.map(Hive.Apps, function(a) {
            a.state_relative_set(new_env, a.state_relative(old_env));
        });
        if(Hive.Selection.controls) Hive.Selection.controls.layout();
        old_env = new_env;
    });
    $(window).resize();

    if (Hive.Exp.fixed_width){
        Hive.make_fixed(Hive.Exp.fixed_width);
    }

    $('#text_default').click(function(e) {
        Hive.new_app({ type : 'hive.text', content : '' });
    });
    $('#text_header').click(function(e) {
        Hive.new_app({ type: 'hive.text', content: '<span style="font-weight:bold">&nbsp;</span>',
            scale : 3 });
    });


    if(!Hive.Exp.background) Hive.Exp.background = { };
    if(!Hive.Exp.background.color) Hive.Exp.background.color = '#FFFFFF';

    Hive.bg_div = $('#bg');
    Hive.append_color_picker($('#color_pick'), Hive.bg_color_set,
        Hive.Exp.background.color);

    $('#image_background').click(function() {
        var history_point;
        showDialog('#dia_edit_bg', {
            fade: false,
            open: function(){ history_point = Hive.History.saver(
                function(){ return $.extend(true, {}, Hive.Exp.background) },
                Hive.bg_set, 'change background'
            ) },
            close: function(){ history_point.save() }
        });
    });

    $('#bg_remove').click(function(){
        delete Hive.Exp.background.url;
        Hive.bg_set({});
    });

    $('#bg_opacity').focus(function() { $('#bg_opacity').focus().select() }).keyup(function(e) {
        Hive.Exp.background.opacity = parseFloat($(e.target).val()) / 100;
        Hive.bg_set(Hive.Exp.background);
    });

    Hive.bg_set(Hive.Exp.background);

    $('#bg_upload').bind('with_files', function(ev, files){
        Hive.bg_set(files[0]);
    }).bind('response', function(ev, files){
        Hive.Exp.background.url = files[0].url;
    });

    $('#link_upload').bind('with_files', function(ev, files){
        // TODO-polish: maybe create link text box first
    }).bind('response', function(ev, files){
        Hive.Exp.background.url = files[0].url;
        // TODO-polish: maybe deal with multiple files
        var file = files[0];
        var app = { type: 'hive.text', content:
                $('<a>').attr('href', file.url).text(file.name)[0].outerHTML,
            file_name: file.name
        };
        Hive.new_app(app);
    });

    // var new_link = function() { asyncUpload({
    //     start: Hive.upload_start, error: uploadErrorCallback,
    //     success : function(data) {
    //         if(data.error) { return error(); }
    //     }
    // }); };
    // 
    // $('#insert_image').click(upload_file);
    // $('#image_upload').click(upload_file);
    // $('#insert_audio').click(upload_file);
    // $('#audio_upload').click(upload_file);
    // $('#insert_file' ).click(new_link);
    

    hover_menu('#insert_text', '#menu_text');

    var image_menu = hover_menu('#insert_image', '#menu_image');
    var image_embed_menu = hover_menu($('#image_from_url'), $('#image_embed_submenu'),
        { click_persist: $('#image_embed_code'), auto_close: false,
            open: function(){ $('#image_embed_code').focus(); }, group: image_menu });
    $('#embed_image_form').submit(function(){
        Hive.embed_code('#image_embed_code');
        image_embed_menu.close();
        image_menu.close();
        return false;
    });

    hover_menu('#insert_audio', '#menu_audio');

    var embed_menu = hover_menu('#insert_embed', '#menu_embed', {
        open: function(){ $('#embed_code').get(0).focus() } });
    $('#embed_done').click(function() { Hive.embed_code('#embed_code'); embed_menu.close(); });

    hover_menu('#insert_shape', '#menu_shape');
    $('#shape_rectangle').click(function(e) {
        Hive.new_app({ type : 'hive.rectangle', content :
            { color : colors[24], 'border-color' : 'black', 'border-width' : 0,
                'border-style' : 'solid', 'border-radius' : 0 } });
    });
    $('#shape_sketch').click(function(e) {
        Hive.new_app({ type: 'hive.sketch', dimensions: [700, 700 / 1.6], content: { brush: 'simple', brush_size: 10 } });
    });

    hover_menu('#insert_file', '#menu_file');

    ////////////////////////////////////////////////////////////////////////////////
    // Labs features
    // if ($('#labs, #menu_labs').length == 2) {
    //     hover_menu($('#labs'), $('#menu_labs'), { layout: 'center_y', min_y: 77 });
    // }
    // var set_make_fixed_text = function(){
    //     var text = Hive.Exp.fixed_width ? "Make Auto-Scaling" : "Make Fixed-Width";
    //     $('#make_fixed').text(text);
    // };
    // set_make_fixed_text();
    // $('#make_fixed').click(function(e) {
    //     if (Hive.Exp.fixed_width){
    //         Hive.make_fixed(false);
    //     } else {
    //         Hive.make_fixed(1000);
    //     }
    //     set_make_fixed_text();
    // });
    // $('#edit_script').click(function() {
    //     showDialog('#dia_edit_script', {
    //         fade: false,
    //         close: function() {
    //             var script = $('#expr_script_input').val();
    //             Hive.Exp.script = script;
    //         }
    //         //open: function(){ history_point = Hive.History.saver(
    //         //    function(){ return $.extend(true, {}, Hive.Exp.background) },
    //         //    Hive.bg_set, 'change background'
    //         //) },
    //         //close: function(){ history_point.save() }
    //     });
    // });
    // $('#edit_style').click(function() {
    //     showDialog('#dia_edit_style', {
    //         fade: false,
    //         //open: function(){ history_point = Hive.History.saver(
    //         //    function(){ return $.extend(true, {}, Hive.Exp.background) },
    //         //    Hive.bg_set, 'change background'
    //         //) },
    //         close: function(){
    //             var style = $('#expr_style_input').val();
    //             Hive.Exp.style = style;
    //             $('#expr_style').html( style );
    //             //history_point.save()
    //         }
    //     });
    // });
    // $('#raw_html').click(function(){
    //     var app = {type: 'hive.raw_html', content: '<div></div>'};
    //     Hive.new_app(app);
    // });
    // End labs
    ////////////////////////////////////////////////////////////////////////////////
    
    $('#btn_grid').click(Hive.toggle_grid);

    $('#media_upload').bind('with_files', function(ev, files){
        // media files are available immediately upon selection
        Hive.new_file(files);
    }).bind('response', function(ev, files){
        // after file is uploaded, save meta data and id from server by
        // matching up file name
        var find_apps = function(name){
            return Hive.Apps.all().filter(function(a){
                return (a.init_state.file_name == name) });
        };
        files.map(function(f){
            find_apps(f.name).map(function(a){
                var upd = { file_id: f.id, url: f.url };
                if(f.meta) upd.file_meta = f.meta;
                a.state_update(upd);
            });
        });
    });

    var busy_e = $('#btn_save .loading');
    $(document).ajaxStart(function(){
        // TODO-draft: set a flag to block saving while uploads are in progress
        busy_e.show();
    }).ajaxStop(function(){
        busy_e.hide();
    }).ajaxError(function(ev, jqXHR, ajaxOptions){
        // TODO-polish upload_error: show some warning, and somehow indicate
        // which app(s) failed to save
    });

    var checkUrl = function(){
        var u = $('#url').val();
        if(u.match(/[^\w.\/-]/)) {
            alert("Please just use letters, numbers, dash, period and slash in URLs. It makes it easier to share on other websites.");
            $('#url').focus();
            return false;
        } else {
            return true;
        }
    };

    var save_menu = hover_menu('#btn_save', '#menu_save',
        { auto_height : false, auto_close : false,
            click_persist : '#menu_save' });
    $('#save_submit').click(function(){
        if( ! $(this).hasClass('disabled') ){
            if(checkUrl()){
                window.onbeforeunload = null; //Cancel the warning for leaving the page
                $(this).addClass('disabled');
                Hive.save();
            }
        }
    });
    $('#save_overwrite').click(function() {
        Hive.Exp.overwrite = true;
        Hive.save();
    });

    // var setThumb = function(app){
    //     // Set thumb_id property for the server to find the appropriate file object
    //     // if a default thumb a pseudo file_id, id<10 is chosen. 
    //     // this should be replaced when default thumbs are handled as file objects -JDT 2012-01-13
    //     Hive.Exp.thumb_file_id = app.file_id;
    //     $('#current_thumb').attr('src',
    //         app.content.replace(/(amazonaws.com\/[0-9a-f]*$)/,'$1_190x190') );
    // };
    // var dia_thumbnail;
    // $('#btn_thumbnail').click(function() {
    //     dia_thumbnail = showDialog('#dia_thumbnail');
    //     var user_thumbs = $.map(Hive.Exp.images, function(app){
    //        if (typeof(app.file_id) != "undefined") { // Non S3 images can't be used for thumbs
    //            var img = $('<img>').attr('src', app.thumb).attr('data-file-id', app.file_id);
    //            var e = $("<div class='thumb'>").append(img).get(0);
    //            return e;
    //        };
    //     });
    //     $('#expr_images').empty().append(user_thumbs);
    //     $('#dia_thumbnail .thumb img').click(function() {
    //         setThumb({file_id: $(this).attr('data-file-id'), content: this.src});
    //         dia_thumbnail.close();
    //         return false;
    //     });
    // });
    
    // Automatically update url unless it's an already saved
    // expression or the user has modified the url manually
    $('#menu_save #title').bind('keydown keyup', function(){
        if (!(Hive.Exp.home || Hive.Exp.created || $('#url').hasClass('modified') )) {
            $('#url').val($('#title').val().replace(/[^0-9a-zA-Z]/g, "-")
                .replace(/--+/g, "-").replace(/-$/, "").toLowerCase());
        }
    }).keydown();

    $('#url').focus(function(){
        $(this).addClass('modified');
    });

    $('#menu_save #title').blur(function(){
        $('#title').val($('#title').val().trim());
    }).blur();

    $('#url').change(checkUrl);

    hover_menu($('#privacy' ), $('#menu_privacy'), { group: save_menu } );
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

    Hive.Apps.init(Hive.Exp.apps);

    Hive.History.init();
};

// Matches youtube and vimeo URLs, any URL pointing to an image, and
// creates the appropriate App state to be passed to Hive.new_app.
Hive.embed_code = function(element) {
    var c = $(element).val().trim(), app;

    if(m = c.match(/^https?:\/\/www.youtube.com\/.*?v=(.*)$/i)
        || (m = c.match(/src="https?:\/\/www.youtube.com\/embed\/(.*?)"/i))
        || (m = c.match(/http:\/\/youtu.be\/(.*)$/i))
    ) {
        var url = '//www.youtube.com/v/' + m[1]
            + '?rel=0&amp;showsearch=0&amp;showinfo=0&amp;fs=1';
        app = { type : 'hive.html', content : 
              '<object type="application/x-shockwave-flash" style="width:100%; height:100%" '
            + 'data="' + url + '"><param name="movie" value="' + url + '">'
            + '<param name="allowFullScreen" value="true">'
            + '<param name="wmode" value="opaque"/></object>' };
    }

    else if(m = c.match(/^https?:\/\/(www.)?vimeo.com\/(.*)$/i))
        app = { type : 'hive.html', content :
            '<iframe src="//player.vimeo.com/video/'
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
        app = { type : 'hive.html', content : embed[0].outerHTML };
    }

    else if(c.match(/^https?:\/\//i)) {
        var error = function(data, msg){
            alert('Sorry, failed to load url ' + c + '.\n' + msg);
            // Hive.upload_finish();
        };
        var callback = function(data) {
            if( data.error ){
                if(m = c.match(/^https?:\/\/(.*)(jpg|jpeg|png|gif)$/i)){
                    app = { type : 'hive.image', content : c }
                    Hive.new_app(app);
                } else {
                    return error(false, data.error);
                }
            }
            Hive.new_file(data/*, { load: Hive.upload_finish }*/);
            $(element).val('');
        }
        // Hive.upload_start();
        $.ajax($('#media_upload').attr('action'), {
            data: { remote: true, url: c }
            , success: callback
            , dataType: 'json'
            , error: error
            , type: 'POST'
        });
        return;
    }

    else {
        var dom = $('<div>');
        dom[0].innerHTML = c;
        dom.find('object').append($('<param name="wmode" value="opaque"/>'));
        dom.find('embed').attr('wmode', 'opaque');
        dom.find('iframe').attr('width', '100%').attr('height', '100%');
        app = { type : 'hive.html', content: dom[0].innerHTML };
    }

    Hive.new_app(app);
    $(element).val('');
} 

Hive.drag_start = noop; // function(){ hovers_active(false) };
Hive.drag_end = noop; // function(){ hovers_active(true) };

Hive.save = function() {
    var expr = Hive.state();

    if(expr.name.match(/^profile/)) {
        alert('The name "profile" is reserved.');
        return false;
    }

    var on_response = function(ev, ret){
        // Hive.upload_finish();
        if(typeof(ret) != 'object')
            alert("Sorry, something is broken :(. Please send us feedback");
        if(ret.error == 'overwrite') {
            $('#expr_name').html(expr.name);
            showDialog('#dia_overwrite');
            $('#save_submit').removeClass('disabled');
        }
        else if(ret.id) Hive.edit_page.view_expr(ret);
    }, on_error = function(ev, ret){
        // Hive.upload_finish();
        if (ret.status == 403){
            relogin(function(){ $('#btn_save').click(); });
        }
        $('#save_submit').removeClass('disabled');
    };

    $('#expr_save .expr').val(JSON.stringify(Hive.state()));
    $('#expr_save').bind('response', on_response)
        .bind('error', on_error).submit();
};
Hive.get_draft = function() {
    return localStorage.expr_draft ? JSON.parse(localStorage.expr_draft) : null }
Hive.set_draft = function() { localStorage.expr_draft = JSON.stringify(Hive.state()); }
Hive.del_draft = function() { delete localStorage.expr_draft; }


Hive.state = function() {
    //Hive.Exp.domain = $('#domain').val();
    Hive.Exp.name = $('#url').val();
    Hive.Exp.apps = Hive.Apps.state();
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
    e.src = e.src_d = asset('skin/edit/grid-' + (Hive.grid ? 'on' : 'off') + '.png');
    $('#grid_guide').css(Hive.grid ?
          { 'background-image' : "url('" + asset('skin/edit/grid_square.png') + "')",
              'background-repeat' : 'repeat' }
        : { 'background-image' : '' }
    );
};

Hive.bg_color_set = function(c) {
    if(!c) c = '';
    Hive.bg_div.add('#bg_preview').css('background-color', c);
    Hive.Exp.background.color = c;
};
Hive.bg_set = function(bg, load) {
    Hive.Exp.background = bg;
    Hive.bg_color_set(bg.color);

    var img = Hive.bg_div.find('img'),
        imgs = img.add('#bg_preview_img'),
        url = bg.content || bg.url;
    if(url) bg.url = url;

    if(bg.url) imgs.show();
    else { imgs.hide(); return }

    imgs.attr('src', bg.url);
    img.load(function(){
        setTimeout(layout.place_apps, 0);
        if(load) load();
    });
    if(bg.opacity) imgs.css('opacity', bg.opacity);
};
Hive.bg_change = function(s){
    Hive.History.saver(
        function(){ return $.extend(true, {}, Hive.Exp.background) },
        Hive.bg_set, 'change background'
    ).exec(s);
};

Hive.make_fixed = function(width){
    if (width === false){
        delete Hive.Exp.fixed_width;
        $('#happs, #controls').attr('style', '');
    } else {
        Hive.Exp.fixed_width = width;
        $('#happs, #controls').css({
            width: Hive.Exp.fixed_width, 
            margin: '0 auto', 
            position: 'relative', 
        });
        $('#happs').css({
            'border-left': '1px dashed rgba(127,127,127,0.5)', 
            'border-right': '1px dashed rgba(127,127,127,0.5)', 
            height: '100%'
        });
    }
};

function remove_all_apps() {
    var aps = $.map(Hive.Apps, id); // store a copy of Apps so we can destructively update it
    $.map(apps, function(a) { a.remove() });
}

Hive.append_color_picker = function(container, callback, init_color, opts){
    // opts = $.extend({iframe: false}, opts);
    var o = {}, init_color = init_color || '#000000',
        e = color_picker_template(colors),
        bar = e.find('.hue_bar'),
        shades = e.find('.shades'),
        manual_input = e.find('.shades'),
        pickers = e.find('.color_select');

    var to_rgb = function(c) {
        return $.map($('<div>').css('color', c).css('color')
            .replace(/[^\d,]/g,'').split(','), function(v){ return parseInt(v) });
    }, to_hex = function(color){
        if (typeof(color) == "string") color = to_rgb(color);
        return '#' + $.map(color, function(c) {
                var s = c.toString(16);
                return s.length == 1 ? '0' + s : s
            }).join('').toUpperCase();
    }, init_color = to_hex(init_color);

    pickers.each(function(i, el){
        el = $(el);
        var c = el.attr('val');
        el.click(function(ev){
            set_color(c);
            manual_input.val(c);
            callback(c, to_rgb(c));
        }).bind('mousedown', function(e){ e.preventDefault()});
    });

    var hex_changed = false;
    var update_hex = o.update_hex = function() {
        if (!hex_changed) return;
        hex_changed = false;
        var v = manual_input.val();
        var c = $('<div>').css('color', v).css('color');
        callback(c, to_rgb(c));
    };

    // Prevent unwanted nudging of app when moving cursor in manual_input
    manual_input.bind('mousedown keydown', function(e){
        hex_changed = true;
        e.stopPropagation();
    });

    manual_input.blur(update_hex).keypress(function(e){
        if (e.keyCode == 13) {
            if (opts && opts.field_to_focus){
                opts.field_to_focus.focus();
            } else {
                manual_input.blur();
            }
        }
    });

    // saturated color picked from color bar
    var hsv = [0, 0, 1];
    var get_hue = function(e) {
        hsv[0] = bound(Math.floor(e.pageY - bar.offset().top) / bar.height(), 0, 1);
        shades.css('background-color', 'rgb(' + hsvToRgb(hsv[0], 1, 1).join(',') + ')');
        calc_color();
    };
    bar.click(get_hue).drag(get_hue);

    var set_color = function(c) {
        var rgb = to_rgb(c);
        hsv = rgbToHsv(rgb[0], rgb[1], rgb[2]);
        shades.css('background-color', 'rgb(' + hsvToRgb(hsv[0], 1, 1).join(',') + ')');
    };
    set_color(init_color);
    o.set_color = function(color){
        manual_input.val(to_hex(color));
        set_color(color);
    };

    var get_shade = function(e) {
        hsv[2] = bound((e.pageX - shades.offset().left) / 120, 0, 1);
        hsv[1] = bound((e.pageY - shades.offset().top) / 120, 0, 1);
        calc_color();
    };
    shades.click(get_shade).drag(get_shade);

    var calc_color = function() {
        var color = hsvToRgb(hsv[0], hsv[1], hsv[2]);
        var hex = to_hex(color);
        manual_input.val(hex);
        callback(hex, color);
    }

    // if (opts.iframe){
    //     Hive.input_frame(manual_input, e, {width: 124});
    // }

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

        return $.map([r * 255, g * 255, b * 255], Math.round);
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

    container.append(e);
    return o;
};

Hive.random_str = function(){ return Math.random().toString(16).slice(2); };

Hive.input_frame = function(input, parent, opts){
    opts = $.extend({width: 200, height: 45}, opts)

    var frame_load = function(){
        frame.contents().find('body')
            .append(input)
            .css({'margin': 0, 'overflow': 'hidden'});
    };
    var frame = $('<iframe>').load(frame_load)
        .width(opts.width).height(opts.height)
        .css({
            'display': 'inline-block',
            'float': 'left',
            'margin-top': '5px'
        });
    parent.append(frame);
    input.css({
        'border': '5px solid hsl(164, 57%, 74%)',
        'width': '100%',
        'padding': '5px',
        'font-size': '17px'
    });
};

// Convenience functions for interactive coding
Hive.sel = function(n) {
    if(!n) n = 0;
    return Hive.Selection.elements[n];
}

Hive.foc = function(n){ Hive.Selection.update([Hive.Apps[n]]) };

$(function(){
    $(window).keydown(function(e){
        if(e.shiftKey && e.keyCode == 120){ // F9
            debugger;
            console.log(sel().content_element.find('.hive_selection'));
        }
    });
});

Hive.print_stack = function(){
    //try { thiswillthrowanerror^2 }
    //catch(e) { console.log(e.stack) }
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

return Hive;

});