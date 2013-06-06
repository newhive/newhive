/* 
 * class page
   Top-level entry point for client view rendering.
   Delegates actual rendering to the templates.
 */
define([
    'browser/jquery',
    'ui/nav',
    'ui/new_account',
    'server/context',
    'browser/layout',
    'ui/util',
    'sj!templates/card_master.html',
    'sj!templates/home.html',
    'sj!templates/social_overlay.html',
    'sj!templates/overlay.html',
    'sj!templates/profile_edit.html',
    'sj!templates/expr_card_large.html',
    'sj!templates/expr_card_feed.html',
    'sj!templates/expr_card_mini.html',
    'sj!templates/feed_card.html',
    'sj!templates/user_card.html',
    'sj!templates/profile_card.html',
    'sj!templates/icon_count.html',
], function(
    $, nav, new_account, context, browser_layout, ui_util, master_template,
    home_template, social_overlay_template, overlay_template, profile_edit_template
) {
    var o = {}, expr_page = false, contentFrameURLBase = context.is_secure ?
        context.secure_content_server_url : context.content_server_url,
        grid_width, controller, 
        anim_direction; // 0 = up, +/-1 = right/left
    const ANIM_DURATION = 700;

    o.init = function(controller){
        o.anim_direction = 0;
        o.controller = controller;
        nav.render();
        $('#overlays').empty().html(overlay_template());
        $(window).resize(layout);
        window.addEventListener('message', o.handle_message, false);
        $("#page_prev").click(o.page_prev);
        $("#page_next").click(o.page_next);
        $("#social_plus").click(o.social_toggle);

        layout();
    };
    o.render = function(method, data){
        expr_page = (method == 'expr');
        if(!expr_page) hide_exprs();
        var page_data = data.page_data;
        page_data.layout = method;
        if(o[method]) o[method](page_data);
        else render_site(page_data);

        layout();
    };

    o.social_toggle = function() {
        popup = $('#social_overlay');
        // TODO: animate
        if (popup.css('display') == 'none') {
            popup.show();
        } else {
            popup.hide();
        }
    };
    o.page_prev = function() { o.navigate_page(-1); }
    o.page_next = function() { o.navigate_page(1); }
    o.navigate_page = function (offset){
        o.anim_direction = offset / Math.abs(offset);
        var page_data = context.page_data;
        if (page_data.cards != undefined) {
            var len = page_data.cards.length
            var found = -1;
            // TODO: add the current card to context.
            for (var i = 0; i < len; ++i){
                if (page_data.cards[i].id == page_data.expr_id) {
                    found = i;
                    break;
                }
            }
            // TODO: do we need error handling?
            if (found >= 0) {
                // TODO: need to asynch fetch more expressions and concat to cards.
                found = (found + len + offset) % len;
                page_data.expr_id = page_data.cards[found].id;
                var page_state = {api:"/api/expr/" + page_data.expr_id, 
                    route_name:"view_expr",
                    page:"/" + page_data.cards[found].owner.name +
                        "/" + page_data.cards[found].name};
                o.controller.open_route(page_state);
            }
        }
    }
    // Handles messages from PostMessage (from other frames)
    o.handle_message = function(m){
        if ( m.data == "show_prev" || m.data == "show_next") {
            var div = (m.data == "show_prev" ? $("#page_prev") : $("#page_next"));
            div.show();
        }
        if ( m.data == "hide_prev" || m.data == "hide_next") {
            var div = (m.data == "hide_prev" ? $("#page_prev") : $("#page_next"));
            div.hide();
        }
    };

    // route.client_method definitions
    o.expr_detail = function(page_data){
        render_site(page_data);
        // expr_column(); // TODO: is this necessary?
    };

    o.grid = function(page_data){
        grid_width = 410;
        render_site(page_data);
    }

    o.forms = function(page_data){
        switch(data.form) {
        case "create_account":
            new_account.init(o);
            new_account.render();
            break;
        default:
            $('#site').empty().append(home_template(page_data));
        }
    };

    o.comment_response = function (e, json) {
        $('#comment_form textarea').val('');
    }

    // Animate the new visible expression, bring it to top of z-index.
    // TODO: animate nav bar
    o.expr = function(page_data){
        // TODO: should the HTML render on page load? Or delayed?
        $('#overlays #social_overlay').empty().append(
            social_overlay_template(context.page_data));
        $("#nav").prependTo("#social_overlay");
        $("#social_overlay #plus").click(o.social_toggle);
        $('#comment_form').on('response', o.comment_response);

        // display_expr(page_data.expr_id);
        var expr_id = page_data.expr_id;
        var expr_curr = $('.expr-visible');
        expr_curr.removeClass('expr-visible');
        $('#exprs').show();
        $('#social_plus').show();

        var contentFrame = $('#expr_' + expr_id);
        if (contentFrame.length == 0) {
            // Create new content frame
            var contentFrameURL = contentFrameURLBase + expr_id;
            contentFrame = $('<iframe class="expr expr-visible">');
            contentFrame.attr('src', contentFrameURL);
            contentFrame.attr('id','expr_' + expr_id);
            $('#exprs').append(contentFrame);
        }
        else {
            contentFrame.addClass('expr-visible').removeClass('expr-hidden');
            contentFrame.get(0).contentWindow.
                postMessage({action: 'show'}, '*');
        }
        contentFrame.show();
        if (o.anim_direction == 0 || expr_curr.length != 1) {
            contentFrame.css({
                'left': 0,
                'top': -contentFrame.height() + 'px',
                'z-index': 1 }
            ).animate({
                top: "0"
            }, {
                duration: ANIM_DURATION,
                complete: hide_other_exprs });
        } else {
            // 
            contentFrame.css({
                'top': 0,
                'left': o.anim_direction * contentFrame.width(),
                'z-index': 1 }
            ).animate({
                left: "0"
            }, {
                duration: ANIM_DURATION,
                complete: hide_other_exprs,
                queue: false })
            expr_curr.animate({
                'left': -o.anim_direction * contentFrame.width(),
            }, {
                duration: ANIM_DURATION,
                complete: hide_other_exprs,
                queue: false })
        }
        $('#exprs .expr').not('.expr-visible').css({'z-index': 0 });
    }

    o.home = function(page_data){
        page_data.layout = 'profile';
        $('#site').empty().append(home_template(page_data));
        $('#email').on('change', function(){
            $('#optional').removeClass('hide');
        });
        $('#invite_form').on('response', function(e, data){
            if(page_data){ // success
                $('#request_invite').hide();
                $('#request_sent').removeClass('hide');
                // TODO: set cookie
            }
            else { // failure
                $('#request_invite .error').removeClass('hide');
            }
        });
        // TODO: create handlers for contact UI
    };

    o.profile = function(page_data){
        render_site(page_data);
        expr_column();
    };
    o.profile_edit = function(page_data){
        ui_util.uploader('profile_thumb_form',
            function(url){
                $('#profile_thumb').attr('src', url)
            },
            function(data){
                console.log(data);
            }
        );
        ui_util.uploader('profile_bg_form',
            function(url){
                $('#profile_bg').css('background-image', url)
            },
            function(data){
                console.log(data);
            }
        );
        $('#site').empty().append(profile_edit_template(page_data));
    };
    o.profile_private = function(page_data){
        page_data.profile.subheading = 'Private';
        page_data.layout = 'grid';
        render_site(page_data);
        expr_column();
    };

    o.loves = function(page_data){
        page_data.profile.subheading = 'Loves';
        render_site(page_data);
    };

    o.mini = function(page_data){
        page_data.layout = 'grid';
        grid_width = 232 + 20; // padding = 10 + 10
        render_site(page_data);
    };
    
    function hide_other_exprs() {
        $('#exprs .expr').not('.expr-visible').addClass('expr-hidden').hide();
    }

    function hide_exprs() {
        var contentFrame = $('.expr-visible');

        if(contentFrame.length){
            contentFrame.animate({
                top: $(window).height() + 'px'
            },{
                duration: ANIM_DURATION,
                complete: function() {
                    contentFrame.addClass('expr-hidden');
                    contentFrame.removeClass('expr-visible');
                    contentFrame.get(0).contentWindow.
                        postMessage({action: 'hide'}, '*');
                    hide_expr_complete();
                }
            });
        } else {
            hide_expr_complete();
        }
    }

    function hide_expr_complete() {
        $('#exprs').hide();
        $('.overlay').hide();
        $('#nav').prependTo("body");
    }

    function render_site(page_data){
        $('#site').empty().append(master_template(page_data));
    }

    function layout(){
        $('#exprs').css('height', $(window).height());
        $('#site').css('height', $(window).height() - 44);
        browser_layout.center($('#page_prev'), undefined, {'h': false});
        browser_layout.center($('#page_next'), undefined, {'h': false});
        if(context.page_data.layout == 'grid') $('#feed').css('width',
            Math.min(3, Math.floor($(window).width() / grid_width)) * grid_width);
    }

    function expr_column(){
        // TODO: put actual rendering code here?

        // fix background spacing on line breaks
        $('.card .words').each(function(){
            var e = $(this);
            if(e.hasClass('spaced')) return;
            e.html(e.html().replace(/ |$/g, '&nbsp; '));
            e.addClass('spaced');
        });
    }

    o.add_to_feed = function(page_data){
        $('#feed').append(show_cards(page_data));
    };

    // function replace_or_append(e, replace, append){
    //     var replace = $(replace);
    //     if(replace.length) replace.replaceWith(e);
    //     else $(append).append(e);
    // }

    return o;
});
