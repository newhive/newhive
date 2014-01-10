define([
    'browser/jquery'
    ,'browser/js'
    ,'server/context'
    ,'browser/upload'
    ,'ui/util'

    ,'./env'
    ,'./util'
    ,'./events'

    ,'js!google_closure.js'
    // ,'./app_modifiers'
], function(
    $
    ,js
    ,context
    ,upload
    ,ui_util

    ,env
    ,u
    ,evs
    // ,app_has
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

    o.pos = function(){
        var s = env.scale();
        return [ _pos[0] * s, _pos[1] * s ];
    };
    o.pos_set = function(pos){
        var s = env.scale();
        _pos = [ pos[0] / s, pos[1] / s ];
        o.layout();
    };
    o.dims = function() {
        var s = env.scale();
        return [ _dims[0] * s, _dims[1] * s ];
    };
    o.dims_set = function(dims){
        var s = env.scale();
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
    evs.on(o.div, 'dragstart', o).on(o.div, 'drag', o).on(o.div, 'dragend', o)
        .on(o.div, 'click', o).long_hold(o.div, o);
 
    o.type(o); // add type-specific properties
    o.apps.add(o); // add to apps collection

    return o;
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
            Hive.showDialog(dia, {
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
        o.div.css('font-size', (env.scale() * o.scale()) + 'em');
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
        env.History.save(exec_cmd('+undo'), exec_cmd('+redo'), 'edit');
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

        o.color_picker = u.append_color_picker(
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
    o.content_element.attr('id', u.random_str()).addClass('text_content_element');
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
        o.div.find('.button.set_bg').click(function() { Hive.bg_change(o.app.state()) });
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
    o.full_bleed_coord = coord;
    var dims = o.dims_relative();
    dims[coord] = 1000;
    o.dims_relative_set(dims);

    o.orig_pos_set = o.pos_set;
    o.orig_move_start = o.move_start;
    o.orig_move_end = o.move_end;

    o.move_start = function() {
        env.History.begin();

        o.orig_move_start();
        o.padding = 10; // Scale into screen space?
        o.size = o.dims()[1 - o.full_bleed_coord];//o.size || 200;
        o.start_pos = o.pos()[1 - o.full_bleed_coord] - o.padding;
        o.apps = Hive.Apps.all().filter(function(app) {
            return !(app.id == o.id || env.Selection.selected(app));
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
        env.History.group('full-bleed move');
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
    });

    var on_files = function(files){
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
    };
    upload.drop_target(o.content_element, on_files, u.on_media_upload);

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
        dims = u._div(dims)(env.scale());
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
        history_point.save();
        $(".ruler").hidehide();
    };
    o.resize_to = function(delta){
        return [ Math.max(1, dims_ref[0] + delta[0]), 
            Math.max(1, dims_ref[1] + delta[1]) ];
    };
    o.resize_to_pos = function(pos, doit) {
        var _pos = o.pos_relative();
        // TODO: allow snapping to aspect ratio (keyboard?)
        // TODO: set snap parameters be set by user
        if(!Hive.no_snap){
            var tuple = [];
            tuple[0] = [undefined, undefined, pos[0]];
            tuple[1] = [undefined, undefined, pos[1]];
            excludes = {};
            excludes[o.id] = true;
            pos = u.snap_helper(tuple, {
                exclude_ids: excludes,
                snap_strength: .5,
                snap_radius: 10, });
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
            o.c.resize_h.css({ left: dims[0] -18 + o.padding,
                top: Math.min(dims[1] / 2 - 18, dims[1] - 54) });
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


return Hive;

});