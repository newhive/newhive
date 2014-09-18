define([
    'browser/jquery'
    ,'browser/js'
    ,'context'
    ,'ui/util'

    ,'./apps'
    ,'./env'
    ,'./util'
    ,'./events'

    ,'js!google_closure.js'
], function(
    $
    ,js
    ,context
    ,ui_util

    ,hive_app
    ,env
    ,u
    ,evs
){
var o = {}
    ,noop = function(){}
    ,asset = ui_util.asset
;

// Generic widgets for all App types. This objects is responsible for the
// selection border, and all the buttons surounding the App when selected, and for
// these button's behavior.  App specific behavior is added by
// hive_app.App.Foo.Controls function, and a list of modifiers in app.make_controls
o.Controls = function(app, multiselect, delegate) {
    if(app.controls) {
        // Check if existing controls are same type as requested
        if(app.controls.multiselect == multiselect) return;
        else app.controls.remove(); // otherwise destroy them and reconstruct requested type
    }
    var o = app.controls = {};
    var sel_app = app.sel_app()
    o.app = app;
    o.multiselect = multiselect;

    o.remove = function() {
        o.fixed_div.remove();
        app.controls = false;
    };

    o.append_link_picker = function(d, opts) {
        opts = $.extend({ open: noop, close: noop }, opts);
        var e = $("<div class='control drawer link'>");
        var cancel_btn = $("<img>").addClass('hoverable')
            .attr('src', asset('skin/edit/delete_app.png'))
            .attr('title', 'Clear link')
            // .css('margin', '12px 0 0 5px');
        var input = $('<input type="text">');

        d.append(e);
        // Protect the input in its own frame so it doesn't change the selection
        // of the current frame
        input_frame(input, e);
        e.append(cancel_btn);

        // set_link is called when input is blurred
        var set_link = function(){
            var v = input.val();
            if (v.match(/@\w+\.\w{2,}/)) {
                // Auto-add mailto:
                if (! v.match(/:/))
                    v = 'mailto:' + v;
            } else if (!v.match(/^\//) && !v.match(/\/\//) && v.match(/\w+\.\w{2,}/)) 
                // TODO: improve URL guessing.  
                // Auto-add http:// to urls
                v = 'http://' + v;
            o.app.link_set(v);
            env.History.saver(sel_app.link, sel_app.link_set, 'link image').exec(v);
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
        return c;
    };
    o.appendButton = function(c, klass) {
        klass = klass || "buttons"
        var buttons = o.div.find('.' + klass);
        if (buttons.length == 0)
            buttons = $('<div class="control ' + klass + '"></div>').appendTo(o.div);
        buttons.append(c);
        return c;
    }

    o.addControl = function(ctrls) { 
        return $($.map(ctrls.clone(false), o.appendControl)); };
    o.addButton = function(ctrls) { 
        return $($.map(ctrls.clone(false), function(x) {
            return o.appendButton(x) } )); };
    o.addTopButton = function(ctrls) { 
        return $($.map(ctrls.clone(false), function(x) {
            return o.appendButton(x, "top_buttons") } )); };
    o.addControls = function(ctrls) { 
        return $($.map(ctrls.clone(false).children(), o.appendControl)); };
    o.addButtons = function(ctrls) {
        $ctrls = ctrls.find(".control.buttons");
        if ($ctrls.length == 0)
            $ctrls = ctrls;
        return $($.map($ctrls.clone(false).children(), function (x) {
            o.appendButton(x) } )); };
    o.hover_menu = function(handle, drawer, opts) {
        return u.hover_menu(handle, drawer, $.extend({
            auto_height: false, offset_y: 5 }, opts))
    };
    o.single = function() {
        return (env.Selection.count() == 1) ? o.app.sel_app() : false }

    o.padding = 12;
    o.border_width = 5;
    var pad_ul = [45, 55], pad_br = [45, 120], min_d = [135, 40];
    if(multiselect){
        pad_ul = [3, 3];
        pad_br = [3, 3];
        min_d = [1, 1];
        o.padding = 1;
        if (!env.gifwall)
            o.border_width = 2;
    }
    pad_ul = $.map(pad_ul, function(x) { return Math.max(x, o.border_width) });
    pad_br = $.map(pad_br, function(x) { return Math.max(x, o.border_width) });
    var pos_dims = function(){
        // TODO-bugbug-border-push:
        //    * Can still be pushed off screen with really small apps 
        //    * Add scroll height when pushed from bottom to prevent
        //      overlap of controls with app content
        // TODO-polish-border-push:
        //    * Maybe make pushed border segments dashed
        // Maybe ditch border pushing entirely. Not convinced it's worth it
        var ap = u._add(app.pos(), env.offset), // add zoom offset
            // win = $(window), wdims = [win.width(), win.height()],
            wdims = env.win_size,
            pos = [ Math.max(pad_ul[0] + env.scrollX, ap[0]), 
                Math.max(pad_ul[1] + env.scrollY, ap[1]) ],
            ad = app.dims(),
            dims = [ ap[0] - pos[0] + ad[0], ap[1] - pos[1] + ad[1] ];
        if(dims[0] + pos[0] > wdims[0] + env.scrollX - pad_br[0])
            dims[0] = wdims[0] + env.scrollX - pad_br[0] - pos[0];
        if(dims[1] + pos[1] > wdims[1] + env.scrollY - pad_br[1])
            dims[1] = wdims[1] + env.scrollY - pad_br[1] - pos[1];

        var minned_dims = [ Math.max(min_d[0], dims[0]),
            Math.max(min_d[1], dims[1]) ];
        var delta_dir = [ ap[0] < 0 ? 0 : -1, ap[1] < 0 ? 0 : -1 ];
        if(env.gifwall && !o.multiselect) {
            pos[1] = Math.max(pad_ul[1], ap[1]);
            dims[1] = ap[1] - pos[1] + ad[1];
            minned_dims = dims.slice();
        }
        pos = u._add(pos)(u._mul(delta_dir)(u._sub(minned_dims)(dims)))
        pos = [ Math.max(pad_ul[0] + env.scrollX, pos[0]), 
            Math.max(pad_ul[1] + env.scrollY, pos[1]) ],
        pos = u._sub(pos, env.offset) // remove zoom offset

        return { pos: pos, dims: minned_dims };
    };
    o.pos = function(){ return pos_dims().pos };
    o.dims = function(){ return pos_dims().dims };

    o.layout = function() {
        // Fix parent layout if needed
        var posdims = pos_dims(), pos = posdims.pos, dims = posdims.dims,
            ap = app.pos(),
            cx = dims[0] / 2, cy = dims[1] / 2, p = o.padding,
            bw = o.border_width, outer_l = -cx -bw - p,
            outer_width = dims[0] + bw*2 + p*2, outer_height = dims[1] + p * 2 + 1;

        u.inline_style(o.fixed_div[0], { left: ap[0], top: ap[1] })
        u.inline_style(o.div[0], { left: pos[0] - ap[0], top: pos[1] - ap[1] })

        u.inline_style(o.select_box[0], { left: cx, top: cy });
        u.inline_style(o.select_borders[0], { left: outer_l,
            top: -cy -bw -p, width: outer_width, height: bw }); // top
        u.inline_style(o.select_borders[1], { left: cx + p,
            top: -cy -p - bw + 1, height: outer_height + bw * 2 -2, width: bw }); // right
        u.inline_style(o.select_borders[2], { left: outer_l,
            top: cy + p, width: outer_width, height: bw }); // bottom
        u.inline_style(o.select_borders[3], { left: outer_l,
            top: -cy -p - bw + 1, height: outer_height + bw * 2 -2, width: bw }); // left
        if(o.multiselect) return;

        //o.c.undo   .css({ top   : -38 - p, right  :  61 - p });
        o.c.help   .css({ left: dims[0] - 76 + p, top: -38 - p });
        o.c.copy   .css({ left: dims[0] - 45 + p, top: -38 - p });
        o.c.remove .css({ left: dims[0] - 14 + p, top: -38 - p });

        o.c.stack  .css({ left: dims[0] - 78 + p, top: dims[1] + 8 + p });
        o.c.buttons.css({ left: -bw - p, top: dims[1] + p + 10,
            width: dims[0] - 60 });
        o.c.top_buttons.css({ left: -bw - p, top: -38 - p, width: dims[0] - 60 });
    };

    o.fixed_div = $('<div>').addClass('fixed_controls').appendTo("#controls");
    o.div = $('<div>').addClass('controls').appendTo(o.fixed_div);

    // add borders
    o.select_box = $("<div style='position: absolute'>");
    var border = $('<div>').addClass('select_border drag');
    o.select_borders = border.add(border.clone().addClass('right'))
        .add(border.clone().addClass('bottom'))
        .add(border.clone().addClass('left'));
    border.eq(0).addClass('top'); // add 'top' class after the others were cloned
    // TODO-refactor replace with evs.on
    evs.on(o.select_borders, 'dragstart', o.app)
        .on(o.select_borders, 'drag', o.app)
        .on(o.select_borders, 'dragend', o.app);
    o.div.append(o.select_box.append(o.select_borders));
    o.select_box.click(function(){
        var app = o.single()
        if(app)
            app.unfocus();
    });

    if(o.multiselect && o.app.angle)
        o.select_box.rotate(o.app.angle());

    if (!multiselect) {
        o.addControls($('#controls_common'));
        var d = o.div;
        o.c = {};
        //o.c.undo    = d.find('.undo'   );
        o.c.help  = d.find('.help' );
        o.c.remove  = d.find('.remove' );
        o.c.resize  = d.find('.resize' );
        o.c.stack   = d.find('.stack'  );
        o.c.remove.click(function(){
            o.app.remove();
            env.layout_apps() // in case scrollbar visibility changed
        });
        o.c.help.click(function(){
            env.main.help_selection()
        })
        o.c.copy    = d.find('.copy'   );
        o.c.copy.click(function(){
            var copy = o.app.copy({ load: function(a){
                env.Selection.select(a);
            } });
        });
        if (env.copy_table) {
            var ref_copy;
            const copy_grid = 30;
            var grid_size = function(offset) {
                var round = function(x) {
                    return Math.max(1, Math.ceil(x));
                }
                offset = u._sub(offset)(ref_copy);
                offset = u._div(offset)([copy_grid, -copy_grid]);
                offset = offset.map(round, offset)
                return offset;
            };
            o.c.copy.on('dragstart', function(ev) {
                ref_copy = [ev.clientX, ev.clientY];
            })
            .on('drag', function(ev) {
                var grid = grid_size([ev.clientX, ev.clientY]);
                d.find($(".copy_copy")).remove();
                var copy = d.find(".copy");
                var left = parseFloat(copy.css("left"));
                var top = parseFloat(copy.css("top"));
                for (var x = 0; x < grid[0]; ++x) {
                    for (var y = 0; y < grid[1]; ++y) {
                        if (x == 0 && y == 0)
                            continue;
                        var $el = copy.clone();
                        $el.addClass("copy_copy")
                            .css("left", left + x*copy_grid)
                            .css("top", top - y*copy_grid)
                            .appendTo(d);
                    }
                }
            })
            .on('dragend', function(ev) {
                var grid = grid_size([ev.clientX, ev.clientY]);
                d.find($(".copy_copy")).remove();
                var count = grid[0] * grid[1] - 1;
                copy_list = [o.app];
                if (o.app.elements)
                    copy_list = o.app.elements();
                var padding = [env.padding(), env.padding()];
                var grid_dims = u._add(padding)(u._mul(1/env.scale())(o.app.dims()));
                env.History.begin();
                for (var x = 0; x < grid[0]; ++x) {
                    for (var y = 0; y < grid[1]; ++y) {
                        if (x == 0 && y == 0)
                            continue;
                        var copy = o.app.copy({
                            offset: u._mul([x, y])(grid_dims),
                            load: function(){
                                if (! --count)
                                    env.Selection.select(copy_list);
                            } });
                        if (copy.concat)
                            copy_list = copy_list.concat(copy)
                        else
                            copy_list.push(copy);
                    }
                }
                env.Selection.select(copy_list);
                env.History.group('copy grid');
            });
        }
        d.find('.stack_up').click(o.app.stack_top);
        d.find('.stack_down').click(o.app.stack_bottom);

        $.map(o.app.make_controls, function(f){ f(o) });

        o.c.buttons = d.find('.buttons');
        o.c.top_buttons   = d.find('.top_buttons'  );
        d.find('.hoverable').each(function(i, el){ ui_util.hoverable($(el)) });
    }

    o.layout();
    return o;
};

var input_frame = function(input, parent, opts){
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

return o.Controls;
})
