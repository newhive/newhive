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
    var height = opts.thumb_width + opts.text_height + 2 * opts.margin + navigator_element.find('.info').height();
    var expr_width = opts.thumb_width + 2 * opts.margin;
    var history_manager = window.History;

    // private variables
    var content_element,
        navigator_element,
        updater,
        next_list = [],
        prev_list = [],
        current_expr;

    // private methods
    function animate_slide(steps){
        var operator = steps > 0 ? "-=" : "+=";
        inner.find('.current .element').addClass('rounded');
        inner.animate(
            {left: operator + ((opts.thumb_width + opts.margin * 2) * Math.abs(steps))},
            {complete: o.render}
        );
    };

    function build_search(query) {
        function build(list, input, prefix){
            if (typeof(input) == "undefined") return;
            var q = typeof(input) == "string" ? [input] : input;
            $.merge(list, $.map(q, function(el) { return prefix + el }));
        };
        var query_list = []
        build(query_list, query.user, "@");
        build(query_list, query.tag, "#");
        return query_list.join(" ");
    };

    var pos = 0;
    function update_pos(offset){
        pos = pos + offset;
        if (pos > prev_list.length * expr_width - $(window).width()){
            o.fetch_prev();
            o.render({'preserve_pos': true});
        } else if (-pos > next_list.length * expr_width - $(window).width()) {
            o.fetch_next();
            o.render({'preserve_pos': true});
        };
    };

    // public methods
    o.fetch_next = function(count){
        if (!count) count = opts.visible_count;
        var update_function = updater.next;
        var towards = next_list;
        var callback = function(data){
            $.each(data, function(i, expr){
                towards.push(Hive.Navigator.Expr(expr));
            });
        };
        var final_expr = towards[towards.length - 1];
        update_function(final_expr[opts.paging_attr], opts.visible_count, callback);
    };

    o.fetch_prev = function(count){
        if (!count) count = opts.visible_count;
        var update_function = updater.prev;
        var towards = prev_list;
        var callback = function(data){
            $.each(data, function(i, expr){
                towards.push(Hive.Navigator.Expr(expr));
            });
        };
        var final_expr = towards[towards.length - 1];
        update_function(final_expr[opts.paging_attr], opts.visible_count, callback);
    };

    o.select = function(offset){
        var previous_expr = current_expr;
        var left_offset = $(window).width();
        if (offset > 0){
            var towards = next_list;
            var away = prev_list;
            var update_function = updater.next;
            var fetch_function = o.fetch_next;
        } else {
            var towards = prev_list;
            var away = next_list;
            var update_function = updater.prev;
            var fetch_function = o.fetch_prev;
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
        history_manager.pushState(current_expr, current_expr.title, o.current_url());

        Hive.Nav.update_expr(current_expr.data());

        //var callback = function(data){
        //    $.each(data, function(i, expr){
        //        towards.push(Hive.Navigator.Expr(expr));
        //    });
        //};
        o.cache_next();

        var final_expr = towards[towards.length - 1];
        if (final_expr && towards.length < opts.visible_count) {
            fetch_function(opts.visible_count);
            //update_function(final_expr[opts.paging_attr], opts.visible_count, callback);
        }

    };

    o.prev = function(){
        return function(){ o.select(-1); }
    }();

    o.next = function(){
        return function(){ o.select(1); }
    }();

    o.select_by_id = function(id){
        var ids, return_ids, pos;
        if (id === o.current_id()) return;
        return_ids = function(el) { return el.id };

        // Look for id in prev_list
        ids = $.map(o.prev_list(), return_ids);
        pos = $.inArray(id, ids);
        if (pos >= 0){
            // Transform from 0-based index in previous list to position relative to current
            pos = -(pos + 1);
        } else {
            // Now look in next_list
            ids = $.map(o.next_list(), return_ids);
            pos = $.inArray(id, ids);
            if (pos >= 0){
                pos = pos + 1;
            } else {
                // Not found in either case, this shouldn't happen normally
                return false;
            }
        }
        o.select(pos);
    };

    function build(list, element, direction, start_index){
        element.empty();
        $.each(list, function(i, expr){
            if (!expr) return;
            var el = $('<div>')
                .addClass('element')
                .data('index', (i + start_index) * direction);
            var im = $('<img>')
                .attr('src', expr.thumb)
                .css('width', opts.thumb_width)
                .css('height', opts.thumb_width);
            var byline = $('<div class="byline">')
                .append('<span class="by">by</span> ' + expr.owner.name )
                .append('<span>');
            var text = $('<div class="text">')
                .append('<div class="title">' + expr.title + '</div>')
                .append(byline)
                .css('width', opts.thumb_width)
                .css('height', opts.text_height);
            el.append(im).append(text);
            element.append(el);
        });
    };


    var inner, current, next, prev;
    o.render = function(render_opts){
        render_opts = $.extend({hidden: false, preserve_pos: false}, render_opts);

        var width = $(window).width();

        // Points on the screen immediately left and right of the center thumbnail
        var center = {
            minus: Math.floor((width - opts.thumb_width) / 2),
            plus: Math.floor((width + opts.thumb_width) / 2)
        };

        var old_inner = inner;
        if (!render_opts.preserve_pos) {
            inner = $('<div>').addClass('navigator_inner');

            current = $('<div>').addClass('current').css('left', center.minus);
            next = $('<div>').addClass('container next').css('left', center.plus);
            prev = $('<div>').addClass('container prev').css('right', center.plus);

            inner.append(next).append(prev).append(current);

            // The frame is the 'loupe' like border highlighting the current element
            var frame = navigator_element.find('.frame');
            if (!frame.length) frame = $('<div>').addClass('frame border selected')
            frame.css('left', center.minus - opts.margin)
                .css('width', opts.thumb_width)
                .css('height', height - opts.margin)
                .css('margin-top', -opts.margin);

            //inner.add(frame).drag('init', function(){
            //    return inner.add(frame);
            //}).drag(function(e, dd){
            //    $(this).css('left', dd.offsetX);
            //}).drag('end', function(e, dd){
            //    if (this === inner[0]) update_pos(dd.deltaX);
            //}).on('mousewheel', function(e){
            //    var delta = e.originalEvent.wheelDelta;
            //    inner.add(frame).css('left', '+=' + delta);
            //    update_pos(delta);
            //});

            // Build the new navigator
            navigator_element.css('height', height)
                .css('font-size', opts.thumb_width/190 + 'em');
            if (render_opts.hidden) navigator_element.css('bottom', -height - 2 * opts.margin);
            navigator_element.append(inner).append(frame);
        }

        build([current_expr], current, 0, 1);
        build(next_list, next, 1, 1);
        build(prev_list, prev, -1, 1);

        inner.find('.element').click(function(){
            o.select($(this).data('index'));
        });

        // Update tags, etc in info line
        var info = navigator_element.find('.info');

        var query = URI(window.location.href).query(true);
        var search_bar = info.find('input').val(build_search(query));

        function tagify(tags, cls, prefix){
            if (typeof tags == "undefined") return "";
            var tag_array = typeof(tags) == "string" ? [tags] : tags;
            return $.map(tag_array, function(tag) {
                return "<span class='tag " + cls + "'>" + prefix + tag + "</span>"
            }).join('');
        };

        var expr_tags = o.current_expr().tags_index;
        var owner_tags = o.current_expr().owner.tags;
        if (owner_tags) {
            owner_tags = $.grep(owner_tags, function(tag){ return $.inArray(tag, expr_tags) == -1 });
        };

        info.find('.tags').html(
            tagify(o.current_expr().owner.name, 'name', '@')
        ).append(
            tagify(expr_tags, 'expr', '#')
        ).append(
            tagify(owner_tags, 'user', '#')
        ).find('.tag').click(function(){
            search_bar.val($(this).html());
        });


        // Unless this is the initial render we now have two inner elements,
        // remove the old one, but do it in this roundabout way to prevent a
        // flash of a blank element,
        if (old_inner) {
            old_inner.animate({opactiy: 0}, 5, function(){ old_inner.remove();});
        }

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
                setTimeout( function(){
                    console.log('caching');
                    next_list[i].load(content_element, o.cache_next);
                }, 500);
                break;
            } else if (prev_list[i] && !prev_list[i].loading_started){
                setTimeout( function(){
                    console.log('caching');
                    prev_list[i].load(content_element, o.cache_next);
                }, 500);
                break;
            }
        }
    };

    // initialization
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
        history_manager.replaceState(current_expr, current_expr.title, o.current_url());
        navigator_element.hover(function(){ o.show(); sticky = true; }, function(){ sticky = false; });
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

    o.data = function(){
        return data;
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
    $(window).resize(function(){
        Hive.navigator.render();
    });
    $(window).on('statechange', function(){ // Note: We are using statechange instead of popstate
        var state = History.getState(); // Note: We are using History.getState() instead of event.state
        Hive.navigator.select_by_id(state.data.id);
    });
});
