define([
    'browser/jquery'
    ,'browser/js'
    ,'server/context'

    ,'./apps'
    ,'./env'
    ,'./util'
    ,'./events'
    ,'./controls'

    ,'js!google_closure.js'
], function(
    $
    ,js
    ,context

    ,hive_app
    ,env
    ,u
    ,evs
    ,Controls
){
var o = {}
    ,Funcs = js.Funcs
    ,elements = []
;

o.Selection = function(o) {
    // returns: {param} n: nth selected element
    //      {no params}  : the list of selected elements
    o.elements = function(){ 
        if (arguments.length > 0)
            return elements[arguments[0]];
        return elements.slice(); 
    };
    o.sorted = function(){ return elements.slice().sort(u.topo_cmp); }
    o.count = function(){ return elements.length; };
    o.each = function(fn){ $.each(elements, fn) };
    o.get_targets = function(){
        return (!drag_target || drag_target == o) ?
            elements.slice() : [drag_target]; 
    };
    o.add_to_collection = false;
    o.has_align = false;
    o.is_selection = true;
    o.make_controls = [];
    o.handler_type = 2;

    // relative coords and sizes for each app
    var _positions = [], _scales = [];

    // DEBUG
    o._scales = function(){ return _scales; }

    // BEGIN-event-handlers

    o.is_multi = function(ev){
        return !env.gifwall && (ev.shiftKey || u.is_ctrl(ev));
    }

    var app_clicking
    o.mousedown = function(ev){
        // mousedown comes from body,
        // if mousedown on app or controls, store app in app_clicking,
        // if mousedown was not on selected app or controls, unselect all
        ev.stopPropagation()
        app_clicking = ev.data

        var hit = false
        if(o.controls && $.contains(o.controls.div.get(0), ev.target))
            hit = true
        else if ($(ev.target).closest(".control").length)
            hit = true

        if(hit || !o.count() || o.is_multi(ev) || ev.data)
            return

        o.each(function(i, el){
            if( el.controls && $.contains(el.controls.div.get(0), ev.target) )
                hit = true
        })
        if(!hit)
            o.unfocus()
    }

    o.mouseup = function(ev){
        // Select or deselect an app. Mouseup comes from app div.

        var app_clicked = app_clicking
        app_clicking = false
        if(dragging) return

        var app = ev.data;
        // must be mouseup on an app that was mousedowned
        if(!app || app != app_clicked) return

        if (context.flags.shift_does_raise && ev.shiftKey) {
            if(u.is_ctrl(ev))
                app.stack_bottom(ev)
            else
                app.stack_top(ev)
            return
        }
        if(o.is_multi(ev)){
            if(o.selected(app)) o.unfocus(app);
            else o.push(app)
        }
        else o.update([ app ])
    }

    var dragging = false, drag_target, selecting = false;
    o.drag_target = function(){ return drag_target; };
    o.dragstart = function(ev, dd){
        if(dragging) return
        u.reset_sensitivity();
        dragging = true;
        var app = ev.data;
        if(app && !u.is_ctrl(ev)) {
            // If target is in selection, drag whole selection
            if(elements.indexOf(ev.data) >= 0)
                drag_target = o;
            else
                drag_target = ev.data;
            if (ev.altKey) {
                // alt + drag = duplicate
                drag_target.copy({offset:[0, 0]})
            }
            o.hide_controls()
            o.move_start();
            return;
        }
        // Otherwise, we are changing selection via dragging on the background.
        if(env.gifwall) {
            dragging = false;
            return;
        }
        selecting = true
        o.offset = env.apps_e.offset().left;
        u.reset_sensitivity();

        o.new_selection = [];
        $('.app_select').remove();
        o.div = $("<div class='app_select'>").css('z-index', 3);
        o.select_box = $("<div class='select_box border selected dragbox'>")
            .css({position: 'relative', padding: 0, left: '-5px', top: '-5px'});
        $(document.body).append(o.div);
        o.div.append(o.select_box);
        o.start = [ev.pageX, ev.pageY];
        if (ev.shiftKey || u.is_ctrl(ev)){
            o.initial_elements = elements.slice();
        } else {
            o.initial_elements = [];
            o.unfocus();
        }
    };
    o.drag = function(ev, dd){
        if (!dragging) return;
        ev.stopPropagation()

        var delta = [dd.deltaX, dd.deltaY];
        o.sensitivity = u.calculate_sensitivity(delta);
        var app = ev.data;
        if(app && !selecting){
            o.move_handler(ev, delta);
            return
        }

        if(!o.start) return;
        o.drag_dims = [Math.abs(dd.deltaX), Math.abs(dd.deltaY)];
        o.drag_pos = [dd.deltaX < 0 ? ev.pageX : o.start[0],
            dd.deltaY < 0 ? ev.pageY : o.start[1]];
        o.div.css({ left : o.drag_pos[0], top : o.drag_pos[1],
            width : o.drag_dims[0], height : o.drag_dims[1] });
        o.update_focus(ev);
    };
    o.dragend = function (ev, dd) {
        if(!dragging) return;
        dragging = false;
        o.show_controls()

        var app = ev.data;
        if(app && !selecting){
            o.move_end();
            return false;
        }

        if(!o.drag_dims) return;
        o.select_box.remove();
        if(o.pos) o.update_focus(ev);
        if(o.div) o.div.remove();
        o.update(elements);
        selecting = false
        return false;
    }
    var old_mod = false, old_selection = []
    o.update_focus = function(event){
        var s = env.scale();
        var select = { 
            left: (o.drag_pos[0] - o.offset) / s,
            right: (o.drag_pos[0] + o.drag_dims[0]) / s,
            top: (o.drag_pos[1] - o.offset) / s, 
            bottom: (o.drag_pos[1] + o.drag_dims[1]) / s, 
        };
        var new_selection = u.overlapped_apps(select);
        var new_mod = event.shiftKey;
        if (old_selection.length != new_selection.length || new_mod != old_mod){
            if (new_mod)
                o.update($(u.except(o.initial_elements, new_selection)));
            else
                o.update($.unique($.merge(new_selection, o.initial_elements)));
        }
        old_mod = new_mod;
        old_selection = new_selection;
    };

    // We handle our own history
    o.history_helper_relative = function(name){
        var o2 = { name: name };
        o2.save = function(){};
        return o2;
    };

    var ref_pos, full_apps = [], pushing_apps, pushing_rel_pos,
        prev_selection, coord_full, full;
    o.set_full = function(app) { full = app; };
    o.pushing_start = function(){
        // Save current selection and restore it after move.
        prev_selection = elements.slice();
        o.update([]);
        coord_full = full.full_coord;
        var coord = 1 - coord_full;
        o.padding = 0;
        o.size = full.dims_relative()[coord];
        o.start_pos = full.pos_relative()[coord] - o.padding;
        o.stop_pos = o.start_pos + o.size + 2 * o.padding;
        pushing_apps = env.Apps.all().filter(function(app) {
            return !(app.id == full.id || env.Selection.selected(app));
        });
        for (var i = 0; i < pushing_apps.length; ++i) {
            var app = pushing_apps[i];
            app.old_start = app.pos_relative()[coord];
            var stop = app.old_start + app.dims_relative()[coord];
            if (app.old_start + .5 < o.stop_pos && stop > .5 + o.start_pos
                && app.full_coord == undefined) {
                if (!o.selected(app)) o.push(app);
                pushing_apps.splice(i, 1);
                --i;
                continue;
            }
            if (app.old_start >= o.start_pos)
                app.old_start -= o.size + 2 * o.padding;
        }
        if (!o.selected(full)) o.push(full);
        if (env.highlight_full_bleed)
            full.highlight();
        drag_target = o;
        pushing_rel_pos = o.start_pos - o.pos_relative()[coord];
    }
    o.pushing_move = function(pos, rel_pos) {
        var coord = 1 - coord_full,
            min_start = 0, push_start = 0, push_size = 0, apps = pushing_apps;
        if (rel_pos === undefined) rel_pos = pushing_rel_pos;
        // constrain the movement to be only in one coord.
        pos[coord_full] = ref_pos[coord_full];
        o.start_pos = pos[coord] - o.padding + rel_pos;

        if (env.squish_full_bleed) {
            for (var i = 0; i < apps.length; ++i) {
                var app = apps[i];
                var start = app.old_start;
                var stop = start + app.dims_relative()[coord];
                if (stop < o.start_pos && stop > min_start)
                    min_start = stop;
            }
            pos[coord] = min_start + o.padding - rel_pos;
            o.start_pos = pos[coord] - o.padding + rel_pos;
        }
        o.stop_pos = o.start_pos + o.size + 2 * o.padding;
        for (var i = 0; i < apps.length; ++i) {
            var app = apps[i];
            var start = app.old_start;
            var stop = start + app.dims_relative()[coord];
            if (env.squish_full_bleed && stop < o.start_pos && stop > min_start)
                min_start = stop;
            if (start < o.stop_pos && stop > o.start_pos) {
                var push_try = o.stop_pos - start;
                push_size = Math.max(push_size, push_try);
            }
        }
        for (var i = 0; i < apps.length; ++i) {
            var app = apps[i];
            var start = app.old_start;
            var stop = start + app.dims_relative()[coord];
            var new_pos = app.pos_relative();
            if (stop > o.start_pos + .5) start += push_size;
            new_pos[coord] = start;
            app.pos_relative_set(new_pos);
        }
    };
    set_full_apps = function() {
        full_apps = (drag_target && drag_target != o) ? [drag_target] : elements;
        full_apps = full_apps.filter(function(a) { 
            return a.full_coord != undefined; });
    }
    o.move_start = function(){
        set_full_apps();
        // if (context.flags.full_bleed && full_apps.length)
        if (full_apps.length) {
            full = full_apps[0];
            o.pushing_start();
        } else
            full_apps = [];
        var moved_obj = drag_target || o;
        o.update_relative_coords();
        ref_pos = moved_obj.pos_relative();
        env.History.change_start(full_apps.length);
    };
    o.move_relative = function(delta, axis_lock, snapping){
        if(!ref_pos) return;
        env.Apps.begin_layout();
        if(axis_lock)
            delta[ Math.abs(delta[0]) > Math.abs(delta[1]) ? 1 : 0 ] = 0;
        var pos = u._add(ref_pos)(delta);
        var off = [0, 0];
        if (o != drag_target)
            off = u._sub(drag_target.min_pos())(drag_target.pos_relative());
        // pos = u._add(pos)(off);
        // TODO-feature-snap: check key shortcut to turn off snapping
        if(!env.no_snap && snapping){
            var excludes = {};
            if(drag_target.id) excludes[drag_target.id] = true;
            pos = u.snap_helper(drag_target.bounds_tuple_relative(pos), {
                exclude_ids: excludes,
                snap_strength: .05,
                snap_radius: 18,
                guide_0: !env.gifwall && (!full_apps.length || coord_full == 1),
                guide_1: !env.gifwall && (!full_apps.length || coord_full == 0),
                sensitivity: o.sensitivity, });
        }
        pos = u._sub(pos)(off);
        if (full_apps.length)
            o.pushing_move(pos);
        drag_target.pos_relative_set(pos);
        env.Apps.end_layout();
        //o.layout();
    };
    o.move_handler = function(ev, delta){
        delta = u._div(delta)(env.scale());

        o.move_relative(delta, ev.shiftKey, u.should_snap(ev));
    };
    o.move_end = function(){
        env.History.change_end('move');
        u.set_debug_info("");
        $(".ruler").hidehide();
        if (full_apps.length) {
            if (env.highlight_full_bleed)
                full_apps[0].highlight({on: false});
            o.update(prev_selection);
            full_apps = [];
        }
        o.layout();
    };

    o.centroid_relative = function(){
        // centroids of selected apps
        return u._div( elements.map(function(a){ return a.centroid_relative() })
            .reduce(function(p1, p2){ return u._add(p1)(p2) }) )
            (elements.length)
    }

    // hive_app.App.has_rotate(o);
    var ref_angle = 0, ref_center, rotation_refs
    o.angle = function(){ 
        if (elements.length == 1 && typeof(elements[0].angle) == "function")
            return elements[0].angle();
        return 0; 
    };
    o.rotate_start = function(angle) {
        ref_angle = angle;
        ref_center = o.centroid_relative()
        rotation_refs = []
        o.each(function(i, el) {
            if(el.rotate_start)
                el.rotate_start(ref_angle)
            var centroid = el.centroid_relative()
            rotation_refs[i] = {
                 ref_angle: el.angle()
                ,ref_cen: centroid
                ,ref_pos: u._sub(el.pos_relative())(centroid)
            }
        })
        env.History.change_start()
    }
    o.angle_set = function(a) {
        a -= ref_angle;
        o.each(function(i, el) {
            if(el.angle_set)
                el.angle_set(rotation_refs[i].ref_angle + a);
            var cent = u.rotate_about(rotation_refs[i].ref_cen,
                    ref_center, u.deg2rad(a))
                ,new_pos = u._sub(el.pos_relative())(el.centroid_relative())
            el.pos_relative_set(u._add(rotation_refs[i].ref_pos)(cent));
        });
    }
    o.rotate_end = function(){
        elements.map(function(a){
            if(a.rotate_end) a.rotate_end()
        })
        env.History.change_end('rotate')
    }
    hive_app.App.has_resize(o);
    var ref_dims, _ref_dims, _resize = o.resize;
    o.before_resize = function() {
        set_full_apps();
        o.each(function(i, a) { 
            if (a.resize_start) a.resize_start(); });

        drag_target = o;
        ref_dims = o.dims_relative();
        if (delegate_dims_set()) {
            _ref_dims = elements[0].dims();
            elements[0].dims_ref_set();
        }
        // env.History.begin();
        env.History.change_start(full_apps.length);
    }
    o.after_resize = function() {
        o.each(function(i, a) { 
            if (a.resize_end) a.resize_end(true /* skip history */); });

        o.update_relative_coords();
        env.History.change_end('resize');
        // env.History.group('resize');

        full_apps = [];
        drag_target = ref_dims = undefined;
        o.show_controls()
        return true;
    }
    var _dims_relative_set = o.dims_relative_set;
    // Multiselect doesn't handle non-aspect-preserving resize.
    // Delegate it for single selection
    var delegate_dims_set = function() {
        return (ref_dims && elements.length == 1) // && !elements[0].get_aspect())
    }
    o.dims_relative_set = function(new_dims) {
        if (delegate_dims_set())
            return;
        var new_ref = ref_dims;
        if (!new_ref) {
            new_ref = o.dims_relative();
        }
        var scale_by = Math.max( new_dims[0] / new_ref[0],
            new_dims[1] / new_ref[1] );

        o.each(function(i, a){
            a.pos_relative_set( 
                u._add(u._mul(scale_by)(_positions[i]))(o.pos_relative()) );
            a.dims_relative_set( u._mul(scale_by)(u._mul(new_ref)(_scales[i])) );
        });

        var bounds = o.bounds();
        _dims_relative_set([bounds.right - bounds.left, bounds.bottom - bounds.top]);
        if (!ref_dims)
            o.update_relative_coords();
    }
    o.resize = function(delta){
        var dims = _resize(delta);
        if(!ref_dims) return;
        if (delegate_dims_set()) {
            return elements[0].resize(delta);
        }

    };
    o.get_aspect = function() {
        if (elements.length == 1 && !elements[0].get_aspect()) {
            return elements[0].get_aspect();
        }

        var dims = o.dims();
        return dims[0] / dims[1];
    };

    // END-event-handlers

    o.app_select = function(app, multi) {
        app.div.addClass("selected");
        if(multi) {
            app.unfocus();
        } else {
            app.focus();
            // TODO-feature for sketch and geometry apps: evs.handler_set(o.type)
            // depends on defining app specific but instance unspecific creation
            // handlers on app type constructors
        }
        // Add mini-border
        Controls(app, true);
    };
    o.app_unselect = function(app) {
        app.div.removeClass("selected");
        app.unfocus();
        if(app.controls) app.controls.remove();
    };

    o.scroll_to_view = function() {
        u.scroll_to_view(o.max_pos());
        u.scroll_to_view(o.min_pos());
    }
    o.update = function(apps){
        apps = $.grep(apps || elements, function(e){ return ! e.deleted; });
        var multi = true;

        // Previously focused elements that should be unfocused
        o.each(function(i, el){
            if($.inArray(el, apps) == -1) {
                o.app_unselect(el);
            }
        });
        // Previously unfocused elements that should be focused
        $.each(apps, function(i, el){ 
            if($.inArray(el, elements) == -1)
                o.app_select(el, apps.length > 1); 
        });

        elements = $.merge([], apps);

        o.update_relative_coords();

        // Show controls which apply to all objects in the selection
        if (o.controls) o.controls.remove();
        o.make_controls = o.base_controls.slice();
        var sel_controls = u.union.apply(null, 
            elements.map(function(app) {
                return app.make_controls || []; })
        )
        o.make_controls = u.union(o.make_controls, sel_controls);
        if(apps.length > 1) {
            var common_type = apps[0].type.tname
            apps.map(function(a) { 
                if (common_type != a.type.tname) common_type = false
            })
            o.make_controls = o.make_controls.filter(function(c) {
                return !c.single && (common_type || !c.single_type);
            }).concat(o.multi_controls)
        }
        o.make_controls = o.make_controls.merge_sort(function(a,b) {
            a = a.display_order || 5
            b = b.display_order || 5
            return a - b
        })
        if(!dragging && multi) {
            Controls(o, false);
            o.controls.layout();
        }
        if (env.gifwall && context.flags.show_mini_selection_border && o.controls)
            o.controls.div.find(".select_border").hidehide();
        if(apps.length == 0) {
            evs.handler_del({handler_type: 0}); 
            if (o.controls) o.controls.remove();
        }
    };
    o.multi_controls = (function() {
        var control_len = o.make_controls.length;
        o.make_controls.push(function (o) {
            o.addTopButton($("#controls_multi .button"));
        })
        o.make_controls.push(function (o) {
            // Only show aspect control if there is an element with unfixed aspect
            $("#controls .button.change_aspect").showhide(
                env.Selection.elements().filter(function(a) {
                    return !a.get_aspect()}).length) 
        })
        o.make_controls[o.make_controls.length - 1].display_order = 9

        var set_tiling_param = function(param) { 
            return function(v) { env.tiling[param] = v; u.retile(); } }
        var get_tiling_param = function(param) { 
            return function() { return env.tiling[param] } }

        hive_app.App.has_slider_menu(o, ".change_aspect"
            ,set_tiling_param("aspect"), get_tiling_param("aspect"), null, null
            ,{ min: .30, max: 3.0, quant: .1
        })
        hive_app.App.has_slider_menu(o, ".change_padding"
            ,set_tiling_param("padding"), get_tiling_param("padding"), null, null
            ,{ min: -30, max: 30, quant: 1, clamp: false
        })
        hive_app.App.has_slider_menu(o, ".change_columns"
            ,set_tiling_param("columns"), get_tiling_param("columns"), null, null
            ,{ min: 1, max: 10.0, quant: .1, clamp_max: false
        })
        return o.make_controls.splice(control_len);
    })()
    o.unfocus = function(app){
        if(app) o.update($.grep(elements, function(el){ return el !== app }));
        else o.update([]);
    };
    o.push = function(element) { 
        o.update(elements.concat([element]));
    };
    o.select = function(app_or_apps){
        return o.update((!app_or_apps || $.isArray(app_or_apps)) ? app_or_apps : [app_or_apps]);
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
        if (hive_app.Apps.defer_layout()) {
            o.needs_layout = true;
            return true;
        }

        var bounds = o.bounds(), _pos = [bounds.left, bounds.top]
            ,_dims = [bounds.right - bounds.left, bounds.bottom - bounds.top];
        _positions = elements.map(function(a){
            return u._sub(a.pos_relative())(_pos);
        });
        _scales = elements.map(function(a){
            return u._div(a.dims_relative())(_dims);
        });
        o.bounds_relative_set(_pos, _dims);
    };

    var _pos_relative_set = o.pos_relative_set;
    o.pos_relative_set = function(pos){
        o.each(function(i, a){
            a.pos_relative_set(u._add(pos)(_positions[i]));
        });

        var bounds = o.bounds();
        _pos_relative_set([bounds.left, bounds.top]);

        // o.layout();
    };
    o.bounds = function() { 
        return u.app_bounds(elements);
    };
    // Overridden so as to take place in un-rotated space
    o.min_pos = function() {
        return o.pos_relative();
    };
    o.max_pos = function() {
        return u._add(o.pos_relative())(o.dims_relative());
    };

    // END-coords

    o.copy = function(opts){
        var load_count = elements.length + 1, copies, _load = opts.load;
        opts = $.extend({ 
            offset: [ 0, o.dims()[1] + 20 ],
            // 'z_offset': elements.length 
            },
            opts)
        opts.load = function(){
            load_count--;
            if( ! load_count ) {
                o.select( copies );
                if (_load)
                    _load();
                // else
                //     o.select( copies );
            }
        };
        env.History.begin();
        var copies = hive_app.Apps.copy(elements, opts)
        env.History.group('copy group');
        // load_count is one more than elements to guarantee copies existence
        // when loaded.
        setTimeout(opts.load, 1)
        return copies;
    }
    o.remove = function(){
        var sel = $.merge([], elements);
        o.unfocus();
        env.History.begin();
        $.each(sel, function(i, el){ el.remove() });
        env.History.group('delete group');
        env.layout_apps() // in case scrollbar visibility changed
    };

    o.get_stack = function(){
        return elements.sort(function(a, b){ a.layer() - b.layer() });
    };
    o.stack_top = function(ev){
        if (!ev.shiftKey) {
            return o.stack_shift(1)
        }
        env.History.begin();
        $.each(o.get_stack().reverse(), function(i, el){ el.stack_top() })
        env.History.group('stack group to top');
    };
    o.stack_bottom = function(ev){
        if (!ev.shiftKey) {
            return o.stack_shift(-1)
        }
        env.History.begin();
        $.each(o.get_stack().reverse(), function(i, el){ el.stack_bottom() })
        env.History.group('stack group to bottom');
    };
    o.stack_shift = function(offset) {
        env.History.begin();
        var overlaps = u.overlapped_apps(u.region_from_app(o))
            , elements = o.get_stack().reverse(), up_offset = -1
        if (offset < 0) {
            up_offset = 0
        }
        overlaps = u.except(overlaps, elements)
        var z_indexes = $.map(overlaps, function(a) { return a.layer(); })
        z_indexes.sort(js.op['-'])

        $.map(elements, function(a) {
            var layer = a.layer()
            for (var i = 0; i < z_indexes.length; i++)
                if (layer < z_indexes[i])
                    break;
            i = js.bound(i + offset + up_offset, 0, z_indexes.length - 1)
            var new_layer = z_indexes[i];
            if (u._sign(new_layer - layer) == u._sign(offset))
                a.stack_to(new_layer)
        })
        env.History.group('stack group ' + ((offset > 0) ? 'up' : 'down'));
    }

    var parent = o;
    o.make_controls.push(function(o){
        o.padding = 7;
        // TODO-cleanup-selection: add this back after app controls is moved into selection
        // o.div.drag(parent.move_handler).drag('start', parent.move_start)
        //     .drag('end', parent.move_end);
    });

    o.layout = function(){
        if (hive_app.Apps.defer_layout()) {
            o.needs_layout = true;
            return true;
        }
        if (o.needs_layout) {
            o.needs_layout = false;
            o.update_relative_coords();
        }
        if (o.controls)
            o.controls.layout();
    }

    o.keydown = Funcs(function(ev){ 
        // ctrl+[shift+]a to select all or none
        if( ev.keyCode == 65 && u.is_ctrl(ev) ){
            o.select( ev.shiftKey ? [] : hive_app.Apps.all() );
            return false;
        }

        var handlers = {
            27: function(){ // esc
                    if(elements.length) o.unfocus()
                    else return true
                },
            46: function(){ o.remove() }, // del
            66: function(){ o.stack_bottom(ev) }, // b
            84: function(){ o.stack_top(ev) }, // t
        }
        if(handlers[ev.keyCode]){
            if(handlers[ev.keyCode]()) return;
            return false;
        }

        // TODO: improve efficiency by using o.controls.pos_set like drag handler
        // or improving o.bounds
        if(o.controls)
            o.controls.layout();
    });
    
    // Set up delegate functions for controls
    o.load = function() {
        o.base_controls = o.make_controls.slice();
    }
    setTimeout(o.load, 1);
    var delegate_fn = function(fn_name) {
        return function() {
            var args = $.makeArray(arguments), res = "undefined"
                ,from_history = (args.slice(-1)[0] == "history")
                ,apps = elements.slice();
            if (from_history) {
                args.pop();
                if (args.length) {
                    args = args[0].slice();
                    apps = args.shift();
                }
            }
            all_res = apps.map(function(app, i) {
                if (typeof(app[fn_name]) == "function") {
                    var applied = args;
                    if (from_history)
                        applied = [args[i]];
                    if (typeof(app[fn_name]) == "function") {
                        var _res = app[fn_name].apply(null, applied);
                        if (res == "undefined") res = _res;
                        if (res != _res) res = undefined;
                    }
                    return _res;
                }
                return undefined;
            });
            if (from_history) {
                all_res.unshift(apps);
                return all_res;
            }
            return res;
        }
    }
    var delegates = ["color", "color_set", "opacity", "opacity_set"
        ,"border_radius", "border_radius_set", "link", "link_set"
        ,"stroke_width", "stroke_width_set", "stroke_update", "reframe"
        ,"blur", "blur_set", "stroke", "stroke_set", 'run', 'edit', 'stop'
        ,'css_class', 'css_class_set', "border_width", "border_width_set"
        ,"client_data", "client_data_set"];
    delegates.map(function(fn_name) {
        o[fn_name] = delegate_fn(fn_name);
    });

    // prevent selection keyhandler from eating events when nothing is selected
    hive_app.App.has_nudge(o, function(){ return elements.length > 0 })

    return o;
};
hive_app.registerApp(o.Selection, 'hive.selection');

return o;
})
