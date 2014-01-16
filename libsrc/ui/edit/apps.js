define([
    'browser/jquery'
    ,'browser/js'
    ,'server/context'
    ,'browser/upload'
    ,'browser/layout'
    ,'ui/util'

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
    ,ui_util
    // ,app_has

    ,env
    ,u
    ,evs
){

var Hive = {}
    ,noop = function(){}
    ,Funcs = js.Funcs
    ,asset = ui_util.asset
;

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
        if (! opts.position)
            a.center(opts.offset);
        a.dims_set(a.dims());
        if (env.gifwall) {
            // TODO: move the app into the right place, and push other apps
            // a.pos_set([0, $("body")[0].scrollHeight]);
            var not_it = env.Apps.all().filter(function(x) { return a.id != x.id; });
            var height = Math.max(0, u.app_bounds(not_it).bottom);
            a.pos_set([0, height]);
            var aspect = a.get_aspect();
            Hive.App.has_full_bleed(a);
            a.dims_relative_set(a.dims_relative(), aspect);
        }
        env.Selection.select(a);
        if(load) load(a);
    };
    var app = Hive.App(s, opts);
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
    
    var stack = [], restack = function() {
        for(var i = 0; i < stack.length; i++)
            if(stack[i]) stack[i].layer_set(i);
    };
    u.has_shuffle(stack);
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
        u.array_delete(o, app);
        u.array_delete(stack, app);
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
                $tags = $("#tags_input");
                var e = {target:$tags};
                $tags.val(unescape(query)).trigger("change",e);
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

// Creates generic initial object for all App types.
Hive.App = function(init_state, opts) {
    var o = {};
    o.apps = Hive.Apps;
    if(!opts) opts = {};
    
    o.init_state = { z: null };
    $.extend(o.init_state, init_state);
    o.type = Hive.appTypes[init_state.type];
    o.id = init_state.id || u.random_str();
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
        env.History.save(o._unremove, o._remove, 'delete');
    };

    var stack_to = function(i){ o.apps.stack(o.layer(), i); };
    o.stack_to = function(to){
        var from = o.layer();
        if(from == to) return;
        env.History.saver(o.layer, stack_to, 'change layer').exec(to);
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

    o.get_aspect = function() { return false; };
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

    o.layout = function(){
        var pos = o.pos(), dims = o.dims();
        o.div.css({ 'left' : pos[0], 'top' : pos[1] });
        o.div.width(dims[0]).height(dims[1]);
        if(o.controls)
            o.controls.layout();
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

    // END-coords

    o.center = function(offset) {
        var win = $(window),
            pos = [ ( win.width() - o.width() ) / 2 + win.scrollLeft(),
                ( win.height() - o.height() ) / 2 + win.scrollTop() ];
        if(typeof(offset) != "undefined"){ pos = u.array_sum(pos, offset) };
        o.pos_set(pos);
    };

    o.copy = function(opts){
        if(!opts) opts = {};
        if(!opts.offset) opts.offset = [ 0, o.dims()[1] + 20 ];
        var app_state = o.state();
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
            o.pos_set(pos);
            o.dims_set(scaled);
        }
        return { pos: pos, dims: scaled };
    };
    o.highlight = function(opts) {
        opts = opts || {};
        opts = $.extend({on: true}, opts);

        var $highlight = o.div.find(".highlight");
        if (0 == $highlight.length)
            $highlight = $("<div class='highlight hide'></div>").appendTo(o.div);
        $highlight.showhide(opts.on);
    }
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

    o.load = Funcs(function() {
        if( ! o.init_state.position ) o.init_state.position = [ 100, 100 ];
        if( ! o.init_state.dimensions ) o.init_state.dimensions = [ 300, 200 ];
        if( opts.offset )
            o.init_state.position = u.array_sum(o.init_state.position, opts.offset);
        o.state_relative_set(o.init_state);
        if (o.init_state.full_bleed_coord != undefined)
            Hive.App.has_full_bleed(o, o.init_state.full_bleed_coord);
        if(opts.load) opts.load(o);
        u.layout_apps();
    });

    // initialize

    o.div = $('<div class="ehapp">').appendTo('#happs');
 
    o.add_to_collection = true;
    o.type(o); // add type-specific properties
    if (o.add_to_collection)
        o.apps.add(o); // add to apps collection
    evs.on(o.div, 'dragstart', o).on(o.div, 'drag', o).on(o.div, 'dragend', o)
        .on(o.div, 'click', o).long_hold(o.div, o);

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
            u.show_dialog(dia, {
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

Hive.App.Image = function(o) {
    o.is_image = true;
    Hive.App.has_resize(o);
    // TODO-cleanup: aspects should be y/x
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
        env.History.saver(o.link, link_set, 'link image').exec(v);
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
        o.load();
        o.img.css('width', o.dims()[0] + 'px');
        // fit and crop as needed
        if (o.init_state.fit) {
            var opts = { dims:o.dims(), pos:o.pos(), fit:o.init_state.fit, 
                doit: (o.init_state.fit != 2), // Cropping needed, wait on execution
                scaled: [imageWidth, imageHeight] };
            var new_layout = o.fit_to(opts);
            if (opts.fit == 2) {
                o.init_state.scale_x = new_layout.dims[0] / opts.dims[0];
                o.init_state.offset = u._add(new_layout.pos)(u._mul(-1)(opts.pos));
                o.init_state.offset = u._mul( 1 / opts.dims[0] /
                    o.init_state.scale_x)(o.init_state.offset);
            }
            o.init_state.fit = undefined;
        }
        if (env.gifwall || o.init_state.scale_x != undefined) {
            o.allow_crop();
        }
    };
    // TODO-cleanup: move to has_crop
    o.allow_crop = function() {
        if (!context.flags.rect_drag_drop)
            return false;

        o.init_state.scale_x = o.init_state.scale_x || 1;
        o.init_state.offset = o.init_state.offset || [0, 0];
        // o.is_cropped = true;
        var happ = o.content_element.parent();
        o.content_element = $('<div class="crop_box">');
        o.img.appendTo(o.content_element);
        o.content_element.appendTo(happ);
        o.div_aspect = o.dims()[0] / o.dims()[1];
        o.layout();
        return true;
    };

    // TODO-cleanup: move to has_crop
    (function(){
        var drag_hold, fake_img, ref_offset, ref_dims, ref_scale_x;

        // UI for setting .offset of apps on drag after long_hold
        o.long_hold = function(ev){
            if(o != ev.data) return;
            if(o.has_full_bleed() && $(ev.target).hasClass("resize")) return;
            if(!o.init_state.scale_x) 
                if (!o.allow_crop()) return false;
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
        o.resize_end = function() {
            if(!drag_hold) 
                return _resize_end();
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
    })();

    var _layout = o.layout;
    o.max_height = function(){
        off = o.offset()[1] / env.scale();
        return o.dims_relative()[0] / o.aspect + off;
    }
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
        return [o.img.prop('naturalWidth'), o.img.prop('naturalHeight')];
    };

    function controls(o) {
        o.addControls($('#controls_image'));
        o.append_link_picker(o.div.find('.buttons'));
        o.div.find('.button.set_bg').click(function() {
            Hive.bg_change(o.app.state()) });
        return o;
    };
    o.make_controls.push(controls);

    Hive.App.has_rotate(o);
    Hive.App.has_opacity(o);

    o.img = $();
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
        function(){ history_point = env.History.saver(
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
        function(){ history_point = env.History.saver(
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
        u.append_color_picker(o.div.find('.drawer.fill'), o.app.fill_color, '#000000');

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
        var sf = env.scale();
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
        o.div.css('font-size', (env.scale() * o.scale()) + 'em');
        var height = o.div.find('.jp-interface').height();
        o.div.find('.jp-button').width(height).height(height);
    }

    o.load.add(function(){
        o.dims_set(o.dims());
        o.scale_set(o.dims()[1] / 35);
    });

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

    colored = o.div.find('.jp-play-bar, .jp-interface');
    if(!o.init_state.color) o.init_state.color = colors[23];

    o.update_shield();
    setTimeout(function(){ o.load(); }, 100);
    return o;
};
Hive.registerApp(Hive.App.Audio, 'hive.audio');


// TODO-refactor: move into app_modifiers

Hive.App.has_nudge = function(o){
    // TODO-bugbug: implement undo/redo of this. Because nudge is naturally
    // called repeatedly, this should create a special collapsable history
    // point that automatically merges into the next history point if it's the
    // same type, similar to History.begin + History.group
    o.keydown.add(function(ev){
        var nudge = function(dx, dy){
            return function(){
                var s = env.scale(), delta = u._mul(1/s)([dx, dy]);
                if(ev.shiftKey)
                    delta = u._mul(10)(delta);
                o.pos_relative_set(u._add(o.pos_relative())(delta));
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
    o.full_bleed_coord = o.full_coord = coord;
    o.stack_coord = 1 - o.full_coord;

    // To make the functionality removable, we check that we are indeed
    // full bleed
    o.has_full_bleed = function() { return (o.full_coord != undefined); };

    var _dims_relative_set = o.dims_relative_set,
        _pos_relative_set = o.pos_relative_set,
        _get_aspect = o.get_aspect,
        _resize_start = o.resize_start,
        _resize = o.resize,
        _resize_end = o.resize_end,
        push_apps;
    o.before_resize = function(){
        if (!env.gifwall || !o.has_full_bleed())
            return;
        o.dims_ref_set();
        env.History.change_start(true);
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
    };
    o.after_resize = function(){
        if (!env.gifwall || !o.has_full_bleed())
            return;
        env.History.change_end();
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
            pos[o.full_bleed_coord] = 0;
        }
        _pos_relative_set(pos);
    };
    o.dims_relative_set = function(dims, aspect) {
        if (o.has_full_bleed()) {
            if (aspect) {
                if (!o.full_bleed_coord)
                    aspect = 1 / aspect;
                dims[1 - o.full_bleed_coord] = 1000 * aspect;
            }
            dims[o.full_bleed_coord] = 1000;
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
    if (!env.gifwall && !context.flags.rect_drag_drop)
        return o;
    o.content_element.on('dragenter dragover dragleave', function(ev){
        // Handle drop highlighting.
        if (!env.gifwall && ev.type == "dragenter")
            o.highlight();
        else if (!env.gifwall && ev.type == "dragleave")
            o.highlight({on: false});
        ev.preventDefault();
    });

    var on_files = function(files){
        if (env.gifwall) {
            $("#media_upload").trigger('with_files', [files]);
            return;
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
            app = u.new_file(files, init_state,
                { load:load, position: true })[0];
        }
    };
    upload.drop_target(o.content_element, on_files, u.on_media_upload);
    return o;
};

Hive.App.has_resize = function(o) {
    var dims_ref, history_point;
    o.dims_ref_set = function(){ dims_ref = o.dims(); };
    o.resize_start = function(){
        if (o.before_resize) o.before_resize();
        $("#controls").hidehide();
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

        var snap_dist = u._apply(function(x,y) {return Math.abs(x-y);}, 
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
        u.set_debug_info("");
        $(".ruler").hidehide();
        var skip_history = false;
        if (o.after_resize) skip_history = o.after_resize();
        if (!skip_history) history_point.save();
    };
    o.resize_to = function(delta){
        return [ Math.max(1, dims_ref[0] + delta[0]), 
            Math.max(1, dims_ref[1] + delta[1]) ];
    };
    o.resize_to_pos = function(pos, doit) {
        var _pos = o.pos_relative();
        // TODO: allow snapping to aspect ratio (keyboard?)
        // TODO: set snap parameters be set by user
        if(!env.no_snap && !o.has_full_bleed()){
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
            o.c.resize_h.css({ left: dims[0] -18 + o.padding,
                top: Math.min(dims[1] / 2 - 18, dims[1] - 54) });
        }

        // Dragging behavior
        o.c.resize_h.drag('start', function(e, dd) {
                if (o.app.before_h_resize) o.app.before_h_resize();
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
    var scale = o.init_state.scale ? o.init_state.scale * env.scale() : 1;
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
                history_point = env.History.saver(o.app.angle, o.app.angle_set, 'rotate');
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
        function(){ history_point = env.History.saver(
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

        u.append_color_picker(o.c.color_drawer, o.app.color_set, o.app.color());
        var history_point;
        o.hover_menu(o.c.color, o.c.color_drawer, {
            auto_close: false,
            open: function(){ history_point = env.History.saver(o.app.color, o.app.color_set, 'color'); },
            close: function(){ history_point.save() }
        });
        return o;

    }
    o.make_controls.push(controls);
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
    }).on('response', function(ev, files){
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
        function(){ return $.extend(true, {}, env.Exp.background) },
        Hive.bg_set, 'change background'
    ).exec(s);
};

return Hive;

});
