if (typeof(Hive) == "undefined") Hive = {};

Hive.Navigator = function(navigator_element, content_element, opts){
    var o = {};
    opts = $.extend(
        {
            visible_count: 10,
            thumb_width: 130,
            text_height: 40,
            margin: 5,
            paging_attr: 'id'
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
        var previous_expr = current_expr;
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
        if (!current_expr.loading_started) current_expr.load(content_element);
        var frame = current_expr.frame()
            .css({left: left_offset, 'z-index': 2});
        //$('iframe.expr').not(frame).not(previous_expr.frame()).css('z-index', 0);


        function animate_complete(){
            $('iframe.expr').not(frame).css({left: 9999});
            frame.css('z-index', 1);
        };
        frame.animate({left: 0}, {complete: animate_complete});
        history_manager.pushState(current_expr._id, current_expr.title, o.current_url());

        var callback = function(data){
            $.each(data, function(i, expr){
                towards.push(Hive.Navigator.Expr(expr));
            });
        };
        o.cache_next();

        var final_expr = towards[towards.length - 1];
        if (final_expr && towards.length < opts.visible_count) {
            update_function(final_expr[opts.paging_attr], opts.visible_count, callback);
        }

    };

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

    o.cache_next = function(){
        for (i=0; i<3; i++) {
            if ( next_list[i] && !next_list[i].loading_started){
                next_list[i].load(content_element, o.cache_next);
                break;
            } else if (prev_list[i] && !prev_list[i].loading_started){
                prev_list[i].load(content_element, o.cache_next);
                break;
            }
        }
    };

    // initialization
    function set_hover_handler(){
        navigator_element.hover(function(){ o.show(); sticky = true; }, function(){ sticky = false; });
    };

    o.initialize = function(){
        current_expr = Hive.Navigator.Expr(expr);
        content_element.find('iframe').on('load', o.cache_next);
        var render_and_show = function(){
            o.render({hidden: true});
            //o.show();
        };
        if (updater) {
            updater.next(current_expr[opts.paging_attr], o.visible_count(), function(data){
                next_list = $.map(data, Hive.Navigator.Expr);
                if (prev_list.length) render_and_show();
            });
            updater.prev(current_expr[opts.paging_attr], o.visible_count(), function(data){
                prev_list = $.map(data, Hive.Navigator.Expr);
                if (next_list.length) render_and_show();
            });
        }
        history_manager.replaceState(current_expr._id, current_expr.title, o.current_url());
        set_hover_handler();
        return o;
    };

    return o;
};

Hive.Navigator.Expr = function(data){
    var o = $.extend({}, data);
    var frame;

    o.id = o._id;
    o.url =  '/' + o.owner_name + '/' + o.name;

    function on_load(callback){
        if (!$.isFunction(callback)) callback = noop;
        o.loaded = true;
        callback();
    };
    o.load = function(content_element, callback){
        if (frame) return;
        o.loading_started = true;
        console.log('loading ', o.id);
        frame = $('<iframe>')
            .attr('src', content_domain + o.id)
            .css('left', 5000)
            .addClass('expr')
            .on('load', on_load(callback));
        content_element.append(frame);
    };

    o.frame = function(){
        return frame;
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
    Hive.navigator = Hive.Navigator($('#navigator'), $('#expression_frames'))
        .set_updater(Hive.Navigator.Updater())
        .initialize();
    $(window).on('popstate', function(e, data){
    });
    $(window).resize(function(){
        Hive.navigator.render();
    });
});
