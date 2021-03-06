"use strict";
define([
    'jquery'
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
    var sel_app = env.Selection.single(app)
    o.app = app;
    o.multiselect = multiselect;

    o.remove = function() {
        o.fixed_div.remove();
        app.controls = false;
    };

    // TODO: should be a has_link_picker, and should have stringjay HTML instead
    // of hardcoded.
    o.append_link_picker = function(d, opts) {
        opts = $.extend({ open: noop, close: noop }, opts);
        var $drawer = $('<div>').addClass('control drawer').appendTo(d)
            ,$input = $('<input type="text" placeholder="link">')
            // Protect the input in its own frame so it doesn't change the
            // selection of the current frame
        input_frame($input, $drawer, opts)

        // set_link is called when input is blurred
        var set_link = function(){
            var v = normalize_anchor_text( $input.val() )

            sel_app.link_set(v);
            env.History.begin()
            env.History.saver(sel_app.link, sel_app.link_set, 'link').exec(v);
            // http://stackoverflow.com/questions/566276/what-two-separator-characters-would-work-in-a-url-anchor
            // We allow "?" and "&" to replace query params

            // Link name set hack
            // v = input_name.val().trim().replace(/[^a-zA-Z0-9_.\-&?=]/g,"_")
            // if (sel_app.link_name) {
            //     env.History.saver(sel_app.link_name, sel_app.link_name_set, 
            //     'link name').exec(v);
            // }

            env.History.group("link")
        }

        // Don't have to worry about duplicating handlers because all elements
        // were just created from scratch
        $input.on('blur', set_link)

        var menu = o.hover_menu(d.find('.button.link'), $drawer, {
            open: function() {
                opts.open()
                $input.val( attrs_to_string(sel_app.link()) )
                $input.focus()
             }
            ,click_persist: $input
            ,close: function() {
                $input.blur();
                opts.close();
            }
            ,auto_close: false
        });

        // timeout needed to get around firefox bug
        var close_on_delay = function(){
            setTimeout(function(){
                menu.close(true) }, 0);
        }
        $input.keypress(function(e){
            if(e.keyCode == 13) {
                close_on_delay() }
        })

        return menu

        function normalize_anchor_text(v){
            if(v.match(/^\s*$/)) return false
            var no_href = v.match(/^\w+\s*=/)
                ,el = $('<a ' + (no_href ? '' : 'href=') + v +'>')
                ,attrs = u.attrs(el[0])
            if(attrs.href) attrs.href = normalize_href(attrs.href)
            return attrs
        }

        function attrs_to_string(v){
            return (v.href ? [v.href] : []).concat( $.map(v, function(v,k){
                if(k == 'href') return
                v.replace("'", '&#39;')
                if(v.match(/ |"/)) v = "'"+ v +"'"
                return k +'='+ v
            }) ).join(' ')
        }

        function normalize_href(v){
            if( v.match(/@\w+\.\w{2,}/) ){ // sorta like an email?
                // Auto-add mailto:
                if (! v.match(/:/))
                    v = 'mailto:' + v;
            } else if (
                !v.match(/^\//) // not absolute server path
                && !v.match(/\/\//) // not protocol relative
                && v.match(/\w+\.\w{2,}/) // ends with top level domain?
            ){
                // TODO: improve URL guessing.
                // Auto-add http:// to URLs
                v = 'http://' + v;
            }

            return v
        }
    }

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
        var $ctrls = ctrls.find(".control.buttons");
        if ($ctrls.length == 0)
            $ctrls = ctrls;
        return $($.map($ctrls.clone(false).children(), function (x) {
            o.appendButton(x) } )); };
    o.hover_menu = function(handle, drawer, opts) {
        return u.hover_menu(handle, drawer, $.extend({
            auto_height: false, offset_y: 5 }, opts))
    };
    o.single = function() {
        if (env.Selection.count() == 1)
            return sel_app //o.app.sel_app()
        return false
    }

    o.padding = 9;
    o.border_width = 5;
    // pad is the amount space borders need from window edges
    var pad_ul = [10, 10], pad_br = [10, 75], min_d = [146, 40],
        edit_btns_padding = 128
    if(multiselect){
        pad_ul = [3, 3]
        pad_br = [3, 3]
        min_d = [1, 1]
        o.padding = 1
        if( context.flags.Editor.merge_minis ){
            o.border_width = 3
            if( o.multiselect < 0 ){
                o.padding += 3
            }
        }else {
            o.border_width = 2
        }
    }
    var pos_dims = function(){
        // border pushing moves nearest border of off-viewport apps to within
        // pad_url / pad_br distance form edge
        var ap = u._add(app.pos(), env.offset) // add zoom offset
            ,wdims = env.win_size
            ,ad = app.dims()

        // if content escapes viewport to the NW, push SE borders back into viewport
        if( ap[0] + ad[0] < pad_ul[0] )
            ap[0] += pad_ul[0] - ap[0] - ad[0]
        if( ap[1] + ad[1] < pad_ul[1] )
            ap[1] += pad_ul[1] - ap[1] - ad[1]

        // if content escapes viewport to the SE, push NW borders back into viewport
        if( wdims[0] + env.scroll[0] - ap[0] < pad_br[0] )
            ap[0] -= pad_br[0] - (wdims[0] + env.scroll[0] - ap[0])
        // push up-left if past bottom-right
        if( wdims[1] + env.scroll[1] - ap[1] < pad_br[1] )
            ap[1] -= pad_br[1] - (wdims[1] + env.scroll[1] - ap[1])

        // if content editing buttons escape viewport to the S, while content is
        // still visible, push bottom border back up so the buttons can be used
        // without scrolling. In this case, make sure height is added to the
        // controls to allow to scroll down such that the buttons do not overlap
        // the content
        if( (ap[1] + ad[1] > wdims[1] + env.scroll[1]) &&
            (ap[1] < wdims[1] + env.scroll[1] - edit_btns_padding)
        ){
            var old_ad1 = ad[1]
            ad[1] = wdims[1] + env.scroll[1] - edit_btns_padding - ap[1]
        }

        ad = u._max(min_d, ad)

        return { pos: ap, dims: ad }
    }
    o.pos = function(){ return pos_dims().pos }
    o.dims = function(){ return pos_dims().dims }

    o.layout = function() {
        // Fix parent layout if needed
        var posdims = pos_dims(), pos = posdims.pos, dims = posdims.dims,
            ap = app.pos(),
            cx = dims[0] / 2, cy = dims[1] / 2, p = o.padding,
            bw = o.border_width, outer_l = -cx -bw - p,
            outer_width = dims[0] + bw*2 + p*2,
            outer_height = dims[1] + p * 2 + 1
        ;

        u.inline_style(o.fixed_div[0], { left: ap[0], top: ap[1] })
        u.inline_style(o.div[0], { left: pos[0] - ap[0], top: pos[1] - ap[1] })

        u.inline_style(o.select_box[0], { left: cx, top: cy });
        u.inline_style(o.select_borders[0], { left: outer_l,
            top: -cy -bw -p, width: outer_width, height: bw }); // top
        u.inline_style(o.select_borders[1], { left: cx + p,
            top: -cy -p - bw + 1, height: outer_height + bw * 2 -2,
            width: bw }); // right
        u.inline_style(o.select_borders[2], { left: outer_l,
            top: cy + p, width: outer_width, height: bw }); // bottom
        u.inline_style(o.select_borders[3], { left: outer_l,
            top: -cy -p - bw + 1, height: outer_height + bw * 2 -2,
            width: bw }); // left
        if(o.multiselect) return;

        //o.c.undo   .css({ top   : -38 - p, right  :  61 - p });
        o.c.ne.css({ left: dims[0] - 46 + p, top: -42 - p, width: 100 })
        // o.c.help   .css({ left: dims[0] - 76 + p, top: -38 - p });
        // o.c.copy   .css({ left: dims[0] - 45 + p, top: -38 - p });
        // o.c.remove .css({ left: dims[0] - 14 + p, top: -38 - p });

        o.c.stack.css({ left: dims[0] - 46 + p, top: dims[1] + 17 + p });
        o.c.buttons.css({ left: -bw - p - 3, top: dims[1] + p + 14,
            width: dims[0] - 30, height: edit_btns_padding })
        o.c.top_buttons.css({ left: -bw - p - 3, top: - 43 - p,
            width: dims[0] - 60 });
    };

    o.fixed_div = $('<div>').addClass('fixed_controls').appendTo("#controls");
    o.div = $('<div>').addClass('controls').appendTo(o.fixed_div);

    // add borders
    o.select_box = $("<div style='position: absolute'>");
    var border = $('<div>').addClass('select_border drag');
    if (context.flags.Editor.merge_minis) {
        if (o.multiselect < 0) border.addClass('single_other')
        else if (o.multiselect > 1) border.addClass('single')
    }
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
        o.c.ne      = d.find('.controls_ne' );
        o.c.help    = d.find('.help' );
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
            var copy = o.app.copy({ select_copy: 1 });
        });
        if (env.copy_table) {
            var ref_copy;
            var copy_grid = 30; //! constant
            var grid_size = function(offset) {
                var round = function(x) {
                    x = Math.ceil(x)
                    return (x > 0) ? x : x - 1
                    // return Math.max(1, Math.ceil(x));
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
                var grid_sizes = grid_size([ev.clientX, ev.clientY]);
                var grid = grid_sizes.map(Math.abs)
                var grid_dir = grid_sizes.map(u._sign)
                var $copy = o.c.copy
                var $parent = $copy.parent()
                $parent.find($(".copy_copy")).remove();
                var bounds = $copy[0].getBoundingClientRect()

                for (var x = 0; x < grid[0]; ++x) {
                    for (var y = 0; y < grid[1]; ++y) {
                        if (x == 0 && y == 0)
                            continue;
                        var $el = $copy.clone();
                        $el.addClass("copy_copy").css({
                            "left": bounds.left + x*copy_grid*grid_dir[0]
                            ,"top": bounds.top - y*copy_grid*grid_dir[1]
                            ,"position": "fixed"
                        })
                        .appendTo($parent);
                    }
                }
            })
            .on('dragend', function(ev) {
                var grid_sizes = grid_size([ev.clientX, ev.clientY]);
                var grid = grid_sizes.map(Math.abs)
                var grid_dir = grid_sizes.map(u._sign)
                d.find($(".copy_copy")).remove();
                var count = grid[0] * grid[1] - 1;
                if (count == 0)
                    return
                var copy_list = [o.app];
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
                            offset: u._mul([x, -y], grid_dir, grid_dims),
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
        d.find('.stack_up').click(o.app.stack_top_click);
        d.find('.stack_down').click(o.app.stack_bottom_click);

        $.map(o.app.make_controls, function(f){ f(o) });

        o.c.buttons = d.find('.buttons');
        o.c.top_buttons   = d.find('.top_buttons'  );
        d.find('.hoverable').each(function(i, el){ ui_util.hoverable($(el)) });
    }

    o.layout();
    return o;
};

var input_frame = function(input, parent, opts){
    opts = $.extend({width: 200, height: 44}, opts)

    var frame_load = function(){
        if(!frame[0].contentWindow) return
        frame.contents().find('body')
            .append(input)
            .css({'margin': 0, 'overflow': 'hidden'})
    }
    var frame = $('<iframe>').load(frame_load)
        .width(opts.width).height(opts.height)
    parent.append(frame)
    input.css({
        'border': '5px solid hsl(164, 57%, 74%)',
        'width': '100%',
        'padding': '5px',
        'font-size': '17px'
    })
    return frame
};

return o.Controls;
});
