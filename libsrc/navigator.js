if (typeof(Hive) == "undefined") Hive = {};

Hive.Navigator = function(navigator_element, content_element, opts){
    var o = {};
    opts = $.extend(
        {
            thumb_width: 166,
            text_height: 40,
            margin: 5
        },
        opts
    );
    var height = opts.thumb_width + 2 * opts.margin + navigator_element.height();
    var expr_width = opts.thumb_width + 2 * opts.margin;
    if (!opts.visible_count) opts.visible_count = Math.round($(window).width() / expr_width * 2);
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
        var offset = (opts.thumb_width + opts.margin * 2) * -steps;
        o.pos_set(0, offset, true, o.render);
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
    function clamp_pos(x){
        var x_max = prev_list.length * expr_width - center.minus;
        var x_min = center.minus - next_list.length * expr_width;

        if (x_max < x_min) {
            return x_max;
        } else if (x > x_max){
            return x_max;
        } else if (x < x_min ){
            return x_min;
        } else {
            return x;
        }
    };
    o.pos_set = function(x, offset, animate, callback){
        if (animate){
            var new_inner_pos = clamp_pos(x + offset);
            var deficit = x + offset - new_inner_pos;
            inner.animate({'left': new_inner_pos}, {complete: callback});
            loupe.animate({'left': x - deficit + loupe.data('offset')});
        } else {
            var clamped_x = clamp_pos(x);
            inner.css({'left': clamped_x});
            loupe.css({'left': clamped_x + loupe.data('offset')});
        }
        pos = clamped_x;
    };
    o.pos = function(){
        return pos;
    };

    o.move = function(event){
        if (event instanceof WheelEvent){
            o.pos_set(event.wheelDelta + pos);
        } else {
            o.pos_set(event.offsetX);
        }
    };
    o.move_end = function(event){
        if (event instanceof WheelEvent){
            delta = event.wheelDelta;
        } else {
            delta = event.deltaX;
        }
        if (pos > (prev_list.length - opts.visible_count) * expr_width) {
            o.fetch_prev();
        } else if (-pos > (next_list.length - opts.visible_count) * expr_width) {
            o.fetch_next();
        };
    };


    // public methods
    var fetching_lock = {};
    fetch = function(count, direction){
        if (!count) count = opts.visible_count;
        if (direction > 0){
            var lock = 'next';
            var update_function = updater.next;
            var towards = next_list;
            var element = navigator_element.find('.container.next');
        } else {
            var lock = 'prev';
            var update_function = updater.prev;
            var towards = prev_list;
            var element = navigator_element.find('.container.prev');
        }
        if (fetching_lock[lock]) return;
        fetching_lock[lock] = true;
        var start = element.children().last().data('index');
        var callback = function(data){
            $.each(data, function(i, expr){
                // Add to data model
                var exp = o.make_expr(expr);
                towards.push(exp);
                // Add to document
                var card = exp.render_card().data('index', start + direction * (i+1)).click(function(){
                    o.select($(this).data('index'));
                });
                element.append(card);
            });
            fetching_lock[lock] = false;
        };
        var final_expr = towards[towards.length - 1];
        update_function(final_expr, count, callback);
    };
    o.fetch_next = function(count){ return fetch(count, 1); };
    o.fetch_prev = function(count){ return fetch(count, -1); };

    o.select = function(offset){
        var previous_expr = current_expr;
        var left_offset = $(window).width();
        animate_slide(offset);
        if (offset > 0){
            var towards = next_list;
            var away = prev_list;
            var fetch_function = o.fetch_next;
        } else {
            var towards = prev_list;
            var away = next_list;
            var fetch_function = o.fetch_prev;
            left_offset = -left_offset;
        }

        for(i=0; i < Math.abs(offset); i++){
            away.unshift(current_expr);
            current_expr = towards.shift();
        }

        if (!current_expr.loading_started) current_expr.load(content_element);
        var frame = current_expr.frame
            .css({left: left_offset, 'z-index': 2})
            .load(current_expr.show);


        function animate_complete(){
            $('iframe.expr').not(frame).css({left: -9999});
            frame.css('z-index', 1);
        };
        frame.animate({left: 0}, {complete: animate_complete});
        history_manager.pushState({id: current_expr.id, context: o.context()}, current_expr.title, o.current_url());

        previous_expr.hide();
        current_expr.show();

        Hive.load_expr(current_expr.data());

        o.cache_next();

        var final_expr = towards[towards.length - 1];
        if (final_expr && towards.length < opts.visible_count) {
            fetch_function(opts.visible_count);
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
            var el = expr.render_card();
            el.data('index', (i + start_index) * direction).click(function(){
                o.select($(this).data('index'));
            });
            element.append(el);
        });
        list.element = element;
    };

    var inner, current, next, prev, scrolling_elements, loupe, center;
    o.render = function(render_opts){
        render_opts = $.extend({hidden: false}, render_opts);

        var width = $(window).width();

        // Points on the screen immediately left and right of the center thumbnail
        center = {
            minus: Math.floor((width - opts.thumb_width) / 2),
            plus: Math.floor((width + opts.thumb_width) / 2)
        };

        //if (inner) o.pos_set(0);
        var old_inner = inner;
        inner = $('<div>').addClass('navigator_inner');

        current = $('<div>').addClass('current').css('left', center.minus);
        next = $('<div>').addClass('container next').css('left', center.plus);
        prev = $('<div>').addClass('container prev').css('right', center.plus);

        inner.append(next).append(prev).append(current);

        // The loupe is the 'loupe' like border highlighting the current element
        loupe = navigator_element.find('.loupe');
        if (!loupe.length) loupe = $('<div>').addClass('loupe border selected')
        loupe.css('width', opts.thumb_width)
            .css('height', opts.thumb_width)
            .css('margin-top', -opts.margin)
            .data('offset', center.minus - opts.margin);

        inner.drag(function(e, dd){
            o.move(dd);
        }).drag('end', function(e, dd){
            o.move_end(dd, true);
        }).on('mousewheel', function(e){
            o.move(e.originalEvent);
            o.move_end(e.originalEvent);
        });

        scrolling_elements = inner.add(loupe);

        // Build the new navigator
        navigator_element.css('height', height)
            .css('font-size', opts.thumb_width/190 + 'em');
        if (render_opts.hidden) navigator_element.css('bottom', -height - 2 * opts.margin);
        navigator_element.append(inner).append(loupe);

        build([current_expr], current, 0, 1);
        build(next_list, next, 1, 1);
        build(prev_list, prev, -1, 1);

        o.pos_set(0);

        // Update tags, etc in info line
        var info = navigator_element.find('.info');

        var query = URI(window.location.href).query(true);
        info.find('form').submit(o.search);
        set_context_box(build_search(query));

        var expr_tags = o.current_expr().tags_index;
        var owner_tags = o.current_expr().owner.tags;
        if (owner_tags) {
            owner_tags = $.grep(owner_tags, function(tag){ return $.inArray(tag, expr_tags) == -1 });
        };

        var href = function(tag,opts){ return o.search_string(opts.prefix + tag); };
        var tag_html = [
            tag_list_html(o.current_expr().owner.name, {cls: 'name', prefix: '@', href: href})
            , tag_list_html(expr_tags, {cls: 'expr', href: href})
            //, tag_list_html(owner_tags, {cls: 'user'})
            ].join(' ')
        info.find('.tags').html(tag_html)
            .find('.tag').click(function(){
                o.context($(this).html());
                return false;
            });


        // Unless this is the initial render we now have two inner elements,
        // remove the old one, but do it in this roundabout way to prevent a
        // flash of a blank element,
        if (old_inner) {
            old_inner.animate({opactiy: 0}, 5, function(){ old_inner.remove();});
        }

        return o;
    };

    o.show = function(){
        navigator_element.stop().clearQueue();
        navigator_element.animate({bottom: 0});
        return o;
    };

    o.hide = function(){
        navigator_element.stop().clearQueue();
        navigator_element.animate({bottom: -height-2*opts.margin});
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
        return current_expr.id;
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
        for (i=0; i<1; i++) {
            if ( next_list[i] && !next_list[i].loading_started){
                setTimeout( function(){
                    //console.log('caching');
                    next_list[i].load(content_element, o.cache_next);
                }, 500);
                break;
            } else if (prev_list[i] && !prev_list[i].loading_started){
                setTimeout( function(){
                    //console.log('caching');
                    prev_list[i].load(content_element, o.cache_next);
                }, 500);
                break;
            }
        }
    };

    // returns url with querystring based on tag-styled string
    // e.g.: "@thenewhive #art" => "http://currenturl.com/path?user=thenewhive&tag=art"
    o.search_string = function(string){
        var string = string || navigator_element.find('input').val();
        var tags = (" " + string).match(/(.?)[a-z0-9]+/gi);
        tags = $.map(tags, function(el){
            return el.replace('@', 'user=').replace('#', 'tag=').replace(/^[^a-z]/, 'text=')
        });
        return window.location.origin + window.location.pathname + "?" + tags.join('&');
    };

    // Update url, push history state and repopulate navigator based on new context
    o.search = function(){
        history_manager.pushState({id: current_expr.id, context: o.context()}, current_expr.title, o.search_string());
        o.populate_navigator();
    };

    // Pick appropriate updater strategy based on context
    var current_context;
    function change_context(str){
        current_context = str;
        switch(str) {
            case "#Network":
                if (!logged_in) {
                    o.context('#Featured');
                    break;
                }
                o.set_updater(Hive.Navigator.NetworkUpdater());
                break;
            default:
                o.set_updater(Hive.Navigator.Updater());
                break;
        }
    };

    function set_context_box(str){
        navigator_element.find('input').val(str);
        change_context(str);
    };

    o.context = function(str) {
        if (typeof(str) == "undefined") return current_context;
        set_context_box(str)
        o.search();
    };

    // Factory method for Expr objects
    o.make_expr = function(data){
        return Hive.Navigator.Expr(data, opts);
    };

    // Populate navigator from scratch
    o.populate_navigator = function(callback){
        if (typeof(callback) == "undefined") callback = noop;
        next_list = [];
        prev_list = [];
        if (updater) {
            updater.next(current_expr, o.visible_count(), function(data){
                next_list = $.map(data, o.make_expr);
                next_list.loaded = true;
                if (prev_list.loaded) {
                    o.render().show();
                    callback();
                }
            });
            updater.prev(current_expr, o.visible_count(), function(data){
                prev_list = $.map(data, o.make_expr);
                prev_list.loaded = true;
                if (next_list.loaded) {
                    o.render().show();
                    callback();
                }
            });
        }
    };

    // initialization
    o.initialize = function(){
        current_expr = o.make_expr(expr);
        function on_frame_load(){
            o.cache_next();
            current_expr.show();
        };
        var frame = content_element.find('iframe').on('load', on_frame_load);
        history_manager.replaceState(current_expr.data(), current_expr.title, o.current_url());
        var query = URI(window.location.href).query(true);
        change_context(build_search(query));
        o.populate_navigator();
        current_expr.frame = frame;
        current_expr.show();
        navigator_element.hover(function(){ o.show(); sticky = true; }, function(){ sticky = false; });
        return o;
    };

    return o;
};

