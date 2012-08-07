if (typeof(Hive) == "undefined") Hive = {};

Hive.Navigator = function(navigator_element, content_element, opts){
    var o = {};
    opts = $.extend(
        {
            thumb_width: 166,
            text_height: 40,
            margin: 5,
            hidden: false
        },
        opts
    );
    var height = opts.thumb_width + 2 * opts.margin + navigator_element.height();
    var expr_width = opts.thumb_width + 2 * opts.margin;
    if (!opts.visible_count) opts.visible_count = Math.round($(window).width() / expr_width * 2);
    var history_manager = function(){
        var o = window.History;
        _pushState = o.pushState;
        o.pushState = function(data, title, url){
            _pushState(data, title, url);
            _gaq.push(['_trackPageview', url])
        };
        return o;
    }();

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
        build(query_list, query.auth, ":");
        build(query_list, query.tag, "#");
        return query_list.join(" ");
    };

    var pos = 0;
    function clamp_pos(x){
        var x_max = prev_list.length * expr_width - center.minus + 2 * opts.margin;
        var x_min = center.minus - next_list.length * expr_width - 2 * opts.margin;

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
        if (typeof event == "number"){
            o.pos_set(event + pos);
        } else if (event instanceof WheelEvent){
            o.pos_set(event.wheelDelta + pos);
        } else {
            o.pos_set(event.offsetX);
        }
    };
    o.move_end = function(event){
        if (typeof event == "number"){
            delta = event;
        } else if (event instanceof WheelEvent){
            delta = event.wheelDelta;
        } else {
            delta = event.deltaX;
        }
        if (delta > 0 && pos > (prev_list.length - opts.visible_count) * expr_width) {
            o.fetch_prev();
        } else if (delta < 0 && -pos > (next_list.length - opts.visible_count) * expr_width) {
            o.fetch_next();
        };
    };

    // Hive.Navigator.scroll sets auto-scrolling speed, cancels scrolling if called with speed=0
    var scroll_interval, scroll_speed;
    o.scroll = function(speed){
        var interval_function = function(){
            o.move(scroll_speed);
            o.move_end(scroll_speed);
        };
        if (speed == 0) {
            clearInterval(scroll_interval);
            scroll_interval = false;
        } else {
            scroll_speed = speed;
            if (!scroll_interval) {
                scroll_interval = setInterval(interval_function, 30);
            }
        }
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
                element.append(render_card(exp, start + direction * (i+1)));
            });
            fetching_lock[lock] = false;
        };
        var final_expr = towards[towards.length - 1];
        update_function(final_expr, count, callback);
    };
    o.fetch_next = function(count){ return fetch(count, 1); };
    o.fetch_prev = function(count){ return fetch(count, -1); };

    function render_card(expr, i) {
        var timeout;
        var card = expr.render_card().data('index', i).click(function(){
            o.select($(this).data('index'));
        });
        return card;
    };

    o.select = function(offset){
        var previous_expr = current_expr;
        var left_offset = $(window).width();

        // clicking on a card in navigator during animation causes strange behavior.
        // since inner is replaced after the animation is complete, just unbind click
        // handler on inner elements
        inner.find('.expr_card').off('click');
        animate_slide(offset);
        if (offset >= 0){
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

        if (!current_expr.loading_started) current_expr.load();
        var frame = current_expr.frame;
            //.css({left: left_offset, 'z-index': 2})
            //.load(current_expr.show);

        function animate_complete(){
            $('iframe.expr').not(frame).css({left: -9999});
            frame.css('z-index', 1);
        };
        //frame.animate({left: 0}, {complete: animate_complete});
        history_manager.pushState({id: current_expr.id, context: o.context()}, current_expr.title, o.current_url());

        previous_expr.hide();
        current_expr.show(offset);

        Hive.load_expr(current_expr.data());

        o.cache_next();

        var final_expr = towards[towards.length - 1];
        if (final_expr && towards.length < opts.visible_count) {
            fetch_function(opts.visible_count);
        }

        // Garbage collect old frames
        $.each(away.slice(3), function(i, expr){ expr.unload(); });
    };

    function show_expression_not_in_list(data){
        current_expr = o.make_expr(data);
        current_expr.load();
        history_manager.pushState({id: current_expr.id, context: o.context()}, current_expr.title, o.current_url());
        o.populate_navigator(function(){ o.select(0) });
    };
    function load_expr(id){
        $.getJSON('/expr_info/' + id, show_expression_not_in_list);
        return o;
    };
    o.random = function(){
        change_context('');
        $.getJSON('/random?json=1', show_expression_not_in_list);
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
                load_expr(id);
                return false;
            }
        }
        o.select(pos);
    };

    function build(list, element, direction, start_index){
        element.empty();
        $.each(list, function(i, expr){
            if (!expr) return;
            element.append(render_card(expr, (i + start_index) * direction));
        });
        list.element = element;
    };

    var inner, current, next, prev, scrolling_elements, loupe, center, info;
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
        //if (render_opts.hidden) navigator_element.css('bottom', -height - 2 * opts.margin);
        navigator_element.append(inner).append(loupe);

        build([current_expr], current, 0, 1);
        build(next_list, next, 1, 1);
        build(prev_list, prev, -1, 1);

        o.pos_set(0);

        // Update tags, etc in info line
        info = navigator_element.find('.info');

        o.render_tags(o.current_expr());

        // Unless this is the initial render we now have two inner elements,
        // remove the old one, but do it in this roundabout way to prevent a
        // flash of a blank element,
        if (old_inner) {
            old_inner.animate({opactiy: 0}, 5, function(){ old_inner.remove();});
        } else {
            // Things we only want to happen on initial render go here
            info.find('form').submit(o.search);
            info.find('.random_btn').click(o.random);
        }

        // event handlers for auto-scrolling based on mouse position
        var scroll_param = function(d){ return Math.pow(d / 35, 2); };
        inner.on('mousemove', function(e){
            if (e.clientX < 200) {
                o.scroll(scroll_param(200 - e.clientX));
            } else if (e.clientX > width - 200) {
                o.scroll(-scroll_param(width - 200 - e.clientX));
            } else {
                o.scroll(0);
            }
        }).on('mouseleave', function(){
            o.scroll(0);
        });

        return o;
    };

    o.render_tags = function(expr){
        var expr_tags = expr.tags_index;
        var owner_tags = expr.owner.tags;
        if (owner_tags) {
            owner_tags = $.grep(owner_tags, function(tag){ return $.inArray(tag, expr_tags) == -1 });
        };

        var href = function(tag,opts){ return o.current_url(opts.prefix + tag); };
        var tag_html = [
            tag_list_html(expr.owner.name, {cls: 'name', prefix: '@', href: href})
            , tag_list_html(expr_tags, {cls: 'expr', href: href})
            //, tag_list_html(owner_tags, {cls: 'user'})
            ].join(' ')
        info.find('.tags').html(tag_html)
            .find('.tag').click(function(){
                o.context($(this).html());
                return false;
            });

    };

    o.show = function(speed){
        speed = speed || 100;
        clearTimeout(navigator_element.initial_hide_timeout);
        navigator_element.stop().clearQueue().show();
        navigator_element.animate({bottom: 0}, speed);
        if (info && !Modernizr.touch) info.find('input').focus();
        return o;
    };

    o.hide = function(speed){
        speed = speed || 100;
        navigator_element.stop().clearQueue();
        var complete = function(){ navigator_element.hide() };
        navigator_element.animate({bottom: -height*1.1}, {complete: complete}, speed);
        if (info && !Modernizr.touch) info.find('input').blur();
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

    o.current_url = function(context){
        return '/' + current_expr.owner_name + '/' + current_expr.name + o.search_string(context);
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
                    next_list[i].load(o.cache_next);
                }, 500);
                break;
            } else if (prev_list[i] && !prev_list[i].loading_started){
                setTimeout( function(){
                    //console.log('caching');
                    prev_list[i].load(o.cache_next);
                }, 500);
                break;
            }
        }
    };

    // returns url with querystring based on tag-styled string
    // e.g.: "@thenewhive #art" => "http://currenturl.com/path?user=thenewhive&tag=art"
    o.search_string = function(string){
        var string = string || current_context || navigator_element.find('input').val();
        var tags = (" " + string).match(/(.?)[a-z0-9]+/gi) || [];
        tags = $.map(tags, function(el){
            return el.replace('@', 'user=')
                     .replace('#', 'tag=')
                     .replace(':', 'auth=')
                     .replace(/^[^a-z]/, 'text=')
        });
        return tags.length ? "?" + tags.join('&') : '';
    };

    // Update url, push history state and repopulate navigator based on new context
    o.search = function(){
        var context = navigator_element.find('input').val();
        o.context(context);
    };

    // Pick appropriate updater strategy based on context
    var current_context;
    function change_context(str){
        if (!str) str = "#All";
        navigator_element.find('input').val(str);
        current_context = str;
        switch(str) {
            case "#Network":
                if (!logged_in) {
                    o.context('#Featured');
                    break;
                }
                o.set_updater(Hive.Navigator.NetworkUpdater());
                break;
            case "#Recent":
               o.context('#All');
               break;
            default:
                o.set_updater(Hive.Navigator.Updater());
                break;
        }
    };

    o.context = function(str, push_state) {
        if (typeof(str) == "undefined") return current_context;
        return o.set_context(str, push_state);
    };

    o.set_context = function(str, push_state) {
        change_context(str);
        if (push_state !== false) {
            history_manager.pushState({id: current_expr.id, context: o.context()}, current_expr.title, o.current_url());
        }
        // populate_navigator depends on current url so must come after pushState
        o.populate_navigator();
        return o;
    };

    // Factory method for Expr objects
    o.make_expr = function(data){
        return Hive.Navigator.Expr(data, content_element, opts);
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
                    o.render();
                    callback();
                }
            });
            updater.prev(current_expr, o.visible_count(), function(data){
                prev_list = $.map(data, o.make_expr);
                prev_list.loaded = true;
                if (next_list.loaded) {
                    o.render();
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
        var query = URI(window.location.href).query(true);
        change_context(build_search(query));

        history_manager.replaceState({id: current_expr.id, context: o.context()}, current_expr.title, o.current_url());
        o.populate_navigator();
        current_expr.frame = frame;
        current_expr.show();
        // if opts.hidden is true, render initially offscreen, then hide
        // completely for better mobile browser experience
        var bottom = opts.hidden ? -height * 1.1 : 0;
        navigator_element.css({'height': height, bottom: bottom});
        if (opts.hidden){
            navigator_element.initial_hide_timeout = setTimeout(function(){ navigator_element.hide(); }, 1000);
        }
        return o;
    };

    return o;
};

Hive.Navigator.Expr = function(data, content_element, opts){
    var o = $.extend({}, data);

    o.url =  '/' + o.owner_name + '/' + o.name;

    function on_load(callback){
        if (!$.isFunction(callback)) callback = noop;
        o.loaded = true;
        callback();
    };

    o.load = function(callback, src){
        if (o.frame) return;
        o.loading_started = true;
        var src = src || content_domain + (o.auth_required ? 'empty' : o.id);
        o.frame = $('<iframe>')
            .attr('src', src)
            .css('left', -9999)
            .addClass('expr')
            .on('load', on_load(callback));
        content_element.append(o.frame);
    };

    o.unload = function(){
        if (o.frame) {
            o.frame.remove();
            delete o.frame;
            delete o.loading_started;
            delete o.loaded;
        };
    };

    o.data = function(){
        return data;
    };

    function animate(direction){
        var width = $(window).width();
        var final = {'left': 0};
        o.frame.css({'z-index': 2});
        function animate_complete(){
            $('iframe.expr').not(o.frame).css({left: -9999});
            o.frame.css('z-index', 1);
        };
        if (!direction || direction == 0){
            // in place
            o.frame.css(final);
            animate_complete();
        } else if (direction > 0) {
            // from the right
            o.frame.css({'left': width});
            o.frame.animate(final, animate_complete);
        } else {
            // from the left
            o.frame.css({'left': -width});
            o.frame.animate(final, animate_complete);
        }
    };
    function reload_private(password){
        o.unload();
        var src = content_domain + o.id + "?password=" + password;
        o.load(noop, src);
        $.post(server_url + 'expr_info/' + o.id, { password: password }, function(expr){
            $.extend(Hive.expr, expr);
            Hive.Menus.update_expr(Hive.expr);
        }, 'json');
    };
    function password_dialog(){
        if (o.password){
            // already authorized, pass password along to newhiveexpression.com
            reload_private(o.password);
        } else {
            var dia = showDialog('#dia_password');
            var pass_field = $('#password_form .password');
            pass_field.get(0).focus();
            $('#password_form').submit(function(e){
                dia.close();
                reload_private(pass_field.val());
                e.preventDefault();
            });
        };
    };
    o.show = function(direction){
        if (o.auth_required){
            password_dialog();
        }
        animate(direction);
        var f = o.frame;
        f.attr('name', 'expr');
        if (f[0].contentWindow) {
            f[0].contentWindow.postMessage('show', '*');
        }
    };

    o.hide = function(){
        var f = o.frame;
        f.attr('name', '');
        if (f[0].contentWindow) {
            f[0].contentWindow.postMessage('hide', '*');
        }
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
                var index = seek > 0 ? feed.length : 0;
                query.page = current_expr.feed[index].created;
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

Hive.Navigator.create = function(navigator, viewer, opts){
    var o = Hive.Navigator($(navigator), $(viewer), opts)
        //.set_updater(Hive.Navigator.NetworkUpdater())
        .initialize();
    $(window).resize(o.render);
    $(window).on('statechange', function(){ // Note: We are using statechange instead of popstate
        var state = History.getState(); // Note: We are using History.getState() instead of event.state
        var select_expr = function(){
            if (state.data.id != o.current_id()) {
                o.select_by_id(state.data.id);
            }
        };
        if (state.data.context != o.context()){
            o.set_context(state.data.context, false);
            //o.populate_navigator(select_expr);
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
