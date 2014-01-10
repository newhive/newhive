/* Copyright 2010, A Reflection Of Inc */
// thenewhive.com client-side expression editor version 0.1
define([
    'browser/jquery'
    ,'browser/js'

    ,'./apps'
    ,'./util'
    ,'./events'
    ,'./env'
    ,'ui/menu'
    ,'ui/codemirror'
    ,'ui/dialog'
    ,'ui/util'
    ,'browser/layout'
    ,'server/context'
    ,'ui/colors'
    ,'browser/upload'

    ,'browser/jquery/jplayer/skin'
    ,'browser/jquery/rotate.js'
    ,'js!browser/jquery/event/drag.js'
], function(
    $
    ,js

    ,hive_app
    ,u
    ,evs
    ,env
    ,Menu
    ,CodeMirror
    ,dialog
    ,ui_util
    ,layout
    ,context
    ,colors
    ,upload
){

var Hive = {}
    ,debug_mode = context.config.debug_mode
    ,bound = js.bound
    ,noop = function(){}
    ,Funcs = js.Funcs
    ,asset = ui_util.asset
;
Hive.show_move_sensitivity = true;
Hive.no_snap = false;
Hive.asset = asset;
Hive.u = u;

Hive.hover_menu = function(handle, drawer, opts){
    return Menu(handle, drawer, $.extend({ auto_height: false }, opts));
};

Hive.showDialog = function(jq, opts){
    var d = dialog.create(jq, opts);
    d.open();
    return d;
};

// Generic widgets for all App types. This objects is responsible for the
// selection border, and all the buttons surounding the App when selected, and for
// these button's behavior.  App specific behavior is added by
// hive_app.App.Foo.Controls function, and a list of modifiers in app.make_controls
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

    o.append_link_picker = function(d, opts) {
        opts = $.extend({ open: noop, close: noop }, opts);
        var e = $("<div class='control drawer link'>");
        var cancel_btn = $("<img>").addClass('hoverable')
            .attr('src', asset('skin/edit/delete_app.png'))
            .attr('title', 'Clear link')
            .css('margin', '12px 0 0 5px');
        var input = $('<input type="text">');

        d.append(e);
        Hive.input_frame(input, e);
        e.append(cancel_btn);

        // set_link is called when input is blurred
        var set_link = function(){
            var v = input.val();
            // TODO: improve URL guessing
            if(!v.match(/^https?\:\/\//i) && !v.match(/^\//) && v.match(/\w+\.\w{2,}/)) v = 'http://' + v;
            o.app.link(v);
        };

        // Don't have to worry about duplicating handlers because all elements
        // were just created from scratch
        input.on('blur', set_link);

        var m = o.hover_menu(d.find('.button.link'), e, {
             open : function() {
                 var link = o.app.link();
                 opts.open();
                 input.focus();
                 input.val(link);
             }
            ,click_persist : input
            ,close : function() {
                // No need for explicit call to set_link here because it is
                // handled on blur, and blur is always triggered by one of the
                // clauses below
                if (opts.field_to_focus) {
                    opts.field_to_focus.focus();
                }
                input.blur();
                opts.close();
            }
            ,auto_close : false
        });

        // timeout needed to get around firefox bug
        var close_on_delay = function(){
            setTimeout(function(){m.close(true)}, 0);
        };
        e.find('img').click(function() {
            input.focus();
            input.val('');
            close_on_delay();
        });
        input.keypress(function(e) {
            if(e.keyCode == 13) {
                close_on_delay();
            }
        });
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

    o.addControl = function(ctrls) { $.map(ctrls.clone(false), o.appendControl); };
    o.addButton = function(ctrls) { $.map(ctrls.clone(false), o.appendButton); };
    o.addControls = function(ctrls) { $.map(ctrls.clone(false).children(), o.appendControl); };
    o.hover_menu = function(handle, drawer, opts) {
        return Menu(handle, drawer, $.extend({
            auto_height: false, offset_y : o.padding + 1}, opts))
    };

    var pad_ul = [45, 45], pad_br = [45, 110], min_d = [135, 40];
    var pos_dims = function(){
        var ap = o.app.pos(),
            win = $(window), wdims = [win.width(), win.height()],
            pos = [ Math.max(pad_ul[0] + window.scrollX,
                ap[0]), Math.max(pad_ul[1] + window.scrollY, ap[1]) ],
            ad = o.app.dims(),
            dims = [ ap[0] - pos[0] + ad[0], ap[1] - pos[1] + ad[1] ];
        if(dims[0] + pos[0] > wdims[0] + window.scrollX - pad_br[0])
            dims[0] = wdims[0] + window.scrollX - pad_br[0] - pos[0];
        if(dims[1] + pos[1] > wdims[1] + window.scrollY - pad_br[1])
            dims[1] = wdims[1] + window.scrollY - pad_br[1] - pos[1];
        // TODO-bug: make pos adjust in the correct dimension depending on
        // which edge app overlaps
        // var minned_dims = [ Math.max(min_d[0], dims[0]),
        //     Math.max(min_d[1], dims[1]) ];
        // pos = u._sub(pos)( u._sub(minned_dims)(dims) );
        return { pos: pos, dims: dims };
    };
    o.pos = function(){ return pos_dims().pos };
    o.dims = function(){ return pos_dims().dims };

    o.layout = function() {
        var pos = o.pos(), dims = o.dims(),
            cx = dims[0] / 2, cy = dims[1] / 2, p = o.padding,
            bw = o.border_width, outer_l = -cx -bw - p,
            outer_width = dims[0] + bw*2 + p*2, outer_height = dims[1] + p * 2 + 1;

        o.div.css({ left: pos[0], top: pos[1] });

        o.select_box.css({ left: cx, top: cy });
        o.select_borders.eq(0).css({ left: outer_l,
            top: -cy -bw -p, width: outer_width, height: bw }); // top
        o.select_borders.eq(1).css({ left: cx + p,
            top: -cy -p - bw + 1, height: outer_height + bw * 2 -2, width: bw }); // right
        o.select_borders.eq(2).css({ left: outer_l,
            top: cy + p, width: outer_width, height: bw }); // bottom
        o.select_borders.eq(3).css({ left: outer_l,
            top: -cy -p - bw + 1, height: outer_height + bw * 2 -2, width: bw }); // left
        if(o.multiselect) return;

        //o.c.undo   .css({ top   : -38 - p, right  :  61 - p });
        o.c.copy   .css({ left: dims[0] - 45 + p, top: -38 - p });
        o.c.remove .css({ left: dims[0] - 14 + p, top: -38 - p });
        o.c.stack  .css({ left: dims[0] - 78 + p, top: dims[1] + 8 + p });
        o.c.buttons.css({ left: -bw - p, top: dims[1] + p + 10,
            width: dims[0] - 60 });
    };

    o.div = $('<div>').addClass('controls');
    $('#controls').append(o.div);

    // add borders
    o.select_box = $("<div style='position: absolute'>");
    var border = $('<div>').addClass('select_border drag ehapp');
    o.select_borders = border.add(border.clone().addClass('right'))
        .add(border.clone().addClass('bottom'))
        .add(border.clone().addClass('left'));
    border.eq(0).addClass('top'); // add 'top' class after the others were cloned
    // TODO-refactor replace with evs.on
    evs.on(o.select_borders, 'dragstart', o.app)
        .on(o.select_borders, 'drag', o.app)
        .on(o.select_borders, 'dragend', o.app);
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
            var copy = o.app.copy({ load: function(){
                Hive.Selection.select(copy);
            } });
        });
        d.find('.stack_up').click(o.app.stack_top);
        d.find('.stack_down').click(o.app.stack_bottom);

        $.map(o.app.make_controls, function(f){ f(o) });

        o.c.buttons = d.find('.buttons');
        d.find('.hoverable').each(function(i, el){ ui_util.hoverable($(el)) });
    }

    o.layout();
    return o;
};


// Most general event handlers
Hive.handler_type = 3;
Hive.dragstart = noop; // function(){ hovers_active(false) };
Hive.dragend = function(){
    // TODO-usability: fix disabling hover states in ui/util.hoverable
    // hovers_active(true)
    // In case scrollbar has been toggled:
    u.layout_apps(); 
};
Hive.mouse_pos = [0, 0];
Hive.mousemove = function(ev){
    Hive.mouse_pos = [ev.clientX, ev.clientY];
};
Hive.keydown = function(ev){
    // TODO-feature-editor-prompts #706: if key pressed is a word character,
    // create hive.text app with content of the character pressed

    if(ev.ctrlKey && ev.keyCode == 90){
        env.History.undo();
        return false;
    }
    else if(ev.ctrlKey && ev.keyCode == 89){
        env.History.redo();
        return false;
    }
};

Hive.scroll = function(ev){
    if(Hive.Selection.controls)
        Hive.Selection.controls.layout();
    Hive.Selection.elements().map(function(app){
        app.controls.layout() });
};


env.Selection = Hive.Selection = function(){
    var o = Hive.Selection, elements = [];

    o.elements = function(){ return elements.slice(); };
    o.count = function(){ return elements.length; };
    o.each = function(fn){ $.each(elements, fn) };
    o.make_controls = [];
    o.handler_type = 2;

    // relative coords and sizes for each app
    var _positions = [], _scales = [];
    // cached upper-left-most app position and composite size
    var _pos = [0,0], _dims = [0,0];

    // DEBUG
    o._scales = function(){ return _scales; }

    hive_app.App.has_resize(o);

    // BEGIN-event-handlers

    o.is_multi = function(ev) { return ev.shiftKey || ev.ctrlKey; }

    // mousedown comes from body, click comes from app div. Binding clicks
    // from app div prevents deselecting everything else at the start of a
    // group drag operation
    o.click = o.mousedown = function(ev){
        var app = ev.data;
        if(app){
            if (context.flags.shift_does_raise && ev.shiftKey) {
                if (ev.ctrlKey)
                    app.stack_bottom();
                else
                    app.stack_top();
                return;
            }
            if(o.is_multi(ev)){
                if(o.selected(app)) o.unfocus(app);
                else o.push(app);
            }
            else o.update([ app ]);
        }
        else {
            // unfocus all apps if click was not on an app
            if(!o.count() || o.is_multi(ev))
                return;
            var hit = false;
            o.each(function(i, el){
                if( $.contains(el.div.get(0), ev.target) || (
                    el.controls &&
                        $.contains(el.controls.div.get(0), ev.target)
                ) ) hit = true;
            });
            if(o.controls && $.contains(o.controls.div.get(0), ev.target))
                hit = true;
            if(!hit) o.unfocus();
            return true;
        }
    };

    var dragging = false, drag_target;
    o.dragstart = function(ev, dd){
        o.dragging = true;
        $("#controls").hidehide();
        o.reset_sensitivity();

        var app = ev.data;
        if(app){
            // If target is in selection, drag whole selection
            if(elements.indexOf(ev.data) >= 0)
                drag_target = o;
            else
                drag_target = ev.data;
            o.move_start();
            return;
        }

        o.offset = $('#happs').offset().left;

        o.new_selection = [];
        $('.app_select').remove();
        o.div = $("<div class='app_select'>").css('z-index', 3);
        o.select_box = $("<div class='select_box border selected dragbox'>")
            .css({position: 'relative', padding: 0, left: '-5px', top: '-5px'});
        $(document.body).append(o.div);
        o.div.append(o.select_box);
        o.start = [ev.pageX, ev.pageY];
        if (ev.shiftKey || ev.ctrlKey){
            o.initial_elements = elements.slice();
        } else {
            o.initial_elements = [];
            o.unfocus();
        }
    };
    o.drag = function(ev, dd){
        if (!o.dragging) return;

        var delta = [dd.deltaX, dd.deltaY];
        o.sensitivity = o.calculate_sensitivity(delta);
        var app = ev.data;
        if(app){
            o.move_handler(ev, delta);
            return;
        }

        o.drag_dims = [Math.abs(dd.deltaX), Math.abs(dd.deltaY)];
        o.drag_pos = [dd.deltaX < 0 ? ev.pageX : o.start[0],
            dd.deltaY < 0 ? ev.pageY : o.start[1]];
        o.div.css({ left : o.drag_pos[0], top : o.drag_pos[1],
            width : o.drag_dims[0], height : o.drag_dims[1] });
        o.update_focus(ev);
    };
    o.dragend = function (ev, dd) {
        o.dragging = false;
        $("#controls").showshow();

        var app = ev.data;
        if(app){
            o.move_end();
            return;
        }

        if(!o.drag_dims) return;
        o.select_box.remove();
        if(o.pos) o.update_focus();
        if(o.div) o.div.remove();
        o.update(elements);
    }
    o.update_focus = function(event){
        var select = { top: o.drag_pos[1], right: o.drag_pos[0] + o.drag_dims[0],
            bottom: o.drag_pos[1] + o.drag_dims[1], left: o.drag_pos[0] };
        o.old_selection = o.new_selection;
        o.new_selection = $.grep(hive_app.Apps.all(), function(el){
            var dims = el.dims();
            var pos = el.pos();
            return (select.top <= pos[1] && select.left <= pos[0] + o.offset
                && select.right >= pos[0] + dims[0] + o.offset && select.bottom >= pos[1] + dims[1]);
        });
        if (o.old_selection.length != o.new_selection.length){
            o.update($.unique($.merge(o.new_selection, o.initial_elements)));
        }
    };

    var old_states;
    var get_targets = function(){
        return (drag_target == o ? elements : [drag_target]); };
    var get_states = function(){
        return get_targets().map(function(a){ return a.state_relative(); }) };
    var change_start = function(){ old_states = get_states(); };
    var change_end = function(name){
        var apps = get_targets().slice(), new_states = get_states(),
            start_states = old_states.slice();
        env.History.save(
            function(){ $.each(apps, function(i, a){
                a.state_relative_set(start_states[i]) }) },
            function(){ $.each(apps, function(i, a){
                a.state_relative_set(new_states[i]) }) },
            name
        );
    };

    var history_point, ref_pos;
    o.move_start = function(){
        var moved_obj = drag_target || o;
        ref_pos = moved_obj.pos_relative();
        change_start();
    };
    o.move_relative = function(delta, axis_lock){
        if(!ref_pos) return;
        if(axis_lock)
            delta[ Math.abs(delta[0]) > Math.abs(delta[1]) ? 1 : 0 ] = 0;
        var pos = u._add(ref_pos)(delta);
        // TODO-feature-snap: check key shortcut to turn off snapping
        if(!Hive.no_snap){
            var excludes = {};
            if(drag_target.id) excludes[drag_target.id] = true;
            pos = u.snap_helper(drag_target.bounds_tuple_relative(pos), {
                exclude_ids: excludes,
                snap_strength: .05,
                snap_radius: 18,
                sensitivity: o.sensitivity, });
        }
        drag_target.pos_relative_set(pos);
        o.layout();
    };
    o.move_handler = function(ev, delta){
        delta = u._div(delta)(env.scale());

        o.move_relative(delta, ev.shiftKey);
    };
    o.move_end = function(){
        change_end('move');
        Hive.set_debug_info("");
        $(".ruler").hidehide();
    };

    var ref_dims;
    o.resize_start = function(){
        $("#controls").hidehide();
        ref_dims = o.dims_relative();
        change_start();
    };
    o.resize = function(delta){
        o.resize_relative(u._div(delta)(env.scale()));
    };
    o.get_aspect = function() {
        var dims = o.dims();
        return dims[1] / dims[0];
    };
    o.resize_relative = function(delta){
        if(!ref_dims) return;

        var scale_by = Math.max( (ref_dims[0] + delta[0]) / ref_dims[0],
            (ref_dims[1] + delta[1]) / ref_dims[1] );
        var dims = u._mul(scale_by)(ref_dims);

        o.each(function(i, a){
            a.pos_relative_set( u._add(u._mul(scale_by)(_positions[i]))(_pos) );
            a.dims_relative_set( u._mul(scale_by)(u._mul(ref_dims)(_scales[i])) );
        });

        var bounds = o.bounds();
        _dims = [bounds.right - bounds.left, bounds.bottom - bounds.top];

        o.layout();
    };
    o.resize_end = function(){
        $("#controls").showshow();
        o.update_relative_coords();
        change_end('resize');
    };

    // END-event-handlers

    o.app_select = function(app, multi) {
        if(multi){
            app.unfocus();
            evs.handler_del(app);
        }
        else{
            app.focus();
            evs.handler_set(app);
            // TODO-feature for sketch and geometry apps: evs.handler_set(o.type)
            // depends on defining app specific but instance unspecific creation
            // handlers on app type constructors
        }
        Hive.Controls(app, multi);
    };
    o.app_unselect = function(app, multi) {
        app.unfocus();
        if(app.controls) app.controls.remove();
    };

    o.update = function(apps){
        if(!apps) apps = $.grep(elements, function(e){ return ! e.deleted; });
        var multi = o.dragging || (apps.length > 1);

        // Previously unfocused elements that should be focused
        $.each(apps, function(i, el){ o.app_select(el, multi); });
        // Previously focused elements that should be unfocused
        o.each(function(i, el){
            if($.inArray(el, apps) == -1)
                o.app_unselect(el, multi);
        });

        elements = $.merge([], apps);

        o.update_relative_coords();

        if(!o.dragging && multi) {
            Hive.Controls(o, false);
            o.controls.layout();
        }
        if(apps.length <= 1 && o.controls)
            o.controls.remove();
        if(apps.length == 0)
            evs.handler_del({handler_type: 0}); 
    };

    o.unfocus = function(app){
        if(app) o.update($.grep(elements, function(el){ return el !== app }));
        else o.update([]);
    };
    o.push = function(element) { 
        o.update(elements.concat([element]));
    };
    o.select = function(app_or_apps){
        return o.update($.isArray(app_or_apps) ? app_or_apps : [app_or_apps]);
    };
    o.selected = function(app){
        return $.inArray(app, elements) != -1;
    };

    o.divs = function(){
        return $.map(elements, function(a){ return a.div[0] });
    };

    // BEGIN-coords: client space and editor space (called relative)
    // position and dimension methods

    o.update_relative_coords = function(){
        var bounds = o.bounds();
        _pos = [bounds.left, bounds.top];
        _dims = [bounds.right - bounds.left, bounds.bottom - bounds.top];
        _positions = elements.map(function(a){
            return u._add(u._mul(-1)(_pos))(a.pos_relative());
        });
        _scales = elements.map(function(a){
            return u._div(a.dims_relative())(_dims);
        });
    };

    o.pos = function(){
        return u._mul(env.scale())(_pos);
    };
    o.dims = function() {
        return u._mul(env.scale())(_dims);
    };

    o.min_pos = function() {
        var bounds = o.bounds();
        return [bounds.left, bounds.top];
    };
    o.max_pos = function() {
        var bounds = o.bounds();
        return [bounds.right, bounds.bottom];
    };
    // TODO-cleanup: these functions live in app.  Can we share them?
    // Can selection inherit app?
    o.cent_pos = function() { return u._mul(.5)(u._add(o.min_pos())(o.max_pos())); };
    // return [[x-min, x-center, x-max], [y-min, y-center, y-max]]
    // if o were moved to pos
    o.bounds_tuple_relative = function(pos) {
        var curr_ = [o.min_pos(), o.cent_pos(), o.max_pos()];
        var curr = [[],[]];
        $.map(curr_, function(pair) {
            curr[0] = curr[0].concat(pair[0] + pos[0] - _pos[0]);
            curr[1] = curr[1].concat(pair[1] + pos[1] - _pos[1]);
        });
        return [curr[0].slice(), curr[1].slice()];
    }
    o.pos_relative = function(){ return _pos.slice(); };
    o.dims_relative = function(){ return _dims.slice(); };
    o.pos_relative_set = function(pos){
        o.each(function(i, a){
            a.pos_relative_set(u._add(pos)(_positions[i]));
        });

        var bounds = o.bounds();
        _pos = [bounds.left, bounds.top];

        o.layout();
    };
    o.dims_relative_set = function(dims){
        // TODO: call o.resize_start() then o.resize();
    };
    o.bounds = function() { 
        var abs_mins = elements.map(function(el){ return el.min_pos() });
        var abs_maxs = elements.map(function(el){ return el.max_pos() });
        return {
            left:   Array.min(abs_mins.map(function(c){ return c[0] })),
            top:    Array.min(abs_mins.map(function(c){ return c[1] })),
            right:  Array.max(abs_maxs.map(function(c){ return c[0] })),
            bottom: Array.max(abs_maxs.map(function(c){ return c[1] }))
        };
    };

    // TODO: make these reflect axis aligned bounding box (when rotated, etc)
    // currently not used. Note these depend on an up-to-date _dims and _pos
    // o.min_pos = function(){ return _pos.slice(); };
    // o.max_pos = function(){ return [ _pos[0] + _dims[0], _pos[1] + _dims[1] ]; };
    // o.pos_center = function() {
    //     var dims = o.dims();
    //     var pos = o.pos();
    //     return [ pos[0] + dims[0] / 2, pos[1] + dims[1] / 2 ];
    // };

    // END-coords

    o.copy = function(){
        var offset = [ 0, o.dims()[1] + 20 ], load_count = elements.length, copies;
        var load_counter = function(){
            load_count--;
            if( ! load_count ) {
                o.select( copies );
                env.History.group('copy group');
            }
        };
        env.History.begin();
        copies = $.map( elements, function(e){
            return e.copy({ offset: offset, load: load_counter, 'z_offset': elements.length })
        });
    }
    o.remove = function(){
        var sel = $.merge([], elements);
        o.unfocus();
        env.History.begin();
        $.each(sel, function(i, el){ el.remove() });
        env.History.group('delete group');
    };

    o.get_stack = function(){
        return elements.sort(function(a, b){ a.layer() - b.layer() });
    };
    o.stack_top = function(){
        env.History.begin();
        $.each(o.get_stack(), function(i, el){ el.stack_top() })
        env.History.group('stack group to top');
    };
    o.stack_bottom = function(){
        env.History.begin();
        $.each(o.get_stack().reverse(), function(i, el){ el.stack_bottom() })
        env.History.group('stack group to bottom');
    };

    var parent = o;
    o.make_controls.push(function(o){
        o.padding = 7;
        o.div.drag(parent.move_handler).drag('start', parent.move_start)
            .drag('end', parent.move_end);
    });

    o.layout = function(){
        o.controls && o.controls.layout();
    }

    o.keydown = Funcs(function(ev){ 
        // ctrl+[shift+]a to select all or none
        if( ev.keyCode == 65 && ev.ctrlKey ){
            o.select( ev.shiftKey ? [] : hive_app.Apps.all() );
            return false;
        }

        var handlers = {
            27: function(){ o.unfocus() },             // esc
            46: function(){ o.remove() },              // del
            66: function(){ o.stack_bottom() },        // b
            84: function(){ o.stack_top() },           // t
        }
        if(handlers[ev.keyCode]){
            handlers[ev.keyCode]();
            return false;
        }

        // TODO: improve efficiency by using o.controls.pos_set like drag handler
        // or improving o.bounds
        if(o.controls)
            o.controls.layout();
    });
    var times, distances, delta_latched;
    // var move_speed, delta_ave;
    o.reset_sensitivity = function() {
        delta_latched = [0, 0];
        // delta_ave = [0, 0];
        // move_speed = 1;
        times = [], distances = [];
    };
    // TODO: move sensitivity code globally
    o.calculate_sensitivity = function(delta) {
        // Calculate sensitivity
        // check timestamp and bump sensitivity if longish
        // gap between user inputs.
        var move_dist = u._sub(delta)(delta_latched);
        delta_latched = delta.slice();
        var time = new Date().getTime() / 1000;
        times.push(time);
        // Max is better than other distance metric because user will
        // commonly move in both axes accidentally.
        // TODO: track x and y independently
        var distance = Math.max(Math.abs(move_dist[0]), Math.abs(move_dist[1]));
        // Keep track of accumulated distance.
        distances.push(distance + 
            (distances.length ? distances[distances.length - 1] : 0));
        var max_sens_time = 1;
        while (times.length > 2 && time - times[0] > max_sens_time) {
            times.splice(0, 1);
            distances.splice(0, 1);
        }
        time = times[times.length - 1] - times[0];
        distance = distances[distances.length - 1] - distances[0];
        var speed = distance ? distance / time : 1;
        // speed = move_speed = u._lerp(.1, move_speed, speed);

        // Experiment with using distance to "average position"
        // delta_ave = u._lerp(.1, delta_ave, delta);
        // var move_dist = u._sub(delta)(delta_ave);
        // var speed = Math.abs(move_dist[0]) + Math.abs(move_dist[1]);
        // sensitivity = 1 / (speed - .98);
        var sensitivity = 150 / speed;
        if (times.length < 5)
            sensitivity *= 2;
        // TODO: flags like this should live on the root app.
        if (Hive.show_move_sensitivity && context.flags.debugger)
            Hive.set_debug_info({
                sensitivity: Math.round(100*sensitivity)/100,
                time: Math.round(10000*time)/10000,
                distance: Math.round(10000*distance)/10000,
                speed: Math.round(100*speed)/100,
            });

        return sensitivity;
    };

    hive_app.App.has_nudge(o);

    return o;
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
        if (! opts.position)
            a.center(opts.offset);
        a.dims_set(a.dims());
        Hive.Selection.select(a);
        if(load) load(a);
    };
    var app = hive_app.App(s, opts);
    env.History.save(app._remove, app._unremove, 'create');
    return app;
};

