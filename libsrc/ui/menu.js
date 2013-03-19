(function(){

var menu = function(handle, drawer, options) {
    var handle = $(handle), drawer = $(drawer), o = { handle : handle, drawer : drawer },
        menu_items = drawer.find('.menu_item'), close_timer = false,
        opts = $.extend({
             open: noop
            ,close: noop
            ,open_menu: function(){ drawer.show() }
            ,close_menu: function(){ drawer.hide() }
            ,sticky: false

            // auto_close should be deprecated, it's never set to true in our project @2012-08-12
            ,auto_close: false

            // auto_close_delay is the amount of time after which the menu
            // closes on its own if the user doesn't trigger open or close
            // through any mouse action, assuming `opened` is set to true
            ,auto_close_delay: 0

            ,hover_close: true
            ,open_delay: 100
            ,close_delay: 500
            ,offset_y: 8
            ,offset_x: 8
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
        }, options)
    ;
    if(!handle.length) throw("menu has no handle");
    if(!drawer.length) throw("menu has no drawer");
    if(!opts.group) opts.group = { menus: [] };

    o.menus = [];
    o.opened = opts.opened;
    o.sticky = opts.sticky;

    o.delayed_close = function(close_delay) {
            if(typeof(close_delay) != 'number') close_delay = false;
        opts.default_item.removeClass('active');
        if(opts.hover_close && ! close_timer) {
            close_timer = setTimeout(o.close, close_delay || opts.close_delay);
        }
        if(opts.group.delayed_close) opts.group.delayed_close();
    };
    o.cancel_close = function(e) {
        if(close_timer) {
            clearTimeout(close_timer);
            close_timer = false;
        }
    };

    // for debugging
    o.opts = function(){ return opts };
    o.drawer = function(){ return drawer };

    o.close = function(force) {
        if (!opts.close_condition()) return;
        close_timer = false;
        if(!o.opened) return;

        if(force) $.map(o.menus, function(m){ m.close(force) });
        else if(o.sticky || $.inArray(true, $.map(o.menus, function(m){ return m.opened })) > -1) return;

        if(opts.animate_close){
            if(!opts.animate_open){
                opts.animate_open = {};
                for(var p in opts.animate_close) opts.animate_open[p] = drawer.css(p);
            }
            drawer.animate(opts.animate_close, 100);
        } else opts.close_menu();
        if(o.shield) o.shield.remove();

        o.opened = false;
        opts.close();
        handle.get(0).busy = false;
        handle.removeClass('active');

        return o;
    }

    o.open = function() {
        if(menu.disabled || ! opts.open_condition()) return;
        handle.addClass('active');
        opts.default_item.addClass('active');
        o.cancel_close();
        if(o.opened) return;

        o.opened = true;
        if( opts.group.current && (opts.group.current != o) ) opts.group.current.close(true);
        opts.group.current = o;
        handle.get(0).busy = true;

        if(opts.animate_open) drawer.animate(opts.animate_open, 100);
        else opts.open_menu();

        var css_opts = {};
        if(opts.layout){
            // pick top of menu based on if menu would go past bottom of
            // window if below handle, or above top of window if above the handle
            var hp = handle.parent().is(drawer.parent()) ? handle.position() : handle.offset();

            if( opts.layout == 'bottom' ){
                var oy = handle.outerHeight() + opts.offset_y;
                css_opts.top = (handle.offset().top + oy + drawer.outerHeight() > ($(window).height() + window.scrollY))
                    && (handle.offset().top - oy - drawer.outerHeight() - window.scrollY > 0) ?
                    hp.top - drawer.outerHeight() - opts.offset_y : hp.top + oy;

                var layout_x = opts.layout_x;
                if( layout_x == 'auto' ) {
                    var drawer_right = handle.offset().left + drawer.outerWidth();
                    var window_right = $(window).width() + window.scrollX;
                    layout_x = (drawer_right > window_right) ? 'right' : 'left';
                }
                css_opts.left = ( layout_x == 'right' ?
                    hp.left - drawer.outerWidth() + handle.outerWidth() : hp.left );
            }
            else if( opts.layout == 'center_y' ){
                css_opts.top = Math.max(opts.min_y, hp.top + handle.outerHeight() / 2 -
                     drawer.outerHeight() / 2);
                css_opts.left = hp.left - opts.offset_x - drawer.outerWidth();
            }

            // shield element prevents hovering over gap between handle and menu from closing the menu
            o.shield = $();
            //if(opts.offset_y) o.shield.add($('<div>').css({
            //    'position': 'absolute',
            //    'left': hp.left,
            //    'top': hp.top + handle.outerHeight(),
            //    'width': handle.outerWidth(),
            //    'height': opts.offset_y,
            //    'background-color': 'orange'
            //});
            //if(opts.offset_x) o.shield.add($('<div>').css({
            //    'position': 'absolute',
            //    'left': hp.left - opts.offset_x,
            //    'top': hp.top,
            //    'width': opts.offset_x,
            //    'height': handle.outerHeight(),
            //    'background-color': 'orange'
            //});
            o.shield.insertBefore(handle)
                .mouseover(o.cancel_close)
                .mouseout(o.delayed_close)
            ;
        }

        if(opts.auto_height && css_opts.top + drawer.outerHeight() > $(window).height()) {
            var scroller = drawer.find('.items');
            scroller.css('max-height', $(window).height() - 50 - css_opts.top -
                (drawer.outerHeight() - scroller.outerHeight()));
        }

        drawer.css(css_opts);

        opts.open();
        return o;
    }

    opts.group.menus.push(o);

    if(opts.hover) {
        handle.on('hover', null, { delay: opts.open_delay }, o.open)
            .on('hoverend', o.delayed_close);
        drawer.mouseover(o.cancel_close).mouseout(o.delayed_close);
    }
    handle.click(function(){
        if(o.opened && opts.default_item) opts.default_item.click();
        o.open();
    });
    if(opts.focus_persist){
        drawer.find('input[type=text],input[type=password],textarea').on('click keydown', function(){
            o.sticky = true;
        }).on('blur', function(){
            o.sticky = false;
            o.delayed_close();
        }).on('focus', o.cancel_close);
        drawer.mousedown(function(){ setTimeout(o.cancel_close, 1) });
    }

    menu_items.each(function(i, d){
        var e = $(d);
        e.mouseover(function(){ e.addClass('active'); });
        e.mouseout(function(){ e.removeClass('active'); });
    });

    if(opts.auto_close) drawer.click(o.close);
    if(opts.opened && opts.auto_close_delay){ o.delayed_close(opts.auto_close_delay); }

    return o;
}

menu.menus = [];

define(['browser/jquery'], function(){ return menu });

})();
