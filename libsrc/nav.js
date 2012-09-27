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

    o.layout = function(dims){
        var action_nav = $('#action_nav'),
            top = ($(window).height() - Hive.navigator.height() - 47) / 2
                - action_nav.outerHeight() / 2 + 47;
        $('#action_nav_handle').height(action_nav.outerHeight()).add(action_nav)
            .css('top', Math.max(o.action_nav_top, top));

        $('#user_nav_handle').width($('#user_nav').outerWidth());
        $('#owner_nav_handle').width($('#owner_nav').outerWidth());

        opts.pad_right = $(window).width() - dims[0];
        opts.pad_bottom = $(window).height() - dims[1];
        $('#action_nav_handle, #owner_nav_handle, #right_nav_handle').css('right', opts.pad_right + 3);
        $('#navigator_handle').css('bottom', opts.pad_bottom);

        Hive.navigator.layout({ pad_bottom: opts.pad_bottom, pad_right: opts.pad_right });
        if( o.nav_menu.opened ) $('#action_nav, #owner_nav').css('right', opts.pad_right);
    };

    o.init = function(group){
        if(!group) group = { menus: [] };

        hover_menu( '#logo', '#hive_menu', { offset_y: 8, open: function(){
            $('#search_box').get(0).focus(); }, group: group } );

        if(logged_in) {
            hover_menu( '#user_btn', '#user_menu', { offset_y: 8, group: group, open: function(){
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
                offset_y: 8,
                layout_x: 'right',
                group: group
            } );
            $('#call_to_action').html(Hive.config.nav.call_to_action);
        }

        var swap_action_nav = { open: function(){ $('#action_nav').hide() },
            close: function(){ $('#action_nav').show() } };

        if($('#owner_btn').length) hover_menu('#owner_btn', '#owner_menu', $.extend({ offset_y: 8,
            layout_x: 'right', group: group }, swap_action_nav));
        $('#owner_menu .menu_item.listen').click(function(){
            o.feed_toggle('star', Hive.expr ? Hive.expr.owner.id : owner_id, '#owner_menu .menu_item.listen', '', {ga: 'listen'})
        });

        if($('#share_btn').length) hover_menu('#share_btn', '#share_menu', $.extend({ offset_y: 8,
            group: group }, swap_action_nav));
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
                if (config.nav.opens_navigator) Hive.navigator.hide(speed);
                drawers.stop().clearQueue();
                // For some reason just using drawers.hide as the callback for animate didn't work
                var callback = function(){ drawers.hide(); };
                animate_each(close_state, speed, callback);
                Hive.navigator.current_expr().frame.get(0).focus();
            };
        var close_condition = function(){
            return config.nav.hideable || Hive.is_fullscreen();
        };
        var open_nav = function(){
                drawers.stop().clearQueue().show();
                animate_each(open_state(opts), speed);
                if (config.nav.opens_navigator){
                    Hive.navigator.show(speed);
                }
            };

        var shared_hover_menu_opts = {
            layout: false,
            open_delay: config.open_delay,
            close_delay: config.close_delay,
            group: false
        }

        var nav_menu = o.nav_menu = hover_menu(
            handles,
            drawers,
            $.extend(
                {
                    opened: config.nav.open_initially,
                    open_menu: open_nav,
                    close_menu: close_nav,
                    close_condition: close_condition
                },
                shared_hover_menu_opts
            )
        );
        if (config.auto_close_delay && config.nav.hideable) {
            nav_menu.delayed_close(config.auto_close_delay);
        }
        var navigator_handles = '#navigator_handle';
        if (config.nav.opens_navigator){
            navigator_handles += ", .nav_handle";
        }
        var navigator_hover_menu = hover_menu(
            $(navigator_handles),
            $('#navigator'),
            $.extend(
                { opened: config.navigator.open_initially,
                  open_menu: function(){ Hive.navigator.show(speed); },
                  close_menu: function(){ Hive.navigator.hide(speed); }
                },
                shared_hover_menu_opts
            )
        );

        o.init(nav_menu);
        var initial_state = config.nav.open_initially ? open_state(opts) : close_state;
        animate_each(initial_state, 0);
        drawers.show();

        o.action_nav_top = 70;
        var menu_top = o.action_nav_top + 4;
        hover_menu('#view_btn', '#expr_menu',
            { layout: 'center_y', min_y: menu_top, offset_x: 13, group: nav_menu });
        hover_menu('#star_btn', '#star_menu',
            { layout: 'center_y', min_y: menu_top, offset_x: 13, group: nav_menu });
        hover_menu('#broadcast_btn', '#broadcast_menu',
            { layout: 'center_y', min_y: menu_top, offset_x: 13, group: nav_menu });
        hover_menu('#comment_btn', '#comment_menu',
            {
                layout: 'center_y', min_y: menu_top, offset_x: 13, group: nav_menu,
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

        var del_dialog;
        $('#action_nav .delete').click(function(){ del_dialog = showDialog('#dia_delete'); });
        $(function(){ $('#dia_delete .no_btn').click(function(){ del_dialog.close() }) });

        Hive.navigator = Hive.Navigator.create(
            '#navigator',
            '#expression_frames',
            {hidden: !config.navigator.open_initially}
        );
        Hive.load_expr(Hive.navigator.current_expr());
        //o.navigator_menu = hover_menu(handles, '#navigator', {
        //    layout: false,
        //    opened: false,
        //    open_menu: Hive.navigator.show,
        //    close_menu: Hive.navigator.hide,
        //    group: nav_menu,
        //    close_delay: o.slow_close
        //});

        window.addEventListener('message', function(m){
            if(m.data == 'focus') {
                nav_menu.close(true);
                //o.navigator_menu.close(true);
            }
            else if( m.data.match(/^layout=/) ){
                var dims = m.data.split('=')[1].split(',');
                o.layout(dims);    
            }
        }, false);

        o.layout([ $(window).width(), $(window).height() ]);

        o.update_expr(expr);

        // In order to make sure the navigator and the nav are rendered,
        // initially they are placed offscreen but not hidden (by css and init
        // function for nav and navigator respectively).  However, for a good
        // mobile experience, they need to be hidden, so we hide after a delay,
        // (again, this is handled by init function in case of navigator)
        if (!config.nav.open_initially) {
            setTimeout(function(){
                nav_menu.drawer().hide();
            }, 500 );
        }
        //o.navigator_menu.delayed_close(5000);
        //nav_menu.delayed_close(5000);
    };

    o.user_link = function(name, id){
        return $('<a>').attr('href', '/' + name).addClass(id);
            //.click(function(){ Hive.navigator.context('@' + name); return false; });
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
        $('.btn_box.edit,.btn_box.delete').toggleClass( 'none', ! is_owner );

        $('#owner_btn').toggleClass('none', is_owner);
        if(!is_owner){
            var owner_name = expr.owner_name[0].toUpperCase() + expr.owner_name.slice(1);
            $('.owner_name').html(owner_name);
            $('#owner_btn .user_thumb').attr('src', expr.owner.thumb)
                .toggleClass('none', !expr.owner.has_thumb);
            $('.owner_url').attr('href', expr.owner.url);

            // load owner's info: feed items in owner_menu, expr links and thumbs, listening status
            $.getJSON(server_url + 'user/' + expr.owner.id, function(data, status, jqXHR){
                var thumbs = $('#owner_menu .thumbs');
                thumbs.html('');
                $.map(data.exprs, function(e){
                    $('<a>').attr({ 'href': e.url + '?user=' + expr.owner.name, 'title': e.title })
                        // TODO: enable this when Navigator supports changing both expression and context
                        //.click(function(){
                        //    Hive.navigator.context('@' + expr.owner.name).select_by_id(e.id);
                        //    return false;
                        //})
                        .append($('<img>').attr('src', e.thumb).addClass('thumb')).appendTo(thumbs);
                });
                $('#owner_menu .listen').removeClass('on off').addClass(data.listening ? 'on' : 'off');
                $('#owner_menu .items').html(data.feed_html);
            });
        }

        var is_empty = function(v){ return !v || (v == '0') };
        $('.view .count').html(expr.counts.Views);
        $('.star .count').html(expr.counts.Star).toggleClass('zero', is_empty(expr.counts.Star));
        $('.broadcast .count').html(expr.counts.Broadcast).toggleClass('zero', is_empty(expr.counts.Broadcast));
        $('.comment .count').html(expr.counts.Comment).toggleClass('zero', is_empty(expr.counts.Comment));

        // update share URLs and embed dialog
        o.update_share_urls(expr);
        var embed_link = $( $('#dia_embed textarea').val() ).attr('src', expr.url);
        $('#dia_embed textarea').val(embed_link.outerHTML());

        $('#expr_menu .big_card .title').html(expr.title);
        $('#expr_menu .big_card .thumb').attr('src', expr.thumb);
        $('#expr_menu .tags').html(tag_list_html(expr.tags_index));
        $('#expr_menu .time').html(expr.updated_friendly);

        $('#add_to_featured').find('.' + expr.featured.toString()).show();
        $('#add_to_featured').find('.' + (!expr.featured).toString()).hide();

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

    o.update_user = function(user_data){
        console.log('update_user: ', user_data);
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
    , message: 'Join me on The New Hive'
    , title: 'Invite Friends to Join The New Hive'
    , filters: ['app_non_users']
  }, requestCallback);
};
