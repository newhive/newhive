function img_fill(img) {
    var e = $(img), w = e.parent().width(), h = e.parent().height();
    if(!e.length) return;
    e.css('position', 'absolute');
    if(e.width() / e.height() > w / h) e.width('').height(h);
    else e.width(w).height('');
    center(e, e.parent(), { minimum : false });
    return e;
}

var place_apps = function() {
    var win_width = $(window).width();
    $('.happfill').each(function(i, div) {
        var e = $(div);
        //e.width(e.parent().width()).height(e.parent().height());
        img_fill(e.find('img'))
    });
    if (Hive.expr && Hive.expr.fixed_width) return;
    $('.happ').each(function(i, app_div) {
        var e = $(this);
        var s = e.parent().width() / 1000;
        if(!e.data('css')) {
            var c = {}, props = ['left', 'top', 'width', 'height'];
            if($(app_div).css('border-radius').indexOf('px') > 0) $.merge(props,
                     ['border-top-left-radius', 'border-top-right-radius',
                         'border-bottom-right-radius', 'border-bottom-left-radius']
                 );
            map(function(p) { c[p] = parseFloat(app_div.style[p]) }, props);
            var scale = parseFloat(e.attr('data-scale'));
            if(scale) c['font-size'] = scale;
            e.data('css', c);
            var a; if(a = e.attr('data-angle')) e.rotate(parseFloat(a));
            e.css('opacity', this.style.opacity);
        }
        var c = $.extend({}, e.data('css'));
        for(var p in c) {
            if(p == 'font-size') c[p] = (c[p] * s) + 'em';
            else c[p] = Math.round(c[p] * s);
        }
        e.css(c);
    });
}

function center(e, inside, opts) {
    if(!e.width() || !e.height()) return; // As image is loading, sometimes height can be falsely reported as 0

    var w = typeof(inside) == 'undefined' ? $(window) : inside,
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
}

// TODO: fix this
function is_fullscreen(){
    return document.height == window.screen.height && document.width == window.screen.width;
}

// TODO: unminify this (wtf?)
function new_window(b,c,d){
    var a=function(){if(!window.open(b,'t','scrollbars=yes,toolbar=0,resizable=1,status=0,width='+c+',height='+d)){document.location.href=b}};if(/Firefox/.test(navigator.userAgent)){setTimeout(a,0)}else{a()}
}
