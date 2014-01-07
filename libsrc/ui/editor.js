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
    './edit/events',
    'sj!templates/color_picker.html',
    'browser/jquery/jplayer/skin',
    'browser/jquery/rotate.js',
    'js!browser/jquery/event/drag.js',
    //'js!browser/jquery-ui/jquery-ui-1.10.3.custom.js',
    'js!google_closure.js'
], function(
    $,
    js,
    Menu,
    CodeMirror,
    dialog,
    ui_util,
    layout,
    context,
    colors,
    evs,
    color_picker_template
){

var Hive = {}, debug_mode = context.config.debug_mode, bound = js.bound,
    noop = function(){}, Funcs = js.Funcs, asset = ui_util.asset;
Hive.shift_does_raise = false;
Hive.show_move_sensitivity = false;
Hive.asset = asset;

// TODO-refactor: move into util
_apply = function(func, scale) {
    if (typeof(scale) == "number") {
        return function(l) {
            return $.map(l, function(x) { return func(scale, x); });
        }
    } else {
        // TODO: error handling?
        return function(l) {
            if (typeof(l) == "number") {
                return $.map(scale, function(x, i) { return func(x, l); });
            } else {
                return $.map(l, function(x, i) { return func(scale[i], x); });
            }
        }
    }
};

_mul = function(scale) {
    return _apply(function(x, y){ return x * y; }, scale);
};
_add = function(scale) {
    return _apply(function(x, y){ return x + y; }, scale);
};
_div = function(scale) {
    return _apply(function(x, y){ return x / y; }, scale);
};
_sub = function(scale) {
    return _apply(function(a, b) { return a - b; }, scale);
};
_inv = function(l){
    return l.map(function(x){ return 1/x; });
};
// Return a value that is alpha (scalar) of the way between old_val
// and new_val.  The values can be numbers or equal-length vectors.
_lerp = function(alpha, old_val, new_val) {
    if (typeof(old_val) == "number") {
        return alpha * new_val + (1 - alpha) * old_val;
    } else {
        return _apply(function(old_val, new_val) {
            return alpha * new_val + (1 - alpha) * old_val;
        }, old_val)(new_val);
    }
};

// Returns the nonnegative (nonoverlapping) distance btw two intervals.
interval_dist = function(a, b) {
    c = [a[1] - b[0], a[0] - b[1]];
    if (c[0] * c[1] <= 0)
        return 0;
    return Math.min(Math.abs(c[0]), Math.abs(c[1]));
};

interval_size = function(i) { return Math.abs(i[1] - i[0]); };
// Returns the least interval containing both inputs
interval_bounds = function(a, b) {
    return [Math.min(a[0], b[0]), Math.max(a[1], b[1])];
};
// Useful for default values when using interval_bounds
var null_interval = [Infinity, -Infinity];
var all_interval = [-Infinity, Infinity];
////////

var hover_menu = function(handle, drawer, opts){
    return Menu(handle, drawer, $.extend({ auto_height: false }, opts));
};

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
        var query = location.search.slice(1);
        if (query.length) {
            if (query == "new_user") {
                $("#dia_editor_help").data("dialog").open();
            } else {
                // otherwise query is assumed to be tag list
                $("#tags_input").val(unescape(query));
            }
        }
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

Hive.env_set = function(){
    Hive._scale = $(window).width() / 1000;
};
Hive.env = function(){
    return { scale: Hive._scale };
};
Hive.layout_apps = function(){
    var old_env = Hive.env();
    Hive.env_set();
    var new_env = Hive.env();
    if(old_env.scale == new_env.scale) return;

    $.map(Hive.Apps, function(a){ a.layout() });
    if(Hive.Selection.controls) Hive.Selection.controls.layout();
};

var snap_helper = function(my_tuple, exclude_ids,
    snap_strength, snap_radius, sensitivity, padding
) {
    var s = Hive.env().scale;
    if (snap_radius == undefined) snap_radius = 10;
    if (snap_strength == undefined) snap_strength = 0.0;
    if (padding == undefined) padding = 10;
    if (sensitivity == undefined) sensitivity = 0;
    padding = padding * .5;
    var pos;
    for (var j = 0; j < my_tuple[0].length; j++){
        if (my_tuple[0][j]) {
            pos = [my_tuple[0][j], my_tuple[1][j]];
            break;
        }
    }
    var tuple = [[],[]], new_pos = pos.slice();
    // TODO-perf: save this array only after drag/drop
    // And keep it sorted
    var apps = Hive.Apps.all().filter(function(app) {
        return !(app.id in exclude_ids || Hive.Selection.selected(app));
    });
    // TODO: this 'root' app belongs as a permanent feature of Apps.
    // var app = Hive.App({
    //     position: [0, 0],
    //     dimensions: [1000, $("body")[0].scrollHeight / s],
    //     type: 'hive.root',
    // });
    // app.load();
    // apps = apps.concat([app]);
    for (var i = 0; i < apps.length; i++) {
        var app = apps[i];
        var curr_ = [app.min_pos(), app.cent_pos(), app.max_pos()];
        var curr = [[],[]];
        $.map(curr_, function(pair) {
            curr[0] = curr[0].concat(pair[0]);
            curr[1] = curr[1].concat(pair[1]);
        });
        tuple[0] = tuple[0].concat([curr[0].slice()]);
        tuple[1] = tuple[1].concat([curr[1].slice()]);
    };
    // Add in the root element. 
    // TODO: should be in apps
    var scroll_coord = 1;
    var max_height = $("body")[0].scrollWidth / s;
    if (scroll_coord)
        max_height = $("body")[0].scrollHeight / s;
    tuple[scroll_coord] = tuple[scroll_coord].concat([[0, max_height / 2, max_height]]);
    tuple[1 - scroll_coord] = tuple[1 - scroll_coord].concat([[0, 500, 1000]]);

    var best_intervals = [];
    if (my_tuple[0][1])
        dist_cent = [my_tuple[0][1], my_tuple[1][1]];
    else
        var dist_cent = pos.slice();
    for (var coord = 0; coord <= 1; ++coord) {
        var best_snaps = {};
        var best_guides = {};
        var my_interval = [my_tuple[1 - coord][0], my_tuple[1 - coord][2]];
        if (my_interval[0] == undefined || my_interval[1] == undefined) {
            my_interval = dist_cent.slice()[coord];
            my_interval = [my_interval, my_interval];
        }
        var best = { goal:0, strength:0, start:[0,0], end:[0,0] };
        for (var app_i = 0; app_i < tuple[coord].length; ++app_i) {
            for (var type1 = 0; type1 < 3; ++type1) {
                coord1 = my_tuple[coord][type1];
                if (!coord1)
                    continue;
                for (var type2 = 0; type2 < 3; ++type2) {
                    if (coord == scroll_coord && app_i == tuple[coord].length - 1
                        && type2 > 0)
                        break;
                    coord2 = tuple[coord][app_i][type2];
                    // Add padding if aligning a right edge to a left
                    var padding_factor = 0, added_padding = 0;
                    var padding_steps = 1;
                    if (Math.max(type2, type1) == 2 && 
                        (type1 == 0 || type2 == 0)) {
                        padding_factor = padding*(type2 - type1);
                        padding_steps = 2;
                    }
                    for (var j = 0; j < padding_steps; 
                        ++j, coord2 += padding_factor, 
                        added_padding += padding_factor) {
                        var snap_dist = Math.abs(coord2 - coord1);
                        if (snap_dist < snap_radius) {
                            var strength = 1.0;
                            var other_interval =
                                [tuple[1 - coord][app_i][0],tuple[1 - coord][app_i][2]];
                            var dist = interval_dist(my_interval, other_interval);
                            var guide = interval_bounds(my_interval, other_interval);
                            // power fall-off w/ decay when user jiggles mouse
                            var snap_dist_scaled = 1 - snap_dist / snap_radius;
                            strength *= Math.pow(snap_dist_scaled, sensitivity);
                            if (dist > 200) strength /= 
                                Math.exp((Math.min(dist, 1000) - 200)/500);
                            if ((type1 == 1) ^ (type2 == 1)) strength *= .4;
                            var goal = coord2 + pos[coord] - coord1;
                            goal = Math.round(goal*2)/2;
                            var total = best_snaps[goal.toString()] || 0;
                            total += strength;
                            goal_memo = goal.toString();
                            best_snaps[goal_memo] = total;
                            best_guides[goal_memo] = best_guides[goal_memo] || {};
                            // NOTE: We were showing the ruler at coord2 - added_padding
                            best_guides[goal_memo][coord2] = interval_bounds(
                                best_guides[goal_memo][coord2] || null_interval,
                                guide);
                            if (total > best.strength) {
                                best.strength = total;
                                best.goal = goal;
                            }
                        }
                    }
                }
            }
        }
        if (best.strength > snap_strength) {
            new_pos[coord] = best.goal;
            var obj = best_guides[best.goal.toString()];
            // Just pick the first available guide matching the goal.
            // TODO-polish: pick on a more sensible criterion
            for (var first in obj)
                if (obj.hasOwnProperty(first)) break;
            best_intervals[coord] = obj[first].concat([parseFloat(first)]);
        }
    }
    $(".ruler").hidehide();
    for (var coord = 0; coord < 2; ++coord) {
        if (best_intervals[coord]) {
            var best_interval = best_intervals[coord];
            var best = {start:[], end:[]};
            // Correct an interval which includes the original point pre-snap.
            // Fix it to the post-snap position.
            var orig_pos = [pos[1 - coord], my_tuple[1 - coord][2]];
            for (var i = 0; i < 2; i++) {
                if (orig_pos[i]) {
                    for (var j = 0; j < 2; j++) {
                        if (best_interval[j] == orig_pos[i])
                            best_interval[j] += new_pos[1 - coord] - pos[1 - coord];
                    }
                }
            }
            best.start[1 - coord] = best_interval[0];
            best.end[1 - coord] = best_interval[1];
            best.start[coord] = best_interval[2] - 2/s;
            best.end[coord] = best_interval[2];
            var klass = ".ruler.ruler" + coord;
            var rule = $(klass);
            if (0 == rule.length) {
                rule = $('<div class="ruler ruler' + coord + '">');
                rule.appendTo($("body"));
            }
            rule.showshow();
            rule.css({
                left: Math.min(best.start[0], best.end[0]) * s,
                top: Math.min(best.start[1], best.end[1]) * s,
                width: Math.abs(best.start[0] - best.end[0]) * s,
                height: Math.abs(best.start[1] - best.end[1]) * s
            });
        }
    }
    return new_pos;
}

// Creates generic initial object for all App types.
Hive.App = function(init_state, opts) {
    var o = {};
    o.apps = Hive.Apps;
    if(!opts) opts = {};
    
    o.init_state = { z: null };
    $.extend(o.init_state, init_state);
    o.type = Hive.appTypes[init_state.type];
    o.id = init_state.id || Hive.random_str();
    o.handler_type = 0;

    o.add_to = function(method, more_method){
        // Add functionality to methods, used by behavior and child constructors
        var old_method = o[method];
        o[method] = function(){
            return more_method(old_method());
        };
    };

    o._remove = function(){
        o.unfocus();
        o.div.hidehide();
        o.deleted = true;
        if(o.controls) o.controls.remove();
    };
    o._unremove = function(){
        o.div.showshow();
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
    o.stack_bottom = function(){
        o.stack_to(0) };
    o.stack_top = function(){
        o.stack_to(o.apps.length -1) };
    
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

    // stacking order of aps
    var layer = init_state.z;
    o.layer = function(){ return layer; };
    o.layer_set = function(n){
        layer = n;
        o.div.css('z-index', n);
    };

    // BEGIN-coords: client space and editor space (called relative)
    // position and dimension methods

    var _pos = [-999, -999], _dims = [-1, -1];

    o.pos = function(){
        var s = Hive.env().scale;
        return [ _pos[0] * s, _pos[1] * s ];
    };
    o.pos_set = function(pos){
        var s = Hive.env().scale;
        _pos = [ pos[0] / s, pos[1] / s ];
        o.layout();
    };
    o.dims = function() {
        var s = Hive.env().scale;
        return [ _dims[0] * s, _dims[1] * s ];
    };
    o.dims_set = function(dims){
        var s = Hive.env().scale;
        _dims = [ dims[0] / s, dims[1] / s ];
        o.layout();
    };
    o.width = function(){ return o.dims()[0] };
    o.height = function(){ return o.dims()[1] };
    o.pos_center = function() {
        var dims = o.dims();
        var pos = o.pos();
        return [ pos[0] + dims[0] / 2, pos[1] + dims[1] / 2 ];
    };

    o.layout = function(){
        var pos = o.pos(), dims = o.dims();
        o.div.css({ 'left' : pos[0], 'top' : pos[1] });
        o.div.width(dims[0]).height(dims[1]);
        if(o.controls){
            o.controls.pos_set([ pos[0], pos[1] ]);
            o.controls.layout();
        }
    };

    o.pos_relative = function(){ return _pos.slice(); };
    o.pos_relative_set = function(pos){
        _pos = pos.slice();
        o.layout()
    };
    o.dims_relative = function(){
        return _dims.slice();
    }
    o.dims_relative_set = function(dims){
        _dims = dims.slice();
        o.layout();
    };
    o.pos_center_relative = function(){
        var dims = o.dims_relative();
        var pos = o.pos_relative();
        return [ pos[0] + dims[0] / 2, pos[1] + dims[1] / 2 ];
    };
    // TODO: make these two reflect axis aligned bounding box (when rotated, etc)
    o.min_pos = function(){ return _pos.slice(); };
    o.max_pos = function(){ return [ _pos[0] + _dims[0], _pos[1] + _dims[1] ]; };
    o.cent_pos = function() { return _mul(.5)(_add(o.min_pos())(o.max_pos())); };
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

    // END-coords

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
        delete app_state.id;
        if(opts.z_offset) app_state.z += opts.z_offset;
        var cp = Hive.App(app_state, opts);
        Hive.History.save(cp._remove, cp._unremove, 'copy');
        return cp;
    };

    o.fit_to = function(opts){
        if (opts.doit == undefined) opts.doit = true;
        var dims = opts.dims.slice(), pos = opts.pos.slice();
        var scaled = (opts.scaled) ? opts.scaled.slice() : o.dims();
        var aspect = scaled[1] / scaled[0];
        var into_aspect = dims[1] / dims[0];
        var fit_coord = (aspect < into_aspect) ? 0 : 1;
        if (opts.zoom || opts.fit == 2)
            fit_coord = 1 - fit_coord;
        scaled = _mul(dims[fit_coord] / scaled[fit_coord])(scaled);
        pos[1 - fit_coord] += 
            (dims[1 - fit_coord] - scaled[1 - fit_coord]) / 2;

        if (opts.doit) {
            o.pos_set(pos);
            o.dims_set(scaled);
        }
        return { pos: pos, dims: scaled };
    };

    o.state_relative = function(){ return {
        position: _pos.slice(),
        dimensions: _dims.slice()
    }};
    o.state_relative_set = function(s){
        _pos = s.position.slice();
        _dims = s.dimensions.slice();
        o.layout();
    };

    o.state = function(){
        var s = $.extend({}, o.init_state, o.state_relative(), {
            z: o.layer(),
            full_bleed_coord: o.full_bleed_coord,
            // TODO-cleanup: flatten state and use o.state() and
            // o.state_update to simplify behavior around shared attributes
            content: o.content(),
            id: o.id
        });
        return s;
    };
    o.state_update = function(s){
        $.extend(o.init_state, s);
    };

    o.history_helper_relative = function(name){
        var o2 = { name: name };
        o2.old_state = o.state_relative();
        o2.save = function(){
            o2.new_state = o.state_relative();
            Hive.History.save(
                function(){ o.state_relative_set(o2.old_state) },
                function(){ o.state_relative_set(o2.new_state) },
                o2.name
            );
        };
        return o2;
    };

    o.load = Funcs(function() {
        if( ! o.init_state.position ) o.init_state.position = [ 100, 100 ];
        if( ! o.init_state.dimensions ) o.init_state.dimensions = [ 300, 200 ];
        if( opts.offset ) o.init_state.position = array_sum(o.init_state.position, opts.offset);
        o.state_relative_set(o.init_state);
        if (o.init_state.full_bleed_coord != undefined)
            Hive.App.has_full_bleed(o, o.init_state.full_bleed_coord);
        if(opts.load) opts.load(o);
        Hive.layout_apps();
    });

    // initialize

    o.div = $('<div class="ehapp">').appendTo('#happs');
    evs.on(o.div, 'dragstart', o).on(o.div, 'drag', o).on(o.div, 'dragend', o)
        .on(o.div, 'click', o).long_hold(o.div, o);
 
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
    o.hover_menu = function(h, d, opts) {
        return hover_menu(h, d, $.extend({offset_y : o.padding + 1}, opts)) };

    o.layout = function() {
        o.pos_update();
        var dims = o.dims(), p = o.padding, ad = o.app.dims(),
            cx = Math.round(ad[0] / 2), cy = Math.round(ad[1] / 2),
            bw = o.border_width, outer_l = -cx -bw - p,
            outer_width = ad[0] + bw*2 + p*2, outer_height = ad[1] + p * 2 + 1;

        o.select_box.css({ left: cx, top: cy });
        o.select_borders.eq(0).css({ left: outer_l, top: -cy -bw -p, width: outer_width, height: bw }); // top
        o.select_borders.eq(1).css({ left: cx + p, top: -cy -p - bw + 1, height: outer_height + bw * 2 -2, width: bw }); // right
        o.select_borders.eq(2).css({ left: outer_l, top: cy + p, width: outer_width, height: bw }); // bottom
        o.select_borders.eq(3).css({ left: outer_l, top: -cy -p - bw + 1, height: outer_height + bw * 2 -2, width: bw }); // left
        if(o.multiselect) return;

        //o.c.undo   .css({ top   : -38 - p, right  :  61 - p });
        o.c.copy   .css({ left  : dims[0] - 45 + p, top   : -38 - p });
        o.c.remove .css({ left  : dims[0] - 14 + p, top   : -38 - p });
        o.c.stack  .css({ left  : dims[0] - 78 + p, top   : dims[1] + 8 + p });
        o.c.buttons.css({ left  :  -bw - p, top : dims[1] + p + 10, width : dims[0] - 60 });
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


Hive.appTypes = { };
Hive.registerApp = function(app, name) {
    app.tname = name;
    Hive.appTypes[name] = app;
}

var is_escape = function(ev){
    return ev.keyCode == 27;
}

// Most general event handlers
Hive.handler_type = 3;
Hive.dragstart = noop; // function(){ hovers_active(false) };
Hive.dragend = function(){
    // TODO-usability: fix disabling hover states in ui/util.hoverable
    // hovers_active(true)
    // In case scrollbar has been toggled:
    Hive.layout_apps(); 
};
Hive.mouse_pos = [0, 0];
Hive.mousemove = function(ev){
    Hive.mouse_pos = [ev.clientX, ev.clientY];
};
Hive.keydown = function(ev){
    // TODO-feature-editor-prompts #706: if key pressed is a word character,
    // create hive.text app with content of the character pressed

    if(ev.ctrlKey && ev.keyCode == 90){
        Hive.History.undo();
        return false;
    }
    else if(ev.ctrlKey && ev.keyCode == 89){
        Hive.History.redo();
        return false;
    }
};


Hive.App.has_nudge = function(o){
    // TODO-bugbug: implement undo/redo of this. Because nudge is naturally
    // called repeatedly, this should create a special collapsable history
    // point that automatically merges into the next history point if it's the
    // same type, similar to History.begin + History.group
    o.keydown.add(function(ev){
        var nudge = function(dx, dy){
            return function(){
                var s = Hive.env().scale, delta = _mul(1/s)([dx, dy]);
                if(ev.shiftKey)
                    delta = _mul(10)(delta);
                o.pos_relative_set(_add(o.pos_relative())(delta));
            }
        }
        var handlers = {
            37: nudge(-1,0)   // Left
            , 38: nudge(0,-1) // Up
            , 39: nudge(1,0)  // Right
            , 40: nudge(0,1)  // Down
        }
        if(handlers[ev.keyCode]){
            handlers[ev.keyCode]();
            return false;
        }
    });
};

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

// coord = 0 ==> full in x dimension (y scrolling)
// coord = 1 ==> full in y dimension (x scrolling)
Hive.App.has_full_bleed = function(o, coord){
    if (!coord) coord = 0;  // default is vertical scrolling
    o.full_bleed_coord = coord;
    var dims = o.dims_relative();
    dims[coord] = 1000;
    o.dims_relative_set(dims);

    o.orig_pos_set = o.pos_set;
    o.orig_move_start = o.move_start;
    o.orig_move_end = o.move_end;

    o.move_start = function() {
        Hive.History.begin();

        o.orig_move_start();
        o.padding = 10; // Scale into screen space?
        o.size = o.dims()[1 - o.full_bleed_coord];//o.size || 200;
        o.start_pos = o.pos()[1 - o.full_bleed_coord] - o.padding;
        o.apps = Hive.Apps.all().filter(function(app) {
            return !(app.id == o.id || Hive.Selection.selected(app));
        });
        var apps = o.apps;
        for (var i = 0; i < apps.length; ++i) {
            var app = apps[i];
            app.old_start = app.pos()[1 - o.full_bleed_coord];
            (app.orig_move_start || app.move_start)();
            if (app.old_start >= o.start_pos)
                app.old_start -= o.size + 2 * o.padding;
        }
    };
    o.move_end = function() {
        o.orig_move_end();
        var apps = o.apps;
        for (var i = 0; i < apps.length; ++i) {
            var app = apps[i];
            (app.orig_move_end || app.move_end)();
        }
        Hive.History.group('full-bleed move');
    };
    o.pos_set = function(pos) {
        pos[o.full_bleed_coord] = 0;
        var coord = 1 - o.full_bleed_coord; // Work in y
        o.start_pos = pos[coord] - o.padding;
        o.stop_pos = o.start_pos + o.size + 2 * o.padding;

        if (o.apps) {
            var push_start = 0, push_size = 0, apps = o.apps;
            for (var i = 0; i < apps.length; ++i) {
                var app = apps[i];
                var start = app.old_start;
                var stop = start + app.dims()[coord];
                if (start < o.stop_pos && stop > o.start_pos) {
                    var push_try = o.stop_pos - start;
                    push_size = Math.max(push_size, push_try);
                }
            }
            for (var i = 0; i < apps.length; ++i) {
                var app = apps[i];
                var start = app.old_start;
                var stop = start + app.dims()[coord];
                var new_pos = app.pos();
                if (stop > o.start_pos) start += push_size;
                new_pos[coord] = start;
                (app.orig_pos_set || app.pos_set)(new_pos);
            }
        }
        o.orig_pos_set(pos);
    };

    o.div.drag('start', o.move_start).drag('end', o.move_end);
    // o.move_setup();
    // o.pos_set(o.pos());
};

// Let users drag images onto this app
// NOTE: this adds handlers to o.content_element, so if
// content_element changes, this modifier needs to be called again.
Hive.App.has_image_drop = function(o) {
    if (!context.flags.rect_drag_drop)
        return o;
    o.content_element.on('dragenter dragover', function(ev){
        // TODO-dnd: handle drop highlighting
        if (o.highlight)
            o.highlight();

        ev.preventDefault();
    }).on('drop', function(ev){
        var dt = ev.originalEvent.dataTransfer;
        file_list = dt.files;
        var files = [];
        var urlCreator = window.URL || window.webkitURL;
        for(var i = 0; i < file_list.length; i++){
            var f = file_list.item(i), file = {
                url: urlCreator.createObjectURL(f),
                name: f.name,
                mime: f.type
            };
            files.push(file);
            break; // can only handle 1 file
        }
        var url = dt.getData("URL");
        if (files.length == 0 && url.length) {
            var file_name = url.split("/").slice(-1)[0];
            var i = file_name.lastIndexOf(".");
            if (i > 0) {
                var name = file_name.slice(0, i);
                var ext = file_name.slice(i + 1);
                // TODO-cleanup: have this live somewhere global
                // TODO-dnd: handle audio
                var image_mimes = {
                    "jpg": "image/jpeg",
                    "jpeg": "image/jpeg",
                    "gif": "image/gif",
                    "png": "image/png"
                };
                var mime = image_mimes[ext];
                if (mime) {
                    files.push({
                        url: url,
                        name: name,
                        mime: mime
                    });
                }
            }
        }
        if (files.length == 0)
            return false;
        var load = function(app) {
            // app.fit_to({dims: o.dims(), pos: o.pos(), zoom: false});
        };
        // TODO-dnd: Insert ajax to turn into proper file (from blob URL)
        var file = files[0];
        var init_state = { 
            position: o.pos_relative(), 
            dimensions: o.dims_relative(),
            fit: 2 };
        if (o.is_image) {
            // o.set_from_file(file);
            o.init_state.file_name = file.name;
            o.init_state.url = o.init_state.content = file.url;
            o.init_state = $.extend(o.init_state, init_state);
            // TODO-dnd: have undo state
            o.url_set(file.url);
            var app = o;
        } else {
            // TODO-dnd: have fit depend on where the object was dropped relative
            // to image center
            app = Hive.new_file(files, init_state,
                { load:load, position: true })[0];
        }
        return app;
    });

    return o;
};
Hive.App.has_resize = function(o) {
    var dims_ref, history_point;
    o.resize_start = function(){
        $("#controls").hidehide();
        dims_ref = o.dims();
        history_point = o.history_helper_relative('resize');
    };
    o.resize = function(delta) {
        var dims = o.resize_to(delta);
        if(!dims[0] || !dims[1]) return;
        dims = _div(dims)(Hive.env().scale);
        // everything past this point is in editor space.
        var aspect = o.get_aspect ? o.get_aspect() : false;

        if (aspect) {
            var newWidth = dims[1] * aspect;
            dims = (newWidth < dims[0]) ? [newWidth, dims[1]] : 
                [dims[0], dims[0] / aspect];
        }

        // snap
        var _pos = o.pos_relative();
        var pos = [ _pos[0] + dims[0], _pos[1] + dims[1] ];
        var snap_dims = o.resize_to_pos(pos, !aspect);

        if (!aspect)
            return;

        var snap_dist = _apply(function(x,y) {return Math.abs(x-y);}, 
            dims)(snap_dims);
        dims = (snap_dist[0] < snap_dist[1]) ?
            [snap_dims[1] * aspect, snap_dims[1]] :
            [snap_dims[0], snap_dims[0] / aspect];

        newWidth = dims[1] * aspect;
        dims = (newWidth < dims[0] ? [newWidth, dims[1]]
            : [dims[0], dims[0] / aspect]);
        o.dims_relative_set(dims);
    }

    o.resize_end = function(){ 
        $("#controls").showshow();
        history_point.save();
        $(".ruler").hidehide();
    };
    o.resize_to = function(delta){
        return [ Math.max(1, dims_ref[0] + delta[0]), 
            Math.max(1, dims_ref[1] + delta[1]) ];
    };
    o.resize_to_pos = function(pos, doit) {
        var _pos = o.pos_relative();
        var snap_strength = .5, snap_radius = 10;  //!!
        // TODO: allow snapping to aspect ratio (keyboard?)
        if (snap_strength > 0) {
            var excludes = {};
            excludes[o.id] = true;
            var tuple = [];
            tuple[0] = [undefined, undefined, pos[0]];
            tuple[1] = [undefined, undefined, pos[1]];
            pos = snap_helper(tuple, excludes, snap_strength, snap_radius);
        }
        var _dims = [];
        _dims[0] = pos[0] - _pos[0];
        _dims[1] = pos[1] - _pos[1];
        if (o.full_bleed_coord != undefined)
            _dims[o.full_bleed_coord] = 1000;
        _dims = [ Math.max(1, _dims[0]), Math.max(1, _dims[1]) ];
        if (doit || doit == undefined)
            o.dims_relative_set(_dims);
        return _dims;
    };

    function controls(o) {
        var common = $.extend({}, o);
        o.resize_control = true;

        o.addControl($('#controls_misc .resize'));
        o.c.resize = o.div.find('.resize');

        o.layout = function() {
            common.layout()
            var p = o.padding;
            var dims = o.dims();
            o.c.resize.css({ left: dims[0] -18 + p, top: dims[1] - 18 + p });
        };

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
        // TODO-cleanup: move to has_crop
        // if (o.is_cropped) 
        evs.long_hold(o.c.resize, o.app);

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
    o.scale_set = function(s){ scale = s; o.layout(); };

    var _state_relative = o.state_relative, _state_relative_set = o.state_relative_set;
    o.state_relative = function(){
        return $.extend(_state_relative(), { 'scale': scale });
    };
    o.state_relative_set = function(s){
        _state_relative_set(s);
        if(s.scale) o.scale_set(s.scale);
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

// TODO: root, selection, app inherits pseudoApp
// TODO-perf: ? For all inheritance, use prototype.

// PseudoApp cannot be added to selection
// It has no (server) state.
Hive.App.PseudoApp = function(o) {

};
Hive.registerApp(Hive.App.PseudoApp, 'hive.pseudo');
Hive.App.Root = function(o) {
    // Automatic top level app for layout and template logic

};
Hive.registerApp(Hive.App.Root, 'hive.root');


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

    o.get_aspect = function() {
        var dims = o.dims();
        return dims[0] / dims[1];
    };
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
                .on('mousedown keydown', function(e){ e.stopPropagation(); });
            edit_mode = true;
        }
        else {
            o.rte.unwrap_all_selections();
            o.rte.save_cursor();
            o.rte.add_breaks();
            o.rte.make_uneditable();
            o.content_element
                .off('mousedown keydown')
                .trigger('blur');
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
    var _layout = o.layout;
    o.layout = function(){
        _layout();
        o.div.css('font-size', (Hive.env().scale * o.scale()) + 'em');
    };

    // New scaling code
    var scale_ref, dims_ref, history_point, 
        _resize_start = o.resize_start, _resize = o.resize;
    o.resize_start = function(){
        _resize_start();
        scale_ref = o.scale();
        dims_ref = o.dims();
        history_point = o.history_helper_relative('resize');
    };
    o.resize = function(delta) {
        _resize(delta);
        var scale_by = o.dims()[0] / dims_ref[0];
        o.scale_set(scale_ref * scale_by);
    };
    
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
            $(el).on('mousedown', function(e) {
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

Hive.App.has_slider_menu = function(o, handle, set, init, start, end) {
    function controls(o) {
        var common = $.extend({}, o), changed = false;
        if(!start) start = noop;
        if(!end) end = noop;

        var drawer = $('<div>').addClass('control drawer hide');
        var input = $("<input class='control' type='text' size='3'>")
            .appendTo(drawer);
        o.div.find('.buttons').append(drawer);
        var m = o.hover_menu(o.div.find(handle), drawer, {
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
    var opacity = o.init_state.opacity === undefined ? 1 : o.init_state.opacity;
    o.opacity = function(){ return opacity; };
    o.opacity_set = function(s){
        opacity = s;
        o.content_element.css('opacity', s);
    };

    function controls(o) {
        var common = $.extend({}, o);

        o.addButton($('#controls_misc .opacity'));
        o.c.opacity = o.div.find('.opacity');

        return o;
    };
    o.make_controls.push(controls);

    o.add_to('state', function(s){
        s.opacity = opacity;
        if(opacity == 1) delete s.opacity;
        return s;
    });

    o.load.add(function(){
        if (o.content_element)
            o.opacity_set(opacity);
    });

    var history_point;
    Hive.App.has_slider_menu(o, '.button.opacity',
        function(v) { o.opacity_set(v/100) },
        function() { return Math.round(o.opacity() * 100) },
        function(){ history_point = Hive.History.saver(
            o.opacity, o.opacity_set, 'change opacity') },
        function(){ history_point.save() }
    );
};
    
Hive.App.has_color = function(o) {
    function controls(o) {
        var common = $.extend({}, o);

        o.addButton($('#controls_misc .drawer.color'));
        o.c.color = o.div.find('.button.color');
        o.c.color_drawer = o.div.find('.drawer.color');

        Hive.append_color_picker(o.c.color_drawer, o.app.color_set, o.app.color());
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
    o.is_image = true;
    Hive.App.has_resize(o);
    o.get_aspect = function() {
        return o.div_aspect || o.aspect;
    };
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
        // We recreated the content_element, so reapply its handlers.
        Hive.App.has_image_drop(o);
    };
    o.img_load = function(){
        o.imageWidth  = o.img.width() || o.img.prop('naturalWidth');
        o.imageHeight = o.img.height() || o.img.prop('naturalHeight');
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
        o.load();
        o.img.css('width', o.dims()[0] + 'px');
        // fit and crop as needed
        if (o.init_state.fit) {
            var opts = { dims:o.dims(), pos:o.pos(), fit:o.init_state.fit, 
                doit: (o.init_state.fit != 2), // Cropping needed, wait on execution
                scaled: [o.imageWidth, o.imageHeight] };
            var new_layout = o.fit_to(opts);
            if (opts.fit == 2) {
                o.init_state.scale_x = new_layout.dims[0] / opts.dims[0];
                o.init_state.offset = _add(new_layout.pos)(_mul(-1)(opts.pos));
                o.init_state.offset = _mul( 1 / opts.dims[0] /
                    o.init_state.scale_x)(o.init_state.offset);
            }
            o.init_state.fit = undefined;
        }
        if (o.init_state.scale_x != undefined) {
            // TODO-cleanup: move to has_crop
            // o.is_cropped = true;
            var happ = o.content_element.parent();
            o.content_element = $('<div class="crop_box">');
            o.img.appendTo(o.content_element);
            o.content_element.appendTo(happ);
            o.div_aspect = o.dims()[0] / o.dims()[1];
            o.layout();
        }
    };

    // TODO-cleanup: move to has_crop
    (function(){
        var drag_hold, fake_img, ref_offset, ref_dims, ref_scale_x;

        // UI for setting .offset of apps on drag after long_hold
        o.long_hold = function(ev){
            if(!o.init_state.scale_x || o != ev.data) return;
            $("#controls").hidehide();
            ev.stopPropagation();
            drag_hold = true;

            // show new img w/ opacity
            fake_img = o.img.clone().appendTo(o.div).css('opacity', .5)
                .css('z-index', 0);
            o.img = o.img.add(fake_img);
            return false;
        };
        o.long_hold_cancel = function(ev){
            if(!drag_hold) return;
            $("#controls").showshow();
            if (ev)
                ev.stopPropagation();
            drag_hold = false;
            o.img = o.img.not(fake_img);
            fake_img.remove();
        };

        o.dragstart = function(ev){
            if (!drag_hold) return;
            ev.stopPropagation();
            ref_offset = o.offset();
            // o.fixed_coord = (ref_offset[0] == 0) ? 0 : ((ref_offset[1] == 0) ? 1 : -1);
            history_point = Hive.History.saver(o.offset, o.offset_set, 'move crop');
        };
        o.drag = function (ev, dd, shallow) {
            if(!drag_hold || !ref_offset) return;
            ev.stopPropagation();
            var delta = [dd.deltaX, dd.deltaY];
            if(ev.shiftKey)
                delta[ Math.abs(dd.deltaX) > Math.abs(dd.deltaY) & 1 ] = 0;
            // constrain delta for now to the "free" dimension
            if (o.fixed_coord >= 0)
                delta[o.fixed_coord] = 0;
            // TODO: snap to edge/center
            delta = _add(delta)(ref_offset);
            var dims = o.dims();
            delta[0] = Math.min(0, Math.max(delta[0],
                dims[0]*(1 - o.init_state.scale_x)));
            delta[1] = Math.min(0, Math.max(delta[1],
                dims[1] - dims[0] / o.aspect * o.init_state.scale_x));
            o.offset_set(delta);
            o.layout();
        };
        o.dragend = function(ev){
            if(!drag_hold) return;
            history_point.save();
            o.long_hold_cancel(ev);
        };

        var _resize = o.resize, _resize_end = o.resize_end, 
            _resize_start = o.resize_start;
        o.resize_start = function() {
            _resize_start();
            if (!drag_hold) return;
            ref_dims = o.dims_relative();
            ref_scale_x = o.init_state.scale_x;
            history_point = Hive.History.saver(
                o.image_scale, o.image_scale_set, 'move crop');
        };
        o.resize = function(delta) {
            if(!drag_hold)
                return _resize(delta);
            delta = _div(delta)(Hive.env().scale);
            var dims = _add(ref_dims)(delta);
            dims[0] = Math.max(1, Math.min(dims[0],
                ref_scale_x*ref_dims[0]*(1 + o.init_state.offset[0])));
            dims[1] = Math.max(1, Math.min(dims[1],
                ref_scale_x*ref_dims[0]*(1 / o.aspect + o.init_state.offset[1])));
            var scaled = dims[0] / ref_dims[0];
            o.init_state.scale_x = ref_scale_x / scaled;
            o.div_aspect = dims[0] / dims[1];
            o.dims_relative_set(dims);
        };
        o.resize_end = function() {
            _resize_end();
            if(!drag_hold) return;
            history_point.save();
            o.long_hold_cancel();
        };

        o.image_scale = function() { return o.init_state.scale_x; };
        o.image_scale_set = function(scale) { o.init_state.scale_x = scale; };
        // screen coordinates
        o.offset = function() {
            if (!o.init_state.scale_x)
                return undefined;
            return _mul(o.init_state.scale_x * o.dims()[0])(o.init_state.offset);
        }
        o.offset_set = function(offset) {
            if (!offset) o.init_state.offset = undefined;
            else
                o.init_state.offset = _mul(1 / o.init_state.scale_x / o.dims()[0])(offset);
            o.layout();
        };


    })();

    var _layout = o.layout;
    o.layout = function() {
        _layout();
        var dims = o.dims(), scale_x = o.init_state.scale_x || 1;
        o.img.css('width', scale_x * dims[0] + 'px');
        var offset = o.offset();
        if (offset) {
            o.img.css({"margin-left": offset[0], "margin-top": offset[1]});
        }
    };

    o.pixel_size = function(){
        return [o.img.naturalWidth, o.img.naturalHeight]
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
    Hive.App.has_image_drop(o);
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

    Hive.App.has_image_drop(o);
    return o;
};
Hive.registerApp(Hive.App.Rectangle, 'hive.rectangle');


Hive.App.Path = function(o){
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
Hive.registerApp(Hive.App.Path, 'hive.path');


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
    var _layout = o.layout;
    o.layout = function() {
        _layout();
        o.div.css('font-size', (Hive.env().scale * o.scale()) + 'em');
        var height = o.div.find('.jp-interface').height();
        o.div.find('.jp-button').width(height).height(height);
    }

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
            var new_content = o.skin();
            o.content_element.replaceWith(new_content);
            o.content_element = new_content;
            // ideally jPlayer API would be used so the interface
            // isn't reset, but this doesn't work, tested 2013-10
            //o.content_element.jPlayer('setMedia', s.url);
        }
    };

    o.skin = function(){
        return $( $.jPlayer.skin.minimal(
            o.init_state.url, Hive.random_str() )
        )
            .addClass('content')
            .css('position', 'relative')
            .css('height', '100%')
            .appendTo(o.div);
    };

    // Mixins
    Hive.App.has_shield(o, {always: true});
    Hive.App.has_opacity(o);
    Hive.App.has_color(o);

    // Initialization
    if(! o.init_state.dimensions) o.init_state.dimensions = [ 200, 35 ];
    o.content_element = o.skin();

    colored = o.div.find('.jp-play-bar, .jp-interface');
    if(!o.init_state.color) o.init_state.color = colors[23];

    o.update_shield();
    setTimeout(function(){ o.load(); }, 100);
    return o;
};
Hive.registerApp(Hive.App.Audio, 'hive.audio');


Hive.Selection = function(){
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

    Hive.App.has_resize(o);

    // BEGIN-event-handlers

    o.is_multi = function(ev) { return ev.shiftKey || ev.ctrlKey; }

    // mousedown comes from body, click comes from app div. Binding clicks
    // from app div prevents deselecting everything else at the start of a
    // group drag operation
    o.click = o.mousedown = function(ev){
        var app = ev.data;
        if(app){
            if (Hive.shift_does_raise && ev.shiftKey) {
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

        var app = ev.data;
        if(app){
            o.move_handler(ev, dd);
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

    var old_states;
    var get_targets = function(){
        return (drag_target == o ? elements : [drag_target]); };
    var get_states = function(){
        return get_targets().map(function(a){ return a.state_relative(); }) };
    var change_start = function(){ old_states = get_states(); };
    var change_end = function(name){
        var apps = get_targets().slice(), new_states = get_states(),
            start_states = old_states.slice();
        Hive.History.save(
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
        delta_latched = delta_ave = [0, 0];
        move_speed = 1;
    };
    o.move_relative = function(delta, axis_lock){
        if(!ref_pos) return;
        if(axis_lock)
            delta[ Math.abs(delta[0]) > Math.abs(delta[1]) ? 1 : 0 ] = 0;
        var pos = _add(ref_pos)(delta), snap_strength = .05,
            snap_radius = 18;
        // TODO-feature-snap: check key shortcut to turn off snapping
        if(snap_strength > 0){
            var excludes = {};
            if(drag_target.id) excludes[drag_target.id] = true;
            pos = snap_helper(drag_target.bounds_tuple_relative(pos),
                excludes, snap_strength, snap_radius, sensitivity);
        }
        drag_target.pos_relative_set(pos);
        o.layout();
    };
    var delta_latched, move_speed, delta_ave, sensitivity;
    o.move_handler = function(ev, dd){
        var delta = [dd.deltaX, dd.deltaY];
        // Calculate sensitivity
        // TODO-feature-snap: check timestamp and bump sensitivity if longish
        // gap between user inputs.
        var move_dist = _sub(delta)(delta_latched);
        // Max is better than other distance metric because user will
        // commonly move in both axes accidentally.
        var speed = Math.max(Math.abs(move_dist[0]), Math.abs(move_dist[1]));
        speed = move_speed = _lerp(.1, move_speed, speed);
        // Experiment with using distance to "average position"
        // delta_ave = _lerp(.1, delta_ave, delta);
        // var move_dist = _sub(delta)(delta_ave);
        // var speed = Math.abs(move_dist[0]) + Math.abs(move_dist[1]);
        sensitivity = 1 / (speed - .98);
        // TODO: flags like this should live on the root app.
        if (Hive.show_move_sensitivity)
            drag_target.content_element.find("span")
                .text(Math.round(100*sensitivity)/100);

        delta_latched = delta.slice();
        delta = _div(delta)(Hive.env().scale);

        o.move_relative(delta, ev.shiftKey);
    };
    o.move_end = function(){
        change_end('move');
        $(".ruler").hidehide();
    };

    var ref_dims;
    o.resize_start = function(){
        $("#controls").hidehide();
        ref_dims = o.dims_relative();
        change_start();
    };
    o.resize = function(delta){
        o.resize_relative(_div(delta)(Hive.env().scale));
    };
    o.get_aspect = function() {
        var dims = o.dims();
        return dims[1] / dims[0];
    };
    o.resize_relative = function(delta){
        if(!ref_dims) return;

        var scale_by = Math.max( (ref_dims[0] + delta[0]) / ref_dims[0],
            (ref_dims[1] + delta[1]) / ref_dims[1] );
        var dims = _mul(scale_by)(ref_dims);

        o.each(function(i, a){
            a.pos_relative_set( _add(_mul(scale_by)(_positions[i]))(_pos) );
            a.dims_relative_set( _mul(scale_by)(_mul(ref_dims)(_scales[i])) );
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
            return _add(_mul(-1)(_pos))(a.pos_relative());
        });
        _scales = elements.map(function(a){
            return _div(a.dims_relative())(_dims);
        });
    };

    o.pos = function(){
        return _mul(Hive.env().scale)(_pos);
    };
    o.dims = function() {
        return _mul(Hive.env().scale)(_dims);
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
    o.cent_pos = function() { return _mul(.5)(_add(o.min_pos())(o.max_pos())); };
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
            a.pos_relative_set(_add(pos)(_positions[i]));
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
                Hive.History.group('copy group');
            }
        };
        Hive.History.begin();
        copies = $.map( elements, function(e){
            return e.copy({ offset: offset, load: load_counter, 'z_offset': elements.length })
        });
    }
    o.remove = function(){
        var sel = $.merge([], elements);
        o.unfocus();
        Hive.History.begin();
        $.each(sel, function(i, el){ el.remove() });
        Hive.History.group('delete group');
    };

    o.get_stack = function(){
        return elements.sort(function(a, b){ a.layer() - b.layer() });
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

    var parent = o;
    o.make_controls.push(function(o){
        o.pos = parent.pos;
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
            o.select( ev.shiftKey ? [] : Hive.Apps.all() );
            return false;
        }

        var handlers = {
            27: function(){ o.unfocus() },
            46: function(){ o.remove() },
            66: function(){ o.stack_bottom() },
            84: function(){ o.stack_top() },
        }
        if(handlers[ev.keyCode]){
            handlers[ev.keyCode]();
            return false;
        }

        // TODO: improve efficiency by using o.controls.pos_set like drag handler
        // or improving o.bounds
        if(o.controls) o.controls.pos_update();
    });
    Hive.App.has_nudge(o);

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
        if (! opts.position)
            a.center(opts.offset);
        a.dims_set(a.dims());
        Hive.Selection.select(a);
        if(load) load(a);
    };
    var app = Hive.App(s, opts);
    Hive.History.save(app._remove, app._unremove, 'create');
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

// Called on load() and save()
Hive.common_setup = function(){
    $('title').text("Editor - " + (Hive.Exp.title || "[Untitled]"));
};

Hive.init = function(exp, page){
    Hive.Exp = exp;
    Hive.edit_page = page;
    if(!exp.auth) exp.auth = 'public';
    Hive.env_set();

    //setInterval(Hive.set_draft, 5000);
    //try { Hive.set_draft(); }
    //catch(e) { return "If you leave this page any unsaved changes to your expression will be lost."; }
    //var draft = Hive.get_draft();
    //if(draft) Hive.Exp = draft;

    // TODO-refactor: separate background dialog, save dialog, and top level
    // menus into respective constructors

    var ua = navigator.userAgent;
    if ( !ua.match(/(Firefox|Chrome|Safari)/i) || ua.match(/OS 5(_\d)+ like Mac OS X/i)) {
        showDialog('#editor_browsers');
    }

    $(window).on('resize', Hive.layout_apps);

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
    

    hover_menu('#insert_text', '#menu_text');

    var image_menu = hover_menu('#insert_image', '#menu_image');
    var image_embed_menu = hover_menu('#image_from_url', '#image_embed_submenu', {
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

    hover_menu('#insert_audio', '#menu_audio');

    var embed_menu = hover_menu('#insert_embed', '#menu_embed', {
        open: function(){ $('#embed_code').get(0).focus() },
        layout_x: 'center' });
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

    $('#btn_grid').click(Hive.toggle_grid);

    $('#media_upload').on('with_files', function(ev, files){
        // media files are available immediately upon selection
        Hive.new_file(files);
    }).on('response', function(ev, files){
        // after file is uploaded, save meta data and id from server by
        // matching up file name
        var find_apps = function(name){
            // TODO-cleanup: background should be root app
            var apps = Hive.Apps.all().filter(function(a){
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
    });

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

    // var save_menu = hover_menu('#btn_save', '#dia_save',
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

    hover_menu($('#privacy' ), $('#menu_privacy')); //todo-delete, { group: save_menu } );
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

    evs.on(document, 'keydown');
    evs.on('body', 'mousemove');
    evs.on('body', 'mousedown');
    var drag_base = $('#grid_guide');
    evs.on(drag_base, 'draginit');
    evs.on(drag_base, 'dragstart');
    evs.on(drag_base, 'drag');
    evs.on(drag_base, 'dragend');
    Hive.edit_start();

    Hive.Apps.init(Hive.Exp.apps);
    Hive.History.init();
    Hive.common_setup();
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
} 

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
    Hive.Exp.apps = Hive.Apps.state();
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
    Hive.History.saver(
        function(){ return $.extend(true, {}, Hive.Exp.background) },
        Hive.bg_set, 'change background'
    ).exec(s);
};

function remove_all_apps() {
    var aps = $.map(Hive.Apps, id); // store a copy of Apps so we can destructively update it
    $.map(apps, function(a) { a.remove() });
}

Hive.append_color_picker = function(container, callback, init_color, opts){
    // opts = $.extend({iframe: false}, opts);
    var o = {}, init_color = init_color || '#000000',
        div = color_picker_template(colors),
        bar = div.find('.hue_bar'),
        shades = div.find('.shades'),
        manual_input = div.find('.color_input'),
        pickers = div.find('.color_select');

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
            o.set_color(c);
            manual_input.val(c);
            callback(c, to_rgb(c));
        }).on('mousedown', function(e){ e.preventDefault()});
    });

    var hex_changed = false;
    o.update_hex = function() {
        if (!hex_changed) return;
        hex_changed = false;
        var v = manual_input.val();
        var c = $('<div>').css('color', v).css('color');
        callback(c, to_rgb(c));
    };

    // saturated color picked from color bar
    var hsv = [0, 0, 1];
    var get_hue = function(e) {
        hsv[0] = bound(Math.floor(e.pageY - bar.offset().top) / bar.height(), 0, 1);
        shades.css('background-color', 'rgb(' + hsvToRgb(hsv[0], 1, 1).join(',') + ')');
        calc_color();
    };

    o.set_color = function(color){
        var rgb = to_rgb(color);
        hsv = rgbToHsv(rgb[0], rgb[1], rgb[2]);
        shades.css('background-color', 'rgb(' + hsvToRgb(hsv[0], 1, 1).join(',') + ')');
        manual_input.val(to_hex(color));
    };

    var get_shade = function(e) {
        hsv[2] = bound((e.pageX - shades.offset().left) / 120, 0, 1);
        hsv[1] = bound((e.pageY - shades.offset().top) / 120, 0, 1);
        calc_color();
    };

    var calc_color = function() {
        var color = hsvToRgb(hsv[0], hsv[1], hsv[2]);
        var hex = to_hex(color);
        manual_input.val(hex);
        callback(hex, color);
    }

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

    shades.click(get_shade).drag(get_shade);
    bar.click(get_hue).drag(get_hue);
    o.set_color(init_color);

    // Prevent unwanted nudging of app when moving cursor in manual_input
    manual_input.on('mousedown keydown', function(e){
        hex_changed = true;
        e.stopPropagation();
    });

    manual_input.blur(o.update_hex).keypress(function(e){
        if(e.keyCode == 13) {
            if (opts && opts.field_to_focus){
                opts.field_to_focus.focus();
            } else {
                manual_input.blur();
            }
        }
    });

    // if (opts.iframe){
    //     Hive.input_frame(manual_input, div, {width: 124});
    // }

    container.append(div);

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
    return Hive.Selection.elements()[n];
}

Hive.foc = function(n){ Hive.Selection.update([Hive.Apps[n]]) };

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
    rv = [];
    for (i=0; i< a.length; i++){
        rv[i] = a[i] + b[i]
    }
    return rv;
}

Hive.rect_test = function(w, h){
    if(!w) w = 20;
    if(!h) h = 20;
    js.range(w).map(function(x){
        js.range(h).map(function(y){
            Hive.App({
                position: [x*50, y*50],
                dimensions: [48, 48],
                type: 'hive.rectangle',
                content: {color:colors[(x+y)%36]}
            })
        })
    });
};

// Rejigger the selected elements into their "best"
// snapped positions (and sizes TBD)
Hive.im_feeling_lucky = function(){
    var apps = Hive.Selection.elements();
    Hive.Selection.unfocus();
    $.map([100, 60, 40, 30, 20, 10], function(j) {
        // Randomize a bit
        $.map(apps, function(app, i){
            var pos = app.pos_relative();
            var rnd = [Math.random()*j/10-j/20, Math.random()*j/10-j/20];
            pos = _add(rnd)(pos);
            app.pos_relative_set(pos);
        });
        $.map(apps, function(app, i){
            var pos = app.pos_relative();
            // var rnd = [Math.random()*6-3, Math.random()*6-3];
            // pos = _add(rnd)(pos);
            var snap_strength = 0.05, snap_radius = j;
            var excludes = {};
            if(app.id) excludes[app.id] = true;
            pos = snap_helper(app.bounds_tuple_relative(pos),
                excludes, snap_strength, snap_radius);
            app.pos_relative_set(pos);
            // app.resize
        });
    });
    Hive.Selection.update(apps);
};

return Hive;

});
