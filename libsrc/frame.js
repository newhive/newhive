if (typeof(Hive) == "undefined") Hive = {};

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
                $('#user_nav').animate({ left: -50, top: -50 }, speed);
                $('#owner_nav').animate({ right: -50, top: -50 }, speed);
                $('#action_nav').animate({ right: -50 }, speed);
                drawers.hide();
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
        hover_menu('#comment_btn', '#comment_menu', { layout: 'center_y', min_y: menu_top, offset_x: 13,
            open: function(){ $('#comment_menu textarea').get(0).focus() }, group: nav_menu });

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

        var del_dialog;
        $('.delete_btn').click(function(){ del_dialog = showDialog('#dia_delete'); });
        $('#dia_delete .no_btn').click(function(){ del_dialog.close() });

        o.navigator_menu.delayed_close(5000);
        nav_menu.delayed_close(5000);
    };

    o.user_link = function(name){
        return $('<a>').attr('href', '/' + name)
            .click(function(){ Hive.navigator.context('@' + name); return false; });
    };
    o.face_link = function(name, thumb){
        return o.user_link(name).append( $('<img>').attr('src', thumb).addClass('thumb') );
    };
    o.name_link = function(name){ return o.user_link(name).addClass('user').html(name); };

    o.comment_card = function(item){
        return $("<div class='item'>")
            .append(o.face_link(item.initiator_name, item.initiator_thumb))
            .append( $('<div>').addClass('text').html(
                item.text
                + o.name_link(item.initiator_name).outerHTML()
                + "<div class='time'>" + item.created_friendly + "</div>"
            ) );
    };

    // AJAXy diddling for all content in above menus
    o.update_expr = function(expr){
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
                    .append(o.face_link(item.initiator_name, item.initiator_thumb))
                    .append( $('<div>').addClass('text').html(
                        "<div class='time'>" + item.created_friendly + "</div>"
                        + o.name_link(item.initiator_name).outerHTML() + ' ' + o.action_name(item)
                        + ( item.text ? '<br>"' + item.text + '"' : '' )
                    ) ).appendTo(box);
            });
                    
            // filter in to 3 lists of stars, broadcasts, and comments
            var feeds = { Star: [], Broadcast: [], Comment: [] },
                feed_member = function(l){
                    return $.grep(l, function(i){ return i.initiator == user.id }).length == 1;
                };
            $.map(data, function(item){ feeds[item.class_name].push(item) });

            box = $('#star_menu .items').html('');
            $.map(feeds.Star, function(item){
                o.face_link(item.initiator_name, item.initiator_thumb).appendTo(box);
            });
            $('#star_btn').toggleClass('on', feed_member(feeds.Star));

            box = $('#broadcast_menu .items').html('');
            $.map(feeds.Broadcast, function(item){
                o.face_link(item.initiator_name, item.initiator_thumb).appendTo(box);
            });
            $('#broadcast_btn').toggleClass('on', feed_member(feeds.Broadcast));

            box = $('#comment_menu .items').html('');
            $.map(feeds.Comment, function(item){ o.comment_card(item).prependTo(box); });
            $('#comment_btn').toggleClass('on', feed_member(feeds.Comment));
        };
        $.getJSON(server_url + 'expr_feed/' + expr.id, load_feed);

        o.layout();
    };

    o.update_user = function(user_data){
        console.log('update_user: ', user_data);
    };

    o.password_dialog = function(){
       var dia = showDialog('#dia_password');
       $('#password_input').select();
       $('#password_form').submit(function(){
           dia.close();
           // TODO: POST to loaded expression frame
       });
    };

    o.action_name = function(i){
        if(i.class_name == 'Comment') return 'commented';
        if(i.class_name == 'Star') return 'loved';
        if(i.class_name == 'Broadcast') return 'broadcast';
    };

    o.click_star = require_login(function(entity, btn) {
        var btn = $(btn);
        if(btn.hasClass('inactive')) return;
        btn.addClass('inactive');

        var action = btn.hasClass('on') ? 'unstar' : 'star';
        _gaq.push(['_trackEvent', action]);
        $.post('', {action: action, entity: entity}, function(data) {
            var count = parseInt(btn.attr('data-count'));
            var btn_wrapper = btn.parent();
            btn.removeClass('inactive');
            if (!data) alert("Something went wrong, please try again");
            else if(data.unstarred) {
                btn.removeClass('starred');
                btn_wrapper.attr('title', btn_wrapper.attr('data-title-inactive'));
                btn.attr('data-count', count-1);
                iconCounts();
                $('#dia_starrers .user_cards .' + data.unstarred).remove();
            } else {
                btn.addClass('starred');
                btn_wrapper.attr('title', btn_wrapper.attr('data-title-active'));
                btn.attr('data-count', count+1);
                iconCounts();
                $('#dia_starrers .user_cards').prepend(data);
            };
        }, 'json');
    });

    return o;
})();