Hive.new_file = function(files, opts, app_opts) {
    // TODO-feature: depending on type and number of files, create grouping of
    // media objects. Multiple audio files should be assembled into a play
    // list. Multiple images should be placed in a table, or slide-show

    return $.map(files, function(file, i){
        var app = $.extend({ file_name: file.name, file_id: file.id,
            file_meta: file.meta }, opts);

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

        return Hive.new_app(app, $.extend({ offset: [20*i, 20*i] }, app_opts) );
    });

    return false;
}

Hive.set_debug_info = function(info) {
    if (typeof(info) == "object")
        info = JSON.stringify(info).replace(/,/g,"\n")
    var $debug = $("#edit_debug");
    if ($debug.length == 0) {
        $debug = $("<div id='edit_debug' class='debug'</div>");
        $("body").append($debug);
    }
    if (info == "") {
        $debug.hidehide();
        return;
    }
    // TODO: option to put info over mouse
    $debug.showshow().css({ top: "0px", left: "0px" })
        .text(info);
};

// Called on load() and save()
Hive.common_setup = function(){
    $('title').text("Editor - " + (Hive.Exp.title || "[Untitled]"));
};

Hive.on_media_upload = function(files){
    // after file is uploaded, save meta data and id from server by
    // matching up file name
    var find_apps = function(name){
        // TODO-cleanup: background should be root app
        var apps = hive_app.Apps.all().filter(function(a){
            return (a.init_state.file_name == name) });
        if (Hive.Exp.background.file_name == name)
            apps = apps.concat(Hive.Exp.background);
        return apps;
    };
    files.map(function(f){
        find_apps(f.name).map(function(a){
            var upd = { file_id: f.id, url: f.url };
            if(f.meta) upd.file_meta = f.meta;
            if(a.state_update) {
                a.state_update(upd);
            } else {
                a.content = a.url = f.url;
                a.file_name = f.id;
            }
        });
    });
};

