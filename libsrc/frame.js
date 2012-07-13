if (typeof(Hive) == "undefined") Hive = {};

Hive.Menus = {};

// initialize menus for frame page, then close them after delay
Hive.Menus.create = function(){
    var speed = 100;
    var close_nav = function(){
        $('#user_nav').stop().clearQueue().animate({ left: -50, top: -50 }, speed);
        $('#owner_nav').stop().clearQueue().animate({ right: -50, top: -50 }, speed);
        $('#action_nav').stop().clearQueue().animate({ right: -50 }, speed);
    };
    var open_nav = function(){
        $('#user_nav').stop().clearQueue().animate({ left: 0, top: 0 }, speed);
        $('#owner_nav').stop().clearQueue().animate({ right: 0, top: 0 }, speed);
        $('#action_nav').stop().clearQueue().animate({ right: 0 }, speed);
    };

    var drawers = $('#user_nav,#owner_nav,#action_nav'),
        handles = $($.map(drawers, function(e){ return make_handle(e).get(0) }))
            .add('#navigator_handle').add('#navigator');
    Hive.Menus.nav_menu = hover_menu(handles, drawers, { layout: false, open_menu: open_nav,
        close_menu: close_nav, opened: true, close_delay: 1500 } );

    hover_menu( '#logo', '#hive_menu', { offset_y: 8, open: function(){
        $('#search_box').get(0).focus(); }, group: Hive.Menus.nav_menu } );
    if(logged_in) hover_menu( '#username', '#user_menu', { offset_y: 8, group: Hive.Menus.nav_menu } );

    if(!logged_in) {
        Hive.Menus.login_menu = hover_menu( '#login_btn', '#login_menu', {
            open: function() { $('#username').get(0).focus(); },
            close_delay: 1500,
            offset_y: 8,
            layout_x: 'right',
            group: Hive.Menus.nav_menu
        } );
    }

    var swap_action_nav = { open: function(){ $('#action_nav').hide() },
        close: function(){ $('#action_nav').show() } };
    hover_menu('#owner_btn', '#owner_menu', $.extend({ offset_y: 8, layout_x: 'right',
        group: Hive.Menus.nav_menu }, swap_action_nav));
    hover_menu('#share_btn', '#share_menu', $.extend({ offset_y: 8,
        group: Hive.Menus.nav_menu }, swap_action_nav));

    Hive.navigator = Hive.Navigator.create('#navigator', '#expression_frames');
    Hive.Menus.navigator_menu = hover_menu('#navigator_handle', '#navigator', {
        layout: false,
        opened: true,
        open_menu: Hive.navigator.show,
        close_menu: Hive.navigator.hide,
        group: false,
        close_delay: 1500
    });

    setTimeout(function(){
        Hive.Menus.navigator_menu.close();
        Hive.Menus.nav_menu.close();
    }, 5000);
};


// AJAXy diddling for all content in above menus
Hive.Menus.update_expr = function(expr){
    $('.owner_name').html(expr.owner_name);
    $('.owner_thumb').attr('src', expr.owner.thumb);
    $('.owner_url').attr('src', expr.owner.url);

    $('.view .count').html(expr.counts.Views);
    $('.like .count').html(expr.counts.Star);
    $('.broadcast .count').html(expr.counts.Broadcast);
    $('.comment .count').html(expr.counts.Comment);

    // TODO: update share URLs

    console.log('update_expr: ', expr);
};

Hive.Menus.update_user = function(user){
    console.log('update_user: ', expr);
};
