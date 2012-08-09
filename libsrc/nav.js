if (typeof(Hive) == "undefined") Hive = {};

Hive.load_expr = function(expr){
    Hive.expr = expr;

    if(expr.auth_required){
        $('[name=expr]').removeAttr('name');
        expr.frame.attr('name', 'expr');
        //console.log(expr.frame);
        $('.password_form').attr('action', content_domain + expr.id);
        if(expr.password){
            // already authorized, pass password along to expr frame,
            // where it's posted to newhiveexpression.com
            //console.log('one load handler');
            //expr.frame.one('load', function(){
            //    console.log('sending password');
            //    this.contentWindow.postMessage('password=' + expr.password, '*');
            //});
            //expr.frame.one('load', function(){
            var f = $('#auto_password_form');
            f.find('.password').val(expr.password);
            //console.log('submitting password form to ' + f.attr('action') + ' with pass ' + f.find('.password').val());
            f.submit();
            //console.log(expr.frame);
            //});
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
            Hive.Menus.update_expr(Hive.expr);
        }, 'json');
    });
};

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
        }
        else {
            o.login_menu = hover_menu( '#login_btn', '#login_menu', {
                open: function() { $('#username').get(0).focus(); },
                close_delay: opts.slow_close,
                offset_y: 8,
                layout_x: 'right',
                group: group
            } );
        }

        var swap_action_nav = { open: function(){ $('#action_nav').hide() },
            close: function(){ $('#action_nav').show() } };

        if($('#owner_btn').length) hover_menu('#owner_btn', '#owner_menu', $.extend({ offset_y: 8,
            layout_x: 'right', group: group }, swap_action_nav));
        $('#owner_menu .menu_item.listen').click(function(){
            o.feed_toggle('star', o.owner.id, '#owner_menu .menu_item.listen', '', {ga: 'listen'})
        });

        if($('#share_btn').length) hover_menu('#share_btn', '#share_menu', $.extend({ offset_y: 8,
            group: group }, swap_action_nav));

        o.update_owner( owner );
    };

    // initialize menus for frame page, then close them after delay
    o.expr_init = function(){
        var speed = 300,
            drawers = $('#user_nav,#owner_nav,#action_nav'),
            handles = $('.menu_handle').add('#navigator'),
            close_nav = function(){
                drawers.stop().clearQueue();
                $('#user_nav').animate({ left: -50, top: -50 }, { complete:
                    function(){ drawers.hide() } }, speed);
                $('#owner_nav').animate({ right: -50, top: -50 }, speed);
                $('#action_nav').animate({ right: -50 }, speed);
                Hive.navigator.hide(speed);
                Hive.navigator.current_expr().frame.get(0).focus();
            },
            open_nav = function(){
                drawers.stop().clearQueue().show();
                $('#user_nav').animate({ left: 0, top: 0 }, speed);
                $('#owner_nav').animate({ right: opts.pad_right, top: 0 }, speed);
                $('#action_nav').animate({ right: opts.pad_right }, speed);
                Hive.navigator.show();
            };
            nav_menu = o.nav_menu = hover_menu(handles, drawers, { layout: false, open_delay: 400,
                open_menu: open_nav, close_menu: close_nav, opened: false, close_delay: opts.slow_close } );

        o.init(nav_menu);

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

        $('#star_btn').click(function(){ o.feed_toggle('star', Hive.expr.id, '#star_btn',
            '#star_menu .items') });
        $('#broadcast_btn').click(function(){ o.feed_toggle('broadcast', Hive.expr.id,
            '#broadcast_btn', '#broadcast_menu .items') });

        $('#comment_form').submit(o.post_comment);

        // email and embed menus
        $(function(){
            $('.menu_item.message').click(require_login(function(){showDialog('#dia_share')}));
            var dia = $('#dia_share');
            dia.find('form').submit(function(e){
                var submit = dia.find('input[type=submit]');
                if (submit.hasClass('inactive')) return false;
                submit.addClass('inactive');
                var callback = function(){
                    submit.removeClass('inactive');
                    dia.find('#email_to').val('');
                    dia.children().hide();
                    var tmp = $('<h2>Your message has been sent</h2>').appendTo(dia);
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

        Hive.navigator = Hive.Navigator.create('#navigator', '#expression_frames', {hidden: true});
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
        setTimeout(function(){
            nav_menu.drawer().hide();
        }, 500 );
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

        $('.edit_url').attr('href', secure_server + 'edit/' + expr.id);
        $('.expr_id').val(expr.id); // for delete dialog
        $('.btn_box.edit,.btn_box.delete').toggleClass('none', user.id != expr.owner.id);

        var owner_name = expr.owner_name[0].toUpperCase() + expr.owner_name.slice(1);
        $('.owner_name').html(owner_name);
        $('#owner_btn .user_thumb').attr('src', expr.owner.thumb)
            .toggleClass('none', !expr.owner.has_thumb);
        $('.owner_url').attr('href', expr.owner.url);
        o.update_owner( expr.owner );

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
        if( o.owner && o.owner.id == owner.id ) return;
        o.owner = owner;

        var is_owner = owner.id == user.id;
        $('#owner_btn').toggleClass('none', is_owner);
        if( is_owner ) return;

        $('#owner_menu .listen').removeClass('on off').addClass( owner.listening ? 'on' : 'off' );

        $.getJSON(server_url + 'user/' + owner.id, function(data, status, jqXHR){
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
        });
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

    o.feed_toggle = require_login(function(action, entity, btn, items, opts) {
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
