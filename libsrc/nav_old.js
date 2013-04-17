if (typeof(Hive) == "undefined") Hive = {};

Hive.load_expr = function(expr){
    Hive.expr = expr;
    Hive.Menus.update_expr(expr);
}

//Hive.password_dialog = function(){
//    var dia = showDialog('#dia_password'), pass_field = $('#password_form .password');
//    pass_field.get(0).focus();
//    $('#password_form').submit(function(){
//        dia.close();
//        $.post(server_url + 'expr_info/' + Hive.expr.id, { password: pass_field.val() }, function(expr){
//            $.extend(Hive.expr, expr);
//            Hive.Menus.update_expr(Hive.expr);
//        }, 'json');
//    });
//};

Hive.Menus = (function(){
    var o = {}, opts = {
        slow_close: 1100,
        pad_right: 0,
        pad_bottom: 0
    };

    o.init = function(group){
        if(!group) group = { menus: [] };

        hover_menu( '#logo', '#hive_menu', { group: group } );

        if(logged_in) {
            hover_menu( '#user_btn', '#user_menu', { group: group, open: function(){
                var div = $('#user_btn .count');
                if(!div.hasClass('zero')){
                    div.addClass('zero');
                    logAction('notifications_open');
                }
            } } );

            $('#hive_menu .email_invites').click(function(){ showDialog('#dia_referral') });

            $('#fb_invite_menu_item').click(function(e){
                _gaq.push(['_trackEvent', 'fb_connect', 'open_invite_dialog', 'user_menu']);
                sendRequestViaMultiFriendSelector();
            });
            $('#fb_connect_menu_item').click(function(e){
                _gaq.push(['_trackEvent', 'fb_connect', 'open_connect_dialog', 'user_menu']);
                showDialog('#dia_facebook_connect');
            });
            $('#fb_listen_menu_item').click(function(e){
                _gaq.push(['_trackEvent', 'fb_connect', 'open_listen_dialog', 'user_menu']);
                e.stopPropagation();
                $(this).addClass('menu_hover');
                loadDialogPost('facebook_listen');
            });

            $('#hive_menu .feedback').click(function(){
                new_window(secure_server + 'feedback?url=' + window.location, 470, 400);
            });

            $('#add_to_featured').click(function(){
                var that = $(this);
                if (that.hasClass('inactive')) return;
                that.addClass('inactive');
                $.post('/', {action: 'add_to_featured', id: Hive.expr.id}, function(data){
                    that.removeClass('inactive');
                    Hive.expr.featured = data;
                    Hive.Menus.update_expr(Hive.expr);
                    alert('(re)added to featured');
                });
            });
        }
        else {
            o.login_menu = hover_menu( '#login_btn', '#login_menu', {
                open: function() { $('#username').get(0).focus(); },
                close_delay: opts.slow_close,
                group: group
            } );
            if(error) $(function(){ o.login_menu.open().sticky = true; });
            $('#call_to_action').html(Hive.config.nav.call_to_action);
        }

        var swap_action_nav = {
            open: function(){ $('#action_nav').hide(); },
            close: function(){
                if ($.inArray('action', Hive.config.frame.nav.visible) != -1) $('#action_nav').show();
            }
        };

        if ($('#share_btn').length) {
            hover_menu(
                '#share_btn', '#share_menu',
                $.extend({ group: group }, swap_action_nav)
            );
        }

        if ($('#owner_btn').length) {
            hover_menu(
                '#owner_btn', '#owner_menu',
                $.extend({ group: group }, swap_action_nav)
            );
        }
        $('#owner_menu .menu_item.listen').click(function(){
            o.feed_toggle('star', o.owner.id, '#owner_menu .menu_item.listen', '', {ga: 'listen'})
        });

        o.update_owner( owner );

        // email and embed menus
        $(function(){
            $('.menu_item.message').click(require_login('email', function(){showDialog('#dia_share')}));
            var dia = $('#dia_share');
            dia.find('form').submit(function(e){
                var submit = dia.find('input[type=submit]');
                if (submit.hasClass('inactive')) return false;
                submit.addClass('inactive');
                var callback = function(){
                    submit.removeClass('inactive');
                    dia.find('#email_to').val('');
                    dia.children().hide();
                    var tmp = $('<h2>Your message has been sent.</h2>').appendTo(dia);
                    setTimeout(function(){
                        dia.data('dialog').close();
                        dia.children().show();
                        tmp.remove();
                    }, 1500);
                };
                asyncSubmit('#dia_share form', callback, {url: window.location.href});
                _gaq.push(['_trackEvent', 'share', 'email']);
                return false;
            });

            $('.menu_item.embed').click(function(){
                showDialog('#dia_embed');
                $('#dia_embed textarea').get(0).focus();
            });
        });
    };

    o.home_init = function(){
        Hive.config.frame.navigator.hideable = false;
        Hive.config.frame.nav.visible = ['owner'];

        // Set up special version of navigator
        if (!Hive.navigator) {
            Hive.navigator = Hive.Navigator.create(
                '#navigator',
                '#expression_frames',
                {
                    hidden: false,
                    initial_replaceState: false,
                    show_current: false
                }
            );
        }
        Hive.navigator.current_expr().site_expr = true;
        var context = URI(window.location.href).query(true).q || '#Featured';
        Hive.navigator.context(context, false);  // also populates navigator

        o.expr_init();

        // Set up owner nav customizations
        var about_btn = $('<div>')
            .attr('id', 'about_btn')
            .attr('class', 'hoverable center text_btn black_active')
            .click(function(){ window.location = server_url + 'thenewhive/about?q=%40thenewhive' })
            .append('<div>')
          .children()
            .attr('class', 'text')
            .append('<span>About</span>')
          .parent();

        var facebook = $('<a>')
            .attr('href', 'http://facebook.com/thenewhive')
            .append('<img>')
          .children()
            .attr('src',  asset('skin/1/social/facebook.png'))
          .parent();

        var twitter = $('<a>')
            .attr('href', 'http://twitter.com/newhive')
            .append('<img>')
          .children()
            .attr('src',  asset('skin/1/social/twitter.png'))
          .parent();

        var social_icons = $('<div>')
            .attr('id', 'social_icons')
            .append(facebook).append(twitter);

        $('#owner_nav').append(about_btn).append(social_icons);

        $('#owner_btn').hide();

        uninitialized = false;
        var uninitialize = function(){
            if (uninitialized) return;
            uninitialized = true;

            Hive.config.frame.navigator.hideable = true;
            Hive.config.frame.nav.visible = ['owner', 'user', 'action'];
            Hive.Menus.show_drawers();

            about_btn.remove();
            social_icons.remove();
            $('#owner_btn').show();
            $('#navigator').find('.navigator_inner .current, .loupe').show()
            Hive.navigator.update_opts({show_current: true});
        };
        Hive.navigator.update_opts({onexpressionchange: uninitialize});
    };

    // initialize menus for frame page, then close them after delay
    o.expr_init = function(){
        var config = Hive.config.frame;
        var fullscreen = Hive.is_fullscreen();
        $(window).resize(function(){
            var new_fullscreen = Hive.is_fullscreen();
            // Set the nav to close if we've just moved to fullscreen
            if (!fullscreen && new_fullscreen) {
                //nav_menu.close();
                nav_menu.delayed_close(1000);
            } else if (fullscreen && !new_fullscreen){
                nav_menu.open();
            }
            fullscreen = new_fullscreen;
        });

        function animate_each(state, speed, callback){
            var fun = speed ? 'animate' : 'css';
            $.each(state, function(selector, style){
                $(selector)[fun](style, speed, callback);
            });
        };
        var open_state = function(opts){
            return {
                '#user_nav': {left: 0, top: 0}
                , '#owner_nav': { right: opts.pad_right, top: 0 }
                , '#action_nav': { right: opts.pad_right }
            };
        };
        var close_state = {
                '#user_nav': {left: -50, top: -60}
                , '#owner_nav': { right: -50, top: -60 }
                , '#action_nav': { right: -50 }
            };
        var speed = config.speed,
            drawers = $('#user_nav,#owner_nav,#action_nav');
        var handles = $('.nav_handle').add(drawers);
        if (config.navigator.opens_nav) handles.add('#navigator');

        var close_nav = function(){
            if (config.nav.opens_navigator && config.navigator.hideable) Hive.navigator.hide(speed);
            drawers.stop().clearQueue();
            // For some reason just using drawers.hide as the callback for animate didn't work
            var callback = function(){ drawers.hide(); };
            animate_each(close_state, speed, callback);
            Hive.navigator.current_expr().frame.get(0).focus();
        };
        var close_condition = function(){
            return config.nav.hideable || Hive.is_fullscreen();
        };

        var shared_hover_menu_opts = {
            layout: false,
            open_delay: config.open_delay,
            close_delay: config.close_delay,
            group: false
        }

        //var nav_menu = o.nav_menu = hover_menu(
        //    handles,
        //    drawers,
        //    $.extend(
        //        {
        //            opened: config.nav.open_initially,
        //            close_menu: close_nav,
        //            close_condition: close_condition
        //        },
        //        shared_hover_menu_opts
        //    )
        //);

        if (config.init_close_delay && config.nav.hideable) {
            nav_menu.delayed_close(config.init_close_delay);
        }
        var navigator_handles = '#navigator_handle';
        if (config.nav.opens_navigator){
            navigator_handles += ", .nav_handle";
        }
        //var navigator_hover_menu = hover_menu(
        //    $(navigator_handles),
        //    $('#navigator'),
        //    $.extend(
        //        { opened: config.navigator.open_initially,
        //          open_menu: function(){ Hive.navigator.show(speed); },
        //          close_condition: function(){ return config.navigator.hideable; },
        //          close_menu: function(){ Hive.navigator.hide(speed); }
        //        },
        //        shared_hover_menu_opts
        //    )
        //);

        o.init(nav_menu);

        hover_menu('#expr_btn', '#expr_menu');
        hover_menu('#star_btn', '#star_menu');
        hover_menu('#broadcast_btn', '#broadcast_menu');
        hover_menu('#comment_btn', '#comment_menu',
            {
                open: function(){
                    $('#comment_menu textarea').get(0).focus();
                    var box = $('#comment_menu .items');
                    box.scrollTop(box.get(0).scrollHeight);
                }
            }
        );

        $('#star_btn').click(function(){
            o.feed_toggle('star', Hive.expr.id, '#star_btn', '#star_menu .items');
        });
        $('#broadcast_btn').click(function(){
            if (Hive.expr.owner.id != user.id){
                o.feed_toggle('broadcast', Hive.expr.id, '#broadcast_btn', '#broadcast_menu .items');
            }
        });

        $('#comment_form').submit(o.post_comment);

        var del_dialog;

        $('#action_nav .delete').click(function(){ del_dialog = showDialog('#dia_delete'); });
        $(function(){ $('#dia_delete .no_btn').click(function(){ del_dialog.close() }) });

        if (!Hive.navigator) {
            Hive.navigator = Hive.Navigator.create(
                '#navigator',
                '#expression_frames',
                {hidden: !config.navigator.open_initially}
            );
        }
        Hive.load_expr(Hive.navigator.current_expr());
        //o.navigator_menu = hover_menu(handles, '#navigator', {
        //    layout: false,
        //    opened: false,
        //    open_menu: Hive.navigator.show,
        //    close_menu: Hive.navigator.hide,
        //    group: nav_menu,
        //    close_delay: o.slow_close
        //});

        $(window).off('message').on('message', function(e){
            var msg = e.originalEvent.data;
            if(msg == 'focus' && nav_menu) {
                nav_menu.close(true);
            }
        });

        o.update_expr(expr);
    };

    o.user_link = function(name, id){
        return $('<a>').attr('href', '/' + name).addClass(id);
            //.click(function(){ Hive.navigator.context('@' + name); return false; });
    };
    o.face_link = function(name, id, thumb){
        return o.user_link(name, id).append(
            $('<img>').attr({ src: thumb, title: name }).addClass('thumb') );
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
        btn = $(btn).toggleClass('on', state).toggleClass('off', !state);
        if(btn.attr('data-title-on'))
            btn.attr('title', btn.attr('data-title-' + (state ? 'on' : 'off') ));
    }

    // AJAXy diddling for all content in above menus
    o.update_share_urls = function(expr){
        var update_functions = {
            facebook: function(url){ return 'http://www.facebook.com/sharer.php?u=' + url }
            , twitter: function(url){ return 'http://twitter.com/share?url=' + url }
            , tumblr: function(url){ return 'http://www.tumblr.com/share?v=3&u=' + url }
            , pinterest: function(url, title, thumb){ return "http://pinterest.com/pin/create/button/?url=" + url + "&media=" + thumb }
            , stumble: function(url, title){ return 'http://www.stumbleupon.com/submit?url=' + url + '&title=' + title }
            , gplus: function(url){ return "https://plusone.google.com/_/+1/confirm?hl=en-US&url=" + url }
            , linkedin: function(url, title){ return "http://www.linkedin.com/shareArticle?mini=true&url=" + url + "&title=" + title }
            , reddit: function(url){ return 'http://www.reddit.com/submit?url=' + url }
        };
        var share_menu = $('#share_menu');
        $.each(update_functions, function(key, fun){
            var link = share_menu.find('a.' + key);
            var href = fun(
                encodeURIComponent(expr.url)
                , encodeURIComponent(expr.title)
                , encodeURIComponent(expr.thumb)
            );
            link.attr('href', href);
        });
    };

    o.update_expr = function(expr){
        //if(!nav_menu.opened) expr.frame.get(0).focus();
        var set_class = function(o, b, c){ return o[b ? 'addClass' : 'removeClass'](c) };

        var is_owner = user ? (user.id == expr.owner.id) : false;

        $('.edit_url').attr('href', secure_server + 'edit/' + expr.id);
        $('.expr_id').val(expr.id); // for delete dialog
        $('.edit_btn').toggleClass( 'none', ! is_owner );

        var owner_name = expr.owner_name[0].toUpperCase() + expr.owner_name.slice(1);
        $('.owner_name').html(owner_name);
        $('#owner_btn .user_thumb').attr('src', expr.owner.thumb)
            .toggleClass('none', !expr.owner.has_thumb);
        $('.owner_url').attr('href', expr.owner.url);
        o.update_owner( expr.owner );

        var is_empty = function(v){ return !v || (v == '0') };
        if( expr.counts ){
            $('.view .count').html(expr.counts.Views);
            $('.star .count').html(expr.counts.Star).toggleClass('zero', is_empty(expr.counts.Star));
            $('.broadcast .count').html(expr.counts.Broadcast).toggleClass('zero', is_empty(expr.counts.Broadcast));
            $('.comment .count').html(expr.counts.Comment).toggleClass('zero', is_empty(expr.counts.Comment));
        }

        // update share URLs and embed dialog
        o.update_share_urls(expr);
        var embed_url = 'https://' + window.location.host + window.location.pathname + '?template=embed';
        $('#dia_embed textarea').val("<iframe src='" + embed_url + "' style='width: 100%; height: 100%' marginwidth='0' marginheight='0' frameborder='0' vspace='0' hspace='0'></iframe>");

        $('#expr_menu .big_card .title').html(expr.title);
        $('#expr_menu .big_card .thumb').attr('src', expr.thumb);
        $('#expr_menu .tags').html(tag_list_html(expr.tags_index));
        $('#expr_menu .time').html(expr.updated_friendly);

        var featured = expr.featured ? 'true' : 'false';
        $('#add_to_featured').find('.' + featured).show();
        $('#add_to_featured').find('.' + featured).hide();

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
            var has_commented = feed_member(o.feeds.Comment);
            o.btn_state('#comment_btn', has_commented);
            $('#comment_menu').toggleClass('on', has_commented).toggleClass('off', !has_commented);
        };
        var feed_url = server_url + 'expr_feed/' + expr.id;
        if(expr.password) $.post(feed_url, { password: expr.password }, load_feed, 'json');
        else $.getJSON(feed_url, load_feed);
    };

    // load owner's info: feed items in owner_menu, expr links and thumbs, listening status
    o.owner = false;
    o.update_owner = function( owner ){
        if( ! owner || o.owner && o.owner.id == owner.id ) return;
        o.owner = owner;

        var is_owner = (user && owner) ? (user.id == owner.id) : false;
        $('#owner_btn').toggleClass('none', is_owner);
        if( !owner || is_owner ) return;

        $.getJSON('/user/' + owner.id, function(data, status, jqXHR){
            var thumbs = $('#owner_menu .thumbs');
            thumbs.html('');
            $.map(data.exprs, function(e){
                $('<a>').attr({ 'href': e.url + '?user=' + owner.name, 'title': e.title })
                    // TODO: enable this when Navigator supports changing both expression and context
                    //.click(function(){
                    //    Hive.navigator.context('@' + owner.name).select_by_id(e.id);
                    //    return false;
                    //})
                    .append($('<img>').attr('src', e.thumb).addClass('thumb')).appendTo(thumbs);
            });

            $('#owner_menu .items').html(data.feed_html);

            $('#owner_menu .listen').removeClass('on off').addClass( data.listening ? 'on' : 'off' );
        });
    };

    o.update_user = function(user_data){
        //console.log('update_user: ', user_data);
    };

    o.action_name = function(i){
        if(i.class_name == 'Comment') return 'commented';
        if(i.class_name == 'Star') return 'loves';
        if(i.class_name == 'Broadcast') return 'broadcast';
    };

    o.server_error = function(){
        alert("Sorry, something went wrong. Try refreshing the page and trying again.");
    };

    o.feed_toggle = require_login('feed_toggle', function(action, entity, btn, items, opts) {
        btn = $(btn); items = $(items);
        if(btn.hasClass('inactive')) return;
        btn.addClass('inactive');

        var ga_action = (opts && opts.ga) || action;

        var state = btn.hasClass('off');
        _gaq.push(['_trackEvent', (state ? '' : 'un') + ga_action, entity]);
        $.post('', { action: action, entity: entity, state: state }, function(data) {
            var count_e = btn.find('.count');
            var count = parseInt(count_e.html());
            btn.removeClass('inactive');

            if(!data) { o.server_error(); return; }
            if(data.state) {
                count_e.html(count + 1);
                if (items.length) o.face_link(user.name, user.id, user.thumb).prependTo(items);
            } else {
                count_e.html(count - 1);
                if (items.length) items.find('.' + user.id).remove();
            };
            o.btn_state(btn, data.state);
        }, 'json');
    });

    o.post_comment = require_login('comment', function(){
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
            $('#comment_form textarea').val('');
        }, 'json');

        return false;
    });

    return o;
})();

var tag_list_html = function(tags, opts){
    if (typeof tags == "undefined") return "";
    opts = $.extend({prefix: '#', cls: '', join: ' ', href: function(tag, opts){ return '#' + tag }}, opts);
    var tag_array = typeof(tags) == "string" ? [tags] : tags;
    return $.map(tag_array, function(tag) {
        return "<a href='" + opts.href(tag, opts) + "' class='tag " + opts.cls + "'>" + opts.prefix + tag + "</a>"
    }).join(opts.join);
};

var sendRequestViaMultiFriendSelector = function(){
  function requestCallback(response) {
    $('#dia_referral .btn_dialog_close').click();
    if (response){
      _gaq.push(['_trackEvent', 'fb_connect', 'invite_friends', undefined, response.to.length]);
      showDialog('#dia_sent_invites_thanks');
      $.post('/', {'action': 'facebook_invite', 'request_id': response.request, 'to': response.to.join(',')});
    }
  }
  FB.ui({method: 'apprequests'
    , message: 'Join me on NewHive'
    , title: 'Invite Friends to Join NewHive'
    , filters: ['app_non_users']
  }, requestCallback);
};