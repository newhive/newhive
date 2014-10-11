define([
    'browser/jquery'
    ,'ui/util'
    ], function($, util){

function noop(){}

var mobile_opts = { hover: false, hover_close: false };

var menu = function(handle, drawer, options) {
    var handle = $(handle), drawer = $(drawer), o = { handle : handle, drawer : drawer },
        menu_items = drawer.find('.menu_item'), close_timer = false,
        opts = $.extend({
             open: noop // should be called 'opened'
            ,close: noop
            ,open_menu: function(){ drawer.showshow() }
            ,close_menu: function(){ drawer.hidehide() }
            ,sticky: false
            ,hover_close: true
            ,open_delay: 0
            ,close_delay: 500
            ,offset_y: 10
            ,offset_x: 10
            ,focus_persist: true
            ,hover: true
            ,open_condition: function(){ return true; }
            ,close_condition: function(){ return true; }
            ,auto_height: true
            ,default_item: drawer.find('.menu_item.default')
            ,layout: 'bottom'
            ,layout_x: 'auto'
            ,min_y: 0
            ,group: menu
            ,animate_close: false
            ,animate_open: false
            ,opened: false
        }, options);
    if (util.mobile()) 
        $.extend(opts, mobile_opts);
    if(!handle.length)
        throw("menu has no handle");
    if(!drawer.length)
        throw("menu has no drawer");
    if(!opts.group) opts.group = { menus: [] };

    o.menus = [];
    o.opened = opts.opened;
    o.sticky = opts.sticky;
    drawer.data('menu', o);
    handle.data('menu', o);
    // TODO: make this more sofisticated
    var html_opts = drawer.attr("data-menu-opts");
    if (html_opts) {
        $.extend(opts, JSON.parse("{"+html_opts+"}"))
    }

    o.delayed_close = function(close_parent){
        opts.default_item.removeClass('active');
        if(close_parent && opts.group.delayed_close){
            opts.group.delayed_close(true);
        }
        if(opts.hover_close && !close_timer){
            close_timer = setTimeout(o.close, opts.close_delay);
        }    
    };
    o.cancel_close = function(){
        if(opts.group.cancel_close){ 
            opts.group.cancel_close();
        }
        if(close_timer) {
            clearTimeout(close_timer);
            close_timer = false;
        }
    };

    // for debugging
    o.opts = function(){ return opts };
    o.drawer = function(){ return drawer };

    o.close = function(force) {
        clearTimeout(close_timer);
        close_timer = false;
        if(!opts.close_condition()) return;
        $.map(o.menus, function(m){ m.close(force) });
        if(!o.opened) return;

        if(!force && o.sticky) return;

        o.do_close();

        o.opened = false;
        opts.close();
        handle.data('busy', false);
        handle.removeClass('active');
        // Unset the handler if all menus are closed
        if (!o.menus.filter(function(m) { return m.opened; } ).length) {
            menu.remove_menu_shield();
        }

        return o;
    }

    o.do_open = function() {
        if(opts.animate_open) drawer.animate(opts.animate_open, 100);
        else opts.open_menu();
    };
    o.do_close = function() {
        if (opts.auto_height)
            drawer.css("max-height", "none");
        if(opts.animate_close){
            if(!opts.animate_open){
                opts.animate_open = {};
                for(var p in opts.animate_close) opts.animate_open[p] = drawer.css(p);
            }
            drawer.animate(opts.animate_close, 100);
        }
        else opts.close_menu();
    };

    o.open = function() {
        if(menu.disabled || ! opts.open_condition() ||
            (menu.from_hover && menu.no_hover)) return;
        handle.addClass('active');
        opts.default_item.addClass('active');
        o.cancel_close();
        if(o.opened) return;

        o.opened = true;
        if(!shield_handler) {
            menu.set_menu_shield();
        }

        if( opts.group.current && (opts.group.current != o) )
            opts.group.current.close(true);
        opts.group.current = o;
        handle.data('busy', true);

        if(drawer.children().length == 0) {
            o.children_empty = true;
        } else {
            o.children_empty = false;
            o.do_open();
        }

        if (util.mobile()) {
            drawer.css("transform", "scale(2)");
            drawer.css("transform-origin", "0 0");
        }
        if(opts.layout) o.layout();

        opts.open();

        return o;
    };

    o.layout = function(){
        // if drawer emptiness changed, display or hide it here.
        var children_empty = (drawer.children().length == 0);
        if (children_empty != o.children_empty) {
            o.children_empty = children_empty;
            if (children_empty) o.do_close(); 
            else o.do_open();
        }

        if (!children_empty && drawer.hasClass("icon_set")) {
            var icon_x = 60; //drawer.children().eq(0).children().width();
            var count_children = drawer.children().length;
            var size = 1;
            for (; size < 4 && count_children > (size*size); size++) {}
            // -10 for padding.
            drawer.width(((count_children > 20) ? 20 : 0) + 5 + size*icon_x);
            drawer.css("overflow-y", (count_children > 20) ? "scroll" : "hidden");
        }

        // find handle position relative to positioning of drawer
        var hp;
        if(handle.offsetParent().is(drawer.offsetParent())){
            hp = handle.position();
        } else {
            hp = handle.offset();
            if(drawer.css('position') == 'fixed'){
                hp.left -= window.scrollX;
                hp.top -= window.scrollY;
            }
        }

        var css_opts = {};
        var z_index = "auto";
        el = handle;
        var z_index_latch = 0;
        while (el.length && ! (z_index_latch > 0)) {
            z_index = el.css("z-index");
            z_index_latch = parseInt(z_index) + 1;
            el = el.parent();
        }
        if (z_index_latch > 0)
            css_opts['z-index'] = z_index_latch;
        // special stuff for activity menu. Belongs in template file
        // as special attributes
        if (drawer.is("#activity_menu")) {
            opts.auto_height = true;
            // opts.offset_y = (95 - handle.outerHeight()) / 2;
            opts.offset_y = 0;
        } else if (drawer.is(".category_hover")) {
            var $header = $(".main-header .header")
                , bounds = $header[0].getBoundingClientRect()
            $.extend(css_opts, {
                width: bounds.width,
                left: bounds.left,
                right: bounds.right,
                top: bounds.bottom + opts.offset_y,
            })
            drawer.css(css_opts)
            return
        }

        d_size = drawer[0].getBoundingClientRect();
        // pick top of menu based on if menu would go past bottom of
        // window if below handle, or above top of window if above the handle
        if(opts.layout_x == 'submenu'){
            css_opts.left = hp.left + handle.outerWidth() + opts.offset_x;
            if(opts.layout == 'left')
                css_opts.left = hp.left - opts.offset_x - drawer.outerWidth();

            css_opts.top = hp.top - d_size.height + opts.offset_y
                + handle.outerHeight();
            //!! HACK for activity when in header
            var open_menus = menu.menus.filter(function(m) { return m.opened; })
            if (open_menus.length && open_menus[0].handle.parents(".main-header")
                && ! open_menus[0].handle.is(".overlay"))
                css_opts.top = hp.top + opts.offset_y;
        }
        else if(opts.layout == 'bottom' || opts.layout == 'top'){
            var oy = handle.outerHeight() + opts.offset_y
                , win_bottom = $(window).height() + window.scrollY
                , layout = opts.layout
            if (handle.offset().top + oy + d_size.height > win_bottom)
                layout = 'top'
            if (handle.offset().top - opts.offset_y - d_size.height < window.scrollY)
                layout = 'bottom'
            css_opts.top = (layout == 'top')
                ? hp.top - d_size.height - opts.offset_y : hp.top + oy;

            var layout_x = opts.layout_x;
            if( layout_x == 'auto' ) {
                var drawer_right = handle.offset().left + d_size.width;
                var window_right = $(window).width() + window.scrollX;
                layout_x = (drawer_right > window_right) ? 'right' : 'left';
            }
            css_opts.left = ( layout_x == 'right' ?
                hp.left - d_size.width + handle.outerWidth() : hp.left );
            if (opts.layout_x == "center")
                css_opts.left += (handle.outerWidth() - d_size.width) / 2;

            // TODO-polish: check that the menu still fits on window
            // Namely, shift it into screen at the bottom of code
            if (drawer.hasClass("icon_set")) {
                css_opts.left -= (d_size.width - handle.outerWidth()) / 2;
                // TODO-cleanup: Should prolly have option for force upward layout.
                css_opts.top = hp.top - d_size.height - opts.offset_y;
            }
        }
        else if( opts.layout == 'center_y' ){
            css_opts.top = Math.max(opts.min_y, hp.top + handle.outerHeight() / 2 -
                 d_size.height / 2);
            css_opts.left = hp.left - opts.offset_x - d_size.width;
        }

        var margin_y = 50;
        if(opts.auto_height) {
            var scroller = drawer.find('.items');
            if (! scroller.length)
                scroller = drawer
            if(css_opts.top + d_size.height > $(window).height()) {
                scroller.css('max-height', $(window).height() - margin_y - css_opts.top -
                    (d_size.height - scroller.outerHeight()));
            } else if (css_opts.top < margin_y) {
                drawer.css("max-height", d_size.height + css_opts.top - margin_y)
                css_opts.top = 50;
            }
        }

        drawer.css(css_opts);
    };

    opts.group.menus.push(o);

    if(opts.hover) {
        handle.on('mouseover', null, { delay: opts.open_delay }, function(ev) {
            menu.from_hover = true; o.open(ev); menu.from_hover = true; })
            .on('mouseleave', function(){ o.delayed_close(false) });
        drawer.mouseenter(o.cancel_close)
            .mouseleave(function(){ o.delayed_close(true) })
            .mousemove(o.cancel_close)
    }
    menu_items.each(function(i, el) {
        $(el).bind_once_anon("click.menu", function(ev) {
            menu.last_item = $(el)
        })
    })
    // TODO: The correct behavior is to close_all iff item is not handle.
    // If item is handle, it should toggle open/closed state.
    $(drawer).find("a")
        .unbind('click').on("click", function(ev) { 
            menu.close_all(); 
        } );
    handle.unbind('click').click(function(){
        if(opts.default_item.length && opts.hover) {
            menu.close_all();
            opts.default_item.click();
        } else if (o.opened && !opts.hover_close) {
            o.close();
        } else {
            o.open();
        }
    });
    if(opts.focus_persist){
        drawer.find('input[type=text],input[type=password],textarea').on('click keydown', function(){
            o.sticky = true;
        }).on('blur', function(ev){
            o.sticky = false;
            if ($(ev.target).closest(".drawer").length == 0)
                o.delayed_close(true);
        }).on('focus', o.cancel_close);
        drawer.mousedown(function(){ setTimeout(o.cancel_close, 1) });
    }

    menu_items.each(function(i, d){
        if (!opts.no_item_hover) {
            var e = $(d);
            e.mouseover(function(){ e.addClass('active'); });
            e.mouseout(function(){ e.removeClass('active'); });
        }
    });

    return o;
}

var global_handler = function(name, handler) {
    var bodyEle = $("body").get(0);
    if(bodyEle.addEventListener) {
        bodyEle.addEventListener(name, handler, true);
    } else if(bodyEle.attachEvent) {
        handler = function(){
            var event = window.event;
            handler(event)
        };
        document.attachEvent("on" + name, handler)
    }
    return handler
}
var global_handler_off = function(name, handler) {
    var bodyEle = $("body").get(0);
    if(bodyEle.removeEventListener) {
       bodyEle.removeEventListener(name, handler, true);
    } else if(bodyEle.detachEvent) {
       document.detachEvent("on" + name, handler);
    }
}

var shield_handler = null;
menu.set_menu_shield = function() {
    shield_handler = global_handler("click", function(ev) {
        if ($(ev.target).closest(".drawer").length == 0)
            menu.close_all()    
    })
}
menu.remove_menu_shield = function() {
    global_handler_off("click", shield_handler)
    shield_handler = null;
}
menu.close_all = function() {
    $.each(menu.menus, function(i,m) { m.close(true); } )
}
menu.menus = [];

return menu;

});
