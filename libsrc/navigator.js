if (typeof(Hive) == "undefined") Hive = {};

Hive.Navigator = function(navigator_element, content_element, opts){
    var o = {};
    opts = $.extend(
        {
            visible_count: 10,
            thumb_width: 130,
            text_height: 40,
            margin: 5,
            paging_attr: 'updated'
        },
        opts
    );
    var height = opts.thumb_width + opts.text_height + 2 * opts.margin;
    var history_manager = window.history;

    // private variables
    var content_element,
        navigator_element,
        updater,
        next_list = [],
        prev_list = [],
        current_expr;

    // methods
    function animate_slide(steps){
        var operator = steps > 0 ? "-=" : "+=";
        inner.find('.current .element').addClass('rounded');
        inner.animate(
            {left: operator + ((opts.thumb_width + opts.margin * 2) * Math.abs(steps))},
            {complete: o.render}
        );
    };

    o.select = function(offset){
        var left_offset = $(window).width();
        if (offset > 0){
            var towards = next_list;
            var away = prev_list;
            var update_function = updater.next;

        } else {
            var towards = prev_list;
            var away = next_list;
            var update_function = updater.prev;
            left_offset = -left_offset;
        }

        for(i=0; i < Math.abs(offset); i++){
            away.unshift(current_expr);
            current_expr = towards.shift();
        }
        animate_slide(offset);

        //content_element.attr('src', content_domain + current_expr._id);
        var frame = $('<iframe>')
            .attr('src', content_domain + current_expr._id)
            .css('left', left_offset)
            .addClass('expr')
            .on('load', callback_log('load'))
            .ready('load', callback_log('ready'));
        content_element.after(frame);
        setTimeout(function(){
            frame.animate({left: 0});
        }, 500);
        content_element = frame;
        history_manager.pushState(current_expr._id, current_expr.title, o.current_url());
        console.log('push state')

        var callback = function(data){
            $.each(data, function(i, expr){
                towards.push(expr);
            });
        };
        update_function(towards[towards.length - 1][opts.paging_attr], Math.abs(offset), callback);

    };

    //o.fetch_frame(

    o.prev = function(){
        return function(){ o.select(-1); }
    }();

    o.next = function(){
        return function(){ o.select(1); }
    }();

    var inner;
    o.render = function(render_opts){
        render_opts = $.extend({hidden: false}, render_opts);

        var width = $(window).width();

        // Points on the screen immediately left and right of the center thumbnail
        var center = {
            minus: Math.floor((width - opts.thumb_width) / 2),
            plus: Math.floor((width + opts.thumb_width) / 2)
        };

        inner = $('<div>').addClass('navigator_inner');

        function build(list, element, direction){
            $.each(list, function(i, expr){
                if (!expr) return;
                var el = $('<div>')
                    .addClass('element')
                    .data('index', (i + 1) * direction);
                var im = $('<img>')
                    .attr('src', expr.thumb)
                    .css('width', opts.thumb_width)
                    .css('height', opts.thumb_width);
                var text = $('<div class="text">')
                    .append('<div class="title">' + expr.title + '</div>')
                    .css('width', opts.thumb_width)
                    .css('height', opts.text_height);
                el.append(im).append(text);
                element.append(el);
            });
        };

        var current = $('<div>').addClass('current').css('left', center.minus);
        var next = $('<div>').addClass('container next').css('left', center.plus);
        var prev = $('<div>').addClass('container prev').css('right', center.plus);

        build([current_expr], current, 0);
        build(next_list, next, 1);
        build(prev_list, prev, -1);

        inner.append(next).append(prev).append(current);
        inner.find('.element').click(function(){
            o.select($(this).data('index'));
        });

        // The frame is the 'loupe' like border highlighting the current element
        var frame = $('<div>').addClass('frame border selected')
            .css('left', center.minus - opts.margin)
            .css('width', opts.thumb_width)
            .css('height', height - opts.margin)
            .css('margin-top', -opts.margin);

        // Build the new navigator
        var new_nav = $('<div>').addClass('navigator')
            .css('z-index', '4').css('height', height)
            .css('font-size', opts.thumb_width/190 + 'em');
        if (render_opts.hidden) new_nav.css('bottom', -height - 2 * opts.margin);
        new_nav.append(inner).append(frame);//.css('opacity', 0.1);

        // Render the new element to the page, then swap it in for the old
        // element.  This roundabout way prevents a flash of a blank element,
        // could be improved though I'm sure. For instance, you see a doubly
        // opaque drop shadow for a moment
        navigator_element.before(new_nav);
        var old_nav = navigator_element;
        navigator_element.animate({opactiy: 0}, 5, function(){ old_nav.remove();});
        navigator_element = new_nav;
        set_hover_handler();

        return o;
    };

    var visible = false;
    var sticky = false;
    o.show = function(){
        if (visible) return o;
        navigator_element.stop().clearQueue();
        navigator_element.animate({bottom: 0});
        visible = true;
        return o;
    };

    o.hide = function(){
        if (o.no_hide || !visible || sticky) return o;
        navigator_element.stop().clearQueue();
        navigator_element.delay(500).animate({bottom: -height-2*opts.margin});
        visible = false;
        return o;
    };

    // setters
    o.set_updater = function(upd){
        updater = upd;
        return o;
    };

    // getters
    o.current_expr = function(){
        return current_expr;
    };

    o.current_id = function(){
        return current_expr._id;
    };

    o.current_url = function(){
        return '/' + current_expr.owner_name + '/' + current_expr.name + window.location.search;
    };

    o.visible_count = function(){
        return opts.visible_count;
    };

    o.next_list = function(){
        return next_list;
    };

    o.prev_list = function(){
        return prev_list;
    };

    o.height = function(){
        return height;
    };

    // initialization
    function set_hover_handler(){
        navigator_element.hover(function(){ o.show(); sticky = true; }, function(){ sticky = false; });
    };
    o.initialize = function(){
        current_expr = expr;
        content_element.on('load', callback_log('initial load'));
        var render_and_show = function(){
            o.render({hidden: true});
            //o.show();
        };
        if (updater) {
            updater.next(current_expr[opts.paging_attr], o.visible_count(), function(data){
                next_list = data;
                if (prev_list.length) render_and_show();
            });
            updater.prev(current_expr[opts.paging_attr], o.visible_count(), function(data){
                prev_list = data;
                if (next_list.length) render_and_show();
            });
        }
        history_manager.replaceState(current_expr._id, current_expr.title, o.current_url());
        console.log('replace state')
        set_hover_handler();
        return o;
    };

    return o;
};

Hive.Navigator.Updater = function(){
    var o = {};

    seek = function(direction){
        var last;
        return function(current_id, count, callback){
            if (current_id === last) return;
            var uri = URI(window.location.href);
            uri.addQuery({current: current_id, count: count, direction: direction});
            $.getJSON(uri.toString(), function(data, status, jqXHR){
                if (!data.length) last = current_id;
                callback(data, status, jqXHR);
            });
         };
    };
    o.next = seek(1);
    o.prev = seek(-1);

    return o
};

$(function(){
    Hive.navigator = Hive.Navigator($('#navigator'), $('iframe[name=expr]'))
        .set_updater(Hive.Navigator.Updater())
        .initialize();
    $(window).on('popstate', function(e, data){
        console.log('popstate', e.originalEvent.state);
    });
});
