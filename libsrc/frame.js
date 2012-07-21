if (typeof(Hive) == "undefined") Hive = {};

Hive.load_expr = function(expr){
    Hive.expr = expr;

    if(expr.auth_required){
        $('#password_form').attr('action', content_domain + expr.id);
        if(expr.password){
            // already authorized, pass password along to newhiveexpression.com
            $('#password_form .password').val(expr.password);
            $('#password_form').submit();
        } else {
            Hive.password_dialog();
            return;
        }
    }

    Hive.Menus.update_expr(expr);
}

Hive.password_dialog = function(){
    var dia = showDialog('#dia_password'), pass_field = $('#password_form .password');
    pass_field.get(0).focus();
    $('#password_form').submit(function(){
        dia.close();
        $.post(server_url + 'expr_info/' + Hive.expr.id, { password: pass_field.val() }, function(expr){
            $.extend(Hive.expr, expr);
            console.log(expr);
            Hive.Menus.update_expr(Hive.expr);
        }, 'json');
    });
};

Hive.Menus = (function(){
    var o = {};

    o.layout = function(){
        var action_nav = $('#action_nav'),
            top = ($(window).height() - Hive.navigator.height() - 47) / 2
                - action_nav.outerHeight() / 2 + 47;
        $('#action_nav_handle').height(action_nav.outerHeight()).add(action_nav)
            .css('top', Math.max(o.action_nav_top, top));

        $('#user_nav_handle').width($('#user_nav').outerWidth());
        $('#owner_nav_handle').width($('#owner_nav').outerWidth());
    };

    // initialize menus for frame page, then close them after delay
    o.create = function(){
        var speed = 100,
            drawers = $('#user_nav,#owner_nav,#action_nav'),
            handles = $('.menu_handle').add('#navigator_handle').add('#navigator'),
            close_nav = function(){
                drawers.stop().clearQueue();
                $('#user_nav').animate({ left: -50, top: -50 }, { complete:
                    function(){ drawers.hide() } }, speed);
                $('#owner_nav').animate({ right: -50, top: -50 }, speed);
                $('#action_nav').animate({ right: -50 }, speed);
                Hive.navigator.current_expr().frame.get(0).focus();
            },
            open_nav = function(){
                drawers.stop().clearQueue().show();
                $('#user_nav').animate({ left: 0, top: 0 }, speed);
                $('#owner_nav').animate({ right: 0, top: 0 }, speed);
                $('#action_nav').animate({ right: 0 }, speed);
            };
            nav_menu = o.nav_menu = hover_menu(handles, drawers, { layout: false,
                open_menu: open_nav, close_menu: close_nav, opened: true, close_delay: 1500 } );

        hover_menu( '#logo', '#hive_menu', { offset_y: 8, open: function(){
            $('#search_box').get(0).focus(); }, group: o.nav_menu } );
        if(logged_in) hover_menu( '#username', '#user_menu', { offset_y: 8, group: o.nav_menu } );

        if(!logged_in) {
            o.login_menu = hover_menu( '#login_btn', '#login_menu', {
                open: function() { $('#username').get(0).focus(); },
                close_delay: 1500,
                offset_y: 8,
                layout_x: 'right',
                group: nav_menu
            } );
        }

        var swap_action_nav = { open: function(){ $('#action_nav').hide() },
            close: function(){ $('#action_nav').show() } };
        hover_menu('#owner_btn', '#owner_menu', $.extend({ offset_y: 8, layout_x: 'right',
            group: nav_menu }, swap_action_nav));
        hover_menu('#share_btn', '#share_menu', $.extend({ offset_y: 8,
            group: nav_menu }, swap_action_nav));

        o.action_nav_top = 70;
        var menu_top = o.action_nav_top + 4;
        hover_menu('#view_btn', '#expr_menu', { layout: 'center_y', min_y: menu_top, offset_x: 13, group: nav_menu });
        hover_menu('#star_btn', '#star_menu', { layout: 'center_y', min_y: menu_top, offset_x: 13, group: nav_menu });
        hover_menu('#broadcast_btn', '#broadcast_menu', { layout: 'center_y', min_y: menu_top, offset_x: 13, group: nav_menu });
        hover_menu('#comment_btn', '#comment_menu', { layout: 'center_y', min_y: menu_top,
            offset_x: 13, open: function(){
                $('#comment_menu textarea').get(0).focus();
                var box = $('#comment_menu .items');
                box.scrollTop(box.get(0).scrollHeight);
            }, group: nav_menu });

        $('#star_btn').click(function(){ o.feed_toggle('star', Hive.expr.id, '#star_btn',
            '#star_menu .items') });
        $('#broadcast_btn').click(function(){ o.feed_toggle('broadcast', Hive.expr.id,
            '#broadcast_btn', '#broadcast_menu .items') });

        $('#comment_form').submit(o.post_comment);

        var del_dialog;
        $('.delete_btn').click(function(){ del_dialog = showDialog('#dia_delete'); });
        $('#dia_delete .no_btn').click(function(){ del_dialog.close() });

        Hive.navigator = Hive.Navigator.create('#navigator', '#expression_frames');
        o.navigator_menu = hover_menu('#navigator_handle', '#navigator', {
            layout: false,
            opened: true,
            open_menu: Hive.navigator.show,
            close_menu: Hive.navigator.hide,
            group: false,
            close_delay: 1500
        });

        $(window).resize(o.layout);
        o.update_expr(expr);

        o.navigator_menu.delayed_close(5000);
        nav_menu.delayed_close(5000);
    };

    o.user_link = function(name, id){
        return $('<a>').attr('href', '/' + name).addClass(id)
            .click(function(){ Hive.navigator.context('@' + name); return false; });
    };
    o.face_link = function(name, id, thumb){
        return o.user_link(name, id).append( $('<img>').attr('src', thumb).addClass('thumb') );
    };
    o.name_link = function(name, id){ return o.user_link(name, id).addClass('user').html(name); };

    o.comment_card = function(item){
        return $("<div class='item'>")
            .append(o.face_link(item.initiator_name, item.initiator, item.initiator_thumb))
            .append( $('<div>').addClass('text').html(
                item.text
                + o.name_link(item.initiator_name, item.initiator).outerHTML()
                + "<div class='time'>" + item.created_friendly + "</div>"
            ) );
    };

    o.btn_state = function(btn, state){
        btn = $(btn);
        btn.toggleClass('on', state);
        btn.toggleClass('off', !state);
        if(btn.attr('data-title-on'))
            btn.attr('title', btn.attr('data-title-' + (state ? 'on' : 'off') ));
    }

    // AJAXy diddling for all content in above menus
    o.update_expr = function(expr){
        if(!o.navigator_menu.opened) Hive.navigator.current_expr().frame.get(0).focus();
        var set_class = function(o, b, c){ return o[b ? 'addClass' : 'removeClass'](c) };

        $('.expr_id').val(expr.id); // for delete dialog
        $('.btn_box.edit,.btn_box.delete').toggleClass('none', user.id != expr.owner.id);

        $('.owner_name').html(expr.owner_name);
        $('.owner_thumb').attr('src', expr.owner.thumb);
        $('.owner_thumb').toggleClass('none', !expr.owner.has_thumb);
        $('.owner_url').attr('href', expr.owner.url);

        var is_empty = function(v){ return !v || (v == '0') };
        $('.view .count').html(expr.counts.Views);
        $('.star .count').html(expr.counts.Star).toggleClass('zero', is_empty(expr.counts.Star));
        $('.broadcast .count').html(expr.counts.Broadcast).toggleClass('zero', is_empty(expr.counts.Broadcast));
        $('.comment .count').html(expr.counts.Comment).toggleClass('zero', is_empty(expr.counts.Comment));

        // TODO: update share URLs

        $('#expr_menu .big_card .title').html(expr.title);
        $('#expr_menu .big_card .thumb').attr('src', expr.thumb);
        $('#expr_menu .tags').html(tag_list_html(expr.tags_index));

        // load owner's info: feed items in owner_menu, expr links and thumbs, listening status
        $.getJSON(server_url + 'user/' + expr.owner.id, function(data, status, jqXHR){
            var thumbs = $('#owner_menu .thumbs');
            thumbs.html('');
            $.map(data.exprs, function(e){
                $('<a>').attr('href', e.url).append(
                    $('<img>').attr('src', e.thumb).addClass('thumb')).prependTo(thumbs);
            });
            $('#owner_menu .listen').removeClass('on off').addClass(data.listening ? 'on' : 'off');
            $('#owner_menu .items').html(data.feed_html);
        });

        // load expr's feed items: stars, broadcasts, comments
        var load_feed = function(data, status, jqXHR){
            // put all items in expr_menu
            var box = $('#expr_menu .items').html('');
            $.map(data, function(item){
                $("<div class='item'>")
                    .append(o.face_link(item.initiator_name, item.initiator, item.initiator_thumb))
                    .append( $('<div>').addClass('text').html(
                        "<div class='time'>" + item.created_friendly + "</div>"
                        + o.name_link(item.initiator_name, item.initiator).outerHTML()
                        + ' ' + o.action_name(item)
                        + ( item.text ? '<br>"' + item.text + '"' : '' )
                    ) ).appendTo(box);
            });
                    
            // filter in to 3 lists of stars, broadcasts, and comments
            o.feeds = { Star: [], Broadcast: [], Comment: [] };
            var feed_member = function(l){
                    return $.grep(l, function(i){ return i.initiator == user.id }).length >= 1;
                };
            $.map(data, function(item){ o.feeds[item.class_name].push(item) });

            box = $('#star_menu .items').html('');
            $.map(o.feeds.Star, function(item){
                o.face_link(item.initiator_name, item.initiator, item.initiator_thumb).appendTo(box);
            });
            o.btn_state('#star_btn', feed_member(o.feeds.Star));

            box = $('#broadcast_menu .items').html('');
            $.map(o.feeds.Broadcast, function(item){
                o.face_link(item.initiator_name, item.initiator, item.initiator_thumb).appendTo(box);
            });
            o.btn_state('#broadcast_btn', feed_member(o.feeds.Broadcast));

            box = $('#comment_menu .items').html('');
            $.map(o.feeds.Comment, function(item){ o.comment_card(item).prependTo(box); });
            o.btn_state('#comment_btn', feed_member(o.feeds.Comment));
        };
        var feed_url = server_url + 'expr_feed/' + expr.id;
        if(expr.password) $.post(feed_url, { password: expr.password }, load_feed, 'json');
        else $.getJSON(feed_url, load_feed);

        o.layout();
    };

    o.update_user = function(user_data){
        console.log('update_user: ', user_data);
    };

    o.action_name = function(i){
        if(i.class_name == 'Comment') return 'commented';
        if(i.class_name == 'Star') return 'loved';
        if(i.class_name == 'Broadcast') return 'broadcast';
    };

    o.server_error = function(){
        alert("Sorry, something went wrong. Try refreshing the page and trying again.");
    };

    o.click_listen = require_login(function(entity) {
        btn = $('.listen.' + entity); // grab all listen buttons for this user
        if(btn.hasClass('inactive')) return;

        var state = btn.hasClass('off');
        _gaq.push(['_trackEvent', state ? 'listen' : 'unlisten']);
        btn.addClass('inactive');
        $.post('', { action: 'star', entity: entity }, function(data) {
            btn.removeClass('inactive');
            if(!data) { o.server_error(); return }
            o.btn_state(btn, state);
        }, 'json');

        return false;
    });

    o.feed_toggle = require_login(function(action, entity, btn, items) {
        btn = $(btn); items = $(items);
        if(btn.hasClass('inactive')) return;
        btn.addClass('inactive');

        var state = btn.hasClass('off');
        _gaq.push(['_trackEvent', (state ? '' : 'un') + action]);
        $.post('', { action: action, entity: entity, state: state }, function(data) {
            var count_e = btn.find('.count');
            var count = parseInt(count_e.html());
            btn.removeClass('inactive');

            console.log(data);
            if(!data) { o.server_error(); return; }
            if(data.state) {
                count_e.html(count + 1);
                o.face_link(user.name, user.id, user.thumb).prependTo(items);
            } else {
                count_e.html(count - 1);
                items.find('.' + user.id).remove();
            };
            o.btn_state(btn, data.state);
        }, 'json');
    });

    o.post_comment = require_login(function(){
        btn = $('#comment_form .submit'); items = $('#comment_menu .items');
        if(btn.hasClass('inactive')) return;
        btn.addClass('inactive');

        var text = $('#comment_form textarea').val();
        if(text.trim() == '') return false;
        _gaq.push(['_trackEvent', 'post_comment']);
        $.post('', { action: 'comment', entity: Hive.expr.id, text: text }, function(data) {
            btn.removeClass('inactive');
            if(!data) { o.server_error(); return; }
            o.comment_card(data).appendTo(items);
            items.scrollTop(items.get(0).scrollHeight);
            o.btn_state('#comment_btn', true);
        }, 'json');

        return false;
    });

    return o;
})();

var tag_list_html = function(tags, opts){
    if (typeof tags == "undefined") return "";
    opts = $.extend({prefix: '#', cls: '', join: ' ', href: function(tag){ return '#' + tag }}, opts);
    var tag_array = typeof(tags) == "string" ? [tags] : tags;
    return $.map(tag_array, function(tag) {
        return "<a href=" + opts.href(tag) + "' class='tag " + opts.cls + "'>" + opts.prefix + tag + "</a>"
    }).join(opts.join);
};