Hive.init = function(exp, page){
    Hive.Exp = exp;
    Hive.edit_page = page;
    if(!exp.auth) exp.auth = 'public';
    env.scale_set();

    //setInterval(Hive.set_draft, 5000);
    //try { Hive.set_draft(); }
    //catch(e) { return "If you leave this page any unsaved changes to your expression will be lost."; }
    //var draft = Hive.get_draft();
    //if(draft) Hive.Exp = draft;

    // TODO-refactor: separate background dialog, save dialog, and top level
    // menus into respective constructors

    var ua = navigator.userAgent;
    if ( !ua.match(/(Firefox|Chrome|Safari)/i) || ua.match(/OS 5(_\d)+ like Mac OS X/i)) {
        Hive.showDialog('#editor_browsers');
    }

    $(window).on('resize', u.layout_apps);

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
    u.append_color_picker($('#color_pick'), Hive.bg_color_set,
        Hive.Exp.background.color);

    $('#image_background').click(function() {
        var history_point;
        Hive.showDialog('#dia_edit_bg', {
            fade: false,
            open: function(){ history_point = env.History.saver(
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

    $('#bg_upload').on('with_files', function(ev, files){
        Hive.bg_set(files[0]);
    }).on('response', function(ev, files){
        Hive.Exp.background.url = files[0].url;
    });

    $('#link_upload').on('with_files', function(ev, files){
        // TODO-polish: maybe create link text box first
    }).on('response', function(ev, files){
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
    

    Hive.hover_menu('#insert_text', '#menu_text');

    var image_menu = Hive.hover_menu('#insert_image', '#menu_image');
    var image_embed_menu = Hive.hover_menu('#image_from_url', '#image_embed_submenu', {
        click_persist: $('#image_embed_code'), auto_close: false,
        open: function(){
            $('#image_embed_code').focus();
        }, group: image_menu
    });
    $('#embed_image_form').submit(function(){
        Hive.embed_code('#image_embed_code');
        image_embed_menu.close();
        image_menu.close();
        return false;
    });

    Hive.hover_menu('#insert_audio', '#menu_audio');

    var embed_menu = Hive.hover_menu('#insert_embed', '#menu_embed', {
        open: function(){ $('#embed_code').get(0).focus() },
        layout_x: 'center' });
    $('#embed_done').click(function() { Hive.embed_code('#embed_code'); embed_menu.close(); });

    Hive.hover_menu('#insert_shape', '#menu_shape');
    $('#shape_rectangle').click(function(e) {
        Hive.new_app({ type : 'hive.rectangle', content :
            { color : colors[24], 'border-color' : 'black', 'border-width' : 0,
                'border-style' : 'solid', 'border-radius' : 0 } });
    });
    $('#shape_sketch').click(function(e) {
        Hive.new_app({ type: 'hive.sketch', dimensions: [700, 700 / 1.6], content: { brush: 'simple', brush_size: 10 } });
    });

    Hive.hover_menu('#insert_file', '#menu_file');

    $('#btn_grid').click(Hive.toggle_grid);

    $('#media_upload').on('with_files', function(ev, files){
        // media files are available immediately upon selection
        center = u._div([ev.clientX, ev.clientY])(env.scale());
        Hive.new_file(files, { center: center });
    }).on('response', function(ev, files){ Hive.on_media_upload(files) });

    var busy_e = $('.save .loading');
    $(document).ajaxStart(function(){
        // TODO-draft: set a flag to block saving while uploads are in progress
        busy_e.showshow();
        $('#save_submit').addClass('disabled');
        //$('#save_submit .label').hidehide(); // can't get to look nice
    }).ajaxStop(function(){
        busy_e.hidehide();
        $('#save_submit').removeClass('disabled');
        //$('#save_submit .label').showshow();
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

    // var save_menu = Hive.hover_menu('#btn_save', '#dia_save',
    //     { auto_close : false, click_persist : '#dia_save' });
    $('#save_submit').click(function(){
        if( ! $(this).hasClass('disabled') ){
            if(checkUrl()){
                page.controller.set_exit_warning(false);
                Hive.save();
            }
        }
    });
    // canonicalize tags field.
    function tags_input_changed(el) {
        var tags = el.val().trim();
        tags = tags.replace(/[#,]/g," ").replace(/[ ]+/g," ").trim();
        if (tags.length) tags = tags.replace(/([ ]|^)/g,"$1#").trim();
        // TODO-polish: unique the tags
        var search_tags = " " + tags + " ";
        // TODO: remove other keywords from tags.
        search_tags = search_tags.replace(" #remixed ", " ");
        tags = search_tags.trim();
        $(".remix_label input").prop("checked", search_tags.indexOf(" #remix ") >= 0);
        el.val(tags);
    }
    $("#tags_input").change(function(e){
        var el = $(e.target);
        tags_input_changed(el);
    });
    $(".remix_label input").change(function(e) {
        if ($(e.target).prop("checked")) {
            $("#tags_input").val("#remix " + $("#tags_input").val());
        } else {
            $("#tags_input").val($("#tags_input").val().replace(/[#,]?remix/gi,""));
            tags_input_changed($("#tags_input"));
        }
    });
    tags_input_changed($("#tags_input"));
    var save_dialog = $('#dia_save').data('dialog');
    save_dialog.opts.open = Hive.edit_pause;
    save_dialog.opts.close = Hive.edit_start;

    var overwrite_dialog = dialog.create('#dia_overwrite');
    $('#cancel_overwrite').click(overwrite_dialog.close);
    $('#save_overwrite').click(function() {
        Hive.Exp.overwrite = true;
        Hive.save();
    });
    
    // Automatically update url unless it's an already saved
    // expression or the user has modified the url manually
    $('#dia_save #title').text(context.page_data.expr.title).
        on('keydown keyup', function(){
        if (!(Hive.Exp.home || Hive.Exp.created || $('#url').hasClass('modified') )) {
            $('#url').val($('#title').val().replace(/[^0-9a-zA-Z]/g, "-")
                .replace(/--+/g, "-").replace(/-$/, "").toLowerCase());
        }
    }).keydown();

    $('#url').focus(function(){
        $(this).addClass('modified');
    });

    $('#dia_save #title').blur(function(){
        $('#title').val($('#title').val().trim());
    }).blur();

    $('#url').change(checkUrl);

    Hive.hover_menu($('#privacy' ), $('#menu_privacy')); //todo-delete, { group: save_menu } );
    $('#menu_privacy').click(function(e) {
        $('#menu_privacy div').removeClass('selected');
        var t = $(e.target);
        t.addClass('selected');
        $('#privacy').text(t.text());
        var v = t.attr('val');
        if(v == 'password') $('#password_ui').showshow();
        else $('#password_ui').hidehide();
    });
    if(Hive.Exp.auth) $('#menu_privacy [val=' + Hive.Exp.auth +']').click();

    Hive.Selection();

    $(window).on('scroll', Hive.scroll);
    evs.on(document, 'keydown');
    evs.on('body', 'mousemove');
    evs.on('body', 'mousedown');
    var drag_base = $('#grid_guide');
    evs.on(drag_base, 'draginit');
    evs.on(drag_base, 'dragstart');
    evs.on(drag_base, 'drag');
    evs.on(drag_base, 'dragend');
    Hive.edit_start();

    hive_app.Apps.init(Hive.Exp.apps);
    env.History.init();
    Hive.common_setup();
};

Hive.exit = function(){
    $(document).off('keydown');
    $('body').off('mousemove mousedown');
};

Hive.edit_start = function(){
    evs.handler_set(Hive.Selection);
    evs.handler_set(Hive);
};
Hive.edit_pause = function(){
    evs.handler_del(Hive.Selection);
    evs.handler_del(Hive);
};

// Matches youtube and vimeo URLs, any URL pointing to an image, and
// creates the appropriate App state to be passed to Hive.new_app.
Hive.embed_code = function(element) {
    var c = $(element).val().trim(), app;

    if(m = c.match(/^https?:\/\/www.youtube.com\/.*?v=(.*?)(#t=(\d+))?$/i)
        || (m = c.match(/src="https?:\/\/www.youtube(-nocookie)?.com\/embed\/(.*?)"/i))
        || (m = c.match(/https?:\/\/youtu.be\/(.*)$/i))
    ) {
        var args = { 'rel': 0, 'showsearch': 0, 'showinfo': 0 };
        if(m[3]) args['start'] = m[3];
        var url = '//www.youtube.com/embed/' + m[1] + '?' + $.param(args);
        app = { type : 'hive.html', content : 
            "<iframe width='100%' height='100%' class='youtube-player'" +
            "  src='" + url + "' frameborder='0' " +
            "allowfullscreen></iframe>"
        };
            //   '<object type="application/x-shockwave-flash" style="width:100%; height:100%" '
            // + 'data="' + url + '"><param name="movie" value="' + url + '">'
            // + '<param name="allowFullScreen" value="true">'
            // + '<param name="wmode" value="opaque"/></object>' };
    }

    else if(m = c.match(/^https?:\/\/(www.)?vimeo.com\/(.*)$/i))
        app = { type : 'hive.html', content :
            '<iframe src="//player.vimeo.com/video/'
            + m[2] + '?title=0&amp;byline=0&amp;portrait=0"'
            + 'style="width:100%;height:100%;border:0"></iframe>' };

    else if(m = c.match(/^https?:\/\/(.*)mp3$/i))
        app = { type : 'hive.audio', content : {url : c, player : minimal} }

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
            Hive.new_file(data);
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
}; 

Hive.save = function() {
    var expr = Hive.state();
    // Handle remix
    if (expr.owner_name != context.user.name) {
        expr.owner_name = context.user.name;
        expr.owner = context.user.id;
        expr.remix_parent_id = expr.id;
        expr.id='';
        expr._id='';
        // expr.tags += " #remixed"
    }

    if(expr.name.match(/^(profile|tag)$/)) {
        alert('The name "' + expr.name + '" is reserved.');
        return false;
    }

    var on_response = function(ev, ret){
        // Hive.upload_finish();
        if(typeof(ret) != 'object')
            alert("Sorry, something is broken :(. Please send us feedback");
        if(ret.error == 'overwrite') {
            $('#expr_name').html(expr.name);
            $('#dia_overwrite').data('dialog').open();
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

    $('#expr_save .expr').val(JSON.stringify(expr));
    $('#expr_save').on('response', on_response)
        .on('error', on_error).submit();
    Hive.common_setup();
};
Hive.get_draft = function() {
    return localStorage.expr_draft ? JSON.parse(localStorage.expr_draft) : null }
Hive.set_draft = function() { localStorage.expr_draft = JSON.stringify(Hive.state()); }
Hive.del_draft = function() { delete localStorage.expr_draft; }


Hive.state = function() {
    //Hive.Exp.domain = $('#domain').val();
    Hive.Exp.name = $('#url').val();
    Hive.Exp.apps = hive_app.Apps.state();
    Hive.Exp.title = $('#title').val();
    Hive.Exp.tags = $('#tags_input').val();
    Hive.Exp.auth = $('#menu_privacy .selected').attr('val');
    if(Hive.Exp.auth == 'password') 
        Hive.Exp.password = $('#password').val();

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

    if(bg.url) imgs.showshow();
    else { imgs.hidehide(); return }

    imgs.attr('src', bg.url);
    img.load(function(){
        setTimeout(layout.place_apps, 0);
        if(load) load();
    });
    if(bg.opacity) imgs.css('opacity', bg.opacity);
};
Hive.bg_change = function(s){
    env.History.saver(
        function(){ return $.extend(true, {}, Hive.Exp.background) },
        Hive.bg_set, 'change background'
    ).exec(s);
};

function remove_all_apps() {
    var aps = $.map(hive_app.Apps, id); // store a copy of Apps so we can destructively update it
    $.map(apps, function(a) { a.remove() });
}

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

return Hive;

});