var btn_listen_click = require_login(function(entity) {
    btn = $('.listen_button.' + entity); // grab all listen buttons for this user
    if (! btn.hasClass('inactive')) {
        var action = btn.hasClass('starred') ? 'unstar' : 'star';
        btn.addClass('inactive');
        $.post('', {action: action, entity: entity }, function(data) {
            btn.removeClass('inactive');
            if (!data) alert("Something went wrong, please try again");
            else if(data.unstarred) {
                btn.removeClass('starred');
                btn.attr('title', btn.attr('data-title-inactive'));
                $('#dia_listeners .user_cards .' + data.unstarred).remove();
            } else {
                btn.addClass('starred');
                btn.attr('title', btn.attr('data-title-active'));
                $('#dia_listeners .user_cards').prepend(data);
            };
        }, 'json');
    }
    return false;
});
function reloadFeed(){
    $.get('?dialog=feed', function(data){
        $('#feed_menu').html(data);
        var count = $('#notification_count').html();
        var count_div = $('#notifications .count').html(count);
        if (count == "0"){
            count_div.parent('.has_count').andSelf().addClass('zero');
        } else {
            count_div.parent('.has_count').andSelf().removeClass('zero');
        }
    });
}

var btn_broadcast_click = require_login(function(btn) {
    var btn = $('#btn_broadcast');
    if (! btn.hasClass('inactive')) {
        btn.addClass('inactive');
        _gaq.push(['_trackEvent', 'broadcast']);
        $.post('', {'action': 'broadcast', 'domain': window.location.hostname, 'path': window.location.pathname }, function(data) {
            var btn_wrapper = btn.parent();
            btn.removeClass('inactive');
            if (!data) { alert("Something went wrong, please try again"); return; }
            btn.addClass('enabled');
            //if(data.unstarred) {
            //    btn.removeClass('starred');
            //    btn_wrapper.attr('title', btn_wrapper.attr('data-title-inactive'));
            //    btn.attr('data-count', count-1);
            //    iconCounts();
            //    $('#dia_starrers .user_cards .' + data.unstarred).remove();
            //}
        }, 'json');
    }
});

var btn_comment_click = function(){
    loadDialog("?dialog=comments");
    _gaq.push(['_trackEvent', 'comment', 'open_dialog']);
}

var tag_list_html = function(tags, opts){
    if (typeof tags == "undefined") return "";
    opts = $.extend({prefix: '#', cls: ''}, opts);
    var tag_array = typeof(tags) == "string" ? [tags] : tags;
    return $.map(tag_array, function(tag) {
        return "<a href='#" + tag + "' class='tag " + opts.cls + "'>" + opts.prefix + tag + "</a>"
    }).join(' ');
};

function iconCounts() {
    $('.has_count').each(function(){
        var count = $(this).attr('data-count');
        var count_div = $(this).find('.count');
        if (count_div.length == 0){
            count_div = $(this).append('<div class="count"></div>').children().last();
        }
        if (count == "0") {
            count_div.parent('.has_count').andSelf().addClass('zero');
        } else {
            count_div.parent('.has_count').andSelf().removeClass('zero');
        }
        count_div.html(count);
    });
};
