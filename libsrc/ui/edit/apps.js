define([
    'browser/jquery'
    ,'browser/js'
    ,'server/context'
    ,'browser/upload'
    ,'browser/layout'
    ,'browser/js'
    ,'ui/util'
    ,'ui/colors'
    ,'ui/codemirror/main'

    ,'./env'
    ,'./util'
    ,'./events'
    // ,'./app_modifiers'

    ,'js!google_closure.js'
], function(
    $
    ,js
    ,context
    ,upload
    ,layout
    ,js_util
    ,ui_util
    ,colors
    ,codemirror

    ,env
    ,u
    ,evs
    // ,app_has
){

var Hive = {}
    ,noop = function(){}
    ,Funcs = js.Funcs
    ,asset = ui_util.asset
    ,memo = {}
;

var memoize = function(key, value) {
    if (!memo[key]) memo[key] = value
    return memo[key];
}
Hive.appTypes = { };
Hive.registerApp = function(app, name) {
    app.tname = name;
    Hive.appTypes[name] = app;
}

env.new_app = Hive.new_app = function(s, opts) {
    if(!opts) opts = {};
    var load = opts.load;
    opts.load = function(a) {
        // Hive.upload_finish();
        if (!s.position && !opts.position) {
            a.center_weird(opts.offset);
            if (a.type.tname == "hive.image") {
                var pos = a.pos_relative()
                var not_it = env.Apps.all().filter(function(x) { return a.id != x.id; });
                a.pos_relative_set([
                    pos[0]
                    ,env.padding() + Math.max(pos[1], u.app_bounds(not_it).bottom)
                ])
            }
        }
        a.dims_set(a.dims());
        if (env.gifwall) {
            env.History.begin();
            env.History.save(a._remove, a._unremove, 'create');
            // move the app into the right place, and push other apps
            var not_it = env.Apps.all().filter(function(x) { return a.id != x.id; });
            var height = Math.max(0, u.app_bounds(not_it).bottom);
            if (opts.insert_at)
                height = opts.insert_at[1];
            a.pos_relative_set([0, height]);
            var aspect = a.get_aspect();
            Hive.App.has_full_bleed(a);
            a.dims_relative_set(a.dims_relative(), aspect);
            delta = a.dims_relative();
            delta[0] = 0;
            a.dims_relative_set([1000, 0]);
            a.resize_start();
            a.resize(delta);
            a.resize_end();
            $("body").scrollTop(a.pos()[1] + a.dims()[1] - 100);
            env.History.group("create");
        }

        if(!opts.no_select) env.Selection.select(a);
        if(load) load(a);
        env.layout_apps() // in case scrollbar visibility changed
    };
    var app = Hive.App(s, opts);
    if (!env.gifwall && app.add_to_collection)
        env.History.save(app._remove, app._unremove, 'create');
    return app;
};

// collection object for all App objects in page. An App is a widget
// that you can move, resize, and copy. Each App type has more specific
// editing functions.
env.Apps = Hive.Apps = (function(){
    var o = [];

    o.state = function() {
        return $.map(o.all(), function(app) { return app.state(); });
    };

    var defer_layout = false
    o.defer_layout = function() { return defer_layout }
    o.begin_layout = function() { 
        defer_layout = true
    }
    o.end_layout = function() { 
        defer_layout = false
        var apps = o.all()
        apps.push(env.Selection)
        // performance experiment: would the css update faster if not on 
        // the DOM? Turns out no.
        // var controls = $("#controls").remove()
        $.map(o.all(), function(app) { 
            if(app.needs_layout) {
                app.layout()
            }
        })
        // controls.appendTo("#controls_group")
    }

    var stack = []
    u.has_shuffle(stack);
    o.restack = function(include_deletes){
        var c_layer = 0
        for(var i = 0; i < stack.length; i++){
            if(!include_deletes && (!stack[i] || stack[i].deleted))
                continue
            stack[i].layer_set(c_layer)
            c_layer++
        }
    }
    o.stack = function(from, to){
        stack.move_element(from, to);
        o.restack(true);
    };
    o._stack = stack;
    
    o.add = function(app) {
        var i = o.length;
        o.push(app);

        if(typeof(app.layer()) != 'number') {
            app.layer_set(stack.length);
            stack.push(app);
        // if there's already an app at this layer, splice in the new app one layer above
        } else if( stack[app.layer()] ) {
            stack.splice(app.layer() + 1, 0, app);
            o.restack(true)
        } else // This case is on expression load
            stack[app.layer()] = app;
        return i;
    };
    o.copy = function(elements, opts) {
        elements =  elements.sort(function(a,b) {
            return a.layer() - b.layer()
        });
        opts.z_index = "top"; // NaN goes to top
        return $.map(elements, function(e){
            return e.copy(opts)
        });
    } 
    o.fetch = function(id){
        for(var i = 0; i < o.length; i++) if( o[i].id == id ) return o[i];
    };
    o.all = function(){ return $.grep(o, function(e){ return ! e.deleted; }); };
    o.filtered = function(filter) { return $.grep(o, filter); };
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

// Creates generic initial object for all App types.
Hive.App = function(init_state, opts) {
    var o = {};
    o.apps = Hive.Apps;
    if(!opts) opts = {};

    o.initialized = false;    
    o.init_state = { z: null };
    $.extend(o.init_state, init_state);
    o.type = Hive.appTypes[init_state.type];
    o.id = init_state.id || u.random_str();
    o.handler_type = 0;
    o.make_controls = [];

    o.css_state = {};
    o.content = function(content) { return $.extend({}, o.css_state); };
    o.set_css = function(props) {
        o.content_element.css(props);
        $.extend(o.css_state, props);
        if(o.controls) o.controls.layout();
    }
    o.css_getter = function(css_prop){ return function(){
        return o.css_state[css_prop] } }
    o.css_setter = function(css_prop, suffix) { 
        suffix = suffix || ""
        return function(v) {
            var ps = {}; ps[css_prop] = v + suffix; o.set_css(ps);
        }
    }
    o.css_setter_px = function(css_prop) { return o.css_setter(css_prop, 'px') }

    // Generic setters and getters
    o.gcolor = function(){ return o.css_state['background-color'] || 'transparent' };
    o.gcolor_set = o.css_setter('background-color');
    o.gstroke = function(){ return o.css_state['border-color'] || '#000' };
    o.gstroke_set = o.css_setter('border-color');
    o.gborder_width = function(){ return parseInt(o.css_state['border-width'] || 0) };
    o.gborder_width_set = function(v) {
        o.css_setter_px('border-width')(v);
        if (env.Selection.controls)
            fixup_controls(env.Selection.controls);
        o.layout();
    }
    function fixup_controls(o) {
        var has_border = false
        env.Selection.each(function(i, a) {
            has_border |= (a.border_width && a.border_width() > 0)
        })
        o.div.find('.buttons .button.stroke').showhide(has_border);
    };
    fixup_controls.display_order = 9;
    o.make_controls.push(memoize("fixup_controls", fixup_controls));

    var _client_data = function() {
        o.init_state.client_data = o.init_state.client_data || {};
        return o.init_state.client_data;
    }
    o.client_data = function(key) { return _client_data()[key]; }
    o.client_data_set = function(key, value) {
        _client_data()[key] = value;
        o.div.data(key, value);
    }

    // This app, or the selected app if this is the selection
    o.sel_app = function() {
        if (o.is_selection && o.count() == 1)
            return o.elements(0);
        return o;
    }

    // Chain "more_method" onto an existing "method" (or noop if method 
    // does not exist)
    // opts.order = ("before", "after", "user")
    o.USER = 0; o.BEFORE = 1; o.AFTER = 2;
    o.add_to = function(method, more_method, opts){
        opts = $.extend({ order: o.BEFORE }, opts);
        // Add functionality to methods, used by behavior and child constructors
        var old_method = o[method] || noop;
        o[method] = function(more_args){
            switch (opts.order) {
            case (o.BEFORE):
                return more_method(old_method(more_args));
            case (o.AFTER):
                return old_method(more_method(more_args));
            case (o.USER):
                return more_method(old_method);
            }
        };
    };
    o.add_after = function(method, more_method) 
        { return o.add_to(method, more_method, {order: o.AFTER}) };

    o._remove = function(){
        o.unfocus();
        env.Selection.unfocus(o);
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
        env.History.save(o._unremove, o._remove, 'delete');
    };

    var stack_to = function(i){ o.apps.stack(o.layer(), i); };
    o.stack_to = function(to){
        var from = o.layer();
        if(from == to) return;
        env.History.saver(o.layer, stack_to, 'change layer').exec(to);
    };
    o.stack_down = function(ignore){

    }
    o.stack_up = function(ignore){
    }
    o.stack_bottom = function(){
        o.stack_to(0) };
    o.stack_top = function(){
        o.stack_to(o.apps.length -1) };
    
    var focused = false;
    o.focused = function() { return focused };
    o.focus = Funcs(function() {
        if(focused) return;
        focused = true;
        evs.handler_set(o);
    }, function(){ return !o.focused()} );
    o.unfocus = Funcs(function() {
        if(!focused) return;
        focused = false;
        evs.handler_del(o);
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

    o.get_aspect = function() { return false; };
    o.has_full_bleed = function() { return false; };
    o.angle = function(){ return 0; };
    o.pos = function(){
        var s = env.scale();
        return [ _pos[0] * s, _pos[1] * s ];
    };
    o.pos_set = function(pos){
        var s = env.scale();
        o.pos_relative_set( [ pos[0] / s, pos[1] / s ] );
    };
    o.dims = function() {
        var s = env.scale();
        return [ _dims[0] * s, _dims[1] * s ];
    };
    o.dims_set = function(dims){
        var s = env.scale();
        o.dims_relative_set( [ dims[0] / s, dims[1] / s ] );
    };
    o.width = function(){ return o.dims()[0] };
    o.height = function(){ return o.dims()[1] };
    o.pos_center = function() {
        var dims = o.dims();
        var pos = o.pos();
        return [ pos[0] + dims[0] / 2, pos[1] + dims[1] / 2 ];
    };

    var full;
    o.full = function(){ return full }
    o.full_set = function(v){
        full = Boolean(v)
        o.div.addremoveClass('full', full)
    }

    var hidden_controls = false;
    o.hide_controls = function(){
        if(!o.controls) return
        hidden_controls = o.controls
        o.controls.fixed_div.hidehide()
        o.controls = false
    }
    o.show_controls = function(){
        if(!hidden_controls) return
        if(o.controls){
            // discard the controls that were replaced while hidden
            hidden_controls.remove()
            return
        }
        o.controls = hidden_controls
        hidden_controls = false
        o.controls.fixed_div.showshow()
        o.controls.layout()
    }

    o.layout = function(pos, dims){
        if (Hive.Apps.defer_layout()) {
            o.needs_layout = true;
            return true;
        }
        var pos = pos || o.pos(), dims = dims || o.dims();
        u.inline_style(o.div[0], { 'left' : pos[0], 'top' : pos[1] 
            // rounding fixes SVG layout bug in Chrome
            ,width: Math.round(dims[0]), height: Math.round(dims[1])});
        if(o.controls)
            o.controls.layout();
        // If this app == selection, update selection. 
        if(env.Selection && u.array_equals(env.Selection.elements(), [o])) {
            env.Selection.update_relative_coords();
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
    o.bounds_relative_set = function(pos, dims) {
        _pos = pos.slice();
        _dims = dims.slice();
        o.layout();
    }
    o.pos_center_relative = function(){
        var dims = o.dims_relative();
        var pos = o.pos_relative();
        return [ pos[0] + dims[0] / 2, pos[1] + dims[1] / 2 ];
    };
    // TODO: make these two reflect axis aligned bounding box (when rotated, etc)
    var _min_pos = function(){ return o.pos_relative(); };
    var _max_pos = function(){ return u._add(o.pos_relative())(o.dims_relative()) };
    o.pts = function() {
        var _min = _min_pos(), _max = _max_pos(), r = o.angle()
            ,_cen = u._mul(.5)(u._add(_min)(_max))
            ,mtx = [_min, _max], corners = [];
        for (var x = 0; x < 2; ++x) {
            for (var y = 0; y < 2; ++y) {
                var pt = [mtx[x][0], mtx[y][1]]
                if (!r)
                    corners.push(pt)
                else
                    corners.push(u.rotate_about(pt, _cen, u.deg2rad(r)));
            }
        }
        return corners;
    }
    o.max_pos = function() {
        var c = o.pts();
        return [Math.max.apply(null, u.nth(c, 0)),
                Math.max.apply(null, u.nth(c, 1))];
    }
    o.min_pos = function() {
        var c = o.pts();
        return [Math.min.apply(null, u.nth(c, 0)), 
                Math.min.apply(null, u.nth(c, 1))];
    }
    o.cent_pos = function() { return u._mul(.5)(u._add(o.min_pos())(o.max_pos())); };
    // return [[x-min, x-center, x-max], [y-min, y-center, y-max]]
    // if o were moved to pos
    o.bounds_tuple_relative = function(pos) {
        var curr_ = [o.min_pos(), o.cent_pos(), o.max_pos()]
            ,del = u._sub(o.min_pos())(o.pos_relative());
        // curr_ = curr_.map(function(x) { return u._sub(x)(del) });
        var curr = [[],[]];
        $.map(curr_, function(pair) {
            curr[0] = curr[0].concat(pair[0] + pos[0] - _pos[0]);
            curr[1] = curr[1].concat(pair[1] + pos[1] - _pos[1]);
        });
        return [curr[0].slice(), curr[1].slice()];
    }

    o.centroid = function() {
        return u._mul(env.scale())(o.centroid_relative()) }
    o.centroid_relative = function(){
        var ps = o.pts()
            ,sum = ps.reduce(function(p1, p2){ return u._add(p1)(p2) })
        return u._div(sum)(ps.length)
    }

    // END-coords

    o.center_weird = function(offset) {
        var win = $(window),
            pos = [ ( win.width() - o.width() ) / 2 + win.scrollLeft(),
                ( win.height() - o.height() ) / 2 + win.scrollTop() ];
        if(typeof(offset) != "undefined"){ pos = u._add(pos)(offset) };
        o.pos_set(pos);
    };

    o.center_relative_set = function(center){
        o.pos_relative_set(u._sub(center)(u._div(o.dims_relative())(2))) }

    o.copy = function(opts){
        if(!opts) opts = {};
        if(!opts.offset) opts.offset = [ 0, o.dims()[1] + 20 ];
        var app_state = $.extend({}, true, o.state());
        delete app_state.id;
        if(opts.z_offset) app_state.z += opts.z_offset;
        var cp = Hive.App(app_state, opts);
        env.History.save(cp._remove, cp._unremove, 'copy');
        return cp;
    };

    // opts.doit: true to move and resize the object
    // opts.pos, opts.dims: the pos/dims of the object you are fitting to
    // opts.scaled: (optional): dimensions of intrinsic, clipped object
    o.fit_to = function(opts){
        if (opts.doit == undefined) opts.doit = true;
        var dims = opts.dims.slice(), pos = opts.pos.slice();
        var scaled = (opts.scaled) ? opts.scaled.slice() : o.dims();
        var aspect = scaled[1] / scaled[0];
        var into_aspect = dims[1] / dims[0];
        var fit_coord = (aspect < into_aspect) ? 0 : 1;
        if (opts.zoom || opts.fit == 2)
            fit_coord = 1 - fit_coord;
        scaled = u._mul(dims[fit_coord] / scaled[fit_coord])(scaled);
        pos[1 - fit_coord] += 
            (dims[1 - fit_coord] - scaled[1 - fit_coord]) / 2;

        if (opts.doit) {
            o.pos_relative_set(pos);
            o.dims_relative_set(scaled);
        }
        return { pos: pos, dims: scaled };
    };
    o.highlight = function(opts) {
        opts = opts || {};
        opts = $.extend({on: true}, opts);

        var $highlight = o.div.find(".highlight");
        if (0 == $highlight.length) {
            if (env.gifwall)
                $highlight = $("<div class='highlight_box hide'\
                    ><div class='highlight'></div></div>")
            else
                $highlight = $("<div class='highlight hide'></div>")
            $highlight.appendTo(o.content_element || o.div)
        }
        $highlight.showhide(opts.on);
    }
    // TODO-cleanup-history: use state instead
    o.state_relative = function(){ return {
        position: _pos.slice(),
        dimensions: _dims.slice()
    }};
    o.state_relative_set = function(s){
        if(s.position)
            _pos = s.position.slice();
        if(s.dimensions)
            _dims = s.dimensions.slice();
        o.layout();
    };

    o.state = function(){
        var s = $.extend(true, {}, o.init_state, o.state_relative(), {
            z: o.layer(),
            full_bleed_coord: o.full_coord,
            id: o.id
        });
        if(o.content) s.content = o.content()
        if(Object.keys(o.css_state).length)
            s.css_state = $.extend({}, o.css_state);
        return $.extend({}, s);
    };
    o.state_update = function(s){
        $.extend(o.init_state, s);
        o.state_relative_set(s);
    };

    o.history_helper_relative = function(name){
        var o2 = { name: name };
        o2.old_state = o.state_relative();
        o2.save = function(){
            o2.new_state = o.state_relative();
            env.History.save(
                function(){ o.state_relative_set(o2.old_state) },
                function(){ o.state_relative_set(o2.new_state) },
                o2.name
            );
        };
        return o2;
    };

    o.css_class = function(){
        return o.init_state.css_class }
    o.css_class_set = function(s){
        o.div.removeClass(o.css_class()).addClass(s)
        o.init_state.css_class = s
    }

    o.load = Funcs(function() {
        if( ! o.init_state.position ) o.init_state.position = [ 100, 100 ];
        if( ! o.init_state.dimensions ) o.init_state.dimensions = [ 300, 200 ];
        if( opts.offset )
            o.init_state.position = u._add(o.init_state.position)(opts.offset);
        o.state_relative_set(o.init_state);
        if (o.init_state.full_bleed_coord != undefined)
            Hive.App.has_full_bleed(o, o.init_state.full_coord);
        if(opts.load) opts.load(o);
    });

    // initialize

    o.div = $('<div class="happ drag">').appendTo(env.apps_e).attr('id', o.id);
    if (o.init_state.client_data) 
        o.div.data(o.init_state.client_data)
    o.css_class_set(o.css_class())

    o.has_align = o.add_to_collection = o.client_visible = true;
    o.type(o); // add type-specific properties
    o.div.addClass(o.type.tname.replace(".", "_"))
    if (o.content_element && o.init_state.css_state)
        o.set_css(o.init_state.css_state);
    if (o.has_align)
        Hive.App.has_align(o);
    if (o.add_to_collection)
        o.apps.add(o); // add to apps collection
    o.make_controls = o.make_controls.concat(active_controls)
    // TODO-cleanup-events: attach app object to these events on app div without
    // creating duplicate event handlers, allowing for easier overriding
    evs.on(o.div, 'dragstart', o, {bubble_mousedown: true, handle: '.drag'})
        .on(o.div, 'drag', o, {handle: '.drag'})
        .on(o.div, 'dragend', o)
        .on(o.div, 'mousedown', o)
        .on(o.div, 'mouseup', o)
        .long_hold(o.div, o);
    o.initialized = true;
    return o;
};
Hive.registerApp(Hive.App, 'hive.app');

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


// This App shows an arbitrary single HTML tag.
Hive.App.Html = function(o) {
    Hive.App.has_resize(o);
    o.content = function() { return o.content_element[0].outerHTML; };

    var content = o.init_state.content;
    // TODO: turn off autoplay when editing.
    // m = content.match(/(.*youtube.*)&amp;autoplay=1(.*)/);
    // if (m)
    //     content = m[1] + m[2];
    o.content_element = $(content).addClass('content');
    o.div.append(o.content_element);
    if(    o.content_element.is('object')
        || o.content_element.is('embed')
        || o.content_element.is('iframe'))
    {
        Hive.App.has_shield(o, {always: true});
        o.set_shield = function(){ return true; }
        o.shield();
    }

    Hive.App.has_opacity(o)
    // TODO: migrate this and use init_state.media
    m = content.match(/(youtube)|(vimeo)/);
    if (m) {
        o.make_controls.push(memoize("full_screen_control", function(o) {
            o.addButton($('#controls_image .set_bg'));
            o.div.find('.button.set_bg').click(function() {
                Hive.bg_change(o.single().state()) });
        }))
        o.make_controls[o.make_controls.length - 1].single = true;
    }

    setTimeout(function(){ o.load(); }, 100);

    return o;
};
Hive.registerApp(Hive.App.Html, 'hive.html');

// Deprecated
// Hive.App.RawHtml = function(o) {
//     Hive.App.has_resize(o);
//     o.content = function() { return o.content_element[0].outerHTML; };
//     o.get_content = function() { o.content_element; }
//     o.set_content = function(new_content) { o.content_element.html(new_content); }
//     o.content_element = $(o.init_state.content).addClass('content');
//     o.div.append(o.content_element);

//     var controls = function(o){
//         o.addButtons($('#controls_raw_html'));
//         o.div.find('.edit').click(function(){
//             var dia = $($('#dia_edit_code')[0].outerHTML);
//             u.show_dialog(dia, {
//                 fade: false,
//                 close: function() {
//                     var new_content = dia.find('textarea').val();
//                     o.app.set_content(new_content);
//                 },
//                 open: function() {
//                     dia.find('textarea').val(o.app.get_content().html());
//                 }
//             });
//         });
//         //var inner = o.app.content_element.children();
//         //var width = inner.width();
//         //if (width < 100) width = 40;
//         //var height = inner.height();
//         //if (height < 100) height = 40;
//         //o.app.dims_set([width, height]);

//         return o;
//     };
//     o.make_controls.push(controls);

//     setTimeout(function(){ o.load(); }, 100);

//     return o;
// };
// Hive.registerApp(Hive.App.RawHtml, 'hive.raw_html');

// TODO-refactor: We need to decide on an object model for developers
editor = {};
active_controls = [];
editor.add_slider = function(name, opts) {
    opts = $.extend(opts, {handle_name: name})
    var apps = env.Apps.filtered(function(a) { return a.client_visible; })
    for (var i = 0; i < apps.length; ++i) {
        var slider =
            Hive.App.has_slider_menu(apps[i], "", function(v) {
                return env.Selection.client_data_set(name, v)
            }, function() {
                return env.Selection.client_data(name)
            }, null, null, opts)
        if (i == 0) {
            editor.current_code.created_controls.push(slider);
            active_controls.push(slider);
        }
    }
}
editor.add_button = function(name, on_run, opts) {
    var apps = env.Apps.filtered(function(a) { return a.client_visible; })
    var handle_name = name
    var controls = function(o) {
        var handle = find_or_create_button(o, null, handle_name);
        handle.on("click", function(ev) {
            env.History.begin();
            on_run(ev);
            env.History.group(name);
        })
    }
    controls.display_order = 6
    // controls = memoize("userbutton_"+name, controls)
    for (var i = 0; i < apps.length; ++i) {
        apps[i].make_controls.push(controls)
        if (i == 0) {
            editor.current_code.created_controls.push(controls);
            active_controls.push(controls);
        }
    }
}

Hive.App.Code = function(o){
    o.has_align = false
    o.client_visible = false
    Hive.App.has_resize(o)
    o.created_controls = []

    o.content = function(){ return o.editor.getValue() }
    var _load = o.load
    o.run_module_func = function(module_func, callback) {
        var curl_func = function() {
            editor.current_code = o;
            try {
                curl([o.module_name()], function(module) {
                    module[module_func] && module[module_func]();
                    callback && callback(module);
                    editor.current_code = null;
                }, function() {})
            } catch (err) {}
        }
        if (!iter) {
            insert_code()
            // setTimeout(curl_func, 400);
        }
        // else 
            curl_func();
    }
    o.load = function() {
        if (_load) _load()
        o.run_module_func("editor")
    }

    var iter = 0;
    o.module_name = function() { return "module_" + o.id + "_" + iter; }
    var module_code = function() {
        // return o.content();
        return "define('" + o.module_name() + "', " +
            "['browser/jquery'], function($) { var self = {}; " + 
            o.content() + 
            "; return self; })";
    }
    var insert_code = function(callback){
        o.code_element.remove();
        ++iter;
        // o.code_element.on('load')
        // jquery insert doesn't allow debugging, so we use straight js
        o.code_element.html(module_code()).appendTo('body')
        // var script   = document.createElement("script");
        // script.type  = "text/javascript";
        // script.text  = module_code();
        // document.body.appendChild(script);
        // o.code_element = $(script);
    }
    // var try_code_call = function(func_name){
    var animate_go
    o.run = function() {
        o.stop();
        insert_code()
        
        o.run_module_func("run", function(module) {
            if(!module.animate) return
            var animate_frame = function(){
                module.animate()
                // TODO-compat: if requestAnimationFrame not supported,
                // fallback to setTimeout
                if(animate_go) requestAnimationFrame(animate_frame)
            }
            animate_go = 1
            animate_frame()
        })
    }
    o.stop = function() {
        // insert_code();
        if (!iter) return;
        o.run_module_func("stop", function() {
            animate_go = 0
        })
    }
    o.edit = function() {
        if (o.created_controls.length == 0) {
            o.run_module_func("edit", function() { fixup_controls() })
        } else {
            var apps = env.Apps.filtered(function(a) { return a.client_visible; })
            // remove the associated edit controls from their apps
            while (o.created_controls.length) {
                var control = o.created_controls.pop();
                js_util.array_delete(active_controls, control);
                for (var i = 0; i < apps.length; ++i) {
                    var app = apps[i];
                    js_util.array_delete(app.make_controls, control);
                }
            }
            fixup_controls();
        }
    }

    function controls(o) {
        var sel = env.Selection
        find_or_create_button(o, '.run').click(sel.run)
        find_or_create_button(o, '.stop').click(sel.stop)
        find_or_create_button(o, '.edit').click(sel.edit)
        // o.hover_menu(o.div.find('.button.opts'), o.div.find('.drawer.opts'))
        // var showinview = o.div.find('.show_in_view')
        // showinview.prop('checked', o.app.init_state.show_in_view).on(
        //     'change', function(){
        //         o.app.init_state.show_in_view = showinview.prop('checked') })
    }
    controls.single_type = true
    o.make_controls.push(memoize('code_buttons', controls))
    Hive.App.has_shield(o)

    var fixup_controls = function(controls) {
        controls = controls || env.Selection.controls;
        if (!controls) return
        // set the toggle state of the edit button
        if (o.created_controls.length > 0) {
            controls.div.find(".button.edit")
                .css({"background-color":"black", "color": "white"
                    ,"background-size":0})
        } else {
            controls.div.find(".button.edit")
                .css({"background-color":"transparent", "color": "black"
                    ,"background-size":""})
        }        
    }
    fixup_controls.display_order = 9
    o.make_controls.push(fixup_controls)

    o.focus.add(function(){
        o.editor.focus()
        o.div.removeClass('drag').css('opacity', .8)
    })
    o.unfocus.add(function(){
         o.div.addClass('drag').css('opacity', .2)
         o.editor.getInputField().blur()
    })

    var _remove = o.remove
    o.remove = function(){
        o.stop()
        _remove()
    }

    keymap = {
        'Ctrl-/': function(cm){ cm.execCommand('toggleComment') }
    }

    if(!o.init_state.code_type)
        o.init_state.code_type = 'js'
    if(o.init_state.code_type == 'js')
        o.code_element = $('<script>')
    if(o.init_state.code_type == 'css')
        o.code_element = $('<style>')

    // o.content_element = $('<textarea>').addClass('content code drag').appendTo(o.div);
    var mode = o.init_state.code_type
    if(mode == 'js') mode = 'javascript'
    o.editor = CodeMirror(o.div[0], { extraKeys: keymap ,mode: mode })
    o.editor.setValue(o.init_state.content || '')
    o.content_element = $(o.editor.getWrapperElement()).addClass('content code')
    // TODO-cleanup: Move to CSS
    o.div.css('background-color','white').css('opacity',.2);

    o.load()

    return o;
}
Hive.registerApp(Hive.App.Code, 'hive.code')

Hive.App.Image = function(o) {
    o.is_image = true;
    // o.fixed_aspect = true;
    o.has_crop = false;
    Hive.App.has_resize(o);
    // TODO-cleanup: aspects should be y/x
    o.get_aspect = function() {
        if (o.init_state.scale_x)
            return o.dims_relative()[0] / o.dims_relative()[1];
        return o.aspect;
    };
    o.content = function(content) {
        if(typeof(content) != 'undefined') o.url_set(content);
        return o.init_state.url;
    }

    o.link_set = function(v){ 
        o.init_state.href = v;
    };
    o.link = function(v) {
        return o.init_state.href;
    };
    // Hive.App.has_color(o)
    var _state_update = o.state_update, _state_relative = o.state_relative
        ,_state_relative_set = o.state_relative_set
    o.state_relative = function() {
        s = _state_relative()
        if (o.init_state.scale_x) s.scale_x = o.init_state.scale_x
        if (o.init_state.offset) s.offset = o.init_state.offset.slice()
        return s
    }
    o.state_relative_set = function(s) {
        if (s.scale_x) o.init_state.scale_x = s.scale_x
        if (s.offset) o.init_state.offset = s.offset.slice()
        _state_relative_set(s)
    }
    o.state_update = function(s){
        // TODO-cleanup: migrate to use only url for consistency with other apps
        s.content = s.url = (s.url || s.content);
        _state_update(s);
    };

    o.url_set = function(src) {
        if(o.img) o.img.remove();
        o.img = $("<img class='content'>").attr('src', src);
        // o.content_element = o.img;
        o.content_element = o.content_element || $("<div>").appendTo(o.div);
        o.content_element.append(o.img).addClass('crop_box');
        // o.div.append(o.img);
        o.img.load(function(){setTimeout(o.img_load, 1)});
        // We recreated the content_element, so reapply its handlers.
        Hive.App.has_image_drop(o);
    };
    o.img_load = function(){
        var imageSize = o.pixel_size();
        var imageWidth = imageSize[0], imageHeight = imageSize[1];
        o.aspect = imageWidth / imageHeight;
        if( ! o.init_state.dimensions ){
            var ww = $(window).width(), wh = $(window).height(), iw, ih, wa = ww / wh;
            if( (imageWidth > ww * .8) || (imageHeight > wh * .8) ){
                if( wa < imageWidth / imageHeight ){
                    iw = 800;
                    ih = iw / o.aspect;
                } else {
                    ih = 800 / wa;
                    iw = ih * o.aspect;
                }
            } else {
                iw = imageWidth / env.scale();
                ih = iw / o.aspect;
            }
            o.init_state.dimensions = [ iw, ih ];
        }
        o.img.css('width', o.dims()[0] + 'px');
        // fit and crop as needed
        if (o.init_state.fit) {
            var opts = { dims:o.dims_relative(), pos:o.pos_relative(), fit:o.init_state.fit, 
                doit: (o.init_state.fit != 2), // Cropping needed, wait on execution
                scaled: [imageWidth, imageHeight] };
            var new_layout = o.fit_to(opts);
            if (opts.fit == 2) {
                o.init_state.scale_x = new_layout.dims[0] / opts.dims[0];
                o.init_state.offset = u._sub(new_layout.pos, opts.pos);
                o.init_state.offset = u._mul( 1 / opts.dims[0] /
                    o.init_state.scale_x)(o.init_state.offset);
            }
            o.init_state.fit = undefined;
        }
        o.allow_crop(true);
        o.load();
    };

    // TODO-cleanup: move to has_crop
    (function(){
        var drag_hold, fake_img, ref_offset, ref_dims, ref_scale_x, crop_bg

        o.recenter = function() {
            var dims = o.dims_relative(), nat_height = dims[0] / o.aspect;
            o.init_state.offset[0] = 0
            o.init_state.offset[1] = 
                (dims[1] - nat_height) / 2 / dims[0] / o.init_state.scale_x;
            o.layout()
        }
        // UI for setting .offset of apps on drag after long_hold
        o.long_hold = function(ev){
            if(o != ev.data) return;
            if( o.has_full_bleed() && ($(ev.target).hasClass("resize")
                || $(ev.target).hasClass("resize_v")) ) return;
            if(!o.init_state.scale_x) 
                if (!o.allow_crop()) return false;
            // TODO: should we only hide controls if selected?
            $("#controls").showhide(false);
            // env.Selection.hide_controls();
            ev.stopPropagation();
            drag_hold = true;

            // show new img w/ opacity
            crop_bg = $('<div>').css('background-color', 'black')
                .appendTo(o.div)
            fake_img = o.img.clone().appendTo(o.div).css({ 'opacity': .5
                , 'z-index': 0 })
            o.img = o.img.add(fake_img).add(crop_bg);
            o.layout()
            return false;
        };
        o.long_hold_cancel = function(ev){
            if(!drag_hold) return;
            $("#controls").showhide(true);
            // env.Selection.show_controls();
            if (ev)
                ev.stopPropagation();
            drag_hold = false;
            o.img = o.img.not(fake_img).not(crop_bg);
            fake_img.remove();
            crop_bg.remove()
        };

        o.dragstart = function(ev){
            if (!drag_hold) return;
            ev.stopPropagation();
            ref_offset = o.offset();
            // This code "fixes" one of the coordinates so it won't be modifyable
            // o.fixed_coord = (ref_offset[0] == 0) ? 0 : ((ref_offset[1] == 0) ? 1 : -1);
            history_point = env.History.saver(o.offset, o.offset_set, 'move crop');
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
            delta = u._add(delta)(ref_offset);
            var dims = o.dims();
            // constrain the crop to within the bounds of app
            var tuple = [];
            tuple[0] = [dims[0]*(1 - o.init_state.scale_x), 0, 0];
            tuple[1] = [dims[1] - dims[0] / o.aspect * o.init_state.scale_x, 0, 0];
            for (var j = 0; j < 2; ++j) {
                if (tuple[j][0] > tuple[j][2]) { // ensure the tuple is sorted
                    var tmp = tuple[j][0];
                    tuple[j][0] = tuple[j][2];
                    tuple[j][2] = tmp;
                }
                tuple[j][1] = undefined
                // If we want to have center snapping:
                tuple[j][1] = .5 * (tuple[j][0] + tuple[j][2]);
                delta[j] = u.interval_constrain(delta[j], tuple[j]);
            }
            // snap to edge/center
            if (context.flags.snap_crop) {
                var my_tuple = [ [ delta[0] ], [ delta[1] ] ];
                delta = u.snap_helper(my_tuple, { tuple: [ [tuple[0]], [tuple[1]] ] });
            }
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
            if (!drag_hold) 
                return _resize_start();
            ref_dims = o.dims_relative();
            ref_scale_x = o.init_state.scale_x;
            history_point = env.History.saver(
                o.state, o.state_update, 'move crop');
        };
        o.resize = function(delta) {
            if(!drag_hold)
                return _resize(delta);
            delta = u._div(delta)(env.scale());
            var dims = u._add(ref_dims)(delta);
            dims[0] = Math.max(1, Math.min(dims[0],
                ref_scale_x*ref_dims[0]*(1 + o.init_state.offset[0])));
            dims[1] = Math.max(1, Math.min(dims[1],
                ref_scale_x*ref_dims[0]*(1 / o.aspect + o.init_state.offset[1])));
            var scaled = dims[0] / ref_dims[0];
            o.init_state.scale_x = ref_scale_x / scaled;
            o.div_aspect = dims[0] / dims[1];
            o.dims_relative_set(dims);
        };
        o.resize_end = function(skip_history) {
            if(!drag_hold) 
                return _resize_end(skip_history);
            history_point.save();
            o.long_hold_cancel();
        };

        // screen coordinates
        o.offset = function() {
            if (!o.init_state.scale_x)
                return undefined;
            return u._mul(o.init_state.scale_x * o.dims()[0])(o.init_state.offset);
        }
        o.offset_set = function(offset) {
            if (!offset) o.init_state.offset = undefined;
            else
                o.init_state.offset = u._mul(1 / o.init_state.scale_x / o.dims()[0])(offset);
            o.layout();
        };

        // TODO-cleanup: move to has_crop
        o.allow_crop = function(force) {
            if (!force && !context.flags.rect_drag_drop)
                return false;

            o.init_state.scale_x = o.init_state.scale_x || 1;
            o.init_state.offset = o.init_state.offset || [0, 0];
            // o.is_cropped = true;
            // var happ = o.content_element.parent();
            // o.content_element = $('<div class="crop_box">');
            // o.img.appendTo(o.content_element);
            // o.content_element.appendTo(happ);
            o.div_aspect = o.dims()[0] / o.dims()[1];
            o.layout();
            return true;
        };

        o.make_controls.push(function(sel){
            evs.long_hold(sel.div.find('.resize'), sel.single());
        })
        o.make_controls[o.make_controls.length - 1].single = true;
    })();

    var _layout = o.layout;
    o.max_height = function(){
        off = o.offset() || [0,0];
        off = off[1] / env.scale();
        return o.dims_relative()[0] / o.aspect + off;
    }
    o.layout = function() {
        if (_layout()) return true;
        var dims = o.dims(), scale_x = o.init_state.scale_x || 1,
            scale_y = scale_x / o.aspect;
        o.img.css({ 'width': scale_x * dims[0], 'height': scale_y * dims[0] })
        var offset = o.offset();
        if (offset) {
            o.img.css({"margin-left": offset[0], "margin-top": offset[1]});
            var border_width = o.border_width()
            o.div.find(".crop_box img").css(
                {"margin-left": offset[0] - border_width
                ,"margin-top": offset[1] - border_width})
        }
    };

    o.pixel_size = function(){
        return [o.img.prop('naturalWidth'), o.img.prop('naturalHeight')];
    };

    function controls(o) {
        o.addButtons($('#controls_image'));
        o.append_link_picker(o.div.find('.buttons'));
        o.div.find('.button.set_bg').click(function() {
            Hive.bg_change(o.single().state()) });
    };
    controls.single = true;
    o.make_controls.push(controls);

    Hive.App.has_rotate(o);
    Hive.App.has_opacity(o);
    Hive.App.has_border_radius(o);

    o.img = $();
    Hive.App.has_border_width(o);
    Hive.App.has_color(o, "stroke");
    o.state_update(o.init_state);
    o.url_set(o.init_state.url);
    Hive.App.has_image_drop(o);

    return o;
}
Hive.registerApp(Hive.App.Image, 'hive.image');


Hive.App.Rectangle = function(o) {
    Hive.App.has_resize(o);
    var Parent = $.extend({}, o);
    o.init_state.css_state = $.extend(o.init_state.content, o.init_state.css_state);

    Hive.App.has_rotate(o);
    Hive.App.has_color(o);
    o.make_controls[o.make_controls.length - 1].display_order = 1
    Hive.App.has_border_radius(o);
    Hive.App.has_opacity(o);
    Hive.App.has_border_width(o);
    Hive.App.has_color(o, "stroke");

    o.content_element = o.div //$("<div class='content drag'>").appendTo(o.div);
    setTimeout(function(){ o.load() }, 1);

    Hive.App.has_image_drop(o);
    return o;
};
Hive.registerApp(Hive.App.Rectangle, 'hive.rectangle');

Hive.App.has_ctrl_points = function(o){
    // TODO-feature-polish-control-points: make control points actual objects
    // that can be focused and handle events, like nudge, delete, etc

    var app = o;
    o.make_controls.push(function(o){
        var p_els = []

        var _layout = o.layout
        o.layout = function(){
            if (_layout()) return true;

            js.range(app.points_len()).map(function(i){
                var p = u._mul(app.point(i))(env.scale())
                p_els[i].css({left: p[0], top: p[1] })
            })
        }

        js.range(app.points_len()).map(function(i){
            p_els[i] = $('<div>')
                .addClass('control point')
                .appendTo(o.fixed_div)
                .on('dragstart', function(ev){
                    env.History.change_start();
                    app.transform_start(i)
                    env.Selection.hide_controls()
                    ev.stopPropagation()
                })
                .on('drag', function(ev, dd){
                    delta = u._div([dd.deltaX, dd.deltaY])(env.scale())
                    app.point_move(i, delta)
                })
                .on('dragend', function(ev){
                    env.Selection.show_controls()
                    ev.stopPropagation()
                    env.History.change_end("Adjust shape");
                })
        })
    })
    o.make_controls[o.make_controls.length - 1].single = true;
}

Hive.App.Polygon = function(o){
    Hive.App.has_resize(o);
    Hive.App.has_ctrl_points(o)
    var common = $.extend({}, o), poly_el, blur_el

    var style = {}, state = o.init_state
    style['stroke-width'] = 1
    style['stroke'] = '#000'
    style['stroke-linejoin'] = 'round'
    style['fill'] = '#000'
    js.setdefault(state, {points: [], style: {}})
    js.setdefault(state.style, style)
    var points = state.points

    o.get_aspect = function() { 
        var dims = o.dims_relative(); 
        return dims[0]/dims[1]
    }
    o.points = function(){ return points.slice() }
    o.points_len = function(){ return points.length }
    o.point_insert = function(index){
        var svg_point = o.content_element[0].createSVGPoint()
            ,p = points[index-1]
        svg_point.x = p[0]
        svg_point.y = p[1]
        poly_el[0].points.insertItemBefore(svg_point, index)
        points.splice(index, 0, p)
        o.reframe(true)
    }
    o.point_remove = function(index){
        poly_el[0].points.removeItem(index)
        points.splice(index, 1)
        ref_points.splice(index, 1)
        o.reframe(true)
    }
    o.pts = function(){
        var pos = o.pos_relative()
        return points.map(u._add(pos))
    }

    // o.center = function(){
    //     return u._div(points.reduce(function(a, b){ return u._add(a)(b) })
    //         )(points.length)
    // }
    o.size_update = function(new_dims){
        o.content_element[0].setAttribute('viewBox',
            [0, 0, new_dims[0], new_dims[1]].join(' '))
    }

    o.point_offset = function(){
        var off = state.style['stroke-width'] / 2 + o.blur() * 1.5
        return [off, off]
    }
    var _min_pos = o.min_pos, _max_pos = o.max_pos
    o.min_pos = function() {
        return u._sub(_min_pos(), o.point_offset())
    }
    o.max_pos = function() {
        return u._add(_max_pos(), o.point_offset())
    }
    // TODO-polish-polygon-transform: make a version of reframe
    // that doesn't change coords, for use during transformations
    o.repoint = function(display_only){
        var  old_points = points//(display_only ? points : ref_points)
            ,f = u.points_rect(old_points)

        var  pad = o.point_offset()
            ,points_delta = u._add(pad)([-f.x, -f.y])
            ,old_bounds = [f.width - f.x, f.height - f.y]
            ,new_dims = u._sub(o.dims_relative(), u._mul(pad, 2))
            ,dims_ratio = u._div(new_dims, old_bounds)
            ,new_off = u._sub( pad, u._mul([f.x, f.y], dims_ratio) )

        old_points.map(function(p, i){
            o.point_update(i, u._add(u._mul(p, dims_ratio), new_off))
        })
    }

    o.reframe = function(display_only){
        var  old_points = (display_only ? points : ref_points)
            ,f = u.points_rect(old_points)

        var  pad = o.point_offset()
            ,points_delta = u._add(pad)([-f.x, -f.y])
            ,new_dims = u._add([f.width - f.x, f.height - f.y])(
                u._mul(pad)(2) )
            ,new_pos = u._sub(ref_pos)( u._add([-f.x, -f.y])(pad) )

        old_points.map(function(p, i){
            o.point_update(i, u._add(p)(points_delta), display_only)
        })
        o.size_update(new_dims)

        if(display_only){
            var s = env.scale()
            u.css_coords(o.div, u._mul(new_pos)(s), u._mul(new_dims)(s))
            // if(o.controls) o.controls.layout();
        }
        else{
            o.pos_relative_set(new_pos)
            o.dims_relative_set(new_dims)
        }
        // ref_dims = undefined
    }
    var ref_point = [0,0] ,ref_points ,ref_pos ,ref_dims
        ,ref_center ,ref_stroke_width
    o.transform_start = function(i){
        ref_point = points[i].slice()
        ref_points = o.points()
        ref_pos = o.pos_relative()
        ref_dims = o.dims_relative()
        ref_center = u._sub(o.centroid_relative())(ref_pos)
        ref_stroke_width = o.border_width()
    }
    o.point_update = function(i, p, display_only){
        if(!display_only) points[i] = p.slice()
        var svg_p = poly_el[0].points.getItem(i)
        svg_p.x = p[0]
        svg_p.y = p[1]
    }
    o.point_move = function(i, p){
        ref_points[i] = u._add(ref_point)(p)
        o.reframe()
    }
    o.point_set = function(i, p){
        ref_points[i] = points[i] = p
        o.reframe(true)
    }
    o.point = function(i){ return points[i].slice() }
    o.points_set = function(ps){
        $.each(ps, o.point_update)
        o.transform_start(0)
        o.reframe()
        if(o.controls) o.controls.layout()
    }

    var _sr = o.state_relative, _srs = o.state_relative_set
    o.state_relative = function(){
        var s = _sr()
        s.points = o.points()
        return s
    }
    o.state_relative_set = function(s){
        _srs(s)
        if(s.points) o.points_set(s.points)
    }

    var _dims_relative_set = o.dims_relative_set
    o.dims_relative_set = function(dims) {
        _dims_relative_set(dims)
        o.size_update(dims)
        o.repoint()
    }

    // TODO-cleanup: these functions belong in App
    o.set_css = function(props, no_reframe) {
        $.extend(state.style, props);
        var restroke = (typeof props['stroke-width'] != 'undefined')
        if(restroke){
            var v = parseInt(props['stroke-width'])
            if(!v) v = 0
            dims = o.dims_relative()
            props['stroke-width'] = Math.min(v, .5*dims[0], .5*dims[1])
        }
        poly_el.css(props)
        if(restroke){
            o.transform_start(0)
            o.reframe(true)
        }
    }
    o.css_setter = function(css_prop){ return function(v) {
        var ps = {}; ps[css_prop] = v; o.set_css(ps); } }
    o.css_getter = function(css_prop){ return function(){
        return state.style[css_prop] } }

    o.color = o.css_getter('fill')
    o.color_set = o.css_setter('fill')
    o.stroke = o.css_getter('stroke')
    o.stroke_set = o.css_setter('stroke')

    o.blur = function(){ return state.blur || 0 }
    o.blur_set = function(v){
        state.blur = v
        if(v){
            blur_el[0].setAttribute('stdDeviation', v)
            poly_el.css('filter', 'url(#' + o.id + '_blur)')
        }
        else
            poly_el.css('filter', '')
        o.transform_start(0)
        o.reframe(true)
    }

    Hive.App.has_border_width(o) //, {slider_opts:{max:100}})
    Hive.App.has_color(o, "stroke");
    Hive.App.has_blur(o)
    Hive.App.has_rotate(o)
    o.rotate_start = function(){
        o.transform_start(0)
    }
    o.angle_set = function(a){
        ref_points.map(function(p, i){
            o.point_update(i, u.rotate_about(p, ref_center, u.deg2rad(a)))
        })
        o.reframe(true)
    }
    o.rotate_end = function(){
        o.transform_start(0)
        o.reframe()
    }
    Hive.App.has_color(o)
    Hive.App.has_color(o, 'stroke')
    var history_point
    o.border_width = o.css_getter('stroke-width')
    o.border_width_set = o.css_setter('stroke-width')
    o.stroke_update = function(v){
        var stroke_ctrl = env.Selection.controls.div.find('.button.stroke')
        stroke_ctrl.showhide(v)
    }
    Hive.App.has_opacity(o)

    if(!points.length)
        points.push.apply(points, [ [0, 0], [50, 100], [100, 0] ])
    o.div.addClass('svg')
    o.content_element = $("<svg xmlns='http://www.w3.org/2000/svg'"
        + " class='drag content' viewbox='0 0 100 100'"
        + " preserveAspectRatio='none'>"
        + "<filter id='" + o.id + "_blur' filterUnits='userSpaceOnUse'>"
            + "<feGaussianBlur/></filter>"
        + "<polygon points='0,0'></polygon></svg>")
        .appendTo(o.div)
    poly_el = o.content_element.find('polygon')
    poly_el.attr('points', points.map(function(p){ return p[0]+','+p[1] })
        .join(' '))
    blur_el = o.content_element.find('feGaussianBlur')

    o.dims_relative_set(o.init_state.dimensions || [100, 100])
    o.set_css(state.style)
    o.blur_set(o.blur())
    o.transform_start(0)
    o.reframe()

    o.load()

    return o;
};
Hive.registerApp(Hive.App.Polygon, 'hive.polygon');

// Polygon creation tool
(function(o){
    var creating, template, point_i, handle_template = {}, handle_freeform = {}
    o.handler_type = 1

    o.mode = function(_template){
        // set creation mode.
        // If _template is false, make free form (points picked by clicks)
        // Otherwise create a shape defined by a template Polygon object,
        if(_template){
            template = _template
            for(k in handle_freeform) delete o[k]
            $.extend(o, handle_template)
        }
        else{
            for(k in handle_template) delete o[k]
            $.extend(o, handle_freeform)
        }
    }

    o.finish = function(){
        if(creating.points_len() < 2){
            creating._remove()
            return false
        }
        creating.reframe()
        creating = false
        point_i = false
    }

    o.focus = function(){
        // TODO: UI for indicating polygon drawing is active
        // probably highlight shape menu at bottom middle
        evs.handler_set(o);
        u.cursor_set('draw')
    };
    o.unfocus = function(){
        evs.handler_del(o);
        u.cursor_set('default')
    };

    var pos = function(ev){
        var win = window
        return u._mul(1 / env.scale())([ev.clientX + window.scrollX, 
            ev.clientY + window.scrollY]) }

    var from_template = function(){
        var s = (template.state && template.state()) || template
        delete s.position
        delete s.id
        delete s.z
        return s
    }

    var no_click
    handle_template.mouseup = function(ev){
        // TODO-cleanup-events: use better implementation,
        // where it's easier to override app drag events

        // mouseup must bubble to drag_base in order for dragstart to work
        // but must not custom bubble in events module to selection
        ev.stop_editor_propagation()
        if(ev.data) return // if mouseup fired from app, ignore
        if(no_click){
            no_click = false
            return
        }
        var s = from_template()
        template = Hive.new_app(s, {no_select: 1})
        template.center_relative_set(pos(ev))
    }

    handle_template.dragstart = function(ev, dd){
        // absolutely no idea why this is being called twice
        ev.stopPropagation()
        if(creating) return
        var s = from_template()
        s.position = pos(ev)
        creating = template = Hive.new_app(s, {no_select: 1})
    }
    handle_template.drag = function(ev, dd){
        no_click = true
        // TODO-merge-conflict?
        if(!creating) return
        creating.dims_set([dd.deltaX, dd.deltaY])
    }
    handle_template.dragend = function(ev, dd){
        creating = false
        ev.stopPropagation()
    }

    handle_freeform.click = handle_freeform.mousedown = handle_freeform.drag
        = handle_freeform.dragstart = function(e){ return false };

    var ref_pos
    handle_freeform.mouseup = function(ev){
        var p = pos(ev)

        if(!creating){
            creating = template = Hive.new_app( {'type': 'hive.polygon'
                ,points: [[0,0], [0,0]], position: p, dimensions: [1,1] }
                ,{no_select: 1} )
            point_i = 1
            creating.transform_start(0)
            ref_pos = creating.pos_relative()
            return false
        }

        ref_pos = creating.pos_relative()
        var cur_p = creating.point(point_i)
            ,close_d = u._sub(creating.point(0))(cur_p)

        if(u.array_equals( cur_p, creating.point(point_i-1) )
            || Math.abs(close_d[0] + close_d[1]) < 5
        ){
            // double click ends creating
            creating.point_remove(point_i)
            o.finish()
            return false
        }

        // add point
        point_i = creating.points_len()
        creating.point_insert(point_i)
        creating.transform_start(point_i)

        return false
    };

    handle_freeform.mousemove = function(ev){
        if(creating){
            var p = u._sub(pos(ev))(ref_pos)
            creating.point_set(point_i, p)
        }
    }

    o.keydown = function(ev){ 
        if(creating){
            if(ev.keyCode == 27){ // esc
                creating._remove()
                return creating = false
            }
            else if(ev.keyCode == 13){ // enter
                o.finish()
                return false
            }
        }
    }

    o.mode(false)
})(Hive.App.Polygon);


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
        if (!o.single()) return;
        var app = o.app.sel_app();
       
        o.addButtons($('#controls_sketch'));
        u.append_color_picker(o.div.find('.drawer.fill'), app.fill_color, '#000000');

        o.hover_menu(o.div.find('.button.fill'), o.div.find('.drawer.fill'),
            { auto_close : false });
        //TODO: What does this click on the brush handle do?
        var brush_btn = o.div.find('.button.brush')
            .click( function(){
                 app.set_brush( app.brush_name );
            });
        var brush_menu = o.hover_menu(brush_btn, o.div.find('.drawer.brush'));
        o.div.find('.button.eraser').click( function(){ app.win.set_brush( 'eraser' ) });
        o.div.find('.drawer.brush .option').each(function(i, e) { $(e).click(function() {
            app.set_brush($(e).attr('val'));

            o.div.find('.drawer.brush .option').removeClass("selected");
            $(e).addClass("selected");
            brush_menu.close();
        }); })
        o.div.find('.drawer.brush .option[val=' + app.brush_name + ']').click();

        return o;
    };
    o.make_controls.push(controls);
    var app = o.sel_app();
    Hive.App.has_slider_menu(o, '.size'
        ,function(v) { env.Selection.sel_app().win.BRUSH_SIZE = v; }
        ,function() { return env.Selection.sel_app().win.BRUSH_SIZE; }
        ,undefined,undefined,{single: true});
    Hive.App.has_rotate(o);
    Hive.App.has_opacity(o);
    Hive.App.has_shield(o);

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
        var sf = env.scale();
        if (dims[1] / sf < 25) dims[1] = 25 * sf;
        if (dims[1] / sf > 400) dims[1] = 400 * sf;
        if (dims[0] < 2.5 * dims[1]) dims[0] = 2.5 * dims[1];

        o.scale_set(dims[1] / 35);

        o.dims_set(dims);
    };

    o.color = function(){
        return o.init_state.color; };
    o.color_set = function(v){
        o.init_state.color = v;
        o.div.find('.jp-play-bar, .jp-interface').css('background-color', v);
    };

    Hive.has_scale(o);
    var _layout = o.layout;
    o.layout = function() {
        if (_layout()) return true;
        o.div.css('font-size', (env.scale() * o.scale()) + 'em');
        var height = o.div.find('.jp-interface').height();
        o.div.find('.jp-button').width(height).height(height);
    }

    o.load.add(function(){
        o.dims_set(o.dims());
        o.scale_set(o.dims()[1] / 35);
        o.color_set(o.color());
    });

    o.set_shield = function() { return true; }

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
            o.color_set(o.color());
            // ideally jPlayer API would be used so the interface
            // isn't reset, but this doesn't work, tested 2013-10
            //o.content_element.jPlayer('setMedia', s.url);
        }
    };

    o.skin = function(){
        return $( $.jPlayer.skin.minimal(
            o.init_state.url, u.random_str() )
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

    if(!o.init_state.color) o.init_state.color = colors[23];

    o.update_shield();
    setTimeout(function(){ o.load(); }, 100);
    return o;
};
Hive.registerApp(Hive.App.Audio, 'hive.audio');


// TODO-refactor: move into app_modifiers

Hive.App.has_nudge = function(o, condition){
    // TODO-bugbug: implement undo/redo of this. Because nudge is naturally
    // called repeatedly, this should create a special collapsable history
    // point that automatically merges into the next history point if it's the
    // same type, similar to History.begin + History.group
    o.keydown.add(function(ev){
        var nudge = function(delta){
            return function(){
                delta = u._mul(1 / env.scale())(delta);
                var me = o.elements()[0];
                if (me && me.has_full_bleed()) {
                    delta[me.full_coord = 0];
                    if (env.gifwall && delta[1]) {
                        // push up/down by an entire full-bleed app.
                        var apps = $.grep(env.Apps.all(), function(app) {
                            return app.has_full_bleed();
                        });
                        var swap, best_app, invert = u._sign(delta[1]),
                            my_pos = me.pos_relative(), best = Infinity;
                        for (var i = 0; i < apps.length; ++i) {
                            var app = apps[i], 
                                other_pos = invert * app.pos_relative()[1];
                            if (other_pos > invert * my_pos[1]
                                && other_pos < best) {
                                best_app = app;
                                best = other_pos;
                            }
                        }
                        if (!best_app)
                            return;
                        env.History.change_start([best_app, me]);
                        if (invert > 0) {
                            var oth_pos = best_app.pos_relative();
                            my_pos[1] += best_app.max_pos()[1] - me.max_pos()[1];
                            oth_pos[1] -= best_app.min_pos()[1] - me.min_pos()[1];
                            me.pos_relative_set(my_pos);
                            best_app.pos_relative_set(oth_pos);
                        } else {
                            var oth_pos = best_app.pos_relative();
                            oth_pos[1] -= best_app.max_pos()[1] - me.max_pos()[1];
                            my_pos[1] += best_app.min_pos()[1] - me.min_pos()[1];
                            me.pos_relative_set(my_pos);
                            best_app.pos_relative_set(oth_pos);
                        }
                        env.History.change_end("swap");
                        return;
                    }
                }
                if (ev.shiftKey)
                    delta = u._mul(10)(delta);
                o.pos_relative_set(u._add(o.pos_relative())(delta));
            }
        }
        var handlers = {
            37: nudge([-1,0])   // Left
            , 38: nudge([0,-1]) // Up
            , 39: nudge([1,0])  // Right
            , 40: nudge([0,1])  // Down
        }
        if(handlers[ev.keyCode] && condition()){
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
    o.full_coord = coord;
    o.stack_coord = 1 - o.full_coord;

    // To make the functionality removable, we check that we are indeed
    // full bleed
    o.has_full_bleed = function() { return (o.full_coord != undefined); };
    // TODO: just reset the functions instead
    o.remove_full_bleed = function() { o.full_coord = undefined; };

    var _dims_relative_set = o.dims_relative_set,
        _pos_relative_set = o.pos_relative_set,
        _get_aspect = o.get_aspect,
        _resize = o.resize,
        _remove = o._remove, _unremove = o._unremove,
        push_apps, remove_delta;
    o._remove = function() {
        remove_delta = [0, 0];
        remove_delta[o.stack_coord] = o.dims()[o.stack_coord];
        o.before_resize();
        o.resize(u._mul(-1)(remove_delta));
        _remove();
    }
    o._unremove = function() {
        o.dims_ref_set();
        o.resize(remove_delta);
        _unremove();
    }
    // TODO-cleanup: move to resize_start
    o.before_resize = function(){
        if (!env.gifwall || !o.has_full_bleed())
            return;
        o.dims_ref_set();
        // TODO-delete.  Remove junk code. 
        // Verify that resize only comes from selection now
        // env.History.begin();
        // env.History.change_start(true);
        push_apps = env.Apps.all().filter(function(a){
            return a.id != o.id;
        });
    };
    o.resize = function(delta){
        if (!env.gifwall || !o.has_full_bleed())
            return _resize(delta);
        var start = o.max_pos()[o.stack_coord];
        _resize(delta);
        var dims = o.dims_relative();
        if (o.max_height && dims[1] > o.max_height()) {
            dims[1] = o.max_height();
            o.dims_relative_set(dims);
        }
        var push = o.max_pos()[o.stack_coord] - start;
        // Move all apps below my start by delta as well
        for (var i = push_apps.length - 1; i >= 0; i--) {
            var a = push_apps[i];
            if (a.min_pos()[o.stack_coord] > start - .5) {
                var pos = a.pos_relative();
                pos[o.stack_coord] += push;
                a.pos_relative_set(pos);
            }
        };
        if (env.gifwall)
            env.layout_apps();

        return dims
    };
    // TODO-cleanup: move to resize_end
    o.after_resize = function(){
        if (!env.gifwall || !o.has_full_bleed())
            return;
        // env.History.change_end();
        // env.History.group("resize");
        env.layout_apps();
        return true;
    };
    o.get_aspect = function() {
        if (o.has_full_bleed())
            return false;
        return _get_aspect();
    };
    o.pos_relative_set = function(pos) {
        if (o.has_full_bleed()) {
            pos = pos.slice();
            pos[o.full_coord] = 0;
        }
        _pos_relative_set(pos);
    };
    o.dims_relative_set = function(dims, aspect) {
        if (o.has_full_bleed()) {
            if (aspect) {
                if (!o.full_coord)
                    aspect = 1 / aspect;
                dims[1 - o.full_coord] = 1000 * aspect;
            }
            dims[o.full_coord] = 1000;
        }
        _dims_relative_set(dims);
    };
    o.pos_relative_set(o.pos_relative());
    o.dims_relative_set(o.dims_relative());
};

// Let users drag images onto this app
// NOTE: this adds handlers to o.content_element, so if
// content_element changes, this modifier needs to be called again.
Hive.App.has_image_drop = function(o) {
    if (o.has_image_drop || (!env.gifwall && !context.flags.rect_drag_drop))
        return o;
    o.has_image_drop = true;
    o.content_element.on('dragenter dragover dragleave drop', function(ev){
        // Handle drop highlighting.
        if (ev.type == "dragenter") {
            o.highlight();
        } else if (ev.type == "dragleave" || ev.type == "drop") {
            o.highlight({on: false});
        }
        ev.preventDefault();
        return false;
    });
    o.div.on("dblclick",function(ev) { 
        env.click_app = o;
        $("#media_input").click()
    });

    var on_files = function(files, file_list){
        if (env.gifwall) {
            files = files.filter(function(file, i) {
                var res = (file.mime.slice(0, 6) == 'image/');
                if (!res) file_list.splice(i, 1);
                return res;
            });
            u.new_file(files, {}, { insert_at: o.pos_relative() });
            return;
        }
        if (files.length == 0)
            return false;
        var load = function(app) {
            if (typeof(app.set_css) == "function")
                app.set_css(o.css_state)
        };
        // TODO-dnd: handle multiple files (auto group / image bomb algorithm)
        var file = files[0];
        // TODO-dnd: have fit depend on where the object was dropped relative
        // to image center
        var app_state = o.state()
        delete app_state.id;
        var init_state = $.extend(app_state, {fit: 2 })
        env.History.begin();
        app = u.new_file(files, init_state,
            { load:load, position: true })[0];
        if (init_state.fit == 2)
            o.remove();
        env.History.group("Image drop");
    };
    o.with_files = function(ev, file, file_list) { on_files(file, file_list)};
    upload.drop_target(o.content_element, on_files, u.on_media_upload);
    return o;
};
Hive.App.has_border_radius = function(o) {
    o.init_state.css_state = $.extend({ 'border-radius' : 0 }, 
        o.init_state.css_state);
    o.border_radius = function(){ return parseInt(o.css_state['border-radius']) };
    o.border_radius_set = function(v){ o.set_css({'border-radius':v+'px'}); };
    var controls = function(o){
        o.addButton($('#controls_rounding .rounding'));
    }
    o.make_controls.push(memoize('has_border_radius_controls', controls));
    var history_point;
    var sel = env.Selection
    Hive.App.has_slider_menu(o, '.rounding', sel.border_radius_set, sel.border_radius,
        function(){ history_point = env.History.saver(
            sel.border_radius, sel.border_radius_set, 'border radius'); },
        function(){ history_point.save() }
    );
}
Hive.App.has_resize = function(o) {
    var dims_ref, history_point;
    o.dims_ref_set = function(){ dims_ref = o.dims(); };
    o.resize_start = function(){
        if (o.before_resize) o.before_resize();
        env.Selection.hide_controls()
        dims_ref = o.dims();
        u.reset_sensitivity();
        history_point = o.history_helper_relative('resize');
    };
    o.resize = function(delta) {
        o.sensitivity = u.calculate_sensitivity(delta);
        var dims = o.resize_to(delta);
        if(!dims[0] || !dims[1]) return;
        dims = u._div(dims)(env.scale());
        // everything past this point is in editor space.
        var aspect = o.get_aspect();
        if (!o.fixed_aspect && env.ev.shiftKey)
            aspect = false

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
            return snap_dims;

        var snap_dist = u._apply(function(x,y) {return Math.abs(x-y);}, 
            dims)(snap_dims);
        dims = (snap_dist[0] < snap_dist[1]) ?
            [snap_dims[1] * aspect, snap_dims[1]] :
            [snap_dims[0], snap_dims[0] / aspect];

        newWidth = dims[1] * aspect;
        dims = (newWidth < dims[0] ? [newWidth, dims[1]]
            : [dims[0], dims[0] / aspect]);
        o.dims_relative_set(dims);

        return dims
    }

    o.resize_end = function(skip_history){ 
        u.set_debug_info("");
        $(".ruler").hidehide();
        if (o.after_resize) skip_history |= o.after_resize();
        if (!skip_history) history_point.save();
    };
    o.resize_to = function(delta){
        dims_ref = dims_ref || o.dims();
        return [ Math.max(1, dims_ref[0] + delta[0]), 
            Math.max(1, dims_ref[1] + delta[1]) ];
    };
    o.resize_to_pos = function(pos, doit) {
        var _pos = o.pos_relative();
        // TODO: allow snapping to aspect ratio (keyboard?)
        // TODO: set snap parameters be set by user
        if(u.should_snap() && !env.no_snap && !o.has_full_bleed()){
            var tuple = [];
            tuple[0] = [undefined, undefined, pos[0]];
            tuple[1] = [undefined, undefined, pos[1]];
            excludes = {};
            excludes[o.id] = true;
            pos = u.snap_helper(tuple, {
                exclude_ids: excludes,
                snap_strength: .05,
                snap_radius: 10, 
                sensitivity: o.sensitivity / 2, 
            });
        }
        var _dims = [];
        _dims[0] = pos[0] - _pos[0];
        _dims[1] = pos[1] - _pos[1];
        if (o.full_coord != undefined)
            _dims[o.full_coord] = 1000;
        _dims = [ Math.max(1, _dims[0]), Math.max(1, _dims[1]) ];
        if (doit || doit == undefined)
            o.dims_relative_set(_dims);
        return _dims;
    };

    function controls(o) {
        var common = $.extend({}, o);
        o.resize_control = true;
        var app = o.app.sel_app();

        if (app.has_full_bleed())
            o.c.resize = o.addControl($('#controls_misc .resize_v'));
        else
            o.c.resize = o.addControl($('#controls_misc .resize'));

        o.layout = function() {
            common.layout()
            var p = o.padding;
            var dims = o.dims();
            if (app.has_full_bleed())
                o.c.resize.css({ top: dims[1] - 18 + o.padding,
                    left: Math.min(dims[0] / 2 - 18, dims[0] - 54) });
            else
                o.c.resize.css({ left: dims[0] -18 + p, top: dims[1] - 18 + p });
        };

        o.c.resize.drag('start', function(ev, dd) {
                o.drag_target = ev.target;
                o.drag_target.busy = true;
                o.app.resize_start();
            })
            .drag(function(e, dd){ 
                env.ev = e; o.app.resize([ dd.deltaX, dd.deltaY ]); })
            .drag('end', function(e, dd){
                o.drag_target.busy = false;
                o.app.resize_end();
            });

        return o;
    }
    if (o.is_selection)
        o.make_controls.push(controls);
}

Hive.App.has_resize_h = function(o) {
    function controls(o) {
        var common = $.extend({}, o);

        // This control can only ever apply to a single app.
        var app = o.app.elements()[0];

        o.addControl($('#controls_misc .resize_h'));
        o.c.resize_h = o.div.find('.resize_h');
        o.refDims = null;

        o.layout = function() {
            common.layout()
            var p = o.padding;
            var dims = o.dims();
            o.c.resize_h.css({ left: dims[0] -18 + o.padding,
                top: Math.min(dims[1] / 2 - 18, dims[1] - 54) });
        }

        // Dragging behavior
        o.c.resize_h.drag('start', function(e, dd) {
                if (app.before_h_resize) app.before_h_resize();
                o.refDims = app.dims();
                o.drag_target = e.target;
                o.drag_target.busy = true;
                app.div.drag('start');
            })
            .drag('end', function(e, dd) {
                o.drag_target.busy = false;
                app.div.drag('end');
                // if (env.Selection.selected(app)) 
                env.Selection.update_relative_coords();
            })
            .drag(function(e, dd) { 
                app.resize_h([ o.refDims[0] + dd.deltaX, o.refDims[1] ]);
            });

        return o;
    }
    o.resize_h = function(dims) {
        return o.dims_set([ dims[0], o.calcHeight() ]);
    }
    o.make_controls.push(controls);
}

Hive.has_scale = function(o){
    var scale = o.init_state.scale ? o.init_state.scale * env.scale() : 1;
    o.scale = function(){ 
        return scale; };
    o.scale_set = function(s){ 
        scale = s; o.layout(); };

    var _state_relative = o.state_relative, _state_relative_set = o.state_relative_set;
    o.state_relative = function(){
        return $.extend(_state_relative(), { 'scale': scale });
    };
    o.state_relative_set = function(s){
        _state_relative_set(s);
        if(s.scale) o.scale_set(s.scale);
    };
};

Hive.App.has_rotate = function(o) {
    var app = o

    function controls(o) {
        var common = $.extend({}, o), ref_angle = null, offsetAngle = null,
            ref_centroid, app = o.app.sel_app();

        o.getAngle = function(e) {
            var x = e.pageX - ref_centroid[0];
            var y = e.pageY - ref_centroid[1];
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
            app.angle_set(a);
        };

        o.rotateHandle = $("<img class='control rotate hoverable drag' title='Rotate'>")
            .attr('src', asset('skin/edit/rotate.png'));
        o.appendControl(o.rotateHandle);

        var angleRound = function(a) { return Math.round(a / 45)*45; },
            history_point;
        o.rotateHandle.drag('start', function(e, dd) {
                ref_centroid = app.centroid()
                ref_angle = app.angle();
                offsetAngle = o.getAngle(e);
                env.Selection.hide_controls()
                if (app.rotate_start)
                    app.rotate_start(ref_angle);
                if(!app.is_selection)
                    history_point = env.History.saver(
                        app.angle, app.angle_set, 'rotate');
            })
            .drag(function(e, dd) {
                var a = o.getAngle(e) - offsetAngle + ref_angle;
                if( e.shiftKey && Math.abs(a - angleRound(a)) < 10 )
                    a = angleRound(a);
                app.angle_set(a);
            })
            .drag('end', function(){
                if(app.rotate_end) app.rotate_end();
                env.Selection.update_relative_coords();
                env.Selection.show_controls()
                if(!app.is_selection)
                    history_point.save()
            })
            .dblclick(function(){ 
                if(app.is_selection)
                    return;
                history_point = env.History.saver(
                    app.angle, app.angle_set, 'rotate');
                app.angle_set(0); 
                env.Selection.update_relative_coords();
                history_point.save()
            });

        return o;
    }
    if (!o.is_selection) {
        var angle = o.init_state.angle ? o.init_state.angle : 0;
        o.angle = function(){ return angle; };
        o.angle_set = function(a){
            angle = a;
            if(o.content_element)
                o.content_element.rotate(a);
            if(o.controls && o.controls.multiselect)
                o.controls.select_box.rotate(a);
        }
        o.load.add(function() { o.angle_set(o.angle()) });

        var _sr = o.state_relative, _srs = o.state_relative_set
        o.state_relative = function(){
            var s = _sr();
            if(angle === 0 || angle) s.angle = angle;
            return s;
        };
        o.state_relative_set = function(s){
            _srs(s)
            if(s.angle === 0 || s.angle)
                o.angle_set(s.angle)
        }
    }
    o.make_controls.push(memoize("rotate_controls", controls));
}

// set: f(v): tell the app to set its state to the slider value
// init: f(): get the app's state
// start: called on menu open (for history)
// end: called on menu close (for history)
Hive.App.has_slider_menu = function(o, handle_q, set, init, start, end, opts) {
    opts = $.extend({
        single: false // true to make this menu only available to singly-selected apps
        , min:0       // minimum setting on range
        , max:100     // maximum setting on range
        , quant:0     // quantization of slider (1 ==> integers .1 ==> integer/10, etc)
        , clamp:true  // disallow values outside [min, max]
        , clamp_min:true  // disallow values outside [min, max]
        , clamp_max:true  // disallow values outside [min, max]
        , handle:$()  // provide the handle selector instead of looking for it
        , container:null // add controls to container instead of menu
        , handle_name:"" // provide a generic button's name instead of an icon
    }, opts)
    var handle = opts.handle, min = opts.min, max = opts.max
        , container = opts.container, menu_opts = opts.menu_opts
        , initial, val, initialized = false, handle_name = opts.handle_name
        , quant = opts.quant, clamp_min = opts.clamp_min && opts.clamp
        , clamp_max = opts.clamp && opts.clamp_max, single = opts.single
    function controls(o) {
        if(!start) start = noop
        if(!end) end = noop
        var hover_menu = (o && o.hover_menu) || u.hover_menu

        var drawer = $('<div>').addClass('control border drawer slider hide')
            ,range = $("<input type='range' min='0' max='100'>")
                .appendTo(drawer)
                .css('vertical-align', 'middle')
            ,num_input = $("<input type='text' size='3'>")
                .appendTo(drawer)
        if (container) {
            drawer.appendTo(container)
        } else {
            handle = find_or_create_button(o, handle_q, handle_name);
            handle.parent().append(drawer)
        }
        // For named handles with no icon, give them the text of the first 
        // character of their name
        if (handle_name && !handle_q) {
            handle.html(handle_name[0]);
        }
        handle.add(drawer).bind('mousewheel', function(e){
            // Need to initialize here because mousewheel can fire before 
            // menu is opened
            val = val || init();
            var amt = (e.originalEvent.wheelDelta / 2000) || 0
            clamp_set((val || min) + amt*(max - min))
            update_val()
            e.preventDefault()
        })

        var initialize = function(){
            // if(initialized) return;
            initial = val = init();
            // initialized = true;
        }

        var update_val = function(){
            if (typeof(val) == "number") {
                num_input.val((Math.round(val*1000)/1000).toString())
                range.val((val - min)/(max - min)*100)
            } else {
                num_input.val()
                range.val(0)
            }
        }
        var clamp_set = function(n) {
            val = n
            if (quant)
                val = Math.round(val / quant) * quant;
            if (clamp_min) val = Math.max(val, min)
            if (clamp_max) val = Math.min(val, max)
            set(val)
            return val
        }

        if (handle && handle.length) {
            var m = hover_menu(handle, drawer, $.extend (
                menu_opts, {
                open: function(){
                    num_input.focus().select()
                    initialize()
                    update_val()
                    start()
                },
                close: function(){
                    if(val != initial) end()
                }
            }))
        }

        range.on('input change', function(){
            var v = parseFloat(range.val());
            val = v/100*(max - min) + min
            clamp_set(val)
            update_val()
            // num_input.val(val)
        })

        num_input.on('input keyup change', function(ev){
            if(ev.keyCode == 13) { num_input.blur(); m.close(); }
            var v = parseFloat(num_input.val());
            if(isNaN(v)) return;
            val = v;
            clamp_set(val);
            update_val()
        })

        return o
    }
    var res = controls
    if (o) {
        if (single) controls.single = true
        res = memoize('slider' + ((single) ? '_S' : '') + 
            handle_q + handle_name, controls)
        o.make_controls.push(res)
    }
    return res
}

Hive.App.has_align = function(o) {
    function controls(o) {
        var common = $.extend({}, o);

        o.addButton($('#controls_misc .button.align'));
        o.addButton($('#controls_misc .drawer.align'));
        // o.c.align = o.div.find('.align.button');
        o.align_menu = o.hover_menu(o.div.find('.button.align'), 
            o.div.find('.drawer.align'));

        o.div.find('.option[cmd]').each(function(i, el) {
            $(el).on('mousedown', function(e) {
                e.preventDefault();
            }).click(function(){
                env.History.change_start([o.app]);
                var cmd = $(el).attr('cmd')
                    ,coord = 0
                    ,width = 1000
                    ,pos = o.app.pos_relative()
                    ,dims = o.app.dims_relative();
                switch(cmd) {
                  case "+alignLeft":
                    pos[coord] = 0;
                    break;
                  case "+alignRight":
                    pos[coord] = width - dims[coord];
                    break;
                  case "+alignCenter":
                    pos[coord] = (width - dims[coord]) / 2;
                    break;
                  case "+alignFull":
                    pos[coord] = 0;
                    dims[coord] = width;
                    var app = o.app;
                    var aspect = app.get_aspect();
                    if (aspect) {
                        if (!coord) aspect = 1 / aspect;
                        dims[1 - coord] = width * aspect;
                    } else if (app.is_selection && app.count() == 1) {
                        app = app.elements()[0];
                        dims[1 - coord] = app.dims_relative()[1 - coord];
                    }
                    app.dims_relative_set(dims);
                    break;
                }
                o.app.pos_relative_set(pos);
                env.History.change_end("align");
            });
        });

        return o;
    };
    o.make_controls.push(memoize('has_align_controls', controls));
};
    
Hive.App.has_opacity = function(o) {
    var history_point;
    var app = env.Selection;
    Hive.App.has_slider_menu(o, '.button.opacity',
        function(v) { app.opacity_set(v/100) },
        function() { return Math.round(app.opacity() * 100) },
        function(){ history_point = env.History.saver(
            app.opacity, app.opacity_set, 'change opacity') },
        function(){ history_point.save() }
    );
    var opacity = o.init_state.opacity === undefined ? 1 : o.init_state.opacity; 
   o.opacity = function(){ return opacity; };
    o.opacity_set = function(s){
        opacity = s;
        o.content_element.css('opacity', s);
    };
    o.add_to('state', function(s){
        s.opacity = opacity;
        if(opacity == 1) delete s.opacity;
        return s;
    });

    o.load.add(function(){
        if (o.content_element)
            o.opacity_set(opacity);
    });
};
// opts.name: function to call to get the value
// opts.setter: function to call to set the value
// opts.slider_opts: options to pass to slider
Hive.App.has_border_width = function(o, opts) {
    opts = $.extend({name:"border_width"}, opts)
    var history_point, sel = env.Selection
        ,getter = opts.name, setter = opts.setter || getter + "_set"
    // If getter/setter undefined, default to globals
    if (!o[getter]) o[getter] = o['g' + getter]
    if (!o[setter]) o[setter] = o['g' + setter]

    Hive.App.has_slider_menu(o, '.stroke-width'
        ,function(v){
            sel[setter](v)
        }
        ,sel.border_width
        ,function(){ history_point = env.History.saver(
            sel[getter], sel[setter], 'stroke') }
        ,function(){
            history_point.save()
            sel.reframe()
        }
        ,$.extend({max:40, quant:1, handle_name: getter}, opts.slider_opts)
    )
}
Hive.App.has_blur = function(o) {
    var history_point, sel = env.Selection
    Hive.App.has_slider_menu(o, '.blur' ,sel.blur_set ,sel.blur
        ,function(){ history_point = env.History.saver(
            sel.blur, sel.blur_set, 'stroke') }
        ,function(){
            history_point.save()
            sel.reframe()
        }
    )
}
var find_or_create_button = function(app, btn_name, btn_title) {
    var btn = app.div.find('.button' + btn_name);
    if (!btn_name || !btn.length) {
        btn = app.addButton($('#controls_misc .button' + (btn_name || ".run")));
        if (btn_title) {
            btn.attr("title", btn_title);
            if (!btn_name)
                btn.html(btn_title[0]);
        }

    }
    return btn;
}

Hive.App.has_color = function(o, name){
    if(!name) name = 'color'
    if (!o[name]) o[name] = o['g' + name]
    if (!o[name + "_set"]) o[name + "_set"] = o['g' + name + "_set"]
    o.make_controls.push(memoize('has_color_' + name, function(o) {
        var common = $.extend({}, o);
        var color_drawer, sel = env.Selection
            ,getter = sel[name], setter = sel[name + '_set']

        // o.addButton($('#controls_misc .drawer.color'));
        // o.addButton($('#controls_misc .button.color'));
        // o.c.color = o.div.find('.button.color');
        color_drawer = o.addButton($('#controls_misc .drawer.color'));
        o.c.color = find_or_create_button(o, "." + name);
        u.append_color_picker(color_drawer, setter, getter());
        var history_point
        o.hover_menu(o.c.color, color_drawer, {
            auto_close: false
            ,open: function(){
                history_point = env.History.saver(
                    getter, setter, 'color')
            }
            ,close: function(){ history_point.save() }
        });
        return o;
    }))
}


//TODO: integrate this code into root app
Hive.init_background_dialog = function(){
    if(!env.Exp.background) env.Exp.background = { };
    if(!env.Exp.background.color) env.Exp.background.color = '#FFFFFF';
    Hive.bg_div = $('#bg');
    u.append_color_picker($('#color_pick'), Hive.bg_color_set,
        env.Exp.background.color);
    
    $('#image_background').click(function() {
        var history_point;
        u.show_dialog('#dia_edit_bg', {
            fade: false,
            open: function(){ history_point = env.History.saver(
                function(){ return $.extend(true, {}, env.Exp.background) },
                Hive.bg_set, 'change background'
            ) },
            close: function(){ history_point.save() }
        });
    });

    $('#bg_remove').click(function(){
        delete env.Exp.background.url;
        Hive.bg_set({});
    });

    $('#bg_opacity').focus(function() { $('#bg_opacity').focus().select() }).keyup(function(e) {
        env.Exp.background.opacity = parseFloat($(e.target).val()) / 100;
        Hive.bg_set(env.Exp.background);
    });

    Hive.bg_set(env.Exp.background);

    $('#bg_upload').on('with_files', function(ev, files){
        Hive.bg_set(files[0]);
    }).on('success', function(ev, files){
        env.Exp.background.url = files[0].url;
    });
};
Hive.bg_color_set = function(c) {
    if(!c) c = '';
    Hive.bg_div.add('#bg_preview').css('background-color', c);
    env.Exp.background.color = c;
};
Hive.bg_set = function(bg, load) {
    env.Exp.background = bg;
    Hive.bg_color_set(bg.color);

    var img = Hive.bg_div.find('img')
        ,imgs = img.add('#bg_preview_img')
        ,raw = false;
    try {
        raw = $(bg.content)
    } catch(e){}

    $('#bg .content').remove()
    if(raw.length) {
        imgs.hidehide();
        raw.appendTo(Hive.bg_div).showshow();
        return;
    }

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
        function(){ return $.extend(true, {}, env.Exp.background) },
        Hive.bg_set, 'change background'
    ).exec(s);
};

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

return Hive;

});
