define(['browser/jquery'], function($) {
    var o = {};

    o.on_scroll = function(ev) {

    }
    o.place_apps = function() {
        var win_width = $(window).width();
        $('.happfill').each(function(i, div) {
            var e = $(div);
            //e.width(e.parent().width()).height(e.parent().height());
            o.img_fill(e.find('img'))
        });
        $('.happ').each(function(i, app_div) {
            var e = $(this);
            var s = e.parent().width() / 1000;
            if(!e.data('css')) {
                var c = {}, props = ['left', 'top', 'width', 'height'],
                    border = $(app_div).css('border-radius');

                if(border && border.indexOf('px') > 0)
                    $.merge(props, [
                        'border-top-left-radius'
                        ,'border-top-right-radius'
                        ,'border-bottom-right-radius'
                        ,'border-bottom-left-radius'
                    ]);
                props.map(function(p) { c[p] = parseFloat(app_div.style[p]) });
                var scale = parseFloat(e.attr('data-scale'));
                if(scale) c['font-size'] = scale;
                e.data('css', c);
                var angle;
                if((angle = e.attr('data-angle')) && e.rotate)
                    e.rotate(parseFloat(angle));
                e.css('opacity', this.style.opacity);
                if (e.hasClass('hive_image') && e.find('.crop_box').length) {
                    var img = e.find('img');
                    var ic = {}, props = ['margin-top', 'margin-left'];
                    props.map(function(p) { ic[p] = parseFloat(img.css(p)) });
                    img.data('css', ic);
                }
            }
            var c = $.extend({}, e.data('css'));
            for(var p in c) {
                if(p == 'font-size') c[p] = (c[p] * s) + 'em';
                else c[p] = Math.round(c[p] * s);
            }
            e.css(c);
            
            if (e.hasClass('hive_image') && e.find('.crop_box').length) {
                var img = e.find('img');
                var ic = $.extend({}, img.data('css'));
                for(var p in ic) {
                    ic[p] = Math.round(ic[p] * s);
                }
                img.css(ic);
            }
        });
    };

    // TODO: generalize into layout function that can size to parent,
    // as well as center to any side or corner
    o.center = function(e, inside, opts){
        if(!e.width() || !e.height()) return; // As image is loading, sometimes height can be falsely reported as 0

        var w = (typeof(inside) == 'undefined' ? $(window) : inside),
            opts = $.extend({
                absolute: false,
                minimum: true,
                h: true,
                v: true 
            }, opts),
            pos = {}
        ;

        if(opts.h) pos.left = (w.width() - e.outerWidth()) / 2;
        if(opts.v) pos.top = (w.height() - e.outerHeight()) / 2;

        if(opts.minimum) {
            if(opts.h) pos.left = Math.max(0, pos.left);
            if(opts.v) pos.top = Math.max(0, pos.top);
        }
        if(opts.absolute) {
            if(opts.h) pos.left += window.scrollX;
            if(opts.v) pos.top += window.scrollY;
        }

        e.css(pos);
    };

    // fill <img> to parent
    o.img_fill = function(img){
        var e = $(img);
        if(!e.length) return;
        var w = e.parent().width(), h = e.parent().height(), load = function(){
            e.css('position', 'absolute');
            if(e.width() / e.height() > w / h) e.width('').height(h);
            else e.width(w).height('');
            o.center(e, e.parent(), { minimum : false });
        };
        if(!e.width()) e.load(load);
        // else 
        load();
        return e;
    }

    // TODO: fix this
    var is_fullscreen = function(){
        return document.height == window.screen.height && document.width == window.screen.width;
    };

    // TODO: unminify this (wtf?)
    var new_window = function(b,c,d){
        var a=function(){if(!window.open(b,'t','scrollbars=yes,toolbar=0,resizable=1,status=0,width='+c+',height='+d)){document.location.href=b}};if(/Firefox/.test(navigator.userAgent)){setTimeout(a,0)}else{a()}
    };

    return o;
});
