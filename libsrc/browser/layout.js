define(['browser/jquery', 'ui/util'], function($, util) {
    var o = {};

    o.on_scroll = function(ev) {

    }

    o.get_zoom = function(){
        return window.devicePixelRatio
    }

    o.place_apps = function(layout_coord, expr) {
        // if(util.mobile()) return
        var win_dims = [$(window).width(), $(window).height()]
            ,scale_from = win_dims[layout_coord]
            ,s = scale_from / 1000
        if (util.mobile()) s = .5
        // if (win_dims[1] > win_dims[0] && win_dims[0])
        //     s *= win_dims[1] / win_dims[0]

        // TODO: bg code should respect win_width
        $('.happfill').each(function(i, div) {
            var e = $(div);
            //e.width(e.parent().width()).height(e.parent().height());
            curr_dims = null
            if (e.prop("id") == "bg" && expr.bg) 
                curr_dims = expr.bg.dimensions
            o.img_fill(e.find('img'), curr_dims)
        });

        $('.happ').each(function(i, app_div) {
            var e = $(this);
            if(!e.data('css')) {
                var c = {}, props = ['left', 'top', 'width', 'height'],
                    border = $(app_div).css('border-radius')

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
                var angle;
                if((angle = e.attr('data-angle')) && e.rotate)
                    e.rotate(parseFloat(angle));
                e.css('opacity', this.style.opacity);
                if (e.hasClass('hive_image')) {
                    var img = e.find('img');
                    var ic = {}, props = ['margin-top', 'margin-left', 'width'];
                    props.map(function(p) { ic[p] = parseFloat(img.css(p)) });
                    img.data('css', ic);
                }
                e.data('css', c);
            }
            var c = $.extend({}, e.data('css')), c2 = $.extend({}, c);
            if(e.hasClass('text_column')){
                var r = c['left'] / (1000 - c['width'])
                c2['width'] = Math.min(win_width - 2*30,
                    c['width'] * Math.max(1, s))
                c2['left'] = Math.max(30, r * (win_width - c2['width']))
                c2['font-size'] = ( c['font-size'] *
                    Math.max(1, c2['width'] / c['width']) )
                delete c['width']
                delete c['left']
                delete c['font-size']
            }
            for(var p in c2) {
                c2[p] = c[p] ? (c[p] * s) : c2[p]
                if(p == 'font-size') {
                    c2[p] += 'em';
                } else if (p == 'width' || p == 'height'){
                    c2[p] = Math.max(1, Math.round(c2[p])) + 'px';
                } else {
                    c2[p] = Math.round(c2[p]) + 'px';
                }
            }
            e.css(c2);
            // is this faster?
            // util.inline_style(e[0], c2)
            
            if (e.hasClass('hive_image')) {
                var img = e.find('img'), ic = $.extend({}, img.data('css'))
                    ,border_width = util.val(app_div.style['border-width'])

                for(var p in ic) {
                    var new_val = ic[p] * s
                    if (util.starts_with(p, "margin"))
                        new_val -= border_width;
                    ic[p] = Math.round(new_val);
                }
                img.css(ic);
            }
        });
    };

    // TODO: generalize into layout function that can size to parent,
    // as well as center to any side or corner
    o.center = function(e, inside, opts){
        e = $(e)
        opts = opts || {}
        var curr_dims = opts.curr_dims || [e.outerWidth(), e.outerHeight()]
        // As image is loading, sometimes height can be falsely reported as 0
        if(!curr_dims[0] || !curr_dims[1]) return;

        var w = (inside ? $(inside) : $(window))
            opts = $.extend({
                absolute: false,
                minimum: true,
                h: true,
                v: true 
            }, opts),
            pos = {}
        ;

        if(opts.h) pos.left = (w.width() - curr_dims[0]) / 2;
        if(opts.v) pos.top = (w.height() - curr_dims[1]) / 2;

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
    o.img_fill = function(img, curr_dims, $parent){
        var $img = $(img);
        if(!$img.length) return;
        var curr_dims = curr_dims || [$img.width(), $img.height()]
            ,$parent = $parent || $img.parent()
            ,w = $parent.width(), h = $parent.height()
            ,aspect = curr_dims[1] / curr_dims[0]
            ,load = function(){
                $img.css('position', 'absolute');
                if(curr_dims[0] / curr_dims[1] > w / h) 
                    w = h / aspect //$img.width('').height(h);
                else 
                    h = w * aspect //$img.width(w).height('');
                $img.width(w).height(h);
                o.center($img, $parent, { 
                    minimum : false, curr_dims : [w, h] });
            };
        if(!curr_dims[0]) $img.load(load);
        // else 
        load();
        return $img;
    }

    // TODO: fix this
    var is_fullscreen = function(){
        return document.height == window.screen.height && document.width == window.screen.width;
    };

    // TODO: unminify this (wtf?)
    o.new_window = function(b,c,d){
        var a=function(){if(!window.open(b,'t','scrollbars=yes,toolbar=0,resizable=1,status=0,width='+c+',height='+d)){document.location.href=b}};if(/Firefox/.test(navigator.userAgent)){setTimeout(a,0)}else{a()}
    };

    return o;
});