Hive.Navigator.Expr = function(data, opts){
    var o = $.extend({}, data);

    o.url =  '/' + o.owner_name + '/' + o.name;

    function on_load(callback){
        if (!$.isFunction(callback)) callback = noop;
        o.loaded = true;
        callback();
    };
    o.load = function(content_element, callback){
        if (o.frame) return;
        o.loading_started = true;
        var src = content_domain + (o.auth_required ? 'empty' : o.id);
        o.frame = $('<iframe>')
            .attr('src', src)
            .css('left', 5000)
            .addClass('expr')
            .on('load', on_load(callback));
        content_element.append(o.frame);
    };

    o.data = function(){
        return data;
    };

    o.show = function(){
        var f = o.frame;
        f.attr('name', 'expr');
        f[0].contentWindow.postMessage('show', '*');
    };

    o.hide = function(){
        var f = o.frame;
        f.attr('name', '');
        f[0].contentWindow.postMessage('hide', '*');
    };

    o.render_card = function(){
        var el = $('<div>')
            .addClass('element expr_card')
            .css('height', opts.thumb_width);
        var im = $('<img>')
            .attr('src', o.thumb)
            .css('width', opts.thumb_width)
            .css('height', opts.thumb_width);
        var byline = $('<div class="byline">')
            .append('<span class="by">by</span> ' + o.owner.name )
            .append('<span>');
        var text = $('<div class="card_text">')
            .append('<div class="title">' + o.title + '</div>')
            .append(byline)
            .css('width', opts.thumb_width);
        el.append(im).append(text);
        return el;
   };

    return o;
};

