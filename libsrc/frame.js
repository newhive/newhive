if (typeof(Hive) == "undefined") Hive = {};

Hive.Menus = {};

Hive.Menus.layout = function(){
    var o = Hive.Menus, action_nav = $('#action_nav'),
        top = ($(window).height() - Hive.navigator.height() - 47) / 2
            - action_nav.outerHeight() / 2 + 47;
    $('#action_nav_handle').height(action_nav.outerHeight()).add(action_nav)
        .css('top', Math.max(o.action_nav_top, top));

    $('#user_nav_handle').width($('#user_nav').outerWidth());
    $('#owner_nav_handle').width($('#owner_nav').outerWidth());
};

// initialize menus for frame page, then close them after delay
Hive.Menus.create = function(){
    var o = Hive.Menus,
        speed = 100,
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
    hover_menu('#view_btn', '#expr_menu', { layout: 'center_y', min_y: menu_top, offset_x: 11, group: nav_menu });
    hover_menu('#like_btn', '#like_menu', { layout: 'center_y', min_y: menu_top, offset_x: 11, group: nav_menu });
    hover_menu('#broadcast_btn', '#broadcast_menu', { layout: 'center_y', min_y: menu_top, offset_x: 11, group: nav_menu });
    hover_menu('#comment_btn', '#comment_menu', { layout: 'center_y', min_y: menu_top, offset_x: 11, group: nav_menu });

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
    o.layout();

    var del_dialog;
    $('.delete_btn').click(function(){ del_dialog = showDialog('#dia_delete'); });
    $('#dia_delete .no_btn').click(function(){ del_dialog.close() });

    o.navigator_menu.delayed_close(5000);
    nav_menu.delayed_close(5000);
};

// AJAXy diddling for all content in above menus
Hive.Menus.update_expr = function(expr){
    var o = Hive.Menus,
        set_class = function(o, b, c){ return o[b ? 'addClass' : 'removeClass'](c) },
        profile_link = function(name){ return '/' + name + '/profile' };

    $('.expr_id').val(expr.id); // for delete dialog
    $('.btn_box.edit,.btn_box.delete').toggleClass('none', user != expr.owner.id);

    $('.owner_name').html(expr.owner_name);
    $('.owner_thumb').attr('src', expr.owner.thumb);
    $('.owner_thumb').toggleClass('none', !expr.owner.has_thumb);
    $('.owner_url').attr('href', expr.owner.url);

    $('.view .count').html(expr.counts.Views);
    $('.like .count').html(expr.counts.Star).toggleClass('zero', expr.counts.Star == '0');
    $('.broadcast .count').html(expr.counts.Broadcast).toggleClass('zero', expr.counts.Broadcast == '0');
    $('.comment .count').html(expr.counts.Comment).toggleClass('zero', expr.counts.Comment == '0');

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

    // load expr's feed items: likes, broadcasts, comments
    var load_feed = function(data, status, jqXHR){
        // put all items in expr_menu
        var expr_feed = $('#expr_feed').html('');
        $.map(data, function(item){
            $("<div class='item'>"
                + "<a href='" + profile_link(item.initiator_name) + "'>"
                    + "<img src='" + item.initiator_thumb + "'></a>"
                + "<div class='feed_text'>"
                    + "<div class='byline'>" + item.created_friendly + "</div>"
                    + "<a href='" + profile_link(item.initiator_name) + "'>"
                    + item.initiator_name + "</a> " + o.action_name(item)
                    + ( item.text ? '<br>"' + item.text + '"' : '' )
                    + "</div></div>").appendTo(expr_feed);
        });
                
        // filter in to 3 lists of likes, broadcasts, and comments
        console.log('expr_feed: ', data);
        var feeds = { Star: [], Broadcast: [], Comment: [] };
        $.map(data, function(item){ feeds[item.class_name].push(item) });

        var box = $('#like_menu .items').html('');
        $.map(feeds.Star, function(item){
            $('<a>').attr('href', '/' + item.initiator_name)
                .append($('<img>').attr({ src: item.initiator_thumb, title: item.initiator_name }))
                .appendTo(box);
        });
        var box = $('#broadcast_menu .items').html('');
        $.map(feeds.Broadcast, function(item){
            $('<a>').attr('href', profile_link(item.initiator_name))
                .append($('<img>').attr({ src: item.initiator_thumb, title: item.initiator_name }))
                .appendTo(box);
        });

        var box = $('#comment_menu .items').html('');
        $.map(feeds.Comment, function(item){
            
        });

        console.log(feeds);
    };
    $.getJSON(server_url + 'expr_feed/' + expr.id, load_feed);

    o.layout();
};

Hive.Menus.make_handle = function(menu){
    var d = $(menu);
    return $('<div>').addClass('menu_handle').css({
        left: d.offset().left, top: d.offset().top, width: d.width(), height: d.height()
    }).appendTo(document.body);
};

Hive.Menus.update_user = function(user){
    console.log('update_user: ', expr);
};

Hive.Menus.password_dialog = function(){
   var dia = showDialog('#dia_password');
   $('#password_input').select();
   $('#password_form').submit(function(){
       dia.close();
       // TODO: POST to loaded expression frame
   });
};

Hive.Menus.action_name = function(i){
    if(i.class_name == 'Comment') return 'commented';
    if(i.class_name == 'Star') return 'loved';
    if(i.class_name == 'Broadcast') return 'broadcast';
};
