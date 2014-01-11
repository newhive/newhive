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
    u.reset_sensitivity();

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
    o.sensitivity = u.calculate_sensitivity(delta);
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
    if(!env.no_snap){
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
    u.set_debug_info("");
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
    Controls(app, multi);
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
        Controls(o, false);
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
        left:   u.min(abs_mins.map(function(c){ return c[0] })),
        top:    u.min(abs_mins.map(function(c){ return c[1] })),
        right:  u.max(abs_maxs.map(function(c){ return c[0] })),
        bottom: u.max(abs_maxs.map(function(c){ return c[1] }))
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
hive_app.App.has_nudge(o);

env.Selection = o;
return o;

})