Hive.Navigator.Updater = function(){
    var o = {};
    o.paging_attr = 'id';

    seek = function(direction){
        var last;
        return function(current_expr, count, callback){
            if (current_expr === last) return;
            var uri = URI(window.location.href);
            uri.addQuery({page: current_expr[o.paging_attr], limit: count, order: -direction});
            $.getJSON(uri.toString(), function(data, status, jqXHR){
                if (!data.length) last = current_expr;
                callback(data, status, jqXHR);
            });
         };
    };
    o.next = seek(1);
    o.prev = seek(-1);

    return o
};

Hive.Navigator.NetworkUpdater = function(){
    var o = Hive.Navigator.Updater();

    seek = function(direction){
        var last;
        return function(current_expr, count, callback){
            if (current_expr === last) return;
            var query = {limit: count, order: -direction};
            if (current_expr.feed) {
                query.page = current_expr.feed[0].created;
            } else {
                query.expr = current_expr[o.paging_attr]
            }
            var uri = URI(window.location.href);
            uri.addQuery(query);
            $.getJSON(uri.toString(), function(data, status, jqXHR){
                if (!data.length) last = current_expr;
                callback(data, status, jqXHR);
            });
         };
    };
    o.next = seek(1);
    o.prev = seek(-1);

    return o;
};

Hive.Navigator.create = function(navigator, viewer){
    var o = Hive.Navigator($(navigator), $(viewer))
        //.set_updater(Hive.Navigator.NetworkUpdater())
        .initialize();
    $(window).resize(o.render);
    $(window).on('statechange', function(){ // Note: We are using statechange instead of popstate
        var state = History.getState(); // Note: We are using History.getState() instead of event.state
        console.log(state);
        var select_expr = function(){
            if (state.data.id != o.current_id()) {
                o.select_by_id(state.data.id);
            }
        };
        if (state.data.context != o.context()){
            o.populate_navigator(select_expr);
        } else {
            select_expr();
        }
    });
    window.addEventListener('message', function(m){
        if(m.data == 'next') o.next();
        if(m.data == 'prev') o.prev();
    }, false);
    return o;
};
