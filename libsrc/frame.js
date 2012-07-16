if (typeof(Hive) == "undefined") Hive = {};

Hive.Menus = {};

Hive.Menus.layout = function(){
    var o = Hive.Menus, action_nav = $('#action_nav'),
        top = ($(window).height() - 225 - 47) / 2 - action_nav.outerHeight() / 2 + 47;
    console.log('top', top);
    action_nav.css('top', Math.max(o.action_nav_top, top));
};

// initialize menus for frame page, then close them after delay
Hive.Menus.create = function(){
    var o = Hive.Menus,
        speed = 100,
        drawers = $('#user_nav,#owner_nav,#action_nav'),
        handles = $($.map(drawers, function(e){ return make_handle(e).get(0) }))
            .add('#navigator_handle').add('#navigator'),
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

    o.navigator_menu.delayed_close(5000);
    nav_menu.delayed_close(5000);
};

// AJAXy diddling for all content in above menus
Hive.Menus.update_expr = function(expr){
    console.log(expr);
    $('.owner_name').html(expr.owner_name);
    $('.owner_thumb').attr('src', expr.owner.thumb);
    $('.owner_thumb')[expr.owner.has_thumb ? 'removeClass' : 'addClass']('none');
    $('.owner_url').attr('src', expr.owner.url);

    $('.view .count').html(expr.counts.Views);
    $('.like .count').html(expr.counts.Star);
    $('.broadcast .count').html(expr.counts.Broadcast);
    $('.comment .count').html(expr.counts.Comment);

    // TODO: update share URLs

    $('#expr_menu .title').html(expr.title);
    $('#expr_menu img').attr('src', expr.thumb);

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
    $.getJSON(server_url + 'expr_feed/' + expr.id, load_feed);
    var load_feed = function(data, status, jqXHR){
        // filter in to 3 lists of likes, broadcasts, and comments
        var feeds = { Star: [], Broadcast: [], Comment: [] };
        $.map(data, function(){ feeds[data.class_name].push(data) });
        console.log(feeds);
    };
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